// KSFAssistant draft-thread sequence; MIT attribution in NOTICE.md.
import { spawn, execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { failure, parse, stringify } from './protocol.js';
import { workbenchPermissions } from './permissions.js';
import { platform } from '../platform/index.js';

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');
export async function locateCLI() {
  const candidates = [process.env.KSF_CODEX_DESKTOP_CLI, ...platform.desktopCandidates()].filter(Boolean);
  for (const file of candidates) { try { await access(file, constants.X_OK); return file; } catch {} }
  throw failure('CODEX_CLI_MISSING', '未找到 Codex Desktop 随包 CLI。');
}
export class AppServer {
  constructor(executable, cwd) { this.executable = executable; this.cwd = cwd; this.pending = new Map(); this.next = 0; }
  async start() {
    if (this.child) return;
    const env = { ...process.env, CODEX_HOME: codexHome() };
    // A Web host started from a Codex terminal must not lend its parent chat's
    // native identity to another App Server process.
    delete env.CODEX_THREAD_ID; delete env.CODEX_TURN_ID;
    const child = spawn(this.executable, ['app-server', '--listen', 'stdio://'], { cwd: this.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child; child.stderr.resume();
    this.exited = new Promise(resolve => child.once('close', resolve));
    const fail = () => { for (const p of this.pending.values()) p.reject(failure('CODEX_APP_SERVER', 'Codex App Server 已退出。')); this.pending.clear(); };
    child.once('error', fail); child.once('close', fail); child.stdin.on('error', fail);
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let value; try { value = parse(line); } catch { return; }
      const p = this.pending.get(value.id); if (!p) return;
      this.pending.delete(value.id); value.error ? p.reject(failure('CODEX_APP_SERVER', value.error.message)) : p.resolve(value.result);
    });
    await this.call('initialize', { clientInfo: { name: 'ksf_workbench', title: 'KSF 工作台', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(stringify({ method: 'initialized', params: {} }) + '\n');
  }
  call(method, params) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(failure('CODEX_APP_SERVER_TIMEOUT', 'App Server 请求超时。')); }, 15000);
      const done = fn => value => { clearTimeout(timer); fn(value); };
      this.pending.set(id, { resolve: done(resolve), reject: done(reject) });
      this.child.stdin.write(stringify({ id, method, params }) + '\n', error => { if (error) { this.pending.delete(id); clearTimeout(timer); reject(error); } });
    });
  }
  async close() {
    if (!this.child) return;
    const child = this.child; this.child = null;
    child.stdin.end();
    // Let the native writer flush and exit on EOF before terminating it.
    // Windows has no POSIX SIGTERM handler; immediate termination loses flushes.
    const terminate = setTimeout(() => child.kill('SIGTERM'), 250);
    const force = setTimeout(() => child.kill('SIGKILL'), 4000);
    try { await this.exited; } finally { clearTimeout(terminate); clearTimeout(force); }
  }
}
export async function createDraft({ root, name, onCreated, executable }) {
  const server = new AppServer(executable ?? await locateCLI(), root);
  try {
    const permissions = workbenchPermissions(root);
    await server.start();
    if (permissions) {
      let cursor, found = false;
      for (let page = 0; page < 8; page++) {
        const profiles = await server.call('permissionProfile/list', { cwd: root, ...(cursor ? { cursor } : {}) });
        found = profiles.data?.some(p => p.id === permissions.id && p.allowed === true);
        cursor = profiles.nextCursor;
        if (found || !cursor) break;
      }
      if (!found) throw failure('CODEX_PERMISSIONS_UNAVAILABLE', '当前 Codex 不允许使用已选择的 KSF 聊天状态权限。');
    }
    const started = await server.call('thread/start', { cwd: root, serviceName: 'ksf_workbench', ...(permissions ? { permissions: permissions.id } : {}) });
    const threadId = started.thread?.id;
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(threadId ?? '')) throw failure('CODEX_PROTOCOL', 'App Server 未返回有效线程。');
    await onCreated?.(threadId, { permissionProfile: started.activePermissionProfile?.id ?? null });
    if (permissions && started.activePermissionProfile?.id !== permissions.id) throw failure('CODEX_PERMISSIONS_MISMATCH', '原生线程没有采用所选 KSF 聊天状态权限，未投递首句。');
    await server.call('thread/name/set', { threadId, name });
    await server.call('thread/inject_items', { threadId, items: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ taskName: name, workingDirectory: root }) }] }] });
    return threadId;
  } finally { await server.close(); } // A second writer must never race Desktop's resume.
}
export function openDesktop(threadId) {
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(threadId)) throw failure('CODEX_THREAD_INVALID', '线程标识无效。');
  const command = platform.openURI(`codex://threads/${threadId}`);
  return new Promise((resolve, reject) => execFile(command.executable, command.args, { timeout: 10000, windowsHide: true }, error => error ? reject(failure('CODEX_OPEN_FAILED', '无法在 Desktop 打开聊天。')) : resolve()));
}
