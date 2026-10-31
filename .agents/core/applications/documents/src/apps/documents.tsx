import { useContextMenu, copyText } from '@ksf/sdk/components/ui/context-menu';
import { WindowToolbar } from '@ksf/sdk/window-toolbar';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, Search, Plus, PanelLeft, List, ImagePlus, Save, Code2, Columns2, Eye, PencilLine, Unlock, ArrowRight, X, RefreshCw } from 'lucide-react';
import type { AppProps } from '@ksf/sdk/desktop/registry';
import { useWindowContext, useWindowState } from '@ksf/sdk/window-context';
import { Sheet } from '@ksf/sdk/components/ui/sheet';
import { closeGuards } from '@ksf/sdk/apps/app-services';
import { getSession, query, request, useResource, workspaceChanged, workspaceMoved, type TreeEntry } from '@ksf/sdk/apps/client';
import { checkDocument, documentState, editDocument, flushDocuments, loadDocument, resolveDocument, retainDraft, saveDocument, subscribeDocument, unlockDocument } from './document-store';
import { headingId } from './document-model';
const Editor = lazy(() => import('./markdown-editor'));
const Preview = lazy(() => import('./rich-preview'));
const parent = (path: string) => path.split('/').slice(0, -1).join('/');
function useDocument(path: string) { return useSyncExternalStore(notify => subscribeDocument(path, notify), () => documentState(path)); }
function Tree({ path = '', selected, open, move }: { path?: string; selected: string; open: (path: string) => void; move: (path: string) => void }) {
  const contextMenu=useContextMenu(), [visible, setVisible] = useState(100);
  const tree = useResource<{ entries: TreeEntry[] }>(query('/api/workspace/tree', { path }));
  return <>{tree.error && <p className="app-error">{tree.error}<button onClick={tree.refresh}>重试</button></p>}{tree.loading && <p className="app-subtle">读取目录…</p>}{tree.data?.entries.slice(0,visible).map(entry => <TreeNode key={entry.path} entry={entry} selected={selected} open={open} move={move} contextMenu={contextMenu} />)}{tree.data && tree.data.entries.length>visible && <button className="app-text-button" onClick={()=>setVisible(visible+200)}>显示更多（剩余 {tree.data.entries.length-visible} 项）</button>}{contextMenu.menu}</>;
}
function TreeNode({ entry, selected, open, move, contextMenu }: { contextMenu:ReturnType<typeof useContextMenu>; entry: TreeEntry; selected: string; open: (path: string) => void; move: (path: string) => void }) {
  const [expanded, setExpanded] = useState(selected.startsWith(entry.path + '/') && entry.policy !== 'blocked');
  const folder = entry.kind === 'directory', disabled = entry.policy === 'blocked' || entry.kind === 'symlink';
  return <div className="file-tree-node"><div {...contextMenu.bind(()=>[{id:'open',label:folder?(expanded?'收起目录':'展开目录'):'打开文件',disabled,onAction:()=>folder?setExpanded(value=>!value):open(entry.path)},...folder&&entry.policy==='editable'&&!['项目','知识','能力','档案','repositories'].includes(entry.path)?[{id:'move',label:'重命名 / 移动目录…',onAction:()=>move(entry.path)}]:[],{id:'copy',label:'复制路径',separator:true,onAction:()=>copyText(entry.path)}],`${entry.name} 文件操作`)} className="file-tree-line"><button className={`file-tree-row ${selected === entry.path ? 'selected' : ''}`} disabled={disabled} title={entry.path + (disabled ? ' · 受保护' : '')} onClick={() => folder ? setExpanded(v => !v) : open(entry.path)}>{folder ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="tree-indent" />}{folder ? <Folder size={15} /> : <FileText size={14} />}<span>{entry.name}</span>{entry.policy !== 'editable' && <small>{entry.policy === 'system' ? '系统' : '只读'}</small>}</button>{folder && entry.policy === 'editable' && !['项目','知识','能力','档案','repositories'].includes(entry.path) && <button className="tree-move-button" aria-label={`重命名或移动目录 ${entry.path}`} title="重命名 / 移动目录" onClick={() => move(entry.path)}><PencilLine size={12} /></button>}</div>{folder && expanded && <div className="file-tree-children"><Tree path={entry.path} selected={selected} open={open} move={move} /></div>}</div>;
}
function Tab({ path, selected, choose, close, menu }: { menu:ReturnType<ReturnType<typeof useContextMenu>['bind']>; path: string; selected: boolean; choose: () => void; close: () => void }) { const doc = useDocument(path); return <div {...menu} className={`document-tab ${selected ? 'selected' : ''}`}><button onClick={choose} title={path}><FileText size={14} /><span>{path.split('/').at(-1)}</span>{doc.dirty && <i aria-label="未保存" />}</button><button aria-label={`关闭 ${path}`} onClick={close}><X size={13} /></button></div>; }
export function DocumentsApp({ search, navigate, openApp }: AppProps) {
  const contextMenu=useContextMenu();
  const path = search.get('path') ?? '', doc = useDocument(path), context = useWindowContext();
  const [tabs, setTabs] = useWindowState<string[]>('document-tabs', []), [mode, setMode] = useWindowState<'live' | 'source' | 'split' | 'read'>('document-mode', 'live');
  const [sidebar, setSidebar] = useState(true), [outline, setOutline] = useState(true), [term, setTerm] = useState(''), [debounced, setDebounced] = useState(''), [line, setLine] = useState(0);
  const [recent, setRecent] = useState<string[]>([]), [error, setError] = useState(''), [form, setForm] = useState<'file' | 'directory' | 'move' | 'copy' | null>(null), [formPath, setFormPath] = useState(''), [busy, setBusy] = useState(false);
  const [merging, setMerging] = useState(false), [mergeText, setMergeText] = useState(''), [closing, setClosing] = useState(false);
  const [directoryMove, setDirectoryMove] = useState<{ path: string; version: string } | null>(null);
  const closingReply = useRef<((v: boolean) => void) | undefined>(undefined), uploadInput = useRef<HTMLInputElement>(null), previewRoot = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs); tabsRef.current = tabs;
  const results = useResource<{ matches: { path: string; line: number; text: string }[]; truncated: boolean }>(debounced ? query('/api/workspace/search', { q: debounced }) : null);
  const headings = doc.text.split(/\r?\n/).flatMap((text, index) => { const match = text.match(/^(#{1,6})\s+(.+?)\s*#*$/); return match ? [{ level: match[1].length, text: match[2], line: index + 1 }] : []; });
  const markdown = /\.(md|markdown)$/i.test(path), large = doc.text.length > 1024 * 1024;
  const effectiveMode = !markdown || large ? mode === 'read' ? 'read' : 'source' : mode;
  const open = (next: string, hash?: string) => { navigate({ path: next, app: 'com.ksf.markdown', hash: hash || null }); setLine(0); };
  useEffect(() => { const timer = setTimeout(() => setDebounced(term.trim()), 300); return () => clearTimeout(timer); }, [term]);
  useEffect(() => {
    if (!path) return;
    setTabs(current => current.includes(path) ? current : [...current, path]);
    void loadDocument(path);
    void getSession().then(session => { try { const key = `ksf.documents.recent.${session.instanceId}`, next = [path, ...JSON.parse(localStorage.getItem(key) ?? '[]').filter((p: unknown) => typeof p === 'string' && p !== path)].slice(0, 12); localStorage.setItem(key, JSON.stringify(next)); setRecent(next); } catch {} });
  }, [path]);
  useEffect(() => { void getSession().then(session => { try { setRecent(JSON.parse(localStorage.getItem(`ksf.documents.recent.${session.instanceId}`) ?? '[]')); } catch {} }); }, []);
  useEffect(() => {
    const moved = (event: Event) => {
      const { previousPath, path: destination } = (event as CustomEvent<{ previousPath: string; path: string }>).detail;
      const replace = (value: string) => value === previousPath || value.startsWith(previousPath + '/') ? destination + value.slice(previousPath.length) : value;
      setTabs(current => current.map(replace));
      if (replace(path) !== path) navigate({ path: replace(path), hash: null });
    };
    window.addEventListener('ksf:files-moved', moved); return () => window.removeEventListener('ksf:files-moved', moved);
  }, [path, navigate]);
  useEffect(() => { if (!path || !context.enabled) return; const timer = setInterval(() => { if (!document.hidden) void checkDocument(path); }, 3000); const focus = () => void checkDocument(path); window.addEventListener('focus', focus); return () => { clearInterval(timer); window.removeEventListener('focus', focus); }; }, [path, context.enabled]);
  useEffect(() => {
    const guard = async () => {
      for (const name of tabsRef.current) { await saveDocument(name); await retainDraft(name); }
      if (!tabsRef.current.some(name => documentState(name).dirty)) return true;
      return new Promise<boolean>(resolve => { closingReply.current = resolve; setClosing(true); });
    };
    closeGuards.set(context.id, guard);
    const unload = (event: BeforeUnloadEvent) => { if (tabsRef.current.some(name => documentState(name).dirty)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unload);
    return () => { closeGuards.delete(context.id); window.removeEventListener('beforeunload', unload); closingReply.current?.(false); };
  }, [context.id]);
  useEffect(() => { const hash = search.get('hash'); if (hash && effectiveMode === 'read') setTimeout(() => previewRoot.current?.querySelector<HTMLElement>('#' + CSS.escape(hash))?.scrollIntoView(), 100); }, [search.get('hash'), doc.file?.version, effectiveMode]);
  const closeTab = async (name: string) => {
    await saveDocument(name); await retainDraft(name);
    if (documentState(name).dirty) { setError('此文件尚未保存。请先合并、另存副本，或通过窗口关闭入口保留恢复草稿。'); return; }
    const next = tabs.filter(t => t !== name); setTabs(next); if (path === name) navigate({ path: next.at(-1) ?? null, hash: null });
  };
  const showForm = (kind: typeof form) => { setDirectoryMove(null); setForm(kind); setFormPath(kind === 'move' ? path : kind === 'copy' ? path.replace(/(\.[^/.]+)?$/, '-副本$1') : [parent(path), kind === 'directory' ? '新建目录' : '未命名.md'].filter(Boolean).join('/')); setError(''); };
  const beginDirectoryMove = (source: string) => { void flushDocuments(source).then(() => request<{ path: string; version: string }>(query('/api/workspace/tree', { path: source }))).then(directory => { setDirectoryMove(directory); setFormPath(source); setForm('move'); setError(''); }).catch(error => setError(error.message)); };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (form === 'move') { const source = directoryMove?.path ?? path; await flushDocuments(source); await request('/api/workspace/move', { path: source, destination: formPath, version: directoryMove?.version ?? documentState(path).file?.version }); workspaceMoved(source, formPath); }
      else { await request('/api/workspace/create', { path: formPath, kind: form === 'directory' ? 'directory' : 'file', text: form === 'copy' ? doc.text : '' }); if (form !== 'directory') open(formPath); }
      setForm(null); workspaceChanged();
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  };
  const upload = async (file: File, insert: (text: string) => void) => {
    setError('');
    try {
      if (file.size > 20 * 1024 * 1024) throw Error('图片超过 20 MiB。');
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await request<{ relativePath: string }>('/api/workspace/upload', { path, name: file.name, base64 }); insert(`![${file.name.replace(/[\[\]]/g, '')}](${encodeURI(result.relativePath)})`); workspaceChanged();
    } catch (error) { setError((error as Error).message); }
  };
  const jump = (target: number, title: string) => { setLine(target); if (effectiveMode === 'read') previewRoot.current?.querySelector<HTMLElement>('#' + CSS.escape(headingId(title)))?.scrollIntoView({ block: 'start' }); };
  return <div className="builtin-app documents-app">
    <WindowToolbar object={{title:path?.split('/').at(-1)||'KSF文档',detail:path}} navigation={<><button aria-label="切换文件树" title="切换文件树" onClick={() => setSidebar(v => !v)}><PanelLeft size={17} /></button><span className="app-breadcrumb" title={path}>{path || 'KSF文档'}</span></>} actions={[
      { id:'new-file', label:'新建文件', icon:Plus, priority:2, onAction:() => showForm('file') },
      { id:'new-directory', label:'新建目录', icon:Folder, onAction:() => showForm('directory') },
      { id:'outline', label:'大纲', icon:List, pressed:outline, onAction:() => setOutline(v => !v) },
    ]} />
    <div className="document-layout">{sidebar && <aside className="app-sidebar document-sidebar"><label className="app-search"><Search size={15} /><input value={term} onChange={e => setTerm(e.target.value)} placeholder="搜索文件与正文" aria-label="搜索 KSF 文件" />{term && <button onClick={() => setTerm('')} aria-label="清空搜索"><X size={13} /></button>}</label><div className="app-sidebar-scroll">{debounced ? <><p className="app-subtle">{results.loading ? '搜索中…' : `${results.data?.matches.length ?? 0} 个结果${results.data?.truncated ? ' · 已截断，请缩小关键词' : ''}`}</p>{results.error && <p className="app-error">{results.error}</p>}{results.data?.matches.map((match, index) => <button className="file-search-result" key={index} onClick={() => { open(match.path); setLine(match.line); }}><strong>{match.path}</strong><small>{match.line ? `${match.line} · ` : ''}{match.text}</small></button>)}</> : <Tree selected={path} open={open} move={beginDirectoryMove} />}</div><div className="sidebar-foot">本机文件 · 原位编辑</div></aside>}
      <main className="document-workspace"><div className="document-tabs">{tabs.map(name => <Tab key={name} menu={contextMenu.bind(()=>[{id:'open',label:'切换到此文档',onAction:()=>open(name)},{id:'save',label:'保存文档',disabled:!documentState(name).file?.writable,onAction:()=>saveDocument(name)},{id:'copy',label:'复制文件路径',separator:true,onAction:()=>copyText(name)},{id:'close',label:'关闭此标签',onAction:()=>closeTab(name)}],`${name} 标签操作`)} path={name} selected={path === name} choose={() => open(name)} close={() => void closeTab(name)} />)}</div>
        {!path ? <div className="app-welcome"><span className="welcome-icon"><FileText size={35} /></span><h2>KSF文档</h2><p>打开 KSF 文件，继续阅读与写作。</p><button className="app-primary" onClick={() => showForm('file')}><Plus size={15} />新建 Markdown</button><h3>最近打开</h3>{recent.map(name => <button key={name} onClick={() => open(name)}><FileText size={16} /><span>{name}</span><ArrowRight size={14} /></button>)}</div> : <>
          <div {...contextMenu.bind(()=>[{id:'save',label:'保存文档',disabled:!doc.file?.writable||doc.saving,onAction:()=>saveDocument(path)},{id:'rename',label:'重命名 / 移动…',disabled:!doc.file?.writable,onAction:()=>showForm('move')},{id:'copy-file',label:'另存副本…',onAction:()=>showForm('copy')},{id:'copy-path',label:'复制文件路径',separator:true,onAction:()=>copyText(path)},{id:'reload',label:'重新检查磁盘版本',onAction:()=>checkDocument(path)}],'当前文档操作')} className="document-modebar"><div className="app-segmented">{([['live', PencilLine, '即时预览'], ['source', Code2, '源码'], ['split', Columns2, '分栏'], ['read', Eye, '阅读']] as const).map(([value, Icon, name]) => <button key={value} aria-pressed={mode === value} disabled={(!markdown || large) && ['live', 'split'].includes(value)} onClick={() => setMode(value)}><Icon size={14} /><span>{name}</span></button>)}</div><div className="document-file-actions">{doc.file?.policy === 'system' && !doc.file.writable && <button onClick={() => void unlockDocument(path).catch(e => setError(e.message))}><Unlock size={14} />解锁此文件</button>}<button disabled={!doc.file?.writable} title="插入图片" onClick={() => uploadInput.current?.click()}><ImagePlus size={16} /></button><button disabled={!doc.file?.writable || doc.saving} title="立即保存（Cmd/Ctrl+S）" onClick={() => void saveDocument(path)}><Save size={16} /></button><details><summary aria-label="文件操作">•••</summary><div><button disabled={!doc.file?.writable} onClick={() => showForm('move')}>重命名 / 移动</button><button onClick={() => showForm('copy')}>另存副本</button><button onClick={() => void request<{repo:string;path:string}>(query('/api/git/repositories', {path})).then(owner => openApp?.('com.ksf.git',new URLSearchParams(owner).toString())).catch(e => setError(e.message))}>在 KSF仓库中查看</button><button onClick={() => void checkDocument(path)}>重新检查磁盘版本</button></div></details></div></div>
          {large && <p className="app-notice">大文档已切换为源码模式，完整内容仍可编辑。</p>}
          {(doc.error || error || doc.draftError) && <div className="app-error" role="alert">{error || doc.error || doc.draftError}{doc.disk && <><button onClick={() => { setMergeText(doc.text); setMerging(true); }}>比较与合并</button><button onClick={() => showForm('copy')}>另存副本</button></>}{!doc.disk && doc.dirty && <button onClick={() => void saveDocument(path)}>重试保存</button>}{!doc.file && <button onClick={() => void loadDocument(path)}>重新读取</button>}</div>}
          {doc.file ? <div className={`document-content mode-${effectiveMode}`}><Suspense fallback={<p className="app-loading">正在加载编辑器…</p>}>{<Editor key={path} path={path} text={doc.text} writable={doc.file.writable} mode={effectiveMode === 'source' || effectiveMode === 'split' ? 'source' : 'live'} line={line} open={open} onUpload={upload} />}{(effectiveMode === 'read' || effectiveMode === 'split') && <div ref={previewRoot} className="document-preview-scroll"><Preview text={doc.text} path={path} open={open} /></div>}</Suspense></div> : !doc.error && <div className="app-loading"><RefreshCw size={17} />正在读取文件…</div>}
          <footer className="document-status"><span className={doc.error ? 'has-error' : ''}>{doc.saving ? '正在保存…' : doc.disk ? '版本冲突 · 自动保存已暂停' : doc.error ? '保存 / 读取异常' : doc.dirty ? '尚未保存' : doc.file ? doc.file.writable ? '已保存到原文件' : '只读' : '正在读取'}</span><span>{doc.text.length.toLocaleString()} 字符 · {doc.text.includes('\r\n') ? 'CRLF' : 'LF'} · UTF-8</span></footer>
        </>}
      </main>{outline && path && <aside className="document-outline"><h3>大纲</h3>{headings.length ? headings.map(h => <button key={h.line} className={`outline-level-${h.level}`} onClick={() => jump(h.line, h.text)}>{h.text}</button>) : <p className="app-subtle">当前文件没有标题</p>}</aside>}
    </div><input ref={uploadInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, text => editDocument(path, doc.text + '\n' + text)); e.target.value = ''; }} />
    <Sheet open={!!form} onOpenChange={open => { if (!open) setForm(null); }} title={form === 'move' ? directoryMove ? '重命名或移动目录' : '重命名或移动文件' : form === 'copy' ? '另存副本' : form === 'directory' ? '新建目录' : '新建 Markdown 文件'} solid><form className="app-form" onSubmit={e => { e.preventDefault(); void submit(); }}><label>KSF 内的相对路径<input autoFocus value={formPath} onChange={e => setFormPath(e.target.value)} required /></label>{form === 'move' && <p className="app-notice">移动可能影响相对链接。本次不批量改写引用；目录内未保存文档会先保存，其他窗口中的文件路径同步更新。</p>}{error && <p className="app-error">{error}</p>}<button className="app-primary" disabled={busy}>{busy ? '正在处理…' : form === 'move' ? directoryMove ? '移动目录' : '移动文件' : '创建'}</button></form></Sheet>
    <Sheet open={merging} onOpenChange={setMerging} title="比较磁盘变化" className="wide-sheet" solid><p>自动保存已暂停。检查三份内容后，将需要保留的内容写入合并结果。</p><div className="document-conflict-inputs"><label>共同基线<textarea readOnly value={doc.base} /></label><label>磁盘当前版本<textarea readOnly value={doc.disk?.text ?? ''} /></label></div><label className="conflict-result">本地编辑 / 合并结果<textarea value={mergeText} onChange={e => setMergeText(e.target.value)} /></label><div className="app-actions"><button onClick={() => { resolveDocument(path); setMerging(false); }}>采用磁盘版本</button><button className="app-primary" onClick={() => { resolveDocument(path, mergeText); setMerging(false); }}>采用合并结果并恢复保存</button></div></Sheet>
    <Sheet open={closing} onOpenChange={open => { if (!open) { closingReply.current?.(false); closingReply.current = undefined; setClosing(false); } }} title="文档仍有未保存内容" solid><p>保存失败或版本冲突尚未解决。恢复草稿会留在此浏览器，重新打开文件时可恢复。</p>{tabs.some(name => documentState(name).draftError) && <p className="app-error">部分恢复草稿写入失败，请返回编辑并另存副本后关闭。</p>}<div className="app-actions"><button onClick={() => { closingReply.current?.(false); closingReply.current = undefined; setClosing(false); }}>返回编辑</button><button disabled={tabs.some(name => !!documentState(name).draftError)} onClick={() => { closingReply.current?.(true); closingReply.current = undefined; setClosing(false); }}>保留草稿并关闭</button></div></Sheet>
    {contextMenu.menu}
  </div>;
}
