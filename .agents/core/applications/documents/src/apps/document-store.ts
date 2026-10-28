import { APIError, getSession, request, workspaceChanged, type WorkspaceFile } from '@ksf/sdk/apps/client';

export interface DocumentState { path: string; file?: WorkspaceFile; text: string; base: string; dirty: boolean; saving: boolean; error?: string; disk?: WorkspaceFile; draftError?: string; composing: boolean; revision: number }
const documents = new Map<string, DocumentState>(), listeners = new Map<string, Set<() => void>>(), timers = new Map<string, ReturnType<typeof setTimeout>>(), loads = new Map<string, Promise<void>>(), saves = new Map<string, Promise<void>>();
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('ksf-workbench-documents', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('drafts');
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); open.onblocked = () => reject(Error('恢复草稿数据库被其他标签页阻塞。'));
  }).catch(error => { database = undefined; throw error; });
}
async function draft(operation: 'get' | 'put' | 'delete', path: string, value?: unknown) {
  const session = await getSession(), database = await db(), key = `${session.instanceId}:${path}`;
  return new Promise<any>((resolve, reject) => {
    const tx = database.transaction('drafts', operation === 'get' ? 'readonly' : 'readwrite'), store = tx.objectStore('drafts');
    const result = operation === 'get' ? store.get(key) : operation === 'put' ? store.put(value, key) : store.delete(key);
    tx.oncomplete = () => resolve(result.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
function publish(path: string, patch: Partial<DocumentState>) {
  const old = documentState(path); documents.set(path, { ...old, ...patch, revision: old.revision + 1 });
  for (const notify of listeners.get(path) ?? []) notify();
}
export function documentState(path: string): DocumentState { let value = documents.get(path); if (!value) { value = { path, text: '', base: '', dirty: false, saving: false, composing: false, revision: 0 }; documents.set(path, value); } return value; }
export function subscribeDocument(path: string, notify: () => void) { let set = listeners.get(path); if (!set) { set = new Set(); listeners.set(path, set); } set.add(notify); return () => { set!.delete(notify); if (!set!.size) listeners.delete(path); }; }
export async function loadDocument(path: string) {
  if (!path || documentState(path).file) return;
  if (loads.has(path)) return loads.get(path);
  const pending = (async () => {
    try {
      const file = await request<WorkspaceFile>('/api/workspace/file?' + new URLSearchParams({ path }));
      let recovery: any;
      try { recovery = await draft('get', path); } catch (error) { publish(path, { draftError: '本机恢复草稿不可用：' + (error as Error).message }); }
      if (recovery && typeof recovery.text === 'string' && recovery.text !== file.text) publish(path, { file, text: recovery.text, base: recovery.base ?? file.text, dirty: true, disk: recovery.version !== file.version ? file : undefined, error: recovery.version !== file.version ? '恢复草稿与磁盘版本不同，请比较后合并。' : '已恢复未保存草稿，请检查后保存。' });
      else publish(path, { file, text: file.text, base: file.text, dirty: false, error: undefined });
    } catch (error) { publish(path, { error: (error as Error).message }); }
  })().finally(() => loads.delete(path));
  loads.set(path, pending); return pending;
}
function schedule(path: string) {
  clearTimeout(timers.get(path));
  const doc = documentState(path);
  if (doc.dirty && doc.file?.writable && !doc.composing && !doc.disk && !doc.error) timers.set(path, setTimeout(() => void saveDocument(path), 800));
}
export function editDocument(path: string, text: string) {
  const current = documentState(path); if (!current.file?.writable || current.text === text) return;
  publish(path, { text, dirty: text !== current.base, error: current.disk ? current.error : undefined });
  void retainDraft(path); schedule(path);
}
export function composeDocument(path: string, composing: boolean) { publish(path, { composing }); schedule(path); }
export async function retainDraft(path: string) {
  const doc = documentState(path);
  try { if (doc.dirty) await draft('put', path, { text: doc.text, base: doc.base, version: doc.file?.version, at: Date.now() }); else await draft('delete', path); }
  catch (error) { publish(path, { draftError: '恢复草稿写入失败：' + (error as Error).message }); }
}
export async function saveDocument(path: string) {
  clearTimeout(timers.get(path));
  if (saves.has(path)) { await saves.get(path); if (documentState(path).dirty && !documentState(path).error) return saveDocument(path); return; }
  const doc = documentState(path); if (!doc.dirty || !doc.file?.writable || doc.composing || doc.disk) return;
  const pending = (async () => {
    publish(path, { saving: true, error: undefined });
    try {
      const file = await request<WorkspaceFile>('/api/workspace/save', { path, text: doc.text, version: doc.file!.version });
      const current = documentState(path);
      publish(path, { file, base: file.text, dirty: current.text !== file.text, saving: false, error: undefined });
      await retainDraft(path); workspaceChanged(); schedule(path);
    } catch (error) {
      publish(path, { saving: false, error: (error as Error).message, disk: error instanceof APIError ? error.data?.disk : undefined });
      if (error instanceof APIError && error.code === 'WORKSPACE_CONFLICT' && !documentState(path).disk) await checkDocument(path);
      await retainDraft(path);
    }
  })().finally(() => saves.delete(path));
  saves.set(path, pending); await pending;
}
export async function checkDocument(path: string) {
  const doc = documentState(path); if (!doc.file || doc.saving) return;
  try {
    const disk = await request<WorkspaceFile>('/api/workspace/file?' + new URLSearchParams({ path }));
    const current = documentState(path);
    if (current.saving || current.file?.version !== doc.file.version) return;
    if (current.file?.version === disk.version) return;
    if (current.dirty) { publish(path, { disk, error: '磁盘文件已变化，自动保存已暂停。' }); await retainDraft(path); }
    else publish(path, { file: disk, text: disk.text, base: disk.text, error: undefined, disk: undefined });
  } catch (error) { publish(path, { error: (error as Error).message }); }
}
export async function unlockDocument(path: string) { const file = await request<WorkspaceFile>('/api/workspace/unlock', { path }); publish(path, { file }); schedule(path); }
export function resolveDocument(path: string, text?: string) {
  const doc = documentState(path); if (!doc.disk) return;
  const disk = doc.disk, next = text ?? disk.text;
  publish(path, { file: disk, text: next, base: disk.text, dirty: next !== disk.text, disk: undefined, error: undefined });
  void retainDraft(path); schedule(path);
}
export async function flushDocuments(repoPath: string) {
  for (const [path, doc] of documents) if (doc.dirty && (repoPath === '.' || path === repoPath || path.startsWith(repoPath + '/'))) {
    await saveDocument(path);
    if (documentState(path).dirty) throw Error(`${path} 尚未保存，请先处理文档中的冲突或保存错误。`);
  }
}
