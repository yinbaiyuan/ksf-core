import { Activity, ArrowUpRight, ChevronDown } from 'lucide-react';
import type { Capture, Issue } from './types';
const dateFormats = new Map<boolean, Intl.DateTimeFormat>();
export const date = (value?: string | null, full = false) => {
  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return '暂无上报';
  let formatter = dateFormats.get(full);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...(full ? { year: 'numeric', second: '2-digit' } : {}), hour12: false });
    dateFormats.set(full, formatter);
  }
  return formatter.format(timestamp);
};
import { Button } from './components/ui/button';
export function Diagnostics({ capture, errors }: { capture?: Capture; errors: Issue[] }) {
  return <><div className="detail-type"><Activity size={16} />本地采集</div><h3 className="detail-name">采集与服务诊断</h3><dl className="definition-list">
    <div><dt>任务归档</dt><dd>{capture?.enabled ? '已启用' : '未启用'}</dd></div><div><dt>项目 Hooks</dt><dd>{capture?.hookConfigured ? '已配置' : '未配置'}<small>是否已获宿主信任，以 Codex 审核结果为准。</small></dd></div><div><dt>启用时间</dt><dd>{date(capture?.activatedAt, true)}</dd></div>
  </dl><p className="detail-note">页面显示最近一次采集与 Agent 上报，不表示宿主当前仍在运行。</p><h4>读取缺口</h4>{errors.length ? errors.map((e, i) => <p className="diagnostic-issue" key={i}><strong>{e.code}</strong>{e.message}</p>) : <p className="muted">本次任务列表查询未发现读取缺口。</p>}<Button variant="outline" asChild><a href="/api/health" target="_blank" rel="noreferrer">服务健康接口<ArrowUpRight size={14} /></a></Button><details className="technical"><summary>采集原始状态<ChevronDown size={14} /></summary><pre>{JSON.stringify(capture ?? {}, null, 2)}</pre></details></>;
}
