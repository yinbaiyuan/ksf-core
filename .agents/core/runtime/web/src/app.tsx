import { useEffect, useRef, useState } from 'react';
import { Activity, Archive, ArrowLeft, ArrowUpRight, BookOpen, BriefcaseBusiness, ChevronDown, ChevronRight, CircleDot, Compass, FileClock, GitBranch, Inbox, Layers3, Menu, MessageSquare, RefreshCw, Search, Settings2, TriangleAlert } from 'lucide-react';
import type { Capture, Issue, RouteEvent, RouteRecord, Task, TaskDetail, TaskList, TaskTarget, TaskTargets, Turn, TurnSummary } from './types';
import { useLocation, useRemote } from './api';
import { agentNames, captureNames, date, projectName } from './model';
import { Button } from './components/ui/button';
import { Sheet } from './components/ui/sheet';
import { ChangeTimeline, DetailContent, markOrigin, RouteOverview, RouteEvolution, type Detail } from './components/routes';
import { RequestContent, ResultContent } from './components/conversation';
import { partitionMessages, sectionTarget, type SectionId } from './conversation-model';
import { routeSignature } from './route-evolution';
import { ownershipKey } from './targets';
type Navigate = (values: Record<string, string | null>, replace?: boolean) => void;
const enc = encodeURIComponent;
function ErrorNotice({ error, retry }: { error: string | null; retry: () => void }) {
  return error ? <div className="error-notice" role="alert"><TriangleAlert size={16} /><span>读取失败：{error}。已有内容保留。</span><Button size="sm" onClick={retry}>重试</Button></div> : null;
}
function Empty({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return <div className="blank-state"><Inbox size={32} className={loading ? 'loading-mark' : ''} /><h2>{title}</h2><p>{description}</p></div>;
}
function Diagnostics({ capture, errors }: { capture?: Capture; errors: Issue[] }) {
  return <><div className="detail-type"><Activity size={16} />本地采集</div><h3 className="detail-name">采集与服务诊断</h3><dl className="definition-list">
    <div><dt>任务归档</dt><dd>{capture?.enabled ? '已启用' : '未启用'}</dd></div><div><dt>项目 Hooks</dt><dd>{capture?.hookConfigured ? '已配置' : '未配置'}<small>是否已获宿主信任，以 Codex 审核结果为准。</small></dd></div><div><dt>启用时间</dt><dd>{date(capture?.activatedAt, true)}</dd></div>
  </dl><p className="detail-note">页面显示最近一次采集与 Agent 上报，不表示宿主当前仍在运行。</p><h4>读取缺口</h4>{errors.length ? errors.map((e, i) => <p className="diagnostic-issue" key={i}><strong>{e.code}</strong>{e.message}</p>) : <p className="muted">本次任务列表查询未发现读取缺口。</p>}<Button variant="outline" asChild><a href="/api/health" target="_blank" rel="noreferrer">服务健康接口<ArrowUpRight size={14} /></a></Button><details className="technical"><summary>采集原始状态<ChevronDown size={14} /></summary><pre>{JSON.stringify(capture ?? {}, null, 2)}</pre></details></>;
}
function ChatBranch({ target, selected, q, choose }: { target: TaskTarget; selected: string | null; q: string; choose: (task: Task) => void }) {
  const [pages, setPages] = useState(1);
  useEffect(() => setPages(1), [q]);
  const list = useRemote<TaskList>(`/api/tasks?target=${enc(target.key)}&q=${enc(q)}`, pages, 'records');
  return <div className="chat-branch"><ErrorNotice error={list.error} retry={list.refresh} />{list.data?.records.map(task => <button key={task.taskId} className={`chat-item${selected === task.taskId ? ' selected' : ''}`} title={task.title} aria-label={`${task.title} · ${task.targetContext?.turnCount ?? 0} 个相关轮次 · ${date(task.targetContext?.latestReported?.reportedAt)}`} aria-current={selected === task.taskId ? 'page' : undefined} onClick={() => choose(task)}><MessageSquare size={13} /><span><strong>{task.title}</strong><small>{task.targetContext?.turnCount} 个相关轮次 · {date(task.targetContext?.latestReported?.reportedAt)}</small></span></button>)}
    {!list.data && <p className="sidebar-hint">正在读取聊天…</p>}{list.data && !list.data.records.length && <p className="sidebar-hint">没有匹配的聊天。</p>}{list.data?.nextOffset != null && <Button size="sm" onClick={() => setPages(p => p + 1)}>更多聊天<ChevronDown size={13} /></Button>}</div>;
}
export function App() {
  const { search, navigate } = useLocation(), target = search.get('target') ?? search.get('project'), taskId = search.get('task'), legacy = search.get('view') === 'routes';
  const catalog = useRemote<TaskTargets>('/api/task-targets');
  const [drawer, setDrawer] = useState<'projects' | null>(null), [diagnostics, setDiagnostics] = useState(false);
  const [draft, setDraft] = useState(''), [q, setQ] = useState(''), [opened, setOpened] = useState<Set<string>>(new Set());
  const [targetIntent, setTargetIntent] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(draft.trim()), 250); return () => clearTimeout(t); }, [draft]);
  useEffect(() => { if (target) setOpened(old => new Set([...old, target])); }, [target]);
  useEffect(() => { if (search.has('project')) navigate({ target, project: null }, true); }, [search, target, navigate]);
  useEffect(() => { if (!legacy && !target && !taskId && catalog.data?.targets[0]) navigate({ target: catalog.data.targets[0].key }, true); }, [legacy, target, taskId, catalog.data, navigate]);
  useEffect(() => {
    if (!target || !catalog.data || catalog.data.targets.some(t => t.key === target)) return;
    const match = catalog.data.targets.find(t => t.aliases?.includes(target));
    if (match) navigate({ target: match.key, project: null }, true);
  }, [target, catalog.data, navigate]);
  const active = catalog.data?.targets.find(p => p.key === target);
  function chooseTarget(key: string) { setTargetIntent(key); navigate({ target: key, project: null, turn: null, tab: null, section: null, view: null }); }
  function chooseChat(task: Task, key: string) { setTargetIntent(null); navigate({ target: key, project: null, task: task.taskId, turn: null, tab: null, section: null, view: null }); setDrawer(null); }
  const sidebar = <><div className="sidebar-brand"><span className="brand-mark"><Layers3 size={19} /></span><strong>KSF<span>工作台</span></strong><span className="local-label">本地</span></div><div className="sidebar-tools"><div className="sidebar-section-title"><span><Layers3 size={15} />归属</span><span>{catalog.data?.targets.length ?? '—'}</span></div><label className="search-field"><Search size={15} /><input aria-label="搜索归属与聊天" placeholder="搜索归属、聊天或历史路由" value={draft} onChange={e => setDraft(e.target.value)} maxLength={200} /></label></div>
    <nav className="project-tree" aria-label="归属与聊天">{(['project', 'knowledge', 'ability', 'archive', 'state'] as const).map(kind => {
      const items = catalog.data?.targets.filter(p => p.kind === kind) ?? [];
      return items.length ? <div className="target-group" key={kind}><h2 className="target-group-heading">{{ project: '项目', knowledge: '知识', ability: '能力', archive: '档案', state: '其他' }[kind]}</h2>{items.map(p => {
        const open = opened.has(p.key) || !!q, Icon = p.kind === 'knowledge' ? BookOpen : p.kind === 'project' ? BriefcaseBusiness : p.kind === 'ability' ? Compass : p.kind === 'archive' ? Archive : Inbox;
        return <div key={p.key} className="project-branch"><div className={`project-tree-row${target === p.key ? ' active' : ''}`}><button className="project-toggle" aria-label={`${open ? '收起' : '展开'}归属 ${p.label}`} aria-expanded={open} onClick={() => setOpened(old => { const next = new Set(old); if (next.has(p.key)) next.delete(p.key); else next.add(p.key); return next; })}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button><button className="project-choice" title={p.target?.path ?? p.label} onClick={() => chooseTarget(p.key)} aria-current={target === p.key ? 'true' : undefined}><Icon size={14} /><strong>{p.label}</strong>{p.lifecycle === 'planned' && <small className="target-lifecycle">待创建</small>}<span className="count">{p.chatCount}</span></button></div>{open && <ChatBranch target={p} selected={target === p.key ? taskId : null} q={q} choose={task => chooseChat(task, p.key)} />}</div>;
      })}</div> : null;
    })}{catalog.data && !catalog.data.targets.length && <p className="sidebar-hint">暂无归属记录。四类目标会在明确上报主归属后出现。</p>}</nav>
    <div className="sidebar-footer"><Button onClick={() => { navigate({ view: legacy ? null : 'routes', session: null }); setDrawer(null); }}><GitBranch size={15} />{legacy ? '返回归属与聊天' : '旧版路由记录'}<ArrowUpRight size={13} /></Button><Button onClick={e => { markOrigin(e.currentTarget); setDrawer(null); setDiagnostics(true); }}><Settings2 size={15} />采集与诊断{catalog.data?.errors.length ? <span className="warning-dot" /> : <span className="connection-dot" />}</Button></div></>;
  return <div className="workbench project-workbench"><aside className="sidebar">{sidebar}</aside><Sheet open={drawer === 'projects'} onOpenChange={open => setDrawer(open ? 'projects' : null)} title="归属与聊天" side="left"><div className="mobile-sidebar">{sidebar}</div></Sheet><main className="workspace"><header className="workspace-bar"><div><Button className="project-menu" size="icon" aria-label="打开归属与聊天" onClick={e => { markOrigin(e.currentTarget); setDrawer('projects'); }}><Menu size={18} /></Button><span className="breadcrumb">工作台<ChevronRight size={13} /><strong>{legacy ? '旧版路由' : active?.label ?? '归属与聊天'}</strong></span></div><span className="service-label"><span className="connection-dot" />本地工作区</span></header><ErrorNotice error={catalog.error} retry={catalog.refresh} />
    {legacy ? <LegacyRoutes search={search} navigate={navigate} /> : !target && taskId ? <ResolveTarget taskId={taskId} turnId={search.get('turn')} navigate={navigate} /> : target ? <TargetWorkspace key={target} target={target} label={active?.label ?? target} taskId={taskId} turnId={search.get('turn')} oldTab={search.get('tab')} section={search.get('section')} navigate={navigate} autoChoose={targetIntent === target} selectionReady={() => setTargetIntent(null)} beforeDrawer={() => setDrawer(null)} /> : <Empty loading={catalog.loading} title={catalog.loading ? '正在读取归属' : '从一个归属开始'} description="按项目、知识、能力或档案查看聊天，聊天内保留完整轮次。" />}
  </main><Sheet open={diagnostics} onOpenChange={setDiagnostics} title="采集与诊断"><Diagnostics capture={catalog.data?.capture} errors={catalog.data?.errors ?? []} /></Sheet></div>;
}
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
function TargetWorkspace({ target, label, taskId, turnId, oldTab, section, navigate, autoChoose, selectionReady, beforeDrawer }: { target: string; label: string; taskId: string | null; turnId: string | null; oldTab: string | null; section: string | null; navigate: Navigate; autoChoose: boolean; selectionReady: () => void; beforeDrawer: () => void }) {
  const first = useRemote<TaskList>(`/api/tasks?target=${enc(target)}&limit=1`);
  const [pages, setPages] = useState(1), [turnsOpen, setTurnsOpen] = useState(false), [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { setPages(1); setDetail(null); }, [taskId]);
  const main = useRemote<TaskDetail>(taskId ? `/api/tasks/${enc(taskId)}?target=${enc(target)}` : null, pages, 'turns');
  const task = main.data?.task, context = main.data?.targetContext;
  useEffect(() => {
    if (!first.data) return;
    if (!taskId || (autoChoose && context && !context.turnCount)) {
      const next = first.data.records[0]?.taskId ?? null;
      if (next !== taskId) navigate({ task: next, turn: null }, true);
      selectionReady();
    } else if (autoChoose && context?.turnCount) selectionReady();
  }, [first.data, taskId, autoChoose, context, navigate]);
  const selected = turnId ?? context?.latestTurnId ?? task?.latestReported?.turnId ?? task?.lastTurn.turnId ?? null;
  useEffect(() => { if (!turnId && selected) navigate({ turn: selected }, true); }, [turnId, selected, navigate]);
  const body = useRemote<{ turn: Turn }>(taskId && selected ? `/api/tasks/${enc(taskId)}/turns/${enc(selected)}?target=${enc(target)}` : null);
  const turn = body.data?.turn;
  useEffect(() => { if (turn?.turnNumber && main.data?.total) setPages(p => Math.max(p, Math.ceil((main.data!.total - turn.turnNumber! + 1) / 30))); }, [turn?.turnNumber, main.data?.total]);
  const selectedVisible = !!main.data?.turns.some(t => t.turnId === selected);
  useEffect(() => { document.querySelector('.round-sidebar .round-item[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }); }, [selected, selectedVisible]);
  useEffect(() => { if (turnsOpen) document.querySelector('.mobile-rounds .round-item[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }); }, [turnsOpen]);
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
  useEffect(() => {
    if (!turn) return;
    const target = sectionTarget(section, oldTab);
    if (target) jumpToSection(target);
    else setActiveSection('request');
    if (oldTab) navigate({ section: target, tab: null }, true);
  }, [section, oldTab, selected, !!turn]);
  function trackSection() {
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
  function selectTurn(id: string) { navigate({ turn: id, tab: null, section: null }); setDetail(null); setTurnsOpen(false); setNewReport(false); setNewTurn(false); }
  const refresh = () => { main.refresh(); body.refresh(); first.refresh(); };
  const roundList = <><div className="round-list-heading"><h2>轮次</h2><span title="此聊天的完整轮次">{main.data?.total ?? '—'} 轮</span></div><div className="round-list" aria-label="完整轮次列表">{main.data?.turns.map(t => {
    const title = t.route?.summary ?? (t.policy === 'exclude' ? '本轮未记录' : t.preview || '等待采集与上报');
    const label = `第 ${t.turnNumber} 轮 · ${title} · ${date(t.startedAt)} · ${t.targetRelation?.label ?? '未上报'}${t.targetHistory?.switched ? ' · 本轮切换' : ''}`;
    return <button key={t.turnId} className={`round-item${selected === t.turnId ? ' selected' : ''}`} title={label} aria-label={label} aria-current={selected === t.turnId ? 'page' : undefined} onClick={() => selectTurn(t.turnId)}><span className="round-item-title"><strong>第 {t.turnNumber} 轮</strong><span className="round-item-summary">{title}</span></span><span className="round-item-meta"><time>{date(t.startedAt)}</time><span className={`relation relation-${t.targetRelation?.kind}`}>{t.targetRelation?.label}</span>{t.targetHistory?.switched && <span className="switch-label">切换</span>}</span></button>;
  })}{main.data?.nextOffset != null && <Button size="sm" className="more-rounds" onClick={() => setPages(p => p + 1)}>更早轮次<ChevronDown size={13} /></Button>}</div>{main.error && <p className="round-list-caption warning-label">部分轮次读取失败，请查看详情提示。</p>}</>;

  let shownDetail = detail;
  const excluded = turn?.policy === 'exclude' || summary?.policy === 'exclude';
  const events = excluded ? [] : turn?.routes ?? [], last = events.at(-1), route = last?.snapshot;
  const messages = partitionMessages(excluded ? [] : turn?.messages ?? []);
  const errors = [...new Set([main.error, body.error, first.error].filter((e): e is string => !!e))];
  const issueCount = errors.length + (turn?.issues.length ?? 0);
  const latestUnreported = task && task.lastTurn.policy !== 'exclude' && task.lastTurn.routeCount === 0 && selected !== task.lastTurn.turnId;
  const routeUpdate = newReport && task?.latestReported?.turnId !== selected ? task?.latestReported : null;
  const turnUpdate = (newTurn || latestUnreported) && task?.lastTurn.turnId !== selected ? task?.lastTurn : null;
  function openDetail(value: Detail) { beforeDrawer(); setTurnsOpen(false); setDetail(value); }
  if (!taskId) return <><ErrorNotice error={first.error} retry={first.refresh} /><Empty loading={first.loading} title={first.loading ? '正在读取聊天' : '暂无相关聊天'} description={`“${label}”下尚无可读取的聊天。`} /></>;
  return <div className="chat-workspace"><aside className="round-sidebar">{roundList}</aside><Sheet open={turnsOpen} onOpenChange={setTurnsOpen} title="聊天轮次" side="left"><div className="mobile-rounds">{roundList}</div></Sheet><section className="round-workspace">
    <div className="detail-context"><Button className="round-menu" size="icon" variant="outline" aria-label="选择轮次" onClick={e => { markOrigin(e.currentTarget); beforeDrawer(); setDetail(null); setTurnsOpen(true); }}><FileClock size={15} /></Button><div className="detail-context-copy"><h1 title={task?.title}>{task?.title ?? '正在读取聊天…'}</h1><div><strong>{(turn?.turnNumber ?? summary?.turnNumber) ? `第 ${turn?.turnNumber ?? summary?.turnNumber} 轮` : '所选轮次'}</strong><time>{date(turn?.startedAt ?? summary?.startedAt)}</time><span className={`capture-state capture-${turn?.status}`}>采集：{captureNames[turn?.status ?? 'pending']}</span></div></div><Button size="icon" variant="outline" aria-label="刷新当前聊天" onClick={refresh}><RefreshCw size={15} /></Button></div>
    <nav className="round-section-nav" aria-label="本轮章节">{(['request', 'route', 'result'] as SectionId[]).map(id => <button key={id} aria-current={activeSection === id ? 'location' : undefined} disabled={excluded || !turn} onClick={() => { navigate({ section: id, tab: null }); jumpToSection(id); }}>{({ request: '请求', route: '路由', result: '结果' })[id]}</button>)}<button className={`record-info-link${issueCount ? ' has-issues' : ''}`} onClick={showRecordInfo}>记录信息{issueCount > 0 && <><TriangleAlert size={12} />{issueCount}</>}</button></nav>
    {(routeUpdate || turnUpdate) && <div className="turn-updates" role="status"><CircleDot size={13} /><span>聊天有更新</span><div>{routeUpdate && <Button size="sm" onClick={() => selectTurn(routeUpdate.turnId)}>查看第 {routeUpdate.turnNumber} 轮路由</Button>}{turnUpdate && turnUpdate.turnId !== routeUpdate?.turnId && <Button size="sm" onClick={() => selectTurn(turnUpdate.turnId)}>查看最新第 {turnUpdate.turnNumber ?? task?.turnCount} 轮{turnUpdate.policy === 'exclude' ? ' · 未记录' : !turnUpdate.routeCount ? ' · 未上报' : ''}</Button>}</div></div>}
    <div className="round-scroll" key={`${taskId}:${selected}`} ref={scroll} onScroll={trackSection}><div className="turn-document">
      {excluded ? <div className="blank-state"><FileClock size={26} /><h2>本轮明确排除采集</h2><p>仅保留无正文占位。</p></div> : turn ? <>
        <section className="turn-section request-section" data-section="request" aria-labelledby="request-heading"><h2 id="request-heading" tabIndex={-1}>请求</h2><RequestContent messages={messages.request} /></section>
        <section className="turn-section route-section-main" data-section="route" aria-labelledby="route-heading-main"><h2 id="route-heading-main" tabIndex={-1}>路由</h2>
          {relation && !['primary', 'unreported', 'excluded'].includes(relation.kind) && <p className="route-context"><span className={`relation relation-${relation.kind}`}>{relation.label}</span><span>当前浏览：{label}</span></p>}
          {route && <p className="route-summary">{route.summary}</p>}
          <RouteEvolution events={events} onDetail={openDetail} />
        </section>
        <section className="turn-section result-section" data-section="result" aria-labelledby="result-heading"><h2 id="result-heading" tabIndex={-1}>结果</h2><ResultContent messages={messages.result} process={messages.process} /></section>
      </> : <p className="section-empty">{body.error ? '本轮读取失败，请查看记录信息并重试。' : '正在读取本轮…'}</p>}
      <details className="record-information"><summary><FileClock size={13} />记录信息{issueCount > 0 && <span className="warning-label"><TriangleAlert size={12} />{issueCount} 项读取或采集提示</span>}<ChevronDown size={13} /></summary><dl className="definition-list"><div><dt>采集状态</dt><dd>{captureNames[turn?.status ?? 'pending']}</dd></div>{last && <><div><dt>Agent 最近上报状态</dt><dd>{agentNames[last.snapshot.status] ?? last.snapshot.status}</dd></div><div><dt>最近上报时间</dt><dd>{date(last.at, true)}</dd></div></>}<div><dt>聊天轮次</dt><dd>{task?.turnCount ?? '—'} 轮 · 当前归属相关 {context?.turnCount ?? '—'} 轮</dd></div><div><dt>当前归属最近上报</dt><dd>{date(context?.latestReported?.reportedAt)}</dd></div></dl><p className="detail-note">采集状态和 Agent 最近上报不表示宿主实时运行状态。</p>{events.length > 0 && <Button size="sm" variant="outline" onClick={e => { markOrigin(e.currentTarget); openDetail({ kind: 'reports', events }); }}>原始上报数据<FileClock size={13} /></Button>}{errors.map(error => <p className="record-error" key={error}>读取失败：{error}</p>)}{turn?.issues.map((issue, i) => <p className="record-error" key={i}>{issue.code}{issue.message ? `：${issue.message}` : ''}</p>)}{issueCount > 0 && <Button size="sm" variant="outline" onClick={refresh}>重新读取</Button>}</details>
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
