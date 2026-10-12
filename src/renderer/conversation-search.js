const DEFAULT_LIMIT = 60;
const EMPTY_ARRAY = [];
let cachedArrays = null;
let cachedIndex = [];

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

function accountIdOf(item) {
  return item?.accountId || 'default';
}

function conversationKey(provider, accountId, id) {
  return `${provider || 'unknown'}:${accountId || 'default'}:${id}`;
}

function projectFor(projects, id, directory) {
  return projects.find(project => project.id === id)
    || projects.find(project => project.directory === directory)
    || null;
}

function accountNameFor(accounts, id) {
  return accounts.find(account => account.id === id)?.name || id || '';
}

function providerName(provider) {
  return ({ codex: 'Codex', claude: 'Claude', shell: 'Terminal' })[provider] || provider || '';
}

function makeItem(kind, value, snapshot) {
  const live = kind === 'live';
  const session = live ? value : null;
  const history = live ? null : value;
  const provider = value.provider || 'unknown';
  const accountId = accountIdOf(value);
  const id = live ? (value.conversationId || value.id) : value.id;
  const directory = live ? (value.workingDirectory || value.directory || '') : (value.directory || '');
  const projectId = live ? value.projectId : value.assignedProjectId;
  const project = projectFor(snapshot.projects, projectId, directory);
  const title = live
    ? (value.title || value.conversationTitle || 'Untitled conversation')
    : (value.conversationTitle || value.title || 'Untitled conversation');
  const updatedAt = live ? (value.updatedAt || value.createdAt || '') : (value.updatedAt || '');
  const keyId = id || (live ? value.id : '');
  return {
    kind,
    ...(live ? { session } : { history }),
    title,
    provider,
    accountId,
    accountName: accountNameFor(snapshot.accounts || [], accountId),
    directory,
    projectId: project?.id || projectId || null,
    projectName: project?.name || '',
    updatedAt,
    key: conversationKey(provider, accountId, keyId),
  };
}

function indexFor(snapshot) {
  const projects = Array.isArray(snapshot.projects) ? snapshot.projects : EMPTY_ARRAY;
  const terminals = Array.isArray(snapshot.terminals) ? snapshot.terminals : EMPTY_ARRAY;
  const history = Array.isArray(snapshot.history) ? snapshot.history : EMPTY_ARRAY;
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : EMPTY_ARRAY;
  if (cachedArrays?.projects === projects
    && cachedArrays.terminals === terminals
    && cachedArrays.history === history
    && cachedArrays.accounts === accounts) return cachedIndex;

  const normalizedSnapshot = { projects, accounts };
  const live = terminals
    .filter(session => session.status !== 'exited')
    .map(session => makeItem('live', session, normalizedSnapshot));
  const openIdentities = new Set(live
    .filter(item => item.session?.conversationId)
    .map(item => item.key));
  const saved = history
    .map(item => makeItem('saved', item, normalizedSnapshot))
    .filter(item => !openIdentities.has(item.key));
  cachedIndex = [...live, ...saved].map(item => {
    const context = [item.directory, item.projectName, providerName(item.provider), item.accountName, item.accountId].join(' ');
    return { item, normalizedTitle: normalize(item.title), normalizedSearch: normalize(`${item.title} ${context}`) };
  });
  cachedArrays = { projects, terminals, history, accounts };
  return cachedIndex;
}

function titleRank(title, query, words) {
  const normalized = normalize(title);
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.includes(query)) return 2;
  if (words.every(word => normalized.includes(word))) return 3;
  return Infinity;
}

/** Search the local conversation snapshot without I/O. */
export function searchConversations(snapshot = {}, query = '', limit = DEFAULT_LIMIT) {
  const needle = normalize(query);
  const words = needle ? needle.split(/\s+/).filter(Boolean) : [];
  const candidates = indexFor(snapshot).map(record => {
    const { item } = record;
    if (needle && !words.every(word => record.normalizedSearch.includes(word))) return null;
    return {
      item,
      rank: needle ? titleRank(record.normalizedTitle, needle, words) : 0,
      time: Date.parse(item.updatedAt) || 0,
    };
  }).filter(Boolean);
  candidates.sort((a, b) => a.rank - b.rank || b.time - a.time || a.item.title.localeCompare(b.item.title));
  const count = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : DEFAULT_LIMIT;
  return candidates.slice(0, count).map(result => result.item);
}

function stableId(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `spotlight-option-${(hash >>> 0).toString(36)}`;
}

/** Create the reusable, self-contained conversation search dialog. */
export function createConversationSearch({
  getState,
  refresh,
  openConversation,
  icon = () => '',
  providerLabel = providerName,
  formatTime = () => '',
  onOpen = () => {},
  onClose = () => {},
}) {
  let isOpen = false;
  let opening = false;
  let selectedIndex = -1;
  let priorFocus = null;
  let currentQuery = '';
  let latestResults = [];
  let refreshGeneration = 0;
  let visibleLimit = DEFAULT_LIMIT;
  let visibleCount = 0;
  let openingPromise = null;

  const dialog = document.createElement('dialog');
  dialog.className = 'spotlight';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Search all conversations');
  const field = document.createElement('div');
  field.className = 'spotlight-field';
  const iconMarkup = document.createElement('span');
  iconMarkup.innerHTML = icon('search');
  const searchMark = iconMarkup.firstElementChild;
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search conversations…';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Search all conversations');
  input.setAttribute('aria-controls', 'spotlight-results');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-autocomplete', 'list');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'spotlight-close';
  closeButton.setAttribute('aria-label', 'Close search');
  closeButton.innerHTML = icon('close');
  field.append(searchMark, input, closeButton);
  const status = document.createElement('div');
  status.className = 'spotlight-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const results = document.createElement('div');
  results.className = 'spotlight-results';
  results.id = 'spotlight-results';
  results.setAttribute('role', 'listbox');
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'spotlight-more';
  more.hidden = true;
  const footer = document.createElement('div');
  footer.className = 'spotlight-footer';
  footer.textContent = '↑ ↓ Navigate　↵ Open　Esc Close';
  dialog.append(field, status, results, more, footer);
  document.body.append(dialog);

  function render() {
    const state = getState() || {};
    latestResults = searchConversations(state, currentQuery, visibleLimit + 1);
    const hasMore = latestResults.length > visibleLimit;
    visibleCount = Math.min(latestResults.length, visibleLimit);
    if (selectedIndex >= visibleCount) selectedIndex = -1;
    results.replaceChildren();
    latestResults.slice(0, visibleCount).forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spotlight-result';
      button.id = stableId(item.key);
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selectedIndex));
      const mark = document.createElement('span');
      mark.className = 'spotlight-mark';
      mark.innerHTML = icon(item.provider);
      const copy = document.createElement('span');
      copy.className = 'spotlight-copy';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const detail = document.createElement('small');
      const place = item.projectName || item.directory;
      const provider = String(providerLabel(item.provider, item.accountId, item) ?? '');
      const includesAccount = (!!item.accountName && normalize(provider).includes(normalize(item.accountName)))
        || (!!item.accountId && normalize(provider).includes(normalize(item.accountId)));
      const account = item.provider === 'codex' && item.accountName && item.accountId !== 'default' && !includesAccount
        ? ` · ${item.accountName}`
        : '';
      detail.textContent = [place, `${provider}${account}`].filter(Boolean).join(' · ');
      copy.append(title, detail);
      const time = document.createElement('time');
      time.className = 'spotlight-time';
      time.textContent = formatTime(item.updatedAt);
      button.append(mark, copy, time);
      button.onclick = () => void openItem(index);
      results.append(button);
    });
    more.hidden = !hasMore;
    more.textContent = `Show ${DEFAULT_LIMIT} more`;
    if (!latestResults.length) status.textContent = currentQuery ? 'No matching conversations.' : 'No conversations yet.';
    else if (hasMore) status.textContent = `${visibleLimit}+ conversations shown. Refine your search or show more.`;
    else status.textContent = currentQuery ? `${latestResults.length} matching conversations` : 'Recent conversations';
    if (latestResults[selectedIndex]?.key) input.setAttribute('aria-activedescendant', stableId(latestResults[selectedIndex].key));
    else input.removeAttribute('aria-activedescendant');
  }

  function setSelected(index) {
    if (!visibleCount) {
      selectedIndex = -1;
      input.removeAttribute('aria-activedescendant');
      return;
    }
    selectedIndex = (index + visibleCount) % visibleCount;
    [...results.children].forEach((button, row) => button.setAttribute('aria-selected', String(row === selectedIndex)));
    input.setAttribute('aria-activedescendant', results.children[selectedIndex]?.id || '');
    results.children[selectedIndex]?.scrollIntoView?.({ block: 'nearest' });
  }

  async function openItem(index) {
    const item = index < visibleCount ? latestResults[index] : null;
    if (!item || opening) return;
    opening = true;
    status.textContent = 'Opening conversation…';
    try {
      await openConversation(item);
      close({ restoreFocus: false });
    } catch (error) {
      opening = false;
      status.textContent = error?.message || 'Could not open conversation.';
    }
  }

  async function refreshAfterOpen(generation) {
    if (typeof refresh !== 'function') return;
    status.dataset.refreshing = 'true';
    status.setAttribute('aria-label', 'Refreshing conversations');
    try {
      await refresh();
      if (isOpen && generation === refreshGeneration) render();
    } catch {
      if (isOpen && generation === refreshGeneration && !latestResults.length) status.textContent = 'Could not refresh conversations.';
    } finally {
      if (generation === refreshGeneration) {
        delete status.dataset.refreshing;
        status.removeAttribute('aria-label');
      }
    }
  }

  function open() {
    if (isOpen) {
      if (dialog.open) input.focus();
      return openingPromise || Promise.resolve();
    }
    isOpen = true;
    opening = false;
    const generation = ++refreshGeneration;
    currentQuery = '';
    visibleLimit = DEFAULT_LIMIT;
    visibleCount = 0;
    selectedIndex = -1;
    priorFocus = document.activeElement;
    input.value = '';
    const pendingOpen = (async () => {
      try {
        await onOpen();
      } catch {
        // Keep search available even if a preview cannot be hidden.
      }
      if (!isOpen || generation !== refreshGeneration) return;
      render();
      dialog.showModal();
      input.focus();
      void refreshAfterOpen(generation);
    })();
    const trackedOpen = pendingOpen.finally(() => {
      if (openingPromise === trackedOpen) openingPromise = null;
    });
    openingPromise = trackedOpen;
    return trackedOpen;
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    opening = false;
    refreshGeneration += 1;
    dialog.close();
    onClose();
    if (restoreFocus && priorFocus?.isConnected) priorFocus.focus();
    priorFocus = null;
  }

  input.addEventListener('input', () => {
    currentQuery = input.value;
    visibleLimit = DEFAULT_LIMIT;
    selectedIndex = -1;
    render();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected(selectedIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(selectedIndex < 0 ? visibleCount - 1 : selectedIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void openItem(selectedIndex < 0 ? 0 : selectedIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  more.addEventListener('click', () => {
    const firstNew = visibleCount;
    const scrollTop = results.scrollTop;
    visibleLimit += DEFAULT_LIMIT;
    selectedIndex = -1;
    render();
    results.scrollTop = scrollTop;
    const addedRows = [...results.children].slice(firstNew);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) addedRows.forEach((row, index) => row.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 180, delay: Math.min(index * 15, 150), easing: 'ease-out', fill: 'backwards' },
    ));
    if (addedRows[0]) results.scrollTo({
      top: addedRows[0].offsetTop - (results.firstElementChild?.offsetTop || 0),
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    input.focus({ preventScroll: true });
  });
  closeButton.addEventListener('click', () => close());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });

  return { open, close };
}
