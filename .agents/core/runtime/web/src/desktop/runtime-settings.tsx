import {useSettingsMutation} from './settings-mutation';
import {Dialog} from '@ksf/sdk/dialog';
import {Button} from '@ksf/sdk/button';
import {SettingsField} from './settings-fields';
import {Switch} from '@ksf/sdk/switch';
import { useEffect, useState } from 'react';
import { request } from '../apps/client';
import { settingsError, SettingsGroup, SettingsLink, SettingsStatus, SettingsActions, SettingsEmpty, SettingsTechnical, useSettingsDraft, useSettingsDetail, useSettingsNavigation } from './settings-controls';
type Runtime = {
    id: string;
    pid?: number;
    reason: string;
    clients: number;
    calls: number;
    jobs: number;
    startedAt: string;
};
type App = {
    id: string;
    name: string;
    enabled: boolean;
    state: string;
    lifecycle: string;
    stopped: boolean;
    manual: boolean;
    restarts: number;
    runtimes: Runtime[];
    holds: Record<string, {
        reason: string;
    }>;
    errors: {
        code: string;
        message: string;
    }[];
};
type Service = {
    state: string;
    pid: number;
    port: number;
    reason: string;
    startedAt: string;
    autostart: boolean | null;
    capabilities?: {
        loginStartup: boolean;
    };
    ai: {
        active: number;
        queued: number;
    };
    frontend: {
        state: string;
    };
    communication?: {
        outgoing: number;
        receiving: number;
        deliveries: number;
        error?: {
            code: string;
        };
    };
};
type Diagnosis = {
    health: string;
    issues: {
        service: string;
        code: string;
        message?: string;
    }[];
    recovery: string;
};
type Owner = {
    kind: 'service';
} | {
    kind: 'app';
    appId: string;
};
type View = Owner | {
    kind: 'logs';
    from: Owner;
} | {
    kind: 'diagnosis';
    from: Owner;
} | null;
const appStatus = (app: App) => !app.enabled ? '已停用' : app.lifecycle === 'frontend' ? '无需后台' : app.state === 'running' ? '运行中' : app.state === 'blocked' ? '数据准备受阻' : app.stopped ? '已由用户停止' : app.state === 'idle' ? '按需待机' : '状态未知';
export function RuntimeSettingsContent({ onMonitor }: {
    onMonitor?: () => void;
}) {
    const [loadError, setLoadError] = useState(''), [configurationVersion, setConfigurationVersion] = useState(''), [loginStartup, setLoginStartup] = useState(true), [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null), [service, setService] = useState<Service | null>(null), [apps, setApps] = useState<App[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [logs, setLogs] = useState(''), [stopped, setStopped] = useState(false), [view, setView] = useState<View>(null), [confirmation, setConfirmation] = useState<'stop' | 'restart' | null>(null);
    const serviceMutation=useSettingsMutation('service',()=>{void load();},()=>{void load();});
    const navigate = useSettingsNavigation(), app = view?.kind === 'app' ? apps.find(item => item.id === view.appId) : undefined;
    const title = view?.kind === 'app' ? (app?.name ?? '应用后台') : view?.kind === 'service' ? '主服务管理' : view?.kind === 'logs' ? '服务与应用日志' : view?.kind === 'diagnosis' ? '运行诊断' : '';
    useSettingsDraft(false, busy);
    useSettingsDetail(view ? view.kind + ('appId' in view ? ':' + view.appId : '') : null, title, () => { setView(view?.kind === 'logs' || view?.kind === 'diagnosis' ? view.from : null); setConfirmation(null); });
    async function load() { try {
        const [s, a, config] = await Promise.all([request<Service>('/api/runtime/service'), request<{
                applications: App[];
            }>('/api/runtime/apps'), request<{
                etag: string;
                details?: {
                    capabilities?: {
                        loginStartup: boolean;
                    };
                };
            }>('/api/config/service')]);
        setConfigurationVersion(config.etag);
        setLoginStartup(config.details?.capabilities?.loginStartup !== false);
        setService(s);
        setApps(a.applications);
        setLoadError('');
    }
    catch (e) {
        setLoadError(settingsError(e));
    } }
    useEffect(() => { if (stopped)
        return; void load(); const refresh = () => { if (document.visibilityState !== 'hidden')
        void load(); }; const timer = setInterval(refresh, 5000); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); }; }, [stopped]);
    async function action(path: string, input: unknown) { setBusy(true); setError(''); setNotice(''); try {
        const change = input as {
            operation?: string;
            enabled?: boolean;
        };
        if (change.operation === 'autostart') {
            const result=await serviceMutation.submit({autostart:change.enabled});if(!result)return;
            setNotice(result.application.state === 'failed' ? (result.application.error?.message ?? '已保存，登录启动项尚未成功应用。') : '登录启动设置已保存。');
        }
        else {
            await request(path, input);
            setNotice('操作已完成。');
        }
        await load();
    }
    catch (e) {
        setError(settingsError(e));
    }
    finally {
        setBusy(false);
    } }
    async function serviceAction(operation: 'stop' | 'restart') { setBusy(true); setError(''); try {
        await request('/api/runtime/service', { operation });
        setStopped(true);
        setConfirmation(null);
        setNotice(operation === 'stop' ? '后台正在退出。可使用设备上的 KSF 启动入口重新启动。' : '后台正在重启，稍后点击重新连接。');
    }
    catch (e) {
        setError(settingsError(e));
    }
    finally {
        setBusy(false);
    } }
    async function showLogs(owner: Owner) { setError(''); try {
        const value = owner.kind === 'service' ? await request<Record<string, string>>('/api/runtime/service', { operation: 'logs' }) : await request<{
            text: string;
        }>('/api/runtime/apps', { action: 'logs', appId: owner.appId });
        setLogs(owner.kind === 'service' ? Object.entries(value).map(([name, text]) => name + '\n' + text).join('\n') : (value as {
            text: string;
        }).text || '暂无日志');
        navigate(() => setView({ kind: 'logs', from: owner }));
    }
    catch (e) {
        setError(settingsError(e));
    } }
    async function diagnose(owner: Owner) { setError(''); try {
        setDiagnosis(await request<Diagnosis>('/api/runtime/service', { operation: 'doctor' }));
        navigate(() => setView({ kind: 'diagnosis', from: owner }));
    }
    catch (e) {
        setError(settingsError(e));
    } }
    const feedback = <>{serviceMutation.feedback}{loadError && <SettingsStatus error>运行状态暂时无法读取：{loadError}。{service ? '以下保留上次读取的结果。' : ''}</SettingsStatus>}{error && <SettingsStatus error>{error}</SettingsStatus>}{notice && <SettingsStatus>{notice}</SettingsStatus>}</>;
    if (view?.kind === 'logs')
        return <>{feedback}<SettingsGroup title="日志内容"><div className="settings-log-view"><pre>{logs}</pre></div></SettingsGroup><SettingsActions><Button disabled={stopped} onClick={() => void showLogs(view.from)} type="button">刷新日志</Button></SettingsActions></>;
    if (view?.kind === 'diagnosis')
        return <>{feedback}<SettingsGroup title="诊断结果"><div className="settings-detail-summary"><span className={'settings-status-badge ' + (diagnosis?.health === 'healthy' ? 'is-good' : 'is-error')}>{diagnosis?.health === 'healthy' ? '后台健康' : '有问题需要处理'}</span>{diagnosis?.issues.map((issue, i) => <SettingsStatus error key={i}>{issue.service} · {issue.message ?? issue.code}</SettingsStatus>)}{diagnosis?.health !== 'healthy' && <p>{diagnosis?.recovery}</p>}</div><SettingsTechnical title="诊断原始数据"><pre>{JSON.stringify(diagnosis, null, 2)}</pre></SettingsTechnical></SettingsGroup><SettingsActions><Button disabled={stopped} onClick={() => void diagnose(view.from)} type="button">重新诊断</Button></SettingsActions></>;
    if (view?.kind === 'app')
        return <>{feedback}{app ? <><SettingsGroup title="运行状态"><dl className="settings-metadata"><div><dt>状态</dt><dd>{appStatus(app)}</dd></div><div><dt>运行方式</dt><dd>{app.lifecycle === 'resident' ? '常驻' : app.lifecycle === 'frontend' ? '纯界面' : '按需'}</dd></div><div><dt>异常重启</dt><dd>{app.restarts} 次</dd></div></dl>{app.errors.map((issue, i) => <SettingsStatus error key={i}>{issue.code}：{issue.message}</SettingsStatus>)}<SettingsTechnical title="进程与保活信息"><p>{app.id}</p>{app.runtimes.map(runtime => <dl className="settings-metadata" key={runtime.id}><div><dt>进程 PID</dt><dd>{runtime.pid ?? '未知'}</dd></div><div><dt>启动时间</dt><dd>{new Date(runtime.startedAt).toLocaleString()}</dd></div><div><dt>调用 / 后台任务</dt><dd>{runtime.calls} / {runtime.jobs}</dd></div><div><dt>租约 / 启动原因</dt><dd>{runtime.clients} / {runtime.reason}</dd></div></dl>)}{Object.entries(app.holds).map(([key, hold]) => <p key={key}>保活：{hold.reason}</p>)}</SettingsTechnical></SettingsGroup>
  <SettingsGroup title="后台操作"><div className="settings-group-footer"><SettingsActions>{(['start', 'stop', 'restart'] as const).map((operation, i) => <Button key={operation} className={operation === 'stop' ? 'settings-danger' : ''} disabled={busy || stopped || !app.enabled || app.lifecycle === 'frontend'} onClick={() => void action('/api/runtime/apps', { action: operation, appId: app.id })} type="button">{['启动', '停止', '重启'][i]}</Button>)}</SettingsActions>{app.lifecycle === 'frontend' && <p className="settings-description">纯界面应用没有可管理的后台进程。</p>}</div><SettingsLink title="应用日志" onClick={() => void showLogs({ kind: 'app', appId: app.id })} disabled={stopped}/></SettingsGroup></> : <SettingsEmpty>此应用已不在当前后台列表中。</SettingsEmpty>}</>;
    if (view?.kind === 'service')
        return <>{feedback}<SettingsGroup title="主服务状态"><dl className="settings-metadata"><div><dt>状态</dt><dd>{stopped ? '正在停止或重启' : service?.state === 'running' ? '运行中' : '状态未知'}</dd></div><div><dt>启动时间</dt><dd>{service ? new Date(service.startedAt).toLocaleString() : '尚未读取'}</dd></div><div><dt>端口 / PID</dt><dd>{service ? `${service.port} / ${service.pid}` : '尚未读取'}</dd></div></dl><SettingsTechnical title="运行详情"><p>启动原因：{service?.reason ?? '未知'}；界面资源：{service?.frontend.state ?? '未知'}</p>{service?.communication && <p>通信发送 {service.communication.outgoing} / 接收 {service.communication.receiving} / 应用投递 {service.communication.deliveries}</p>}</SettingsTechnical></SettingsGroup>
  <SettingsGroup title="检查与日志"><SettingsLink title="服务日志" disabled={stopped} onClick={() => void showLogs({ kind: 'service' })}/><SettingsLink title="运行诊断" disabled={busy || stopped} onClick={() => void diagnose({ kind: 'service' })}/></SettingsGroup>
  <SettingsGroup title="管理主服务" description="停止或重启前，服务会等待在途工作排空。"><div className="settings-group-footer"><SettingsActions><Button disabled={busy || stopped} onClick={() => setConfirmation('restart')} type="button">重启后台</Button><Button className="settings-danger" disabled={busy || stopped} onClick={() => setConfirmation('stop')} type="button" tone="danger">停止后台</Button><Button onClick={() => navigate(()=>location.reload())} type="button">重新连接</Button></SettingsActions><Dialog open={!!confirmation} title={confirmation==='stop'?'停止后台？':'重启后台？'} centered danger confirming={busy} closeOnOutside={false} onClose={()=>{if(busy)return false;setConfirmation(null);}} confirmLabel={confirmation==='stop'?'停止后台':'重启后台'} onConfirm={async()=>{if(!confirmation||busy||serviceMutation.blocked)return false;await serviceAction(confirmation);return false;}}><p>{confirmation==='stop'?'停止后，后台任务和通信服务将不可用。':'重启期间，工作台和后台连接将暂时断开。'}</p></Dialog></div></SettingsGroup></>;
    return <>{!service && !error && <SettingsStatus>正在读取运行状态…</SettingsStatus>}{feedback}
  <SettingsGroup title="KSF 主服务"><dl className="settings-metadata"><div><dt>状态</dt><dd><span className={'settings-status-badge ' + (!stopped && service?.state === 'running' ? 'is-good' : '')}>{stopped ? '等待重新连接' : service?.state === 'running' ? '运行中' : '状态未知'}</span></dd></div><div><dt>AI 任务</dt><dd>{service ? `${service.ai.active} 执行中 · ${service.ai.queued} 排队` : '尚未读取'}</dd></div></dl><SettingsLink title="主服务详情与管理" description="服务日志、诊断与重启操作" onClick={() => navigate(() => setView({ kind: 'service' }))}/></SettingsGroup>
  <SettingsGroup title="启动与后台" description="关闭工作台窗口后，后台任务仍可继续运行。"><div className="settings-form-fields"><SettingsField className="settings-checkbox" label={<>用户登录后启动后台</>}><Switch checked={service?.autostart === true} disabled={busy || stopped || !service || !loginStartup} onCheckedChange={(checked) => void action('/api/runtime/service', { operation: 'autostart', enabled: checked })} label="用户登录后启动后台"/></SettingsField></div>{!loginStartup && <SettingsStatus>当前平台暂不支持登录自启动，请使用 KSF 命令启动后台。</SettingsStatus>}{onMonitor && <SettingsLink title="活动监视器" description="查看任务、后台应用与 CPU、内存占用" onClick={onMonitor}/>}</SettingsGroup>
  {service?.communication?.error && !stopped && <SettingsStatus error>通信服务不可用，请运行诊断。</SettingsStatus>}
  <SettingsGroup title="应用后台" description={service ? `${apps.filter(item => item.state === 'running').length} 个应用正在后台运行` : undefined}>{apps.map(item => <SettingsLink key={item.id} title={item.name} description={item.lifecycle === 'resident' ? '常驻后台' : item.lifecycle === 'frontend' ? '纯界面' : '按需运行'} value={<span className={'settings-status-badge ' + (item.state === 'running' ? 'is-good' : item.errors.length ? 'is-error' : '')}>{appStatus(item)}</span>} onClick={() => navigate(() => setView({ kind: 'app', appId: item.id }))}/>)}{service && !apps.length && <SettingsEmpty>暂无应用后台。</SettingsEmpty>}</SettingsGroup>
  <SettingsActions><Button disabled={busy} onClick={() => { setError(''); void load(); }} type="button">刷新状态</Button>{stopped && <Button onClick={() => navigate(()=>location.reload())} type="button">重新连接</Button>}</SettingsActions>
 </>;
}
