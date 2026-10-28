// Desktop protocol ported from KSFAssistant (MIT). See NOTICE.md.
import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';

export const MAX_FRAME = 64 * 1024 * 1024;
export const failure = (code, message, outcomeUnknown = false) => Object.assign(new Error(message), { code, status: 409, outcomeUnknown });
export const parse = text => JSON.parse(text, (_key, value, context) => typeof value === 'number' && !Number.isSafeInteger(value) && /^-?\d+$/.test(context?.source ?? '') ? BigInt(context.source) : value);
export const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? JSON.rawJSON(item.toString()) : item);
export function requestRef(value) {
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'bigint' || Number.isSafeInteger(value)) return { type: 'number', value: String(value) };
  throw failure('CODEX_PROTOCOL', '无法识别原生问题标识。');
}
export const sameRef = (a, b) => a?.type === b?.type && a?.value === b?.value;
export const refValue = ref => ref.type === 'number' && /^-?\d+$/.test(ref.value) ? BigInt(ref.value) : ref.type === 'string' ? ref.value : (() => { throw failure('CODEX_PROTOCOL', '问题标识无效。'); })();
export function frame(value) {
  const bytes = Buffer.from(stringify(value));
  if (!bytes.length || bytes.length > MAX_FRAME) throw failure('CODEX_PROTOCOL', 'Desktop IPC 帧超过上限。');
  const header = Buffer.alloc(4); header.writeUInt32LE(bytes.length);
  return Buffer.concat([header, bytes]);
}
export class Frames {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const values = [];
    while (this.buffer.length >= 4) {
      const size = this.buffer.readUInt32LE();
      if (!size || size > MAX_FRAME) throw failure('CODEX_PROTOCOL', 'Desktop IPC 帧长度无效。');
      if (this.buffer.length < size + 4) break;
      values.push(parse(this.buffer.subarray(4, size + 4).toString('utf8')));
      this.buffer = this.buffer.subarray(size + 4);
    }
    return values;
  }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const numeric = v => /^\d+$/.test(String(v ?? ''));

export class DesktopIPC extends EventEmitter {
  constructor(endpoint, { timeoutMs = 15000, clientType = 'ksf-assistant', dial = createConnection } = {}) {
    super(); Object.assign(this, { endpoint, timeoutMs, clientType, dial });
    this.pending = new Map(); this.owners = new Map(); this.snapshots = new Map(); this.loads = new Map(); this.generation = 0;
  }
  async connect() {
    if (this.clientId && this.socket) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.#connect().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async #connect() {
    const socket = this.dial(this.endpoint), generation = ++this.generation, frames = new Frames(); this.socket = socket;
    const broken = () => {
      if (this.socket !== socket) return;
      this.socket = null; this.clientId = null; this.generation++; this.owners.clear(); this.snapshots.clear();
      for (const p of this.pending.values()) p.reject(failure('CODEX_DISCONNECTED', 'Desktop 连接已断开。', p.effectful));
      this.pending.clear(); this.emit('disconnected');
    };
    socket.on('error', broken); socket.on('close', broken);
    socket.on('data', chunk => {
      if (socket !== this.socket || generation !== this.generation) return;
      try { for (const value of frames.push(chunk)) this.#handle(value, generation); }
      catch { socket.destroy(); broken(); }
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(failure('CODEX_OFFLINE', '无法连接 Codex Desktop。')); }, 3000);
        const cleanup = () => { clearTimeout(timer); socket.off('connect', ready); socket.off('error', rejectConnect); };
        const ready = () => { cleanup(); resolve(); }, rejectConnect = () => { cleanup(); reject(failure('CODEX_OFFLINE', 'Codex Desktop 尚未运行。')); };
        socket.once('connect', ready); socket.once('error', rejectConnect);
      });
      const response = await this.request('initialize', { clientType: this.clientType }, { timeoutMs: 3000 });
      this.clientId = response.clientId ?? response.clientID;
      if (!this.clientId) throw failure('CODEX_INCOMPATIBLE', 'Desktop IPC 握手未返回客户端身份。');
    } catch (error) { socket.destroy(); broken(); throw error; }
  }
  #handle(message, generation) {
    if (message.type === 'client-discovery-request') { this.write({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } }); return; }
    if (message.type === 'response') {
      const p = this.pending.get(message.requestId); if (!p) return;
      this.pending.delete(message.requestId);
      if (message.resultType === 'error' || message.error) p.reject(failure('CODEX_REJECTED', typeof message.error === 'string' ? message.error : message.error?.message ?? 'Desktop 拒绝了请求。', p.effectful));
      else p.resolve({ ...message, ...(message.result ?? {}) });
      return;
    }
    if (message.type !== 'broadcast') return;
    const params = message.params ?? {}, id = params.conversationId, owner = message.sourceClientId;
    if (!id || params.hostId && params.hostId !== 'local' || !owner || this.owners.get(id) !== owner) return;
    if (message.method !== 'thread-stream-state-changed') return;
    const change = params.change ?? {};
    if (change.type !== 'snapshot') { this.emit('invalidate', id); return; }
    const revision = String(change.revision ?? params.revision ?? '');
    const prior = this.snapshots.get(id);
    if (prior && numeric(revision) && numeric(prior.revision) && BigInt(revision) < BigInt(prior.revision)) return;
    if (!change.conversationState || typeof change.conversationState !== 'object') return;
    const snapshot = { state: change.conversationState, owner, revision, generation, at: Date.now() };
    this.snapshots.set(id, snapshot); this.emit('snapshot', id, snapshot);
  }
  write(value) {
    if (!this.socket || this.socket.destroyed) throw failure('CODEX_DISCONNECTED', 'Desktop IPC 未连接。');
    this.socket.write(frame(value));
  }
  request(method, params, { target, version, timeoutMs = this.timeoutMs, effectful = false, beforeWrite } = {}) {
    const requestId = `ksf-workbench-${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(failure('CODEX_TIMEOUT', 'Desktop 未及时确认，请核对原会话。', effectful)); }, timeoutMs);
      const done = callback => value => { clearTimeout(timer); callback(value); };
      this.pending.set(requestId, { resolve: done(resolve), reject: done(reject), effectful });
      try {
        beforeWrite?.();
        this.write({ type: 'request', requestId, ...(this.clientId ? { sourceClientId: this.clientId } : {}), ...(target ? { targetClientId: target } : {}), timeoutMs, method, ...(version ? { version } : {}), params });
      } catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }
  async owner(id, { waitMs = 0 } = {}) {
    await this.connect(); const until = Date.now() + waitMs;
    do {
      let response;
      try { response = await this.request('thread-owner-discovery', { conversationId: id, hostId: 'local' }, { version: 1, timeoutMs: Math.min(3000, waitMs || 3000) }); }
      catch (error) {
        // A native Desktop may acknowledge the URI before it has resumed the
        // thread. Only this explicit discovery miss is retryable, never an
        // unsupported protocol or a rejected effectful operation.
        const discoveryMiss = error.code === 'CODEX_REJECTED' && error.message === 'no-client-found';
        if ((!discoveryMiss && error.code !== 'CODEX_TIMEOUT') || Date.now() >= until) throw error;
      }
      const owner = response?.handledByClientId ?? response?.handledByClientID;
      if (owner) {
        if (this.owners.get(id) !== owner) { this.snapshots.delete(id); this.emit('owner', id, owner); }
        this.owners.set(id, owner); return owner;
      }
      this.owners.delete(id); this.snapshots.delete(id);
      if (Date.now() >= until) break;
      await delay(250);
    } while (true);
    throw failure('CODEX_NOT_OWNED', 'Desktop 尚未持有此聊天，请在 Desktop 打开后重试。');
  }
  async load(id, { fresh = false } = {}) {
    await this.connect();
    const cached = this.snapshots.get(id);
    if (!fresh && cached && Date.now() - cached.at < 5000) return cached;
    if (this.loads.has(id)) return this.loads.get(id);
    const task = this.#load(id).finally(() => this.loads.delete(id)); this.loads.set(id, task); return task;
  }
  async #load(id) {
    const owner = await this.owner(id), generation = this.generation;
    let onSnapshot, onDisconnect, timer;
    const snapshot = new Promise((resolve, reject) => {
      onSnapshot = (target, value) => { if (target === id && value.owner === owner && value.generation === generation) resolve(value); };
      onDisconnect = () => reject(failure('CODEX_DISCONNECTED', 'Desktop 连接已断开。'));
      this.on('snapshot', onSnapshot); this.once('disconnected', onDisconnect);
      timer = setTimeout(() => reject(failure('CODEX_TIMEOUT', 'Desktop 未返回聊天快照。')), 6000);
    });
    // Install a rejection handler immediately: the request and snapshot can fail independently.
    snapshot.catch(() => {});
    try {
      this.write({ type: 'broadcast', sourceClientId: this.clientId, method: 'thread-stream-following-changed', version: 1, params: { conversationId: id, hostId: 'local', following: true } });
      await this.request('thread-follower-load-complete-history', { conversationId: id }, { target: owner, version: 1, timeoutMs: 6000 });
      const result = await snapshot;
      if (this.generation !== generation || this.owners.get(id) !== owner) throw failure('CODEX_OWNER_CHANGED', 'Desktop 持有者已改变，请重新读取。');
      return result;
    } finally { clearTimeout(timer); this.off('snapshot', onSnapshot); this.off('disconnected', onDisconnect); }
  }
  unfollow(id) {
    if (this.clientId && this.socket) this.write({ type: 'broadcast', sourceClientId: this.clientId, method: 'thread-stream-following-changed', version: 1, params: { conversationId: id, hostId: 'local', following: false } });
    this.snapshots.delete(id); this.owners.delete(id);
  }
  close() { this.socket?.destroy(); }
}
