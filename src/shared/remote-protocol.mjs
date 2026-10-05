const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_INBOUND_FRAMES = 64;
const MAX_INBOUND_BYTES = 20 * 1024 * 1024;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid remote key or packet.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable.');
  return globalThis.crypto;
}

function keyBytes(key) {
  return typeof key === 'string' ? base64UrlToBytes(key) : key;
}

async function deriveRelayToken(key) {
  const raw = keyBytes(key);
  if (!(raw instanceof Uint8Array) || raw.byteLength !== 32) throw new Error('Pairing keys must be 256 bits.');
  const imported = await cryptoApi().subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const result = await cryptoApi().subtle.sign('HMAC', imported, encoder.encode('luce-relay-auth-v1'));
  return bytesToBase64Url(new Uint8Array(result));
}

async function seal(key, value) {
  const raw = keyBytes(key);
  if (!(raw instanceof Uint8Array) || raw.byteLength !== 32) throw new Error('Pairing keys must be 256 bits.');
  const crypto = cryptoApi();
  const imported = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, imported, encoder.encode(JSON.stringify(value)));
  return {nonce: bytesToBase64Url(nonce), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))};
}

async function open(key, packet) {
  const raw = keyBytes(key);
  if (!(raw instanceof Uint8Array) || raw.byteLength !== 32 || !packet || typeof packet !== 'object') throw new Error('Invalid remote packet.');
  const crypto = cryptoApi();
  const imported = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: base64UrlToBytes(packet.nonce)}, imported, base64UrlToBytes(packet.ciphertext));
  return JSON.parse(decoder.decode(plaintext));
}

class PhoneConnection {
  constructor({relayURL, hostId, deviceId, key, requestTimeoutMs = 20000}) {
    this.relayURL = relayURL;
    this.hostId = hostId;
    this.deviceId = deviceId;
    this.key = key;
    this.requestTimeoutMs = Number.isFinite(requestTimeoutMs) ? Math.max(1, requestTimeoutMs) : 20000;
    this.socket = null;
    this.session = null;
    this.sequence = 0;
    this.sendChain = Promise.resolve();
    this.pending = new Map();
    this.events = new Map();
    this.statusListeners = new Set();
    this.nextId = 1;
    this.closed = false;
    this.sendQueueSize = 0;
    this.socketGeneration = 0;
    this.incoming = null;
  }

  onEvent(event, callback) {
    if (typeof callback !== 'function') throw new TypeError('Event callback must be a function.');
    const listeners = this.events.get(event) || new Set();
    listeners.add(callback);
    this.events.set(event, listeners);
    return () => listeners.delete(callback);
  }

  onStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('Status callback must be a function.');
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  setStatus(status) { for (const callback of this.statusListeners) callback(status); }

  async connect() {
    if (this.closed) throw new Error('Phone connection is closed.');
    if (this.socket && this.socket.readyState === 1) return;
    const WebSocketImpl = globalThis.WebSocket;
    if (!WebSocketImpl) throw new Error('WebSocket is unavailable.');
    const token = await deriveRelayToken(this.key);
    const base = new URL(this.relayURL);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = `/api/device/${encodeURIComponent(this.hostId)}/${encodeURIComponent(this.deviceId)}`;
    base.search = `?auth=${encodeURIComponent(token)}`;
    const socket = new WebSocketImpl(base.href);
    const generation = ++this.socketGeneration;
    const incoming = {generation, chain: Promise.resolve(), count: 0, bytes: 0};
    this.incoming = incoming;
    this.socket = socket;
    socket.addEventListener('message', event => this.enqueueIncoming(socket, incoming, event.data));
    socket.addEventListener('open', () => this.setStatus({connected: true}));
    socket.addEventListener('close', () => { if (this.socket === socket) { this.socket = null; this.incoming = null; this.socketGeneration++; this.session = null; this.rejectPending(new Error('Remote connection closed.')); this.setStatus({connected: false}); } });
    socket.addEventListener('error', () => this.setStatus({connected: false, message: 'Could not connect to Luce.'}));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Luce.')), 10000);
      const onOpen = () => { clearTimeout(timer); cleanup(); resolve(); };
      const onError = () => { clearTimeout(timer); cleanup(); reject(new Error('Could not connect to Luce.')); };
      const cleanup = () => { socket.removeEventListener('open', onOpen); socket.removeEventListener('error', onError); };
      socket.addEventListener('open', onOpen); socket.addEventListener('error', onError);
    });
    return this;
  }

  enqueueIncoming(socket, queue, raw) {
    const size = typeof raw === 'string' ? encoder.encode(raw).byteLength : Number(raw?.size ?? raw?.byteLength ?? 0);
    if (queue.count >= MAX_INBOUND_FRAMES || queue.bytes + size > MAX_INBOUND_BYTES) {
      this.fail(new Error('Remote message queue is full.'));
      try { socket.close(4000, 'Inbound queue limit'); } catch {}
      return;
    }
    queue.count++;
    queue.bytes += size;
    const operation = queue.chain.catch(() => {}).then(() => {
      if (this.socket !== socket || this.socketGeneration !== queue.generation) return;
      return this.receive(raw);
    });
    queue.chain = operation.catch(error => this.fail(error));
    operation.finally(() => { queue.count--; queue.bytes -= size; }).catch(() => {});
  }

  async receive(raw) {
    const envelope = JSON.parse(typeof raw === 'string' ? raw : await raw.text());
    if (envelope.type === 'status') { if (!envelope.connected) { this.session = null; this.rejectPending(new Error('Luce is offline.')); } this.setStatus({connected: !!envelope.connected}); return; }
    if (envelope.type !== 'packet') return;
    const value = await open(this.key, envelope.packet);
    if (value.kind === 'challenge') {
      this.session = value.nonce;
      this.sequence = 0;
      await this.send({kind: 'hello', nonce: value.nonce});
      this.setStatus({connected: true, ready: true});
    } else if (value.kind === 'response') {
      if (value.session && value.session !== this.session) return;
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      clearTimeout(pending.timer);
      if (value.ok) pending.resolve(value.value);
      else pending.reject(new Error(value.error || 'Remote request failed.'));
    } else if (value.kind === 'event' && (!value.session || value.session === this.session)) {
      for (const callback of this.events.get(value.event) || []) callback(value.value);
    }
  }

  async send(value) {
    if (this.sendQueueSize >= 64) throw new Error('Phone request queue is full.');
    this.sendQueueSize++;
    const operation = this.sendChain.then(async () => {
      if (!this.socket || this.socket.readyState !== 1) throw new Error('Remote connection is closed.');
      const packet = await seal(this.key, value);
      this.socket.send(JSON.stringify({type: 'packet', packet}));
    });
    this.sendChain = operation.catch(() => {});
    return operation.finally(() => { this.sendQueueSize--; });
  }

  async request(method, params = {}) {
    if (!this.socket || this.socket.readyState !== 1) throw new Error('Remote connection is closed.');
    if (this.pending.size >= 64) throw new Error('Too many pending remote requests.');
    if (!this.session) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error('Luce handshake timed out.')); }, 10000);
      const remove = this.onStatus(status => { if (status.ready) { cleanup(); resolve(); } else if (!status.connected) { cleanup(); reject(new Error('Luce is offline.')); } });
      const cleanup = () => { clearTimeout(timeout); remove(); };
    });
    if (this.pending.size >= 64) throw new Error('Too many pending remote requests.');
    const id = `${cryptoApi().randomUUID?.() || `${Date.now().toString(36)}-${this.nextId++}`}`;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        const error = new Error('Remote request timed out. It may have been sent; check the terminal before retrying.');
        pending.reject(error);
        const socket = this.socket;
        if (socket) {
          this.socket = null;
          this.incoming = null;
          this.socketGeneration++;
          this.session = null;
          this.rejectPending(new Error('Remote connection reset after a timed out request.'));
          this.setStatus({connected: false, message: error.message});
          try { socket.close(4001, 'Request timeout'); } catch {}
        }
      }, this.requestTimeoutMs);
      this.pending.set(id, {resolve, reject, timer});
    });
    try { await this.send({kind: 'request', id, method, params, session: this.session, sequence: ++this.sequence}); }
    catch (error) { const pending = this.pending.get(id); if (pending) clearTimeout(pending.timer); this.pending.delete(id); throw error; }
    return result;
  }

  rejectPending(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  fail(error) { this.setStatus({connected: false, message: error.message}); }
  close() { this.closed = true; this.session = null; this.incoming = null; this.socketGeneration++; this.rejectPending(new Error('Phone connection is closed.')); this.socket?.close(); this.socket = null; this.setStatus({connected: false}); }
}

export {deriveRelayToken, seal, open, PhoneConnection, bytesToBase64Url, base64UrlToBytes};
