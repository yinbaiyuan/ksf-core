import type {Capture,Issue} from '../types';
const date=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'暂无上报';
import {Link} from '@ksf/sdk/link';
import {SettingsStatus,SettingsTechnical} from './settings-controls';
export function SettingsDiagnostics({capture,errors}:{capture?:Capture;errors:Issue[]}){return <>
 <dl className="settings-metadata"><div><dt>任务归档</dt><dd>{capture?.enabled?'已启用':'未启用'}</dd></div><div><dt>项目 Hooks</dt><dd>{capture?.hookConfigured?'已配置':'未配置'}<p className="settings-description">是否已获宿主信任，以 Codex 审核结果为准。</p></dd></div><div><dt>启用时间</dt><dd>{date(capture?.activatedAt)}</dd></div></dl>
 <p>页面显示最近一次采集与 Agent 上报，不表示宿主当前仍在运行。</p>{errors.length?errors.map((e,i)=><SettingsStatus error key={i}>{e.code}：{e.message}</SettingsStatus>):<p>本次任务列表查询未发现读取缺口。</p>}
 <Link href="/api/health" target="_blank">服务健康接口</Link><SettingsTechnical title="采集原始状态"><pre>{JSON.stringify(capture??{},null,2)}</pre></SettingsTechnical>
 </>;}
