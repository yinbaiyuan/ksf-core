import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChartNoAxesCombined, ChevronLeft, ChevronRight, Info, RefreshCw } from 'lucide-react';
import type { WidgetProps } from '@ksf/sdk/desktop/registry';
import type { WorkActivity, WorkMetric, WorkPeriod, WorkStats, WorkTarget } from '../types';
import { Sheet } from '@ksf/sdk/components/ui/sheet';
import { nextWorkMidnight, workDateRange, workMetrics, workPageSize, workPeriodLabels, workRows, workSearch, workTargets, workTasks } from '../work-stats-model';
import './work-stats.css';

function useWorkStats(visible: boolean) {
  const [data, setData] = useState<WorkStats | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useRef<(force?: boolean) => void>(() => {});
  useEffect(() => {
    if (!visible) return;
    let live = true, pending = false, midnight: ReturnType<typeof setTimeout>; const controller = new AbortController();
    const load = async (force = false) => {
      if (pending || document.hidden) return; pending = true; setBusy(true);
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch('/api/work-stats?' + new URLSearchParams({ timeZone, ...(force ? { refresh: '1' } : {}) }), { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.data) throw Error(body.error?.message ?? '工作统计暂时无法读取。');
        if (live) { setData(body.data); setError(''); }
      } catch (error) { if (live && !controller.signal.aborted) setError((error as Error).message); }
      finally { pending = false; if (live) setBusy(false); }
    };
    const boundary = () => { midnight = setTimeout(() => { void load(true); boundary(); }, nextWorkMidnight()); };
    const visibleAgain = () => { if (!document.hidden) { clearTimeout(midnight); boundary(); void load(); } };
    refresh.current = force => { void load(force); }; void load(); boundary();
    const interval = setInterval(() => { void load(); }, 15000); document.addEventListener('visibilitychange', visibleAgain);
    return () => { live = false; controller.abort(); clearTimeout(midnight); clearInterval(interval); document.removeEventListener('visibilitychange', visibleAgain); refresh.current = () => {}; };
  }, [visible]);
  return { data, error, busy, refresh: () => refresh.current(true) };
}
type Detail = { data: WorkStats; period: WorkPeriod; metric: WorkMetric | null; target: WorkTarget | null; page: number; parentPage: number };
const time = (at: string, zone: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: zone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at));

function StatsTable({ data, choose }: { data: WorkStats | null; choose: (period: WorkPeriod, metric: WorkMetric) => void }) {
  return <table className="work-stats-table"><caption className="sr-only">今日和本周工作统计</caption><colgroup><col className="work-stats-period-column" />{workMetrics.map(({ id }) => <col key={id} />)}</colgroup><thead><tr><th scope="col"><span className="sr-only">周期</span></th>{workMetrics.map(({ id, label }) => <th scope="col" key={id}>{label}</th>)}</tr></thead><tbody>{(['today', 'week'] as const).map(period => <tr key={period}><th scope="row"><span>{workPeriodLabels[period]}</span><small>{data ? workDateRange(data, period) : '—'}</small></th>{workMetrics.map(({ id, label }, index) => <td key={id} className={index < 2 ? 'work-stats-main' : ''}><button disabled={!data} aria-label={`${workPeriodLabels[period]}${label} ${data?.[period].counts[id] ?? '读取中'}，查看明细`} onClick={() => choose(period, id)}>{data ? data[period].counts[id].toLocaleString('zh-CN') : '—'}</button></td>)}</tr>)}</tbody></table>;
}
export function WorkStatsWidget({ compact, visible = true, open }: WidgetProps) {
  const stats = useWorkStats(visible), [detail, setDetail] = useState<Detail | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (detailsRef.current) detailsRef.current.scrollTop = 0; }, [detail?.page, detail?.metric, detail?.target?.key]);
  const show = (period: WorkPeriod = 'today', metric: WorkMetric | null = null, target: WorkTarget | null = null) => { if (stats.data) setDetail({ data: stats.data, period, metric, target, page: 0, parentPage: 0 }); };
  const choose = (period: WorkPeriod, metric: WorkMetric) => {
    if (detail) setDetail({ ...detail, period, metric, target: null, page: 0, parentPage: 0 }); else show(period, metric);
  };
  const openTurn = (row: WorkActivity) => { const target = detail?.target?.key; setDetail(null); open(workSearch(row, target), true); };
  const rows = detail ? workRows(detail.data, detail.period, detail.target?.key) : [];
  const targets = detail && ['projects', 'knowledge', 'abilities'].includes(detail.metric ?? '') && !detail.target ? workTargets(rows, detail.metric!) : null;
  const tasks = detail?.metric !== 'turns' && !targets ? workTasks(rows) : null;
  const count = targets?.length ?? tasks?.length ?? rows.length, page = detail?.page ?? 0;
  const pageStart = page * workPageSize;
  return <>
    {compact ? <button className="widget-shortcut" aria-label={stats.error && !stats.data ? '重试工作统计' : '展开工作统计'} title={stats.error || '展开完整工作统计'} disabled={!stats.data && stats.busy} onClick={() => stats.data ? show() : stats.refresh()}><ChartNoAxesCombined size={28} /><span>{stats.error && !stats.data ? '重试统计' : stats.busy && !stats.data ? '读取中…' : '工作统计'}</span></button> : <div className="work-stats-card" aria-busy={!stats.data && stats.busy}>
      <StatsTable data={stats.data} choose={choose} />
      <div className="work-stats-today-targets" aria-label="今日涉及的项目、知识和能力">{workMetrics.slice(2).map(({ id, label }) => {
        const items = stats.data ? workTargets(workRows(stats.data, 'today'), id) : [];
        return <div className="work-stats-target-row" key={id}><span className="work-stats-target-label">今日{label}</span><div className="work-stats-target-names">{items.length ? items.map(({ target }) => <button key={target.key} title={target.label} aria-label={`查看今日${label} ${target.label} 的关联任务`} onClick={() => show('today', id, target)}>{target.label}{target.lifecycle === 'planned' && '（待创建）'}</button>) : <span className="work-stats-no-target">{stats.data ? '暂无' : '—'}</span>}</div></div>;
      })}</div>
      <div className="work-stats-footer"><span>{stats.data ? `更新于 ${time(stats.data.generatedAt, stats.data.timeZone)}` : stats.error ? '统计暂不可用' : '正在读取工作记录…'}</span><button aria-label="刷新工作统计" title="刷新统计" disabled={stats.busy || !visible} onClick={stats.refresh}><RefreshCw size={13} className={stats.busy ? 'work-stats-spinning' : ''} /></button><button aria-label="查看统计口径" title="查看统计口径" disabled={!stats.data} onClick={() => show()}><Info size={13} /></button></div>
      {stats.error && <p className="work-stats-warning" role="alert">{stats.error}{stats.data && ' 显示上次统计。'}<button onClick={stats.refresh}>重试</button></p>}
      {!!stats.data?.errors.length && <p className="work-stats-warning" role="status">部分记录无法读取，统计可能不完整。</p>}
      {stats.data && !stats.data.capture.enabled && <p className="work-stats-note">对话采集未开启，仅统计已有记录。</p>}
    </div>}
    <Sheet solid open={!!detail} onOpenChange={value => { if (!value) setDetail(null); }} className="work-stats-sheet" title={detail?.metric ? `${workPeriodLabels[detail.period]} · ${workMetrics.find(item => item.id === detail.metric)?.label}${detail.target ? ` · ${detail.target.label}` : ''}` : '工作统计'} description="按已记录的用户轮次统计；点击记录可定位原对话。">
      {detail && <>
        {detail.metric === null ? <><StatsTable data={detail.data} choose={choose} /><div className="work-stats-method"><h3>统计口径</h3><p>一个聊天算一个任务；本期开始的用户轮次才计入，进行中和中断的轮次也包括在内。</p><p>项目、知识、能力按本期曾作为主归属的对象去重。仅关联或使用过的能力不计入，三项数量不相加。</p><p>今日从零点开始，本周从周一开始。时区：{detail.data.timeZone}。仅统计已记录的内容，未记录和策略待确认的轮次不计入。</p></div></> : <>
          <div className="work-stats-detailbar">{detail.target && <button onClick={() => setDetail({ ...detail, target: null, page: detail.parentPage })}><ArrowLeft size={14} />返回对象列表</button>}<span>{workDateRange(detail.data, detail.period)} · {count.toLocaleString('zh-CN')} {targets ? '个对象' : tasks ? '个任务' : '轮对话'}</span></div>
          <div className="work-stats-details" ref={detailsRef}>
            {targets ? targets.slice(pageStart, pageStart + workPageSize).map(item => <button className="work-stats-detail" key={item.target.key} onClick={() => setDetail({ ...detail, target: item.target, page: 0, parentPage: detail.page })}><span><strong>{item.target.label}{item.target.lifecycle === 'planned' && <small>（待创建）</small>}</strong><small>{item.tasks.size} 个任务 · {item.turns.size} 轮对话</small></span><ChevronRight size={16} /></button>)
              : tasks ? tasks.slice(pageStart, pageStart + workPageSize).map(item => <button className="work-stats-detail" key={item.id} onClick={() => openTurn(item.latest)}><span><strong>{item.title}</strong><small>{item.turns} 轮 · 最近 {time(item.latest.startedAt, detail.data.timeZone)}</small></span><span aria-hidden="true">↗</span></button>)
                : rows.slice(pageStart, pageStart + workPageSize).map(row => <button className="work-stats-detail" key={`${row.taskId}:${row.turnId}`} onClick={() => openTurn(row)}><span><strong>{row.title}</strong><small>{time(row.startedAt, detail.data.timeZone)} · {row.taskTitle}</small><small>{row.primaryTargets.map(target => target.label).join('、') || '本轮未上报具体归属'}</small></span><span aria-hidden="true">↗</span></button>)}
            {!count && <p className="work-stats-empty">本期没有符合该口径的记录。</p>}
          </div>
          <div className="work-stats-pagination"><button aria-label="上一页统计明细" disabled={!page} onClick={() => setDetail({ ...detail, page: page - 1 })}><ChevronLeft size={16} />上一页</button><span>{page + 1} / {Math.max(1, Math.ceil(count / workPageSize))}</span><button aria-label="下一页统计明细" disabled={pageStart + workPageSize >= count} onClick={() => setDetail({ ...detail, page: page + 1 })}>下一页<ChevronRight size={16} /></button></div>
        </>}
        <p className="work-stats-note">统计至 {time(detail.data.generatedAt, detail.data.timeZone)} · 明细保留打开时的记录。</p>
        {!!detail.data.errors.length && <p className="work-stats-warning">部分记录无法读取，当前仅展示可核对的记录。</p>}
      </>}
    </Sheet>
  </>;
}
