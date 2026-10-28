import { replaceFileSync as renameSync } from '../platform/index.js';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { managedPath } from '../routing/storage.js';
import { withExclusiveLock, withTemporaryFile } from '../shared/files.js';
import { failure } from './protocol.js';
const BASE = '.agents/user-data/codex-conversations/v1';
export function createStore(root) {
  root = realpathSync(root);
  const read = () => {
    const path = managedPath(root, `${BASE}/state.json`);
    if (!existsSync(path)) return { schemaVersion: 1, bindings: {}, operations: {} };
    const bytes = readFileSync(path);
    if (bytes.length > 8 * 1024 * 1024) throw failure('CODEX_STORE_CAPACITY', '会话回执存储达到容量上限，请保留并检查。');
    let value; try { value = JSON.parse(bytes); } catch { throw failure('CODEX_STORE_INVALID', '会话回执无法读取，原件已保留。'); }
    if (value.schemaVersion !== 1 || !value.bindings || !value.operations) throw failure('CODEX_STORE_INVALID', '会话回执版本或结构不支持。');
    return value;
  };
  return { read, change(action) {
    const lock = managedPath(root, `${BASE}/state.lock`, true);
    return withExclusiveLock(lock, { pid: process.pid }, () => {
      const state = read(), result = action(state), bytes = Buffer.from(JSON.stringify(state) + '\n');
      if (bytes.length > 8 * 1024 * 1024) throw failure('CODEX_STORE_CAPACITY', '会话回执达到容量上限。');
      const path = managedPath(root, `${BASE}/state.json`, true);
      withTemporaryFile(`${path}.${randomUUID()}.tmp`, bytes, {}, file => renameSync(file, path));
      return result;
    }, { onLocked() { throw failure('CODEX_STORE_LOCKED', '另一个服务正在更新会话回执，请稍后重试。'); } });
  } };
}
