const { previewURL } = require('./validation.cjs');

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 700;
const MIN_VIEWPORT_WIDTH = 320;
const MAX_VIEWPORT_WIDTH = 1280;
const MIN_VIEWPORT_HEIGHT = 320;
const MAX_VIEWPORT_HEIGHT = 1600;
const PREVIEW_KEY_CODES = {
  Enter: { code: 'Enter', virtualKeyCode: 13 },
  Tab: { code: 'Tab', virtualKeyCode: 9 },
  Backspace: { code: 'Backspace', virtualKeyCode: 8 },
  Escape: { code: 'Escape', virtualKeyCode: 27 }
};
const PREVIEW_KEYS = new Set(Object.keys(PREVIEW_KEY_CODES));

function localPreviewURL(value) {
  const url = new URL(previewURL(value));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Phone previews require a known local development server.');
  return url.href;
}

function viewport(value = {}) {
  const width = Number.isFinite(value.width) ? Math.round(value.width) : PHONE_WIDTH;
  const height = Number.isFinite(value.height) ? Math.round(value.height) : PHONE_HEIGHT;
  return {
    width: Math.max(MIN_VIEWPORT_WIDTH, Math.min(MAX_VIEWPORT_WIDTH, width)),
    height: Math.max(MIN_VIEWPORT_HEIGHT, Math.min(MAX_VIEWPORT_HEIGHT, height))
  };
}

class RemotePreview {
  constructor({ BrowserWindow, terminals, getPreview }) {
    this.BrowserWindow = BrowserWindow;
    this.terminals = terminals;
    this.getPreview = getPreview;
    this.hidden = new Map();
    this.phone = new Map();
    this.pending = new Map();
    this.debuggerAttaching = new WeakMap();
    this.keyQueues = new WeakMap();
  }

  terminal(id) {
    const session = this.terminals.get(id);
    if (!session?.previewAvailable) throw Error('No running local website found for this terminal.');
    const url = localPreviewURL(session.previewURL);
    return { session, url, origin: new URL(url).origin };
  }

  configure(contents, origin) {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    contents.session.setPermissionCheckHandler(() => false);
    for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
      contents.on(name, (event, target) => {
        try {
          if (new URL(localPreviewURL(typeof target === 'string' ? target : event.url)).origin !== origin) event.preventDefault();
        } catch { event.preventDefault(); }
      });
    }
  }

  async openWindow(id, session, url, size, store, storeKey) {
    const previous = store.get(storeKey);
    if (previous && !previous.window.isDestroyed()) {
      const currentURL = previous.window.webContents.getURL();
      if (currentURL && new URL(currentURL).origin === new URL(url).origin) {
        if (size && (previous.width !== size.width || previous.height !== size.height)) {
          if (typeof previous.window.setContentSize === 'function') previous.window.setContentSize(size.width, size.height);
          else previous.window.setSize(size.width, size.height);
          previous.width = size.width;
          previous.height = size.height;
        }
        return previous.window.webContents;
      }
      previous.window.destroy();
      store.delete(storeKey);
    }

    if (store.size >= 3) {
      const [oldKey, old] = store.entries().next().value;
      if (!old.window.isDestroyed()) old.window.destroy();
      store.delete(oldKey);
    }

    const window = new this.BrowserWindow({
      show: false,
      width: size.width,
      height: size.height,
      useContentSize: true,
      resizable: false,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: `persist:orbit-preview-${session.projectId}`
      }
    });
    const contents = window.webContents;
    this.configure(contents, new URL(url).origin);
    store.set(storeKey, { window, url, width: size.width, height: size.height });
    try {
      await Promise.race([
        contents.loadURL(url),
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(Error('Website preview timed out.')), 15000);
          timer.unref();
        })
      ]);
    } catch (error) {
      store.delete(storeKey);
      window.destroy();
      throw error;
    }
    return contents;
  }

  async contents(id, options = {}) {
    const { session, url, origin } = this.terminal(id);
    const mode = options.mode === 'desktop' ? 'desktop' : 'phone';
    const store = mode === 'desktop' ? this.hidden : this.phone;
    const key = mode === 'desktop' ? id : `${id}`;
    const previous = store.get(key);
    const size = mode === 'desktop' ? { width: 1280, height: 800 } : viewport({
      width: options.width ?? previous?.width,
      height: options.height ?? previous?.height
    });
    const pendingKey = `${mode}:${key}`;
    if (this.pending.has(pendingKey)) return this.pending.get(pendingKey);
    const promise = this.openWindow(id, session, url, size, store, key).finally(() => this.pending.delete(pendingKey));
    this.pending.set(pendingKey, promise);
    return promise;
  }

  async capture(id, options = {}) {
    const contents = await this.contents(id, options);
    const original = await contents.capturePage();
    if (original.isEmpty()) throw Error('Preview is still loading. Try again.');
    const size = original.getSize();
    const frame = size.width > 1280 ? original.resize({ width: 1280 }) : original;
    return { jpeg: frame.toJPEG(65).toString('base64'), width: size.width, height: size.height };
  }

  dispatchKey(contents, key) {
    const previous = this.keyQueues.get(contents) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => this.dispatchKeyNow(contents, key));
    this.keyQueues.set(contents, current);
    return current.finally(() => { if (this.keyQueues.get(contents) === current) this.keyQueues.delete(contents); });
  }

  async dispatchKeyNow(contents, key) {
    const protocol = contents.debugger;
    const keyInfo = PREVIEW_KEY_CODES[key];
    if (!protocol || typeof protocol.sendCommand !== 'function' || !keyInfo) throw Error('Website key input is unavailable.');
    if (!protocol.isAttached()) {
      let attaching = this.debuggerAttaching.get(contents);
      if (!attaching) {
        attaching = Promise.resolve().then(() => {
          if (!protocol.isAttached()) protocol.attach('1.3');
        }).finally(() => this.debuggerAttaching.delete(contents));
        this.debuggerAttaching.set(contents, attaching);
      }
      await attaching;
    }

    const virtualKeyCode = keyInfo.virtualKeyCode;
    const event = { key, code: keyInfo.code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode };
    await protocol.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
    try {
      if (key === 'Enter') await protocol.sendCommand('Input.dispatchKeyEvent', { type: 'char', ...event, text: '\r', unmodifiedText: '\r' });
    } finally {
      await protocol.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    }
  }

  async input(params = {}) {
    const { id, type, x, y } = params;
    const contents = await this.contents(id, params);
    if (type === 'text') {
      await contents.insertText(params.text);
      return true;
    }
    if (type === 'key') {
      await this.dispatchKey(contents, params.key);
      return true;
    }
    if (type === 'navigate') {
      if (params.action === 'back' && contents.canGoBack()) contents.goBack();
      else if (params.action === 'forward' && contents.canGoForward()) contents.goForward();
      else if (params.action === 'reload') contents.reloadIgnoringCache();
      return true;
    }

    const frame = await contents.capturePage();
    const size = frame.getSize();
    const point = {
      x: Math.max(0, Math.min(size.width - 1, Math.round(x * size.width))),
      y: Math.max(0, Math.min(size.height - 1, Math.round(y * size.height)))
    };
    contents.focus();
    if (type === 'click') {
      contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
      contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    } else {
      contents.sendInputEvent({ type: 'mouseWheel', ...point, deltaY: -params.deltaY, deltaX: -(params.deltaX || 0), canScroll: true });
    }
    return true;
  }

  close() {
    for (const store of [this.hidden, this.phone]) {
      for (const { window } of store.values()) if (!window.isDestroyed()) window.destroy();
      store.clear();
    }
  }
}

module.exports = { RemotePreview, localPreviewURL, viewport, PREVIEW_KEYS };
