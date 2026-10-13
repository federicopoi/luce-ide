const test = require('node:test');
const assert = require('node:assert/strict');
let searchConversations;
test.before(async () => {
  ({ searchConversations } = await import('../src/renderer/conversation-search.js'));
});

test('searches saved and live conversations across projects and matches words without accents', () => {
  const snapshot = {
    projects: [
      { id: 'p1', name: 'Café App', directory: '/work/cafe' },
      { id: 'p2', name: 'Docs', directory: '/work/docs' },
    ],
    terminals: [
      { id: 't1', projectId: 'p1', conversationId: 'live-1', provider: 'codex', accountId: 'personal', title: 'Billing fix', workingDirectory: '/work/cafe', createdAt: '2026-10-08T12:00:00Z', status: 'running' },
      { id: 't2', projectId: 'p2', conversationId: 'live-2', provider: 'claude', title: 'Release notes', workingDirectory: '/work/docs', createdAt: '2026-10-08T11:00:00Z', status: 'running' },
    ],
    history: [
      { id: 'saved-1', provider: 'claude', title: 'Résumé parser', directory: '/work/docs', updatedAt: '2026-10-08T10:00:00Z' },
    ],
  };

  const results = searchConversations(snapshot, 'cafe billing');
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'live');
  assert.equal(results[0].key, 'codex:personal:live-1');

  const accented = searchConversations(snapshot, 'resume parser');
  assert.equal(accented.length, 1);
  assert.equal(accented[0].kind, 'saved');
  assert.equal(accented[0].projectName, 'Docs');
});

test('deduplicates a saved conversation that is open in a live terminal by provider, account, and id', () => {
  const snapshot = {
    projects: [{ id: 'p1', name: 'One', directory: '/one' }, { id: 'p2', name: 'Two', directory: '/two' }],
    terminals: [
      { id: 't1', projectId: 'p1', conversationId: 'shared', provider: 'codex', accountId: 'work', title: 'Open', workingDirectory: '/one', createdAt: '2026-10-08T12:00:00Z', status: 'running' },
    ],
    history: [
      { id: 'shared', provider: 'codex', accountId: 'work', title: 'Saved title', directory: '/two', updatedAt: '2026-10-08T11:00:00Z' },
      { id: 'shared', provider: 'codex', accountId: 'personal', title: 'Other account', directory: '/two', updatedAt: '2026-10-08T10:00:00Z' },
      { id: 'shared', provider: 'claude', title: 'Other provider', directory: '/two', updatedAt: '2026-10-08T09:00:00Z' },
    ],
  };

  const results = searchConversations(snapshot, '');
  assert.deepEqual(results.map(item => item.key), [
    'codex:work:shared',
    'codex:personal:shared',
    'claude:default:shared',
  ]);
  assert.deepEqual(results.map(item => item.kind), ['live', 'saved', 'saved']);
});

test('ranks title matches ahead of context matches and uses recency for ties; empty query shows recent items', () => {
  const snapshot = {
    projects: [{ id: 'p1', name: 'Search project', directory: '/search' }],
    terminals: [
      { id: 't1', projectId: 'p1', conversationId: 'context', provider: 'claude', title: 'Refactor', workingDirectory: '/search', createdAt: '2026-10-08T12:00:00Z', status: 'running' },
    ],
    history: [
      { id: 'exact', provider: 'claude', title: 'Search', directory: '/other', updatedAt: '2026-10-08T07:00:00Z' },
      { id: 'old', provider: 'claude', title: 'Search result', directory: '/other', updatedAt: '2026-10-08T08:00:00Z' },
      { id: 'new', provider: 'claude', title: 'Search result', directory: '/other', updatedAt: '2026-10-08T11:00:00Z' },
      { id: 'substring', provider: 'claude', title: 'Project search result', directory: '/other', updatedAt: '2026-10-08T11:30:00Z' },
    ],
  };

  const results = searchConversations(snapshot, 'search');
  assert.deepEqual(results.map(item => item.key), ['claude:default:exact', 'claude:default:new', 'claude:default:old', 'claude:default:substring', 'claude:default:context']);
  assert.deepEqual(searchConversations(snapshot, '', 2).map(item => item.key), ['claude:default:context', 'claude:default:substring']);
});

test('rebuilds the cached search index when snapshot arrays are replaced', () => {
  const terminals = [{ id: 't1', projectId: 'p1', title: 'Refactor', workingDirectory: '/one', status: 'running' }];
  const history = [];
  const first = { projects: [{ id: 'p1', name: 'First name', directory: '/one' }], terminals, history, accounts: [] };
  assert.equal(searchConversations(first, 'first name').length, 1);

  const next = { ...first, projects: [{ id: 'p1', name: 'Second name', directory: '/one' }] };
  assert.equal(searchConversations(next, 'first name').length, 0);
  assert.equal(searchConversations(next, 'second name').length, 1);
});
