import { useEffect, useState, type FormEvent } from 'react';
import { createWorkbenchClient } from '../apps/request-client';
import type { AITask } from '../../../../applications/sdk/src/ai-tasks';
import './ai-settings.css';

type Connection={id:string;kind:'api'|'codex';enabled:boolean;concurrency:number;protocolId?:string;baseURL?:string;credentialRef?:string;executablePath?:string;codexHome?:string};
type Profile={id:string;executorId:string;enabled:boolean;model?:string;timeoutMs:number;maxAttempts:number;retryDelayMs:number;maxInputBytes:number;maxOutputBytes:number};
type Config<T>={schemaVersion:1;revision:number;items:T[]};
type Snapshot={connections:Config<Connection>;profiles:Config<Profile>;tasks:AITask[];backgroundErrors?:{appId?:string;code:string;message:string}[]};
const client=createWorkbenchClient();
const statuses:Record<string,string>={queued:'排队中',running:'执行中',retry_wait:'等待重试',reconciling:'待对账',succeeded:'已完成',failed:'失败',cancelled:'已取消'};
const emptyConnection:Connection={id:'',kind:'codex',enabled:true,concurrency:1,executablePath:''};
const emptyProfile:Profile={id:'',executorId:'',enabled:true,model:'',timeoutMs:180000,maxAttempts:1,retryDelayMs:2000,maxInputBytes:1048576,maxOutputBytes:65536};
const apiDefaults:Record<string,{baseURL:string;credentialRef:string}>={
  'deepseek-responses-v1':{baseURL:'https://api.deepseek.com',credentialRef:'env:DEEPSEEK_API_KEY'},
  'openai-responses-v1':{baseURL:'https://api.openai.com/v1',credentialRef:'env:OPENAI_API_KEY'},
  'openai-transcription-v1':{baseURL:'https://api.openai.com/v1',credentialRef:'env:OPENAI_API_KEY'},
};
export function AISettingsContent(){
  const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [connection,setConnection]=useState<Connection>(emptyConnection),[profile,setProfile]=useState<Profile>(emptyProfile),[selected,setSelected]=useState<AITask|null>(null);
  const load=async()=>{try{setData(await client.request<Snapshot>('/api/ai/inspect',{}));setError('');}catch(e){setError((e as Error).message);}};
  useEffect(()=>{void load();},[]);
  async function save(kind:'connections'|'profiles',item:Connection|Profile){if(!data)return;setBusy(true);setNotice('');try{const config=data[kind] as Config<Connection|Profile>;await client.request('/api/ai/config',{kind,config:{revision:config.revision,items:[...config.items.filter(v=>v.id!==item.id),item]}});setNotice('已保存到当前 KSF 实例。');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function saveConnection(e:FormEvent){e.preventDefault();void save('connections',connection);}
  function saveProfile(e:FormEvent){e.preventDefault();const copy={...profile};if(!copy.model)delete copy.model;void save('profiles',copy);}
  function selectProtocol(protocolId:string){
    const previous=apiDefaults[connection.protocolId??''],next=apiDefaults[protocolId];
    setConnection({...connection,protocolId,baseURL:!connection.baseURL||connection.baseURL===previous?.baseURL?next.baseURL:connection.baseURL,credentialRef:!connection.credentialRef||connection.credentialRef===previous?.credentialRef?next.credentialRef:connection.credentialRef});
  }
  const field=(label:string,value:string,onChange:(value:string)=>void,placeholder?:string)=><label>{label}<input value={value} placeholder={placeholder} onChange={event=>onChange(event.target.value)} required/></label>;
  return <div className="ai-settings">
    <p className="ai-settings-intro">供应用调用的公共 AI 执行服务。连接与任务保存在当前 KSF 实例，关闭应用窗口后仍可查询。应用代码负责业务流程和发布。</p>
    {error&&<p role="alert" className="ai-settings-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!!data?.backgroundErrors?.length&&<section aria-label="应用后台诊断"><h4>应用后台启动失败</h4>{data.backgroundErrors.map((issue,index)=><p key={index} className="ai-settings-error" role="alert">{issue.appId??'工作台'} · {issue.code}：{issue.message}</p>)}<p>核对应用后，可在应用商店停用再启用以重试。</p></section>}
    <section><div className="ai-settings-heading"><h4>执行端连接</h4><button onClick={()=>setConnection({...emptyConnection})}>新增</button></div>
      <div className="ai-settings-list">{data?.connections.items.map(item=><button key={item.id} onClick={()=>setConnection({...item})}>{item.id}<small>{item.kind==='codex'?'Codex CLI':item.protocolId} · {item.enabled?'启用':'停用'}</small></button>)}</div>
      <form onSubmit={saveConnection}>
        {field('连接标识',connection.id,value=>setConnection({...connection,id:value}),'例如 codex-local')}
        <label>执行方式<select value={connection.kind} onChange={e=>setConnection(e.target.value==='codex'?{...emptyConnection,id:connection.id}:{id:connection.id,kind:'api',enabled:true,concurrency:1,protocolId:'deepseek-responses-v1',...apiDefaults['deepseek-responses-v1']})}><option value="codex">Codex CLI</option><option value="api">API</option></select></label>
        {connection.kind==='api'?<>{field('API 基础地址',connection.baseURL??'',value=>setConnection({...connection,baseURL:value}))}<label>协议<select value={connection.protocolId} onChange={e=>selectProtocol(e.target.value)}><option value="deepseek-responses-v1">DeepSeek Responses</option><option value="openai-responses-v1">OpenAI Responses</option><option value="openai-transcription-v1">OpenAI 文件转写</option></select></label>{field('后台凭据引用',connection.credentialRef??'',value=>setConnection({...connection,credentialRef:value}),'env:DEEPSEEK_API_KEY')}<p>只填写环境变量引用。后台服务须能读取该变量；不要在这里填写密钥。</p>{connection.protocolId==='deepseek-responses-v1'&&<p>DeepSeek 负责文本和结构化整理；录音需先使用单独的转写配置，或提供转写稿。</p>}</>:<>{field('Codex 可执行文件绝对路径',connection.executablePath??'',value=>setConnection({...connection,executablePath:value}),'/path/to/codex')}<p>使用后台服务账号的 Codex 登录。首版验证 0.163.x，以独立只读文本任务运行。</p></>}
        <label>并发额度<input type="number" min="1" max="8" value={connection.concurrency} onChange={e=>setConnection({...connection,concurrency:Number(e.target.value)})}/></label>
        <label className="ai-settings-checkbox"><input type="checkbox" checked={connection.enabled} onChange={e=>setConnection({...connection,enabled:e.target.checked})}/>接受此连接的新任务</label>
        <div><button className="settings-primary" disabled={busy||!data}>保存连接</button> <button type="button" disabled={busy||!data?.connections.items.some(item=>item.id===connection.id)} onClick={()=>{setBusy(true);void client.request<{message:string}>('/api/ai/check',{executorId:connection.id}).then(result=>{setNotice(result.message);setError('');}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>检查已保存的连接</button></div>
      </form>
    </section>
    <section><div className="ai-settings-heading"><h4>应用执行配置</h4><button onClick={()=>setProfile({...emptyProfile})}>新增</button></div>
      <div className="ai-settings-list">{data?.profiles.items.map(item=><button key={item.id} onClick={()=>setProfile({...item})}>{item.id}<small>{item.executorId} · {item.model||'CLI 默认模型'}</small></button>)}</div>
      <form onSubmit={saveProfile}>
        {field('配置标识',profile.id,value=>setProfile({...profile,id:value}),'例如 text-codex')}
        <label>连接<select required value={profile.executorId} onChange={e=>{const chosen=data?.connections.items.find(item=>item.id===e.target.value);setProfile({...profile,executorId:e.target.value,model:profile.model||(chosen?.protocolId==='deepseek-responses-v1'?'deepseek-flash':'')});}}><option value="">选择连接</option>{data?.connections.items.map(item=><option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
        <label>模型（API 必填）<input required={data?.connections.items.find(item=>item.id===profile.executorId)?.kind==='api'} value={profile.model??''} onChange={e=>setProfile({...profile,model:e.target.value})}/></label>
        <div className="ai-settings-columns"><label>单次时限（秒）<input type="number" min="1" max="3600" value={profile.timeoutMs/1000} onChange={e=>setProfile({...profile,timeoutMs:Number(e.target.value)*1000})}/></label><label>最多尝试<input type="number" min="1" max="5" value={profile.maxAttempts} onChange={e=>setProfile({...profile,maxAttempts:Number(e.target.value)})}/></label></div>
        <label className="ai-settings-checkbox"><input type="checkbox" checked={profile.enabled} onChange={e=>setProfile({...profile,enabled:e.target.checked})}/>启用执行配置</label>
        <button className="settings-primary" disabled={busy||!data}>保存配置</button><p>应用按配置标识提交任务。配置变更只影响新任务，已接收任务使用原快照。</p>
      </form>
    </section>
    <section><div className="ai-settings-heading"><h4>最近任务</h4><button disabled={busy} onClick={()=>void load()}>刷新</button></div>
      {!data?.tasks.length&&<p>尚无 AI 任务。</p>}
      <div className="ai-settings-list">{data?.tasks.map(task=><button key={task.aiTaskId} onClick={()=>setSelected(task)}><span>{statuses[task.status]} · {task.execution.profileId}</span><small>{task.aiTaskId} · {task.execution.attempts.length} 次尝试</small></button>)}</div>
      {selected&&<div className="ai-settings-task"><strong>{statuses[selected.status]}</strong><p>{selected.error?.message??'任务状态可查询；生成结果仍需由应用验收。'}</p>{selected.status==='reconciling'&&<p>原执行结果未知，服务不会自动重发。未确认停止的执行仍占并发额度。</p>}<pre>{JSON.stringify(selected,null,2)}</pre><button onClick={()=>setSelected(null)}>收起</button></div>}
    </section>
  </div>;
}
