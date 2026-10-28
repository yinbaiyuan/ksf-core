import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, lstat, readFile, open, rename, rm, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { requireAI, fail,sha256,canonical } from './schema.js';
import {replaceFile,syncDirectory} from '../platform/index.js';
export {syncDirectory};

export async function safeDirectory(root, target) {
  const base = resolve(root), rel = relative(base, resolve(target));
  requireAI(rel === '' || (!rel.startsWith('..') && !rel.includes(':')), 'AI_PATH_INVALID', 'AI 数据路径越界。');
  let current = base;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(current);
    requireAI(stat.isDirectory() && !stat.isSymbolicLink(), 'AI_PATH_INVALID', 'AI 数据目录不能是符号链接。');
  }
}
export async function atomicJSON(path, value) {
  const bytes = JSON.stringify(value) + '\n';
  requireAI(Buffer.byteLength(bytes) <= 8 * 1024 * 1024, 'AI_STORAGE_LIMIT', '任务记录超过存储上限，已保留原件。');
  const temp = `${path}.${randomUUID()}.tmp`;
  let fd;
  try { fd = await open(temp, 'wx', 0o600); await fd.writeFile(bytes); await fd.sync(); await fd.close(); fd = undefined; await replaceFile(temp, path); await syncDirectory(dirname(path)); }
  finally { await fd?.close(); await rm(temp, { force: true }); }
}
export async function readJSON(path, fallback) {
  try {
    const stat = await lstat(path);
    requireAI(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 8 * 1024 * 1024, 'AI_STORAGE_INVALID', 'AI 数据必须是有界普通文件。');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; if (error instanceof SyntaxError) throw fail('AI_STORAGE_INVALID', 'AI 记录损坏；请保留原件并检查。'); throw error; }
}
export async function createAIStore(root) {
  const home = join(root, '.agents/user-data/ai'), runtime = join(root, '.agents/runtime-data/ai');
  await safeDirectory(root, home); await safeDirectory(root, runtime);
  for (const dir of ['tasks', 'materials', 'results']) await safeDirectory(root, join(home, dir));
  const lockPath = join(runtime, 'writer.lock'), owner = { schemaVersion: 1, pid: process.pid, hostname: hostname(), nonce: randomUUID() };
  let lock;
  for (let i = 0; i < 2; i++) {
    try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify(owner)); await lock.sync(); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const old = await readJSON(lockPath); let dead = false;
      if (old.hostname === hostname() && Number.isSafeInteger(old.pid) && old.pid > 0) { try { process.kill(old.pid, 0); } catch (probe) { dead = probe.code === 'ESRCH'; } }
      // Live or reused PID is intentionally conservative: never steal its lock.
      if (i === 0 && dead && (await readJSON(lockPath)).nonce === old.nonce) { await rm(lockPath); continue; }
      throw fail('AI_SERVICE_BUSY', '本实例已有 AI 协调进程，或写锁归属无法核实。', { status: 409 });
    }
  }
  async function close() { if (!lock) return; await lock.close(); lock = undefined; if ((await readJSON(lockPath)).nonce === owner.nonce) await rm(lockPath); }
  try {
    const tasks = new Map();
    for (const name of await readdir(join(home, 'tasks'))) if (name.endsWith('.json')) {
      requireAI(/^[a-f0-9-]{36}\.json$/.test(name), 'AI_STORAGE_INVALID', '未知任务记录，请保留并检查。');
      const task = await readJSON(join(home, 'tasks', name));
      requireAI(task.schemaVersion === 1 && task.aiTaskId === name.slice(0, -5) && task.request && task.snapshot && task.events?.length && Array.isArray(task.attempts), 'AI_STORAGE_VERSION', '任务存储格式未知或损坏，拒绝覆盖。');
      requireAI(['queued','running','retry_wait','reconciling','succeeded','failed','cancelled'].includes(task.status)&&Number.isSafeInteger(task.revision)&&task.events.length===task.revision&&task.events.every((event,index)=>event.seq===index+1)&&task.events.at(-1).status===task.status&&task.requestDigest===sha256(canonical(task.request))&&task.appId===task.caller?.appId,'AI_STORAGE_INVALID','任务状态、请求摘要或事件序列损坏，拒绝派发。');
      tasks.set(task.aiTaskId, task);
    }
    return { home, runtime, tasks, close, async save(task) { await atomicJSON(join(home, 'tasks', task.aiTaskId + '.json'), task); tasks.set(task.aiTaskId, task); } };
  } catch (error) { await close(); throw error; }
}
