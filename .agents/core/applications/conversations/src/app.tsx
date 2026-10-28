import { useContextMenu, copyText } from '@ksf/sdk/components/ui/context-menu';
import { WindowToolbar } from '@ksf/sdk/window-toolbar';
import { memo, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react';
import { Activity, Archive, ArrowLeft, ArrowUp, ArrowDown, PanelLeftClose, PanelLeftOpen, X, ArrowUpRight, BookOpen, BriefcaseBusiness, ChevronDown, ChevronRight, CircleDot, Compass, FileClock, GitBranch, Inbox, Layers3, Menu, MessageSquare, RefreshCw, Search, Settings2, TriangleAlert } from 'lucide-react';
import type { Capture, Issue, RouteEvent, RouteRecord, Task, TaskDetail, TaskList, TaskTarget, TaskTargets, Turn, TurnSummary } from './types';
import { useRemote } from './api';
import { agentNames, captureNames, date, projectName } from './model';
import { Button } from '@ksf/sdk/components/ui/button';
import { GlassSurface } from '@ksf/sdk/components/glass-surface';
import { SectionSwitcher } from './components/section-switcher';
import { useWindowContext, useWindowState, readingPositions } from '@ksf/sdk/window-context';
import { useMaterialStyle } from '@ksf/sdk/components/material-provider';
import { Sheet } from '@ksf/sdk/components/ui/sheet';
import { ChangeTimeline, DetailContent, markOrigin, RouteOverview, RouteEvolution, type Detail } from './components/routes';
import { RequestContent, ResultContent } from './components/conversation';
import { partitionMessages, sectionTarget, type SectionId } from './conversation-model';
import { routeSignature } from './route-evolution';
import { ownershipKey } from './targets';
import { PaneResize, Highlight, useTargetSearch } from './components/workbench-controls';
import { DISPLAY_KEY, POSITION_KEY, clamp, filterTurns, localDisplay, localPosition, paneLimits, roundTitle, saveLocal, titleMatches, type Position } from './workbench-model';
import { isGlassResizing } from '@ksf/sdk/vendor/liquid-surface';
type Navigate = (values: Record<string, string | null>, replace?: boolean) => void;
const enc = encodeURIComponent;
function ErrorNotice({ error, retry }: { error: string | null; retry: () => void }) {
  return error ? <div className="error-notice" role="alert"><TriangleAlert size={16} /><span>读取失败：{error}。已有内容保留。</span><Button size="sm" onClick={retry}>重试</Button></div> : null;
}
function Empty({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return <div className="blank-state"><Inbox size={32} className={loading ? 'loading-mark' : ''} /><h2>{title}</h2><p>{description}</p></div>;
}
export function Diagnostics({ capture, errors }: { capture?: Capture; errors: Issue[] }) {
  return <><div className="detail-type"><Activity size={16} />本地采集</div><h3 className="detail-name">采集与服务诊断</h3><dl className="definition-list">
    <div><dt>任务归档</dt><dd>{capture?.enabled ? '已启用' : '未启用'}</dd></div><div><dt>项目 Hooks</dt><dd>{capture?.hookConfigured ? '已配置' : '未配置'}<small>是否已获宿主信任，以 Codex 审核结果为准。</small></dd></div><div><dt>启用时间</dt><dd>{date(capture?.activatedAt, true)}</dd></div>
  </dl><p className="detail-note">页面显示最近一次采集与 Agent 上报，不表示宿主当前仍在运行。</p><h4>读取缺口</h4>{errors.length ? errors.map((e, i) => <p className="diagnostic-issue" key={i}><strong>{e.code}</strong>{e.message}</p>) : <p className="muted">本次任务列表查询未发现读取缺口。</p>}<Button variant="outline" asChild><a href="/api/health" target="_blank" rel="noreferrer">服务健康接口<ArrowUpRight size={14} /></a></Button><details className="technical"><summary>采集原始状态<ChevronDown size={14} /></summary><pre>{JSON.stringify(capture ?? {}, null, 2)}</pre></details></>;
}
function ChatBranch({ target, selected, q, choose, matches }: { target: TaskTarget; selected: string | null; q: string; choose: (task: Task) => void; matches?: TaskList }) {
  const contextMenu=useContextMenu(), [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [q]);
  const list = useRemote<TaskList>((!matches || pages > 1) ? `/api/tasks?target=${enc(target.key)}&q=${enc(q)}` : null, pages, 'records');
  const data = list.data ?? matches;
  return <div className="chat-branch"><ErrorNotice error={list.error} retry={list.refresh} />{data?.records.map(task => <button key={task.taskId} {...contextMenu.bind(()=>[{id:'view',label:'查看聊天',onAction:()=>choose(task)},{id:'title',label:'复制聊天标题',onAction:()=>copyText(task.title)},{id:'link',label:'复制聊天链接',onAction:()=>copyText(`${location.origin}/?app=conversations&target=${enc(target.key)}&task=${enc(task.taskId)}`)}],'聊天操作')} className={`chat-item${selected === task.taskId ? ' selected' : ''}`} title={task.title} aria-label={`${task.title} · ${task.targetContext?.turnCount ?? 0} 个相关轮次 · ${date(task.targetContext?.latestReported?.reportedAt)}`} aria-current={selected === task.taskId ? 'page' : undefined} onClick={() => choose(task)}>{selected === task.taskId && <GlassSurface variant="selection" profile="chat" />}<MessageSquare size={13} /><span><strong><Highlight text={task.title} query={q} /></strong><small>{q && !titleMatches(task, q) ? '历史记录匹配 · ' : ''}{task.targetContext?.turnCount} 个相关轮次 · {date(task.targetContext?.latestReported?.reportedAt)}</small></span></button>)}
    {!data && <p className="sidebar-hint">正在读取聊天…</p>}{data && !data.records.length && <p className="sidebar-hint">没有匹配的聊天。</p>}{data?.nextOffset != null && <Button size="sm" onClick={() => setPages(p => p + 1)}>更多聊天<ChevronDown size={13} /></Button>}{contextMenu.menu}</div>;
}
export const ConversationApp = memo(function ConversationApp({ search, navigate, onDiagnostics }: { search: URLSearchParams; navigate: Navigate; onDiagnostics: () => void }) {
  const instance = useWindowContext();
  const materialStyle = useMaterialStyle();
  const target = search.get('target') ?? search.get('project'), taskId = search.get('task'), legacy = search.get('view') === 'routes';
  const catalog = useRemote<TaskTargets>('/api/task-targets');
  const [directoryHidden, setDirectoryHidden] = useWindowState('directory-hidden', false);
  const [drawer, setDrawer] = useState<'projects' | null>(null);
  const [draft, setDraft] = useWindowState('searchDraft', ''), [q, setQ] = useWindowState('searchQuery', ''), [opened, setOpened] = useState<Set<string>>(new Set());
  const [targetIntent, setTargetIntent] = useState<string | null>(null);
  const [searchClosed, setSearchClosed] = useState<Set<string>>(new Set());
  useEffect(() => setSearchClosed(new Set()), [q]);
  useEffect(() => { const t = setTimeout(() => setQ(draft.trim()), 250); return () => clearTimeout(t); }, [draft]);
  useEffect(() => { if (target) setOpened(old => new Set([...old, target])); }, [target]);
  useEffect(() => { if (search.has('project')) navigate({ target, project: null }, true); }, [search, target, navigate]);

  useEffect(() => {
    if (!target || !catalog.data || catalog.data.targets.some(t => t.key === target)) return;
    const match = catalog.data.targets.find(t => t.aliases?.includes(target));
    if (match) navigate({ target: match.key, project: null }, true);
  }, [target, catalog.data, navigate]);
  const [display, setDisplay] = useWindowState('display', localDisplay), [viewport, setViewport] = useState(() => window.innerWidth);
  const [restored] = useState<Position | null>(localPosition);
  useEffect(() => {
    const element = instance.root?.current;
    if (!element) return;
    const frame = element.closest('.os-window');
    const bucket = (w: number) => w < 760 ? 0 : w < 1100 ? 1 : 2;
    const measure = () => { const width = element.clientWidth; setViewport(previous => isGlassResizing(element) && bucket(previous) === bucket(width) ? previous : width); };
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    frame?.addEventListener('ksf:glass-resize-end', measure);
    return () => { observer.disconnect(); frame?.removeEventListener('ksf:glass-resize-end', measure); };
  }, [instance.root]);
  useEffect(() => { if (instance.active) saveLocal(DISPLAY_KEY, display); }, [display, instance.active]);
  useEffect(() => {
    if (!catalog.data || target || taskId || legacy) return;
    if (catalog.data.targets[0]) navigate({ target: catalog.data.targets[0].key }, true);
  }, [catalog.data, target, taskId, legacy, navigate]);
  const directoryLimits = paneLimits('directory', viewport, display.focus ? 0 : display.rounds);
  const directoryWidth = clamp(display.directory, directoryLimits.min, directoryLimits.max);
  const roundLimits = paneLimits('rounds', viewport, viewport <= 1099 ? 0 : directoryWidth);
  const roundWidth = clamp(display.rounds, roundLimits.min, roundLimits.max);
  const targetSearch = useTargetSearch(catalog.data?.targets ?? [], q);
  const searchCount = [...targetSearch.groups.values()].reduce((sum, group) => sum + group.total, 0);
  const active = catalog.data?.targets.find(p => p.key === target);
  function chooseTarget(key: string) { setTargetIntent(key); navigate({ target: key, project: null, turn: null, tab: null, section: null, view: null }); }
  function chooseChat(task: Task, key: string) { setTargetIntent(null); navigate({ target: key, project: null, task: task.taskId, turn: null, tab: null, section: null, view: null }); setDrawer(null); }
  const sidebar = <><div className="sidebar-brand"><span className="brand-mark"><Layers3 size={19} /></span><strong>KSF<span>工作台</span></strong><span className="local-label">本地</span></div><div className="sidebar-tools"><div className="sidebar-section-title"><span><Layers3 size={15} />归属</span><span>{catalog.data?.targets.length ?? '—'}</span></div><label className="search-field"><Search size={15} /><input aria-label="搜索归属与聊天" placeholder="搜索聊天与历史记录" value={draft} onChange={e => setDraft(e.target.value)} maxLength={200} />{draft && <button aria-label="清空搜索" onClick={() => { setDraft(''); setQ(''); }}><X size={14} /></button>}</label>{q && <p className="search-summary" role="status">{targetSearch.loading ? '正在搜索全部归属…' : `${searchCount} 处聊天匹配`}</p>}</div>
    <nav className="project-tree" aria-label="归属与聊天">{(['project', 'knowledge', 'ability', 'archive', 'state'] as const).map(kind => {
      const items = catalog.data?.targets.filter(p => p.kind === kind && (!q || (targetSearch.groups.get(p.key)?.total ?? 0) > 0)) ?? [];
      return items.length ? <div className="target-group" key={kind}><h2 className="target-group-heading">{{ project: '项目', knowledge: '知识', ability: '能力', archive: '档案', state: '其他' }[kind]}</h2>{items.map(p => {
        const open = q ? !searchClosed.has(p.key) : opened.has(p.key), Icon = p.kind === 'knowledge' ? BookOpen : p.kind === 'project' ? BriefcaseBusiness : p.kind === 'ability' ? Compass : p.kind === 'archive' ? Archive : Inbox;
        return <div key={p.key} className="project-branch"><div className={`project-tree-row${target === p.key ? ' active' : ''}`}><button className="project-toggle" aria-label={`${open ? '收起' : '展开'}归属 ${p.label}`} aria-expanded={open} onClick={() => (q ? setSearchClosed : setOpened)(old => { const next = new Set(old); if (next.has(p.key)) next.delete(p.key); else next.add(p.key); return next; })}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><button className="project-choice" title={p.target?.path ?? p.label} onClick={() => chooseTarget(p.key)} aria-current={target === p.key ? 'true' : undefined}><Icon size={14} /><strong><Highlight text={p.label} query={q} /></strong>{p.lifecycle === 'planned' && <small className="target-lifecycle">待创建</small>}<span className="count">{q ? targetSearch.groups.get(p.key)?.total : p.chatCount}</span></button></div>{open && <ChatBranch target={p} selected={target === p.key ? taskId : null} q={q} matches={q ? targetSearch.groups.get(p.key) : undefined} choose={task => chooseChat(task, p.key)} />}</div>;
      })}</div> : null;
    })}{q && !targetSearch.loading && !searchCount && <p className="sidebar-hint">没有找到“{q}”。试试其他关键词，或清空搜索。</p>}{targetSearch.errors.map(error => <p className="sidebar-hint" role="alert" key={error}>{error}<Button size="sm" onClick={() => { setQ(''); setTimeout(() => setQ(draft.trim()), 0); }}>重试搜索</Button></p>)}{catalog.data && !catalog.data.targets.length && <p className="sidebar-hint">暂无归属记录。四类目标会在明确上报主归属后出现。</p>}</nav>
    <div className="sidebar-footer"><Button onClick={() => { navigate({ view: legacy ? null : 'routes', session: null }); setDrawer(null); }}><GitBranch size={15} />{legacy ? '返回归属与聊天' : '旧版路由记录'}<ArrowUpRight size={13} /></Button><Button onClick={e => { markOrigin(e.currentTarget); setDrawer(null); onDiagnostics(); }}><Settings2 size={15} />采集与诊断{catalog.data?.errors.length ? <span className="warning-dot" /> : <span className="connection-dot" />}</Button></div></>;
  return <div className={`workbench project-workbench app-workbench ${viewport < 1100 || directoryHidden ? 'compact-directory' : ''} ${viewport < 760 ? 'compact-rounds' : ''}`} style={{ ...materialStyle, '--directory-width': `${directoryWidth}px`, '--round-width': `${roundWidth}px` } as CSSProperties}><aside className="sidebar"><GlassSurface profile="directory" />{sidebar}<PaneResize name="目录" value={directoryWidth} {...directoryLimits} onChange={directory => setDisplay(v => ({ ...v, directory }))} /></aside><Sheet open={drawer === 'projects'} onOpenChange={open => setDrawer(open ? 'projects' : null)} title="归属与聊天" side="left"><div className="mobile-sidebar">{sidebar}</div></Sheet><main className="workspace"><GlassSurface profile="workspace" /><WindowToolbar object={{title:active?.label??'归属与聊天'}} navigation={<><button aria-label="打开归属与聊天" title="归属与聊天" aria-pressed={!directoryHidden && viewport >= 1100} onClick={e => { markOrigin(e.currentTarget); if (viewport < 1100) setDrawer('projects'); else setDirectoryHidden(value => !value); }}><Menu size={18} /></button><span className="breadcrumb" title={active?.label}><strong>{legacy ? '旧版路由' : active?.label ?? '归属与聊天'}</strong></span></>} actions={[
    { id:'focus', label:'专注阅读', icon:BookOpen, pressed:display.focus, priority:1, onAction:() => setDisplay(value => ({ ...value, focus:!value.focus })) },
    { id:'refresh', label:'刷新', icon:RefreshCw, onAction:catalog.refresh },
    { id:'diagnostics', label:'采集与诊断', icon:Settings2, onAction:onDiagnostics },
  ]} /><ErrorNotice error={catalog.error} retry={catalog.refresh} />
    {legacy ? <LegacyRoutes search={search} navigate={navigate} /> : !target && taskId ? <ResolveTarget taskId={taskId} turnId={search.get('turn')} navigate={navigate} /> : target ? <TargetWorkspace key={target} target={target} label={active?.label ?? target} taskId={taskId} turnId={search.get('turn')} oldTab={search.get('tab')} section={search.get('section')} navigate={navigate} autoChoose={targetIntent === target} selectionReady={() => setTargetIntent(null)} beforeDrawer={() => setDrawer(null)} restored={restored} focus={display.focus} toggleFocus={() => setDisplay(v => ({ ...v, focus: !v.focus }))} roundWidth={roundWidth} roundLimits={roundLimits} resizeRounds={rounds => setDisplay(v => ({ ...v, rounds }))} /> : <Empty loading={catalog.loading} title={catalog.loading ? '正在读取归属' : '从一个归属开始'} description="按项目、知识、能力或档案查看聊天，聊天内保留完整轮次。" />}
  </main></div>;
});
function ResolveTarget({ taskId, turnId, navigate }: { taskId: string; turnId: string | null; navigate: Navigate }) {
  const source = useRemote<{ turn?: Turn; task?: Task }>(`/api/tasks/${enc(taskId)}${turnId ? `/turns/${enc(turnId)}?messages=0` : ''}`);
  useEffect(() => {
    if (!source.data) return;
    const turn = source.data.turn, route = turn?.routes.at(-1)?.snapshot ?? source.data.task?.latestReported?.route;
    const key = turn?.policy === 'exclude' ? 'state:excluded' : route ? ownershipKey(route) : 'unreported';
    navigate({ target: key, project: null }, true);
  }, [source.data, navigate]);
  return <><ErrorNotice error={source.error} retry={source.refresh} /><Empty loading={source.loading} title="正在定位聊天" description="保留原轮次，定位归属上下文。" /></>;
}
function TargetWorkspace({ target, label, taskId, turnId, oldTab, section, navigate, autoChoose, selectionReady, beforeDrawer, restored, focus, toggleFocus, roundWidth, roundLimits, resizeRounds }: { target: string; label: string; taskId: string | null; turnId: string | null; oldTab: string | null; section: string | null; navigate: Navigate; autoChoose: boolean; selectionReady: () => void; beforeDrawer: () => void; restored: Position | null; focus: boolean; toggleFocus: () => void; roundWidth: number; roundLimits: { min: number; max: number }; resizeRounds: (v: number) => void }) {
  const instance = useWindowContext();
  // Explicit chat links already have a selection. When a fallback is needed,
  // share the directory's first page instead of running a second archive scan.
  const first = useRemote<TaskList>(!taskId || autoChoose ? `/api/tasks?target=${enc(target)}&q=` : null, 1, 'records');
  const [pages, setPages] = useState(1), [turnsOpen, setTurnsOpen] = useState(false), [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { setPages(1); setDetail(null); }, [taskId]);
  const main = useRemote<TaskDetail>(taskId ? `/api/tasks/${enc(taskId)}?target=${enc(target)}` : null, pages, 'turns');
  const task = main.data?.task, context = main.data?.targetContext;
  const [roundQuery, setRoundQuery] = useWindowState('roundQuery', '');
  const filterTask = useRef(taskId);
  useEffect(() => { if (filterTask.current !== taskId) setRoundQuery(''); filterTask.current = taskId; }, [taskId]);
  useEffect(() => { if (main.data?.total) setPages(p => Math.max(p, Math.ceil(main.data!.total / 30))); }, [main.data?.total]);
  useEffect(() => {
    if (!first.data) return;
    if (!taskId || (autoChoose && context && !context.turnCount)) {
      const next = first.data.records[0]?.taskId ?? null;
      if (next !== taskId) navigate({ task: next, turn: null }, true);
      selectionReady();
    } else if (autoChoose && context?.turnCount) selectionReady();
  }, [first.data, taskId, autoChoose, context, navigate]);
  const selected = turnId ?? context?.latestTurnId ?? task?.latestReported?.turnId ?? task?.lastTurn.turnId ?? null;
  const [switching, startSwitch] = useTransition(), localSelection = useRef(false);
  useEffect(() => { if (!turnId && selected) navigate({ turn: selected }, true); }, [turnId, selected, navigate]);
  const body = useRemote<{ turn: Turn }>(taskId && selected ? `/api/tasks/${enc(taskId)}/turns/${enc(selected)}?target=${enc(target)}` : null);
  const turn = body.data?.turn;
  useEffect(() => { if (turn?.turnNumber && main.data?.total) setPages(p => Math.max(p, Math.ceil((main.data!.total - turn.turnNumber! + 1) / 30))); }, [turn?.turnNumber, main.data?.total]);
  const selectedVisible = !!main.data?.turns.some(t => t.turnId === selected);
  useEffect(() => { if (!localSelection.current) instance.root?.current?.querySelector('.round-sidebar .round-item[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }); }, [selected, selectedVisible]);
  useEffect(() => { if (!switching) localSelection.current = false; }, [switching, selected]);
  useEffect(() => { if (turnsOpen) document.querySelector(`[data-overlay-owner="${instance.id}"] .mobile-rounds .round-item[aria-current="page"]`)?.scrollIntoView({ block: 'nearest' }); }, [turnsOpen]);
  const summary = main.data?.turns.find(t => t.turnId === selected), relation = turn?.targetRelation ?? summary?.targetRelation;
  const previous = useRef<string | null>(null), previousTurn = useRef<string | null>(null);
  const [newReport, setNewReport] = useState(false), [newTurn, setNewTurn] = useState(false);
  const reportId = task?.latestReported ? `${task.latestReported.turnId}:${routeSignature(task.latestReported.route)}` : '';
  useEffect(() => { if (previous.current && previous.current !== reportId) setNewReport(true); previous.current = reportId; }, [reportId]);
  useEffect(() => { if (previousTurn.current && task?.lastTurn.turnId !== previousTurn.current) setNewTurn(true); previousTurn.current = task?.lastTurn.turnId ?? null; }, [task?.lastTurn.turnId]);
  useEffect(() => { setNewReport(false); setNewTurn(false); previous.current = null; previousTurn.current = null; }, [taskId]);
  const scroll = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('request');
  function jumpToSection(id: SectionId) {
    const element = scroll.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!element) return;
    element.scrollIntoView({ block: 'start' });
    element.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    setActiveSection(id);
  }
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!turn) return;
    const key = `${instance.id}:${taskId}:${selected}`;
    const anchor = sectionTarget(section, oldTab);
    if (anchor) jumpToSection(anchor);
    else if (restoredFor.current !== key) {
      const top = readingPositions.get(key) ?? (restored?.task === taskId && restored?.turn === selected ? restored.scroll : 0);
      if (scroll.current) scroll.current.scrollTop = top;
      setActiveSection('request');
    }
    restoredFor.current = key;
    if (oldTab) navigate({ section: anchor, tab: null }, true);
  }, [section, oldTab, selected, !!turn]);
  const pendingPosition = useRef<Position | null>(null), positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistReading = useRef(() => {});
  persistReading.current = () => {
    if (positionTimer.current) clearTimeout(positionTimer.current);
    positionTimer.current = null;
    const position = pendingPosition.current; pendingPosition.current = null;
    if (!position || !instance.active || (instance.id !== 'standalone' && history.state?.ksfWindow !== instance.id)) return;
    saveLocal(POSITION_KEY, position);
    if (history.state?.ksfWindow === instance.id) history.replaceState({ ...history.state, ksfPosition: position }, '', location.href);
  };
  useEffect(() => {
    const flush = () => persistReading.current();
    window.addEventListener('pagehide', flush);
    window.addEventListener('pointerdown', flush, { capture: true });
    window.addEventListener('keydown', flush, { capture: true });
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('pointerdown', flush, true); window.removeEventListener('keydown', flush, true); flush(); };
  }, []);
  function saveReading(immediate = true) {
    if (!taskId || !selected || !turn || !scroll.current) return;
    readingPositions.set(`${instance.id}:${taskId}:${selected}`, scroll.current.scrollTop);
    if (instance.active && new URLSearchParams(location.search).get('turn') === selected) {
      const position = { target, task: taskId, turn: selected, scroll: scroll.current.scrollTop };
      pendingPosition.current = position;
      if (immediate) persistReading.current();
      else {
        if (positionTimer.current) clearTimeout(positionTimer.current);
        positionTimer.current = setTimeout(() => persistReading.current(), 120);
      }
    }
  }
  useEffect(() => { if (turn) saveReading(); }, [selected, !!turn]);
  function trackSection() {
    saveReading(false);
    const element = scroll.current;
    if (!element) return;
    let next: SectionId = 'request';
    const top = element.getBoundingClientRect().top;
    for (const item of element.querySelectorAll<HTMLElement>('[data-section]')) {
      if (item.getBoundingClientRect().top <= top + 80) next = item.dataset.section as SectionId;
    }
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 2 && element.scrollTop > 0) next = 'result';
    setActiveSection(next);
  }
  function showRecordInfo() {
    const element = scroll.current?.querySelector<HTMLDetailsElement>('.record-information');
    if (element) { element.open = true; element.scrollIntoView({ block: 'start' }); element.querySelector('summary')?.focus({ preventScroll: true }); }
  }
  function selectTurn(id: string) {
    localSelection.current = true;
    saveReading(); setDetail(null); setTurnsOpen(false); setNewReport(false); setNewTurn(false);
    // Keep the input task short; cached long rounds can render concurrently and
    // a later selection supersedes unfinished work without changing the archive.
    startSwitch(() => navigate({ turn: id, tab: null, section: null }));
  }
  const refresh = () => { main.refresh(); body.refresh(); first.refresh(); };
  const visibleTurns = useMemo(() => filterTurns(main.data?.turns ?? [], roundQuery), [main.data?.turns, roundQuery]);
  const allLoaded = !!main.data && main.data.nextOffset == null;
  const index = main.data?.turns.findIndex(t => t.turnId === selected) ?? -1;
  const older = index >= 0 ? main.data?.turns[index + 1] : null, newer = index > 0 ? main.data?.turns[index - 1] : null;
  const roundList = <><div className="round-list-heading"><h2>轮次</h2><span title="此聊天的完整轮次">{main.data?.total ?? '—'} 轮</span><Button size="icon" aria-label="收起轮次栏，专注阅读" onClick={() => { toggleFocus(); requestAnimationFrame(() => instance.root?.current?.querySelector<HTMLButtonElement>('.reader-actions button')?.focus()); }}><GlassSurface variant="button" /><PanelLeftClose size={15} /></Button></div><label className="search-field round-search"><Search size={14} /><input aria-label="筛选聊天内全部轮次" placeholder="筛选此聊天的轮次" value={roundQuery} onChange={e => setRoundQuery(e.target.value)} />{roundQuery && <button aria-label="清空轮次筛选" onClick={() => setRoundQuery('')}><X size={13} /></button>}</label>{roundQuery && <p className="round-filter-status" role="status">{allLoaded ? `${visibleTurns.length} / ${main.data?.total} 轮` : '正在读取全部轮次摘要…'}</p>}<div className="round-list" aria-label="完整轮次列表">{visibleTurns.map(t => {
    const title = roundTitle(t);
    const label = `第 ${t.turnNumber} 轮 · ${title} · ${date(t.startedAt)} · ${t.targetRelation?.label ?? '未上报'}${t.targetHistory?.switched ? ' · 本轮切换' : ''}`;
    return <button key={t.turnId} className={`round-item${selected === t.turnId ? ' selected' : ''}`} title={label} aria-label={label} aria-current={selected === t.turnId ? 'page' : undefined} onClick={() => selectTurn(t.turnId)}>{selected === t.turnId && <GlassSurface variant="selection" profile="round" />}<span className="round-item-title"><strong title={`第 ${t.turnNumber} 轮`}>{String(t.turnNumber ?? '—').padStart(2, '0')}</strong><span className="round-item-summary"><Highlight text={title} query={roundQuery.trim()} /></span></span><span className="round-item-meta"><time>{date(t.startedAt)}</time><span className={`relation relation-${t.targetRelation?.kind}`}>{t.targetRelation?.label}</span>{t.targetHistory?.switched && <span className="switch-label">切换</span>}</span></button>;
  })}{roundQuery && allLoaded && !visibleTurns.length && <p className="round-list-caption">没有匹配轮次，清空筛选可查看全部。</p>}{main.data?.nextOffset != null && <p className="round-list-caption" role="status">{main.error ? '摘要读取未完成，请重试。' : '正在读取完整轮次摘要…'}</p>}</div>{main.error && <p className="round-list-caption warning-label">部分轮次读取失败，请查看详情提示。</p>}</>;

  let shownDetail = detail;
  const excluded = turn?.policy === 'exclude' || summary?.policy === 'exclude';
  const events = excluded ? [] : turn?.routes ?? [], last = events.at(-1), route = last?.snapshot;
  const messages = useMemo(() => partitionMessages(excluded ? [] : turn?.messages ?? []), [excluded, turn?.messages]);
  const errors = [...new Set([main.error, body.error, first.error].filter((e): e is string => !!e))];
  const issueCount = errors.length + (turn?.issues.length ?? 0);
  const archiveStatus = turn?.status ?? summary?.status;
  const archiveLabel = archiveStatus ? captureNames[archiveStatus] ?? archiveStatus : body.error ? '读取失败' : '读取中';
  const sectionReadState = excluded ? '未记录' : !turn ? body.error ? '读取失败' : '读取中' : null;
  const latestUnreported = task && task.lastTurn.policy !== 'exclude' && task.lastTurn.routeCount === 0 && selected !== task.lastTurn.turnId;
  const routeUpdate = newReport && task?.latestReported?.turnId !== selected ? task?.latestReported : null;
  const turnUpdate = (newTurn || latestUnreported) && task?.lastTurn.turnId !== selected ? task?.lastTurn : null;
  function openDetail(value: Detail) { beforeDrawer(); setTurnsOpen(false); setDetail(value); }
  if (!taskId) return <><ErrorNotice error={first.error} retry={first.refresh} /><Empty loading={first.loading} title={first.loading ? '正在读取聊天' : '暂无相关聊天'} description={`“${label}”下尚无可读取的聊天。`} /></>;
  return <div className={`chat-workspace${focus ? ' focus-reading' : ''}`}><aside className="round-sidebar">{roundList}<PaneResize name="轮次栏" value={roundWidth} {...roundLimits} onChange={resizeRounds} /></aside><Sheet open={turnsOpen} onOpenChange={setTurnsOpen} title="聊天轮次" side="left"><div className="mobile-rounds">{roundList}</div></Sheet><section className="round-workspace" aria-busy={switching}><GlassSurface profile="reader" />
    <div className="detail-context"><div className="detail-context-copy"><div className="reading-meta"><span>第 {turn?.turnNumber ?? summary?.turnNumber ?? '—'} 轮</span><time>{date(turn?.startedAt ?? summary?.startedAt)}</time><span className={`capture-state capture-${archiveStatus}`}>归档：{archiveLabel}</span></div><h1>{turn || summary ? route?.summary?.trim() || roundTitle(summary ?? turn) : '正在读取轮次…'}</h1><p className="chat-original-title" title={task?.title}><MessageSquare size={12} />{task?.title ?? '正在读取聊天…'}</p></div><div className="reader-actions"><Button className="round-menu" size="icon" aria-label="打开聊天轮次" onClick={() => setTurnsOpen(true)}><GlassSurface variant="button" /><Menu size={16} /></Button><Button className="focus-toggle" size="icon" aria-label={focus ? '展开轮次栏' : '收起轮次栏，专注阅读'} onClick={toggleFocus}><GlassSurface variant="button" />{focus ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</Button><Button size="icon" aria-label="刷新当前聊天" onClick={refresh}><GlassSurface variant="button" /><RefreshCw size={15} /></Button></div></div>
    <nav className="round-section-nav" aria-label="本轮章节"><SectionSwitcher active={activeSection}>{(['request', 'route', 'result'] as SectionId[]).map(id => <button key={id} aria-current={activeSection === id ? 'location' : undefined} disabled={excluded || !turn} onClick={() => { navigate({ section: id, tab: null }); jumpToSection(id); }}>{({ request: '请求', route: '路由', result: '结果' })[id]}<small>{sectionReadState ?? (id === 'result' ? messages.result.length ? '已有答复' : '尚未归档' : id === 'request' ? messages.request.length ? '已归档' : '尚未归档' : events.length ? `${events.length} 次上报` : '未上报')}</small></button>)}</SectionSwitcher><button className={`record-info-link${issueCount ? ' has-issues' : ''}`} onClick={showRecordInfo}>记录信息{issueCount > 0 && <><TriangleAlert size={12} />{issueCount}</>}</button></nav>
    <div className="round-stepper"><Button size="sm" aria-label="上一轮" disabled={!older} onClick={() => older && selectTurn(older.turnId)}><ArrowUp size={13} />上一轮</Button><span aria-live="polite">{switching ? '正在切换…' : `${turn?.turnNumber ?? summary?.turnNumber ?? '—'} / ${main.data?.total ?? '—'}`}</span><Button size="sm" aria-label="下一轮" disabled={!newer} onClick={() => newer && selectTurn(newer.turnId)}>下一轮<ArrowDown size={13} /></Button></div>
    {(routeUpdate || turnUpdate) && <div className="turn-updates" role="status"><CircleDot size={13} /><span>聊天有更新</span><div>{routeUpdate && <Button size="sm" onClick={() => selectTurn(routeUpdate.turnId)}>查看第 {routeUpdate.turnNumber} 轮路由</Button>}{turnUpdate && turnUpdate.turnId !== routeUpdate?.turnId && <Button size="sm" onClick={() => selectTurn(turnUpdate.turnId)}>查看最新第 {turnUpdate.turnNumber ?? task?.turnCount} 轮{turnUpdate.policy === 'exclude' ? ' · 未记录' : !turnUpdate.routeCount ? ' · 未上报' : ''}</Button>}</div></div>}
    <div className="round-scroll" key={`${instance.id}:${taskId}:${selected}`} ref={scroll} onScroll={trackSection}><div className="turn-document">
      {excluded ? <div className="blank-state"><FileClock size={26} /><h2>本轮明确排除采集</h2><p>仅保留无正文占位。</p></div> : turn ? <>
        <section className="turn-section request-section" data-section="request" aria-labelledby={`${instance.id}-request-heading`}><h2 id={`${instance.id}-request-heading`} tabIndex={-1}>请求</h2><RequestContent messages={messages.request} /></section>
        <section className="turn-section route-section-main" data-section="route" aria-labelledby={`${instance.id}-route-heading-main`}><h2 id={`${instance.id}-route-heading-main`} tabIndex={-1}>路由</h2>
          {relation && !['primary', 'unreported', 'excluded'].includes(relation.kind) && <p className="route-context"><span className={`relation relation-${relation.kind}`}>{relation.label}</span><span>当前浏览：{label}</span></p>}
          {route && <p className="route-summary">{route.summary}</p>}
          <RouteEvolution events={events} onDetail={openDetail} />
        </section>
        <section className="turn-section result-section" data-section="result" aria-labelledby={`${instance.id}-result-heading`}><h2 id={`${instance.id}-result-heading`} tabIndex={-1}>结果</h2><ResultContent messages={messages.result} process={messages.process} /></section>
      </> : <p className="section-empty">{body.error ? '本轮读取失败，请查看记录信息并重试。' : '正在读取本轮…'}</p>}
      <details className="record-information"><summary><FileClock size={13} />记录信息{issueCount > 0 && <span className="warning-label"><TriangleAlert size={12} />{issueCount} 项读取或采集提示</span>}<ChevronDown size={13} /></summary><dl className="definition-list"><div><dt>对话归档状态</dt><dd>{archiveLabel}</dd></div>{last && <><div><dt>Agent 最近上报状态</dt><dd>{agentNames[last.snapshot.status] ?? last.snapshot.status}</dd></div><div><dt>最近上报时间</dt><dd>{date(last.at, true)}</dd></div></>}<div><dt>最终答复</dt><dd>{sectionReadState ?? (messages.result.length ? `已归档 ${messages.result.length} 条` : '尚未归档')}</dd></div><div><dt>聊天轮次</dt><dd>{task?.turnCount ?? '—'} 轮 · 当前归属相关 {context?.turnCount ?? '—'} 轮</dd></div><div><dt>当前归属最近上报</dt><dd>{date(context?.latestReported?.reportedAt)}</dd></div></dl><p className="detail-note">对话归档、Agent 最近上报和最终答复分别记录，不表示宿主实时运行状态。</p>{events.length > 0 && <Button size="sm" variant="outline" onClick={e => { markOrigin(e.currentTarget); openDetail({ kind: 'reports', events }); }}>原始上报数据<FileClock size={13} /></Button>}{errors.map(error => <p className="record-error" key={error}>读取失败：{error}</p>)}{turn?.issues.map((issue, i) => <p className="record-error" key={i}>{issue.code}{issue.message ? `：${issue.message}` : ''}</p>)}{issueCount > 0 && <Button size="sm" variant="outline" onClick={refresh}>重新读取</Button>}</details>
    </div></div>
  </section><Sheet open={!!shownDetail} onOpenChange={open => { if (!open) setDetail(null); }} title={shownDetail?.kind === 'ability' ? '能力详情' : shownDetail?.kind === 'target' ? '归属详情' : shownDetail?.kind === 'project' ? '项目详情' : shownDetail?.kind === 'arrangement' ? '当时完整安排' : shownDetail?.kind === 'reports' ? '原始上报数据' : '路由变化'}>{shownDetail && <DetailContent detail={shownDetail} />}</Sheet></div>;
}
function LegacyRoutes({ search, navigate }: { search: URLSearchParams; navigate: (values: Record<string, string | null>, replace?: boolean) => void }) {
  const [offset, setOffset] = useState(0), [detail, setDetail] = useState<Detail | null>(null);
  const list = useRemote<{ records: RouteRecord[]; total: number; nextOffset: number | null; errors: Issue[] }>(`/api/routes?limit=30&offset=${offset}`);
  const key = search.get('session');
  const record = useRemote<{ record: RouteRecord }>(key ? `/api/routes/${encodeURIComponent(key)}` : null);
  const value = record.data?.record;
  const legacyReason = value?.archive === 'task' ? '此兼容查询不包含逐轮选择说明，请从聊天任务查看原始上报。' : '旧版记录未保存选择说明。';
  const events: RouteEvent[] = value?.history.map((h, i) => ({ eventId: `legacy-${h.revision}-${i}`, roundId: value.roundId, at: h.at, reason: legacyReason, snapshot: h.snapshot })) ?? [];
  return <><div className="task-header"><div className="task-heading"><span className="task-kind"><GitBranch size={14} />兼容记录</span><h1>旧版路由</h1><div className="task-context">保留原会话记录与查询投影，不推测历史轮次关联</div></div><Button size="icon" variant="outline" aria-label="刷新旧版路由" onClick={() => { list.refresh(); record.refresh(); }}><RefreshCw size={16} /></Button></div><ErrorNotice error={list.error || record.error} retry={() => { list.refresh(); record.refresh(); }} /><div className="main-scroll legacy-scroll">{!key ? <section className="legacy-list"><div className="section-heading"><h2>会话记录</h2><span className="count">{list.data?.total ?? 0} 条</span></div>{list.data?.records.map(r => <button key={r.sessionKey} onClick={() => navigate({ session: r.sessionKey })}><GitBranch size={16} /><span><strong>{r.current.summary}</strong><small>{projectName(r.current)} · {r.archive === 'task' ? '任务档案投影' : r.host} · 最近上报 {date(r.updatedAt)}</small></span><ChevronRight size={15} /></button>)}{!list.data?.records.length && <Empty loading={list.loading} title={list.loading ? '正在读取路由' : '暂无旧版路由记录'} description="新聊天任务请从任务导航查看。" />}{(offset > 0 || list.data?.nextOffset != null) && <div className="legacy-pagination"><Button disabled={!offset} onClick={() => setOffset(v => Math.max(0, v - 30))}>上一页</Button><Button disabled={list.data?.nextOffset == null} onClick={() => setOffset(list.data!.nextOffset!)}>下一页</Button></div>}{!!list.data?.errors.length && <p className="warning-label">{list.data.errors.length} 条记录读取失败，请检查本地原件。</p>}</section> : <><Button className="back-link" onClick={() => navigate({ session: null })}><ArrowLeft size={15} />返回会话列表</Button>{value ? <><RouteOverview key={key} route={value.current} reason={legacyReason} at={value.updatedAt} onDetail={setDetail} /><ChangeTimeline events={events} onDetail={setDetail} />{value.historyDropped > 0 && <p className="detail-note">此查询投影已截断 {value.historyDropped} 次变化。{value.archive === 'task' ? '完整路由保存在任务逐轮档案中。' : '旧版仅保留最近 50 次关键变化。'}</p>}</> : <Empty loading={record.loading} title={record.loading ? '正在读取记录' : '记录不可用'} description="请返回列表，或检查本地路由文件。" />}</>}</div><Sheet open={!!detail} onOpenChange={value => { if (!value) setDetail(null); }} title="路由详情">{detail && <DetailContent detail={detail} />}</Sheet></>;
}
