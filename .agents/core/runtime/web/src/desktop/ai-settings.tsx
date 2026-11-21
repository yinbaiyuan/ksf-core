import {SettingsNumberField} from './settings-fields';
import {useSettingsMutation} from './settings-mutation';
import {configurationNumber} from './settings-numbers';
import {SettingsField} from './settings-fields';
import {TextField} from '@ksf/sdk/text-field';
import {Button} from '@ksf/sdk/button';
import {Form} from '@ksf/sdk/form';
import {SettingsSelect} from './settings-fields';
import {Switch} from '@ksf/sdk/switch';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createWorkbenchClient } from '../apps/request-client';
import type { AITask } from '../../../../applications/sdk/src/ai-tasks';
import { settingsError, SettingsGroup, SettingsLink, SettingsStatus, SettingsActions, SettingsEmpty, SettingsTechnical, useSettingsDraft, useSettingsDetail, useSettingsNavigation } from './settings-controls';
type Connection = {
    id: string;
    kind: 'api' | 'codex';
    enabled: boolean;
    concurrency: number;
    protocolId?: string;
    baseURL?: string;
    credentialRef?: string;
    executablePath?: string;
    codexHome?: string;
};
type Profile = {
    id: string;
    executorId: string;
    enabled: boolean;
    model?: string;
    timeoutMs: number;
    maxAttempts: number;
    retryDelayMs: number;
    maxInputBytes: number;
    maxOutputBytes: number;
};
type ConnectionDraft=Omit<Connection,'concurrency'>&{concurrency:string};
type ProfileDraft=Omit<Profile,'timeoutMs'|'maxAttempts'|'retryDelayMs'|'maxInputBytes'|'maxOutputBytes'>&{timeoutMs:string;maxAttempts:string;retryDelayMs:string;maxInputBytes:string;maxOutputBytes:string};
const connectionDraft=(v:Connection):ConnectionDraft=>({...v,concurrency:String(v.concurrency)});
const profileDraft=(v:Profile):ProfileDraft=>({...v,timeoutMs:String(v.timeoutMs/1000),maxAttempts:String(v.maxAttempts),retryDelayMs:String(v.retryDelayMs),maxInputBytes:String(v.maxInputBytes),maxOutputBytes:String(v.maxOutputBytes)});
type Config<T> = {
    schemaVersion: 1;
    revision: number;
    items: T[];
};
type Snapshot = {
    connections: Config<Connection>;
    profiles: Config<Profile>;
    tasks: AITask[];
    backgroundErrors?: {
        appId?: string;
        code: string;
        message: string;
    }[];
};
type DesktopState = {
    available: boolean;
    contractVersion: string;
    platform: string;
    executable?: string;
    permissionProfile: string | null;
    code?: string;
    message?: string;
    checkedAt: string;
};
const client = createWorkbenchClient();
const statuses: Record<string, string> = { queued: '排队中', running: '执行中', retry_wait: '等待重试', reconciling: '待对账', succeeded: '已完成', failed: '失败', cancelled: '已取消' };
const emptyConnection: Connection = { id: '', kind: 'codex', enabled: true, concurrency: 1, executablePath: '' };
const emptyProfile: Profile = { id: '', executorId: '', enabled: true, model: '', timeoutMs: 180000, maxAttempts: 1, retryDelayMs: 2000, maxInputBytes: 1048576, maxOutputBytes: 65536 };
const apiDefaults: Record<string, {
    baseURL: string;
    credentialRef: string;
}> = {
    'deepseek-responses-v1': { baseURL: 'https://api.deepseek.com', credentialRef: 'env:DEEPSEEK_API_KEY' },
    'openai-responses-v1': { baseURL: 'https://api.openai.com/v1', credentialRef: 'env:OPENAI_API_KEY' },
    'openai-transcription-v1': { baseURL: 'https://api.openai.com/v1', credentialRef: 'env:OPENAI_API_KEY' },
};
export function AISettingsContent({ onProjects }: {
    onProjects?: () => void;
} = {}) {
    const [versions, setVersions] = useState<Record<string, string>>({}), [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const [connection, setConnection] = useState<ConnectionDraft>(()=>connectionDraft(emptyConnection)), [profile, setProfile] = useState<ProfileDraft>(()=>profileDraft(emptyProfile)), [selected, setSelected] = useState<AITask | null>(null), [mode, setMode] = useState<'connection' | 'profile' | 'task' | 'tasks' | 'desktop' | null>(null), [baseline, setBaseline] = useState(''), [page, setPage] = useState(0), [title, setTitle] = useState(''),[profileAdvanced,setProfileAdvanced]=useState(false);
    const [desktop, setDesktop] = useState<DesktopState | null>(null), [desktopError, setDesktopError] = useState(''), [desktopReading, setDesktopReading] = useState(false), desktopRequest = useRef(0);
    const readDesktop = useCallback(async () => { const request = ++desktopRequest.current; setDesktopReading(true); try {
        const value = await client.request<DesktopState>('/api/ai/desktop', {});
        if (request === desktopRequest.current) {
            setDesktop(value);
            setDesktopError('');
        }
    }
    catch (e) {
        if (request === desktopRequest.current) {
            setDesktop(null);
            setDesktopError(settingsError(e));
        }
    }
    finally {
        if (request === desktopRequest.current)
            setDesktopReading(false);
    } }, []);
    const submittedDraft=useRef({connections:'',profiles:''});
    const connectionsMutation=useSettingsMutation('ai.connections',values=>{const item=(values.items as Connection[]|undefined)?.find(v=>v.id===connection.id);if(item){const draft=connectionDraft(item);setConnection(draft);setBaseline(JSON.stringify(draft));}void load();},()=>{if(submittedDraft.current.connections)setBaseline(submittedDraft.current.connections);void load();});
    const profilesMutation=useSettingsMutation('ai.profiles',values=>{const item=(values.items as Profile[]|undefined)?.find(v=>v.id===profile.id);if(item){const draft=profileDraft(item);setProfile(draft);setBaseline(JSON.stringify(draft));}void load();},()=>{if(submittedDraft.current.profiles)setBaseline(submittedDraft.current.profiles);void load();});
    const navigate = useSettingsNavigation(), dirty = mode === 'connection' ? JSON.stringify(connection) !== baseline : mode === 'profile' ? JSON.stringify(profile) !== baseline : false;
    useSettingsDraft(dirty, busy, () => { if (mode === 'connection')
        setConnection(JSON.parse(baseline)); if (mode === 'profile')
        setProfile(JSON.parse(baseline)); });
    useSettingsDetail(mode?mode+':'+title+(profileAdvanced?':advanced':''):null,mode==='profile'&&profileAdvanced?'高级执行参数':title,()=>{if(mode==='profile'&&profileAdvanced){setProfileAdvanced(false);return;}setTitle('最近任务');setMode(mode==='task'?'tasks':null);});
    async function load() { try {
        const [snapshot, connections, profiles] = await Promise.all([client.request<Snapshot>('/api/ai/inspect', {}), client.request<{
                etag: string;
            }>('/api/config/ai.connections'), client.request<{
                etag: string;
            }>('/api/config/ai.profiles')]);
        setData(snapshot);
        setVersions({ connections: connections.etag, profiles: profiles.etag });
        setError('');
    }
    catch (e) {
        setError(settingsError(e));
    } }
    useEffect(() => { void load(); }, []);
    useEffect(() => { const refresh = () => { if (!document.hidden)
        void readDesktop(); }; refresh(); const timer = setInterval(refresh, 15000); document.addEventListener('visibilitychange', refresh); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); desktopRequest.current++; }; }, [readDesktop]);
    function editConnection(item?: Connection) { navigate(() => { const value = connectionDraft(item ?? emptyConnection); setConnection(value); setBaseline(JSON.stringify(value)); setTitle(item ? '连接 · ' + item.id : '新增执行端连接'); setMode('connection'); setNotice(''); setError(''); }); }
    function editProfile(item?: Profile) { navigate(() => { const value = profileDraft(item ?? emptyProfile); setProfile(value); setBaseline(JSON.stringify(value)); setTitle(item ? '执行配置 · ' + item.id : '新增执行配置'); setMode('profile');setProfileAdvanced(false); setNotice(''); setError(''); }); }
    async function save(kind: 'connections' | 'profiles', item: Connection | Profile) {
        if (!data||busy)
            return;
        setBusy(true);
        setNotice('');
        setError('');
        try {
            const config = data[kind] as Config<Connection | Profile>;
            submittedDraft.current[kind]=JSON.stringify(kind==='connections'?connection:profile);
            const result=await (kind==='connections'?connectionsMutation:profilesMutation).submit({items:[...config.items.filter(v=>v.id!==item.id),item]});
            if(!result)return;
            setBaseline(JSON.stringify(kind === 'connections' ? connection : profile));
            setNotice(result.application.state === 'failed' ? '已保存，尚未成功应用。' : '已保存，后续新任务使用此配置。');
            await load();
            if (result.application.error)
                setError(result.application.error.message);
        }
        catch (e) {
            setError(settingsError(e, true));
        }
        finally {
            setBusy(false);
        }
    }
    async function saveConnection(){try{await save('connections',{...connection,concurrency:configurationNumber(connection.concurrency,'并发额度',1,8)});}catch(e){setError(settingsError(e,true));}}
    async function saveProfile(){try{const copy:Profile={...profile,timeoutMs:configurationNumber(profile.timeoutMs,'单次时限',1,3600)*1000,maxAttempts:configurationNumber(profile.maxAttempts,'最多尝试',1,5),retryDelayMs:configurationNumber(profile.retryDelayMs,'重试间隔',0),maxInputBytes:configurationNumber(profile.maxInputBytes,'输入上限',1),maxOutputBytes:configurationNumber(profile.maxOutputBytes,'输出上限',1)};if(!copy.model)delete copy.model;await save('profiles',copy);}catch(e){setError(settingsError(e,true));}}
    function selectProtocol(protocolId: string) { const previous = apiDefaults[connection.protocolId ?? ''], next = apiDefaults[protocolId]; setConnection({ ...connection, protocolId, baseURL: !connection.baseURL || connection.baseURL === previous?.baseURL ? next.baseURL : connection.baseURL, credentialRef: !connection.credentialRef || connection.credentialRef === previous?.credentialRef ? next.credentialRef : connection.credentialRef }); }
    const field = (label: string, value: string, onChange: (value: string) => void, placeholder?: string) => <SettingsField className="settings-field" label={<>{label}</>}><TextField value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} required/></SettingsField>;
    const feedback = <>{connectionsMutation.feedback}{profilesMutation.feedback}{dirty && <SettingsStatus>有尚未保存的修改</SettingsStatus>}{error && <SettingsStatus error>{error}</SettingsStatus>}{notice && <SettingsStatus>{notice}</SettingsStatus>}</>;
    const desktopStatus = desktopReading && !desktop ? '正在检查' : desktopError ? '状态未知' : desktop?.available ? '可连接' : desktop ? '未连接' : '尚未检查';
    const desktopBadge = <span className={'settings-status-badge ' + (desktop?.available ? 'is-good' : desktop && !desktop.available ? 'is-error' : '')}>{desktopStatus}</span>;
    if (mode === 'desktop')
        return <>
  <SettingsGroup title="Codex Desktop 会话" description="业务流程选择此路径后，以所属项目创建或接续对话。" action={<Button type="button" className="settings-button" disabled={desktopReading} onClick={() => void readDesktop()}>{desktopReading ? '正在检查…' : '重新检查连接'}</Button>}><dl className="settings-metadata"><div><dt>连接状态</dt><dd>{desktopBadge}</dd></div><div><dt>适用场景</dt><dd>持续对话、项目上下文、人工交互和跨端接续</dd></div><div><dt>模型与登录</dt><dd>沿用 Codex Desktop 的线程设置与登录</dd></div></dl></SettingsGroup>
  {(desktopError || desktop?.message) && <SettingsStatus error>{desktopError || desktop?.message}</SettingsStatus>}
  <SettingsGroup title="使用入口" description="项目应用中可创建、关联和接续 Desktop 对话；其他业务可通过公共 SDK 接入。"><SettingsLink title="打开项目对话入口" description={onProjects ? '选择项目后进入项目对话' : '请先安装项目应用'} disabled={!onProjects} onClick={() => navigate(() => onProjects?.())}/><div className="settings-detail-summary"><p className="settings-field-note">检查连接不会创建对话或启动模型。Desktop 离线时保留原操作，不自动改用 API 或 CLI。</p></div></SettingsGroup>
  <SettingsGroup title="业务接入说明"><div className="settings-detail-summary"><p className="settings-field-note">需要确定结果或 JSON 的步骤选择 API / Codex CLI 执行配置；需要持续交互的步骤选择 Codex Desktop 会话。对话返回操作回执，业务继续查询和采用结果。</p></div><SettingsTechnical title="SDK 与连接详情"><p>使用 @ksf/sdk/ai-services 的 createAIServiceClient 发现并选择路径。任务服务沿用受管应用身份；使用 Desktop 会话的应用还需声明 codex-conversations 权限。</p><dl className="settings-metadata"><div><dt>会话契约</dt><dd>{desktop?.contractVersion ?? 'codex-conversations-v1'}</dd></div>{desktop?.executable && <div><dt>随包程序</dt><dd>{desktop.executable}</dd></div>}{desktop?.permissionProfile && <div><dt>现有权限档</dt><dd>{desktop.permissionProfile}</dd></div>}{desktop?.code && <div><dt>状态代码</dt><dd>{desktop.code}</dd></div>}</dl></SettingsTechnical></SettingsGroup>
 </>;
    if (mode === 'connection')
        return <div className="settings-editor">{feedback}<Form onCommit={saveConnection} disabled={busy} layout="vertical"><SettingsGroup title="连接设置"><fieldset className="settings-form-fields" disabled={busy}>
  {field('连接标识', connection.id, value => setConnection({ ...connection, id: value }), '例如 codex-local')}
  <SettingsField className="settings-field" label={<>执行方式</>}><SettingsSelect value={connection.kind} onChange={e => setConnection(e.target.value === 'codex' ? { ...connectionDraft(emptyConnection), id: connection.id } : { id: connection.id, kind: 'api', enabled: true, concurrency: '1', protocolId: 'deepseek-responses-v1', ...apiDefaults['deepseek-responses-v1'] })}><option value="codex">Codex CLI</option><option value="api">API</option></SettingsSelect></SettingsField>
  {connection.kind === 'api' ? <>{field('API 基础地址', connection.baseURL ?? '', value => setConnection({ ...connection, baseURL: value }))}<SettingsField className="settings-field" label={<>协议</>}><SettingsSelect value={connection.protocolId} onChange={e => selectProtocol(e.target.value)}><option value="deepseek-responses-v1">DeepSeek Responses</option><option value="openai-responses-v1">OpenAI Responses</option><option value="openai-transcription-v1">OpenAI 文件转写</option></SettingsSelect></SettingsField>{field('后台凭据引用', connection.credentialRef ?? '', value => setConnection({ ...connection, credentialRef: value }), 'env:DEEPSEEK_API_KEY')}<p className="settings-field-note">仅填写环境变量引用，后台服务须能读取该变量。</p>{connection.protocolId === 'deepseek-responses-v1' && <p className="settings-field-note">录音需使用单独的转写配置，或提供转写稿。</p>}</> : <>{field('Codex 可执行文件路径', connection.executablePath ?? '', value => setConnection({ ...connection, executablePath: value }), '/path/to/codex')}<p className="settings-field-note">使用后台服务账号已有的 Codex 登录。</p></>}
  <SettingsField className="settings-field" label={<>并发额度</>}><SettingsNumberField inputMode="decimal" required min="1" max="8" value={connection.concurrency} onChange={e => setConnection({ ...connection, concurrency: e.target.value })}/></SettingsField>
  <SettingsField className="settings-checkbox" label={<>接受此连接的新任务</>}><Switch checked={connection.enabled} onCheckedChange={(checked) => setConnection({ ...connection, enabled: checked })} label="接受此连接的新任务"/></SettingsField>
 </fieldset></SettingsGroup><SettingsActions><Button type="button" disabled={busy || dirty || !data?.connections.items.some(item => item.id === connection.id)} onClick={() => { setBusy(true); void client.request<{
            message: string;
        }>('/api/ai/check', { executorId: connection.id }).then(result => { setNotice(result.message); setError(''); }).catch(e => setError(settingsError(e))).finally(() => setBusy(false)); }}>检查已保存的连接</Button><Button type="submit" className="settings-primary" disabled={busy || !data || connectionsMutation.blocked || profilesMutation.blocked} variant="solid" tone="primary">{busy ? '处理中…' : '保存连接'}</Button></SettingsActions></Form></div>;
    if (mode === 'profile')
        return <div className="settings-editor">{feedback}<Form onCommit={saveProfile} disabled={busy} layout="vertical" onInvalidCapture={event=>{const target=event.target;if(target instanceof HTMLElement){const section=target.closest<HTMLElement>('[data-profile-section][hidden]');if(section){setProfileAdvanced(section.dataset.profileSection==='advanced');requestAnimationFrame(()=>target.focus());}}}}><SettingsGroup title="执行配置" description="配置变更只影响新任务，已接收任务保留原快照。"><fieldset className="settings-form-fields" data-profile-section="basic" disabled={busy} hidden={profileAdvanced}>
  {field('配置标识', profile.id, value => setProfile({ ...profile, id: value }), '例如 text-codex')}
  <SettingsField className="settings-field" label={<>连接</>}><SettingsSelect required value={profile.executorId} onChange={e => { const chosen = data?.connections.items.find(item => item.id === e.target.value); setProfile({ ...profile, executorId: e.target.value, model: profile.model || (chosen?.protocolId === 'deepseek-responses-v1' ? 'deepseek-flash' : '') }); }}><option value="">选择连接</option>{data?.connections.items.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</SettingsSelect></SettingsField>
  <SettingsField className="settings-field" label={<>模型<small>API 必填；CLI 可使用默认值</small></>}><TextField required={data?.connections.items.find(item => item.id === profile.executorId)?.kind === 'api'} value={profile.model ?? ''} onChange={e => setProfile({ ...profile, model: e.target.value })}/></SettingsField>
  <SettingsField className="settings-field" label={<>单次时限（秒）</>}><SettingsNumberField inputMode="decimal" required min="1" max="3600" value={profile.timeoutMs} onChange={e => setProfile({ ...profile, timeoutMs: e.target.value })}/></SettingsField><SettingsField className="settings-field" label={<>最多尝试</>}><SettingsNumberField inputMode="decimal" required min="1" max="5" value={profile.maxAttempts} onChange={e => setProfile({ ...profile, maxAttempts: e.target.value })}/></SettingsField>
  <SettingsField className="settings-checkbox" label={<>启用执行配置</>}><Switch checked={profile.enabled} onCheckedChange={(checked) => setProfile({ ...profile, enabled: checked })} label="启用执行配置"/></SettingsField>
 <SettingsLink title="高级执行参数" description="重试间隔与输入输出额度" onClick={()=>setProfileAdvanced(true)}/></fieldset><fieldset className="settings-form-fields" data-profile-section="advanced" disabled={busy} hidden={!profileAdvanced}><SettingsField className="settings-field" label={<>重试间隔（毫秒）</>}><SettingsNumberField inputMode="decimal" required disabled={busy} min="0" value={profile.retryDelayMs} onChange={e => setProfile({ ...profile, retryDelayMs: e.target.value })}/></SettingsField>{(['maxInputBytes', 'maxOutputBytes'] as const).map(key => <SettingsField className="settings-field" key={key} label={<>{key === 'maxInputBytes' ? '输入上限（字节）' : '输出上限（字节）'}</>}><SettingsNumberField inputMode="decimal" required disabled={busy} min="1" value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })}/></SettingsField>)}</fieldset></SettingsGroup><SettingsActions><Button type="submit" className="settings-primary" disabled={busy || !data || connectionsMutation.blocked || profilesMutation.blocked} variant="solid" tone="primary">{busy ? '处理中…' : '保存配置'}</Button></SettingsActions></Form></div>;
    if (mode === 'task' && selected)
        return <><SettingsGroup title="任务摘要"><dl className="settings-metadata"><div><dt>状态</dt><dd>{statuses[selected.status] ?? selected.status}</dd></div><div><dt>执行配置</dt><dd>{selected.execution.profileId}</dd></div><div><dt>执行次数</dt><dd>{selected.execution.attempts.length}</dd></div></dl></SettingsGroup>{selected.error && <SettingsStatus error>{selected.error.message}</SettingsStatus>}{selected.status === 'reconciling' && <SettingsStatus>原执行结果未知，服务不会自动重发；未确认停止的执行仍占并发额度。</SettingsStatus>}<SettingsGroup title="技术详情"><SettingsTechnical title="任务原始数据"><pre>{JSON.stringify(selected, null, 2)}</pre></SettingsTechnical></SettingsGroup></>;
    const tasks = data?.tasks ?? [], pages = Math.max(1, Math.ceil(tasks.length / 20)), currentPage = Math.min(page, pages - 1);
    if(mode==='tasks')return <>{feedback}  <SettingsGroup title="最近任务" description="关闭应用窗口后，任务仍可查询。" action={<Button className="settings-button" disabled={busy} onClick={() => void load()} type="button">刷新</Button>}>{tasks.slice(currentPage * 20, currentPage * 20 + 20).map(task => <SettingsLink key={task.aiTaskId} title={task.execution.profileId} description={task.aiTaskId} value={<span className={'settings-status-badge ' + (task.status === 'failed' ? 'is-error' : task.status === 'succeeded' ? 'is-good' : '')}>{statuses[task.status] ?? task.status}</span>} onClick={() => navigate(() => { setSelected(task); setTitle('任务详情'); setMode('task'); })}/>)}{data && !tasks.length && <SettingsEmpty>尚无 AI 任务。</SettingsEmpty>}</SettingsGroup>
  {pages > 1 && <div className="settings-pagination"><Button className="settings-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} type="button">上一页</Button><span>{currentPage + 1} / {pages}</span><Button className="settings-button" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} type="button">下一页</Button></div>}
</>;
    return <>{!data && !error && <SettingsStatus>正在读取 AI 设置…</SettingsStatus>}{feedback}
  <SettingsGroup title="AI 服务路径" description="业务可按需要选择任务执行配置或 Desktop 持续会话。"><dl className="settings-metadata"><div><dt>API</dt><dd>{data ? data.profiles.items.filter(p => p.enabled && data.connections.items.some(c => c.id === p.executorId && c.kind === 'api' && c.enabled)).length + ' 个启用的任务配置' : error ? '配置状态未知' : '正在读取配置'}</dd></div><div><dt>Codex CLI</dt><dd>{data ? data.profiles.items.filter(p => p.enabled && data.connections.items.some(c => c.id === p.executorId && c.kind === 'codex' && c.enabled)).length + ' 个启用的任务配置' : error ? '配置状态未知' : '正在读取配置'}</dd></div></dl><SettingsLink title="Codex Desktop" description="项目上下文、持续对话与 Desktop 接续" value={desktopBadge} onClick={() => navigate(() => { setTitle('Codex Desktop'); setMode('desktop'); })}/></SettingsGroup>
  <SettingsGroup title="执行端连接" description="API 和 CLI 连接用于返回单次任务结果。" action={<Button className="settings-button" data-settings-link="ai-connection-new" disabled={!data} onClick={() => editConnection()} type="button">新增连接</Button>}>{data?.connections.items.map(item => <SettingsLink key={item.id} title={item.id} description={item.kind === 'codex' ? 'Codex CLI' : item.protocolId} value={<span className={'settings-status-badge ' + (item.enabled ? 'is-good' : '')}>{item.enabled ? '启用' : '停用'}</span>} onClick={() => editConnection(item)}/>)}{data && !data.connections.items.length && <SettingsEmpty>尚未配置连接。</SettingsEmpty>}</SettingsGroup>
  <SettingsGroup title="应用执行配置" action={<Button className="settings-button" data-settings-link="ai-profile-new" disabled={!data} onClick={() => editProfile()} type="button">新增配置</Button>}>{data?.profiles.items.map(item => <SettingsLink key={item.id} title={item.id} description={item.executorId + ' · ' + (item.model || 'CLI 默认模型')} value={item.enabled ? '启用' : '停用'} onClick={() => editProfile(item)}/>)}{data && !data.profiles.items.length && <SettingsEmpty>尚未配置执行配置。</SettingsEmpty>}</SettingsGroup>
  <SettingsGroup title="任务记录"><SettingsLink title="最近任务" description="查看执行状态、分页记录和任务详情" value={data?`${tasks.length} 项`:undefined} onClick={()=>navigate(()=>{setTitle('最近任务');setMode('tasks');})}/></SettingsGroup>
  {!!data?.backgroundErrors?.length && <SettingsGroup title="应用后台诊断">{data.backgroundErrors.map((issue, index) => <SettingsStatus key={index} error>{issue.appId ?? '工作台'} · {issue.message}</SettingsStatus>)}</SettingsGroup>}
  {error && <SettingsActions><Button onClick={() => void load()} type="button">重新读取</Button></SettingsActions>}
 </>;
}
