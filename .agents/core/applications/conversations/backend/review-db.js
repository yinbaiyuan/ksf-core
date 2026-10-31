import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Unbounded report history, app-owned SQLite. JSON values are the versioned business records. */
export function createReviewDB(directory, name = 'reviews.sqlite') {
  const path = join(directory, name); let db;
  function open(write = false) {
    if (db) return db;
    if (!existsSync(path) && !write) return null;
    if (existsSync(directory) && lstatSync(directory).isSymbolicLink() || existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())) throw Object.assign(Error('回顾数据库需要普通文件，原件已保留。'), { code: 'REVIEW_DATA_INVALID' });
    if (write) mkdirSync(directory, { recursive: true });
    const existed = existsSync(path), candidate = new DatabaseSync(path);
    try {
      candidate.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
      const version = candidate.prepare('PRAGMA user_version').get().user_version;
      if (version !== 0 && version !== 1 || existed && version === 0) throw Object.assign(Error('回顾数据版本不兼容，原件已保留。'), { code: 'REVIEW_DATA_INCOMPATIBLE' });
      if (version === 0) candidate.exec('BEGIN IMMEDIATE; CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id)); PRAGMA user_version=1; COMMIT;');
      db = candidate; return db;
    } catch (error) { candidate.close(); throw error; }
  }
  const get = (kind, id) => { const row = open()?.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id); return row ? JSON.parse(row.value) : null; };
  const list = kind => (open()?.prepare('SELECT value FROM records WHERE kind=? ORDER BY id').all(kind) ?? []).map(row => JSON.parse(row.value));
  const put = (kind, id, value) => open(true).prepare('INSERT INTO records(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind, id, JSON.stringify(value));
  const remove = (kind, id) => open()?.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  return { get, list, put, remove,
    ids:kind=>(open()?.prepare('SELECT id FROM records WHERE kind=? ORDER BY id').all(kind)??[]).map(row=>row.id),
    countStatus:(kind,status)=>open()?.prepare("SELECT count(*) AS total FROM records WHERE kind=? AND json_extract(value,'$.status')=?").get(kind,status).total??0,
    transaction(action) { const connection = open(true); connection.exec('BEGIN IMMEDIATE'); try { const result = action(); connection.exec('COMMIT'); return result; } catch (error) { connection.exec('ROLLBACK'); throw error; } }, close() { db?.close(); db = undefined; }, path };
}
