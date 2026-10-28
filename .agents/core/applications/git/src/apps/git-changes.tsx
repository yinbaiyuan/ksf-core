import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ExternalLink, GitCommitHorizontal, Minus, Plus, Search, X } from 'lucide-react';
import { useContextMenu, copyText } from '@ksf/sdk/components/ui/context-menu';
import { entryLabel, filterEntries, type GitAction, type GitEntry, type GitStatus, type Selection } from './git-model';
export function Changes({ state, busy, selection, select, run, edit, resolve, message, setMessage, draftReady, draftError, review, history }: {
  state: GitStatus | null; busy: boolean; selection: Selection | null; select: (s: Selection) => void; run: GitAction; edit: (path: string) => void; resolve: (path: string) => void;
  message: string; setMessage: (message: string) => void; draftReady: boolean; draftError: string; review: () => void; history:(path:string)=>void;
}) {
  const contextMenu=useContextMenu(), messageId = useId();
  const [filter, setFilter] = useState(''), [kind, setKind] = useState('all'), [checked, setChecked] = useState<string[]>([]), [collapsed, setCollapsed] = useState<string[]>([]), [limit, setLimit] = useState(200);
  const root = useRef<HTMLDivElement>(null), anchor = useRef('');
  const entries = state?.entries ?? [];
  const groups = useMemo(() => [
    { id: 'conflicts', label: '待解决冲突', entries: entries.filter(e => e.conflict), staged: false },
    { id: 'staged', label: '已暂存', entries: entries.filter(e => !e.conflict && e.index !== '.' && e.index !== '?'), staged: true },
    { id: 'unstaged', label: '未暂存', entries: entries.filter(e => !e.conflict && (e.worktree !== '.' || e.untracked)), staged: false },
  ], [state?.version]);
  const conflicts = groups[0].entries, staged = groups[1].entries;
  const visibleGroups = useMemo(() => groups.map(group => {
    const visible = filterEntries(group.entries, filter, kind);
    return { ...group, visible, keys: visible.filter(e => !e.conflict).map(e => `${group.staged ? 's' : 'w'}:${e.path}`) };
  }), [groups, filter, kind]);
  const key = (entry: GitEntry, staged: boolean) => `${staged ? 's' : 'w'}:${entry.path}`;
  useEffect(() => { const available = new Set(groups.flatMap(g => g.entries.map(e => key(e, g.staged)))); setChecked(previous => previous.filter(k => available.has(k))); }, [state?.version]);
  useEffect(() => { setLimit(200); setChecked([]); }, [filter, kind]);
  const batch = async (staged: boolean, paths: string[]) => { await run(staged ? 'unstage' : 'stage', { paths }); };
  const pick = (entry: GitEntry, staged: boolean) => entry.conflict ? resolve(entry.path) : select({ path: entry.path, staged });
  const toggle = (id: string, range: boolean, rows: string[]) => {
    const a = rows.indexOf(anchor.current), b = rows.indexOf(id);
    const ids = range && a >= 0 ? rows.slice(Math.min(a, b), Math.max(a, b) + 1) : [id];
    setChecked(previous => previous.includes(id) ? previous.filter(k => !ids.includes(k)) : [...new Set([...previous, ...ids])]); anchor.current = id;
  };
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const selectedPaths = (staged: boolean) => (staged ? groups[1] : groups[2]).entries.filter(e => checkedSet.has(key(e, staged))).map(e => e.path);
  const ws = selectedPaths(false), ss = selectedPaths(true), subjectLength = message.split('\n')[0].length;
  return <section className="git-change-list git-change-list-v2" ref={root} aria-label="文件状态">
    <div className="git-list-tools"><label className="app-search"><Search size={14} /><input aria-label="筛选变更文件" placeholder="搜索文件或路径" value={filter} onChange={e => setFilter(e.target.value)} />{filter && <button aria-label="清空文件筛选" onClick={() => setFilter('')}><X size={12} /></button>}</label><select aria-label="文件状态筛选" value={kind} onChange={e => setKind(e.target.value)}><option value="all">所有状态</option><option value="tracked">已跟踪</option><option value="untracked">未跟踪</option><option value="conflict">冲突</option></select></div>
    {checked.length > 0 && <div className="git-batch-bar"><span>选中 {checked.length}</span>{ws.length > 0 && <button disabled={busy || ws.length > 1000} onClick={() => void batch(false, ws)}><Plus size={12} />暂存 {ws.length}</button>}{ss.length > 0 && <button disabled={busy || ss.length > 1000} onClick={() => void batch(true, ss)}><Minus size={12} />取消暂存 {ss.length}</button>}<button aria-label="清空文件选择" onClick={() => setChecked([])}><X size={13} /></button></div>}
    <div className="git-file-groups">{visibleGroups.map(group => {
      const { visible, keys } = group, hidden = collapsed.includes(group.id);
      if (group.id === 'conflicts' && !conflicts.length) return null;
      return <section key={group.id} className={`git-file-group ${group.id}`}><div className="git-group-heading"><button aria-expanded={!hidden} onClick={() => setCollapsed(hidden ? collapsed.filter(id => id !== group.id) : [...collapsed, group.id])}>{hidden ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<strong>{group.label}</strong><small>{visible.length}{visible.length !== group.entries.length ? ` / ${group.entries.length}` : ''}</small></button>{group.id !== 'conflicts' && <><button title="选择当前筛选的全部文件；Shift 点击可连续选择" aria-label={`选择${group.label}筛选结果`} aria-pressed={!!keys.length && keys.every(k => checkedSet.has(k))} disabled={!keys.length || keys.length > 1000} onClick={() => setChecked(previous => keys.every(k => previous.includes(k)) ? previous.filter(k => !keys.includes(k)) : [...new Set([...previous, ...keys])])}><Check size={13} /></button><button disabled={busy || !visible.length || visible.length > 1000} title={visible.length > 1000 ? '每次最多操作 1000 个文件，请缩小筛选范围' : `${group.staged ? '取消暂存' : '暂存'}当前筛选的 ${visible.length} 个文件`} onClick={() => void batch(group.staged, visible.map(e => e.path))}>{group.staged ? <Minus size={13} /> : <Plus size={13} />}全部</button></>}</div>
        {visible.length > 1000 && <p className="git-group-empty">每次最多操作 1000 个文件；请先筛选或分批选择。</p>}{!hidden && <>{visible.slice(0, limit).map(entry => <div key={entry.path} {...contextMenu.bind(()=>{
          const paths=checkedSet.has(key(entry,group.staged))?selectedPaths(group.staged):[entry.path];
          return [{id:'view',label:entry.conflict?'解决此文件冲突…':'查看文件差异',onAction:()=>pick(entry,group.staged)},...entry.conflict?[]:[{id:'stage',label:`${group.staged?'取消暂存':'暂存'}${paths.length>1?`选中的 ${paths.length} 个文件`:'此文件'}`,disabled:busy||paths.length>1000,onAction:()=>batch(group.staged,paths)}],{id:'edit',label:'在文档中打开',disabled:(group.staged?entry.index:entry.worktree)==='D',onAction:()=>edit(entry.path)},{id:'history',label:'查看文件历史',disabled:entry.untracked,onAction:()=>history(entry.path)},{id:'copy',label:'复制文件路径',separator:true,onAction:()=>copyText(entry.path)}];
        },`${entry.path} 文件操作`)} className={`git-change-row ${selection?.path === entry.path && selection.staged === group.staged ? 'selected' : ''} ${checkedSet.has(key(entry, group.staged)) ? 'checked' : ''}`}>
          {!entry.conflict && <input type="checkbox" checked={checkedSet.has(key(entry, group.staged))} aria-label={`选择${group.staged ? '已暂存' : '未暂存'} ${entry.path}`} onChange={() => {}} onClick={e => toggle(key(entry, group.staged), e.shiftKey, keys)} />}
          <button className="git-file-select" aria-pressed={selection?.path === entry.path && selection.staged === group.staged} onClick={() => pick(entry, group.staged)} onDoubleClick={() => { if (!entry.conflict && !busy) void batch(group.staged, [entry.path]); }} onKeyDown={event => {
            if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const index = visible.findIndex(e => e.path === entry.path), next = visible[index + (event.key === 'ArrowDown' ? 1 : -1)]; if (next) { pick(next, group.staged); const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>(`.${group.id} .git-file-select`)]; buttons[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus(); } }
          }} title={`${entry.path}${entry.originalPath ? ` ← ${entry.originalPath}` : ''} · ${entryLabel(entry, group.staged)} · ${entry.conflict ? '单击解决冲突' : `双击${group.staged ? '取消暂存' : '暂存'}`}`}>
            <span className={`git-file-status status-${entry.conflict ? 'conflict' : entry.untracked ? 'U' : group.staged ? entry.index : entry.worktree}`}>{entry.conflict ? '!' : entry.untracked ? '?' : group.staged ? entry.index : entry.worktree}</span>
            <span className="git-file-name"><strong>{entry.path.split('/').at(-1)}</strong><small>{entry.originalPath ? `${entry.originalPath} → ` : ''}{entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : entryLabel(entry, group.staged)}</small></span>
          </button><button title="在文档中打开" aria-label={`打开 ${entry.path}`} disabled={(group.staged ? entry.index : entry.worktree) === 'D'} onClick={() => edit(entry.path)}><ExternalLink size={12} /></button>{!entry.conflict && <button disabled={busy} title={group.staged ? '取消暂存文件' : '暂存文件'} aria-label={`${group.staged ? '取消暂存' : '暂存'} ${entry.path}`} onClick={() => void batch(group.staged, [entry.path])}>{group.staged ? <Minus size={14} /> : <Plus size={14} />}</button>}
        </div>)}{visible.length > limit && <button className="app-text-button" onClick={() => setLimit(limit + 200)}>再显示 200 项（剩余 {visible.length - limit}）</button>}{!visible.length && <p className="git-group-empty">{group.entries.length ? '无符合筛选的文件' : group.staged ? '暂存后会出现在这里' : '没有未暂存的变更'}</p>}</>}
      </section>;
    })}{!entries.length && <div className="app-empty"><Check size={25} /><strong>工作区干净</strong><small>保存文档后，变更会自动出现在这里。</small></div>}</div>
    <div className="git-commit-form"><div className="git-commit-label"><label htmlFor={messageId}><GitCommitHorizontal size={14} />提交说明</label><small title="第一行建议简洁；此提示不限制提交">{subjectLength} 字</small></div><textarea id={messageId} aria-label="提交说明" disabled={!draftReady} value={message} onChange={e => setMessage(e.target.value)} placeholder={draftReady ? '概括这次修改\n\n可在空行后补充原因与细节' : '正在恢复仓库草稿…'} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing && message.trim() && staged.length && !busy && !state?.conflictCount) { e.preventDefault(); review(); } }} />
      {draftError && <p className="app-error">{draftError}</p>}<div className="git-commit-hint">{state?.conflictCount ? `先解决 ${state.conflictCount} 个冲突` : !staged.length ? '选择文件或差异块暂存后提交' : `仅提交 ${staged.length} 个已暂存文件`}</div><button className="app-primary" disabled={busy || !draftReady || !staged.length || !message.trim() || !!state?.conflictCount} onClick={review}><GitCommitHorizontal size={15} />检查并提交<kbd>⌘ / Ctrl ↵</kbd></button>
    </div>{contextMenu.menu}
  </section>;
}
