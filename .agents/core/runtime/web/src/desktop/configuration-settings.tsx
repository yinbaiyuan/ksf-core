import {useEffect,useState} from 'react';
import {request} from '../apps/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {desktopPreferences,appearancePreferences,useInstancePreferences,preferenceStatus} from '../instance-preferences';
import type {ConfigurationPreferences} from '../configuration-preferences';
import {settingsError,SettingsGroup,SettingsLink,SettingsStatus,SettingsActions,SettingsEmpty,SettingsTechnical,useSettingsDraft,useSettingsDetail,useSettingsNavigation} from './settings-controls';
import './configuration-settings.css';

type Field={name:string;label:string;type:string};
type RecordValue={id:string;label:string;scope:string;description?:string;etag:string;state:string;fields:Field[];values:Record<string,unknown>;defaults:Record<string,unknown>;effective:Record<string,unknown>|null;capabilities:string[];application:{state:string;error?:{message:string}};details?:Record<string,unknown>};
const effects:Record<string,string>={immediate:'已生效','next-read':'下次读取时使用','new-task':'用于后续新任务','restart-required':'需要重启',unknown:'运行中的有效值尚未确认',failed:'已保存，应用失败'};
const domainNames:Record<string,string>={identity:'本地技术身份',instance:'KSF 实例',program:'程序设置',capture:'对话正文归档',sources:'能力源关联'};
const message=(error:unknown)=>settingsError(error);
function AbilityFields({raw,change}:{raw:string;change:(value:string)=>void}){
 const [advanced,setAdvanced]=useState(false);
 let values:Record<string,unknown>|null=null;
 try{const parsed:unknown=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))values=parsed as Record<string,unknown>;}catch{/* Invalid input remains available for correction. */}
 const fields=Object.entries(values??{}).filter(([,value])=>['boolean','string','number'].includes(typeof value));
 function update(key:string,value:unknown){change(JSON.stringify({...values,[key]:value},null,2));}
 return <>{fields.length?<div className="settings-form-body">{fields.map(([key,value])=><label key={key} className={typeof value==='boolean'?'settings-checkbox':'settings-field'}><span>{key}</span>{typeof value==='boolean'?<input type="checkbox" role="switch" checked={value} onChange={e=>update(key,e.target.checked)}/>:<input type={typeof value==='number'?'number':'text'} value={String(value)} onChange={e=>update(key,typeof value==='number'?e.target.valueAsNumber:e.target.value)}/>}</label>)}</div>:<div className="settings-group-body"><SettingsEmpty>尚无简单配置项，可通过高级配置编辑此能力支持的字段。</SettingsEmpty></div>}
 <details className="settings-technical" open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)}><summary>编辑高级配置</summary><div><p className="settings-description">修改 JSON 对象；按顶层字段更新，嵌套值整体替换。</p><label className="settings-field is-wide"><span>配置 JSON</span><textarea className="settings-code" rows={12} value={raw} spellCheck={false} onChange={e=>change(e.target.value)}/></label></div></details></>;
}
export function DomainEditor({domain,only,hideTitle=false}:{domain:string;only?:string[];hideTitle?:boolean}){
 const [record,setRecord]=useState<RecordValue|null>(null),[draft,setDraft]=useState<Record<string,unknown>>({}),[raw,setRaw]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[dirty,setDirty]=useState(false),[reset,setReset]=useState(false);
 const markdown=domain.startsWith('collaboration.'),arbitrary=domain.startsWith('ability:'),navigate=useSettingsNavigation();
 useSettingsDraft(dirty,busy&&record!==null,()=>{if(record)accept(record);});
 function accept(value:RecordValue){setRecord(value);const next=value.effective??{...value.defaults,...value.values};setDraft(next);setRaw(arbitrary?JSON.stringify(value.values,null,2):String(next.text??''));setDirty(false);}
 async function load(){setBusy(true);try{const value=await request<RecordValue>('/api/config/'+encodeURIComponent(domain));accept(value);setError('');setNotice('');}catch(e){setError(message(e));}finally{setBusy(false);}}
 useEffect(()=>{void load();},[domain]);
 function field(name:string,value:unknown){setDraft(current=>({...current,[name]:value}));setDirty(true);setNotice('');}
 async function act(operation:'write'|'check'|'reset'|'apply'){
  if(!record)return;setBusy(true);setError('');setNotice('');
  try{
   const values=operation==='write'||operation==='check'?(markdown?{text:raw}:arbitrary?JSON.parse(raw):only?Object.fromEntries(only.map(key=>[key,draft[key]])):draft):undefined;
   const value=await request<RecordValue&{valid?:boolean;dryRun?:boolean}>('/api/config/'+encodeURIComponent(domain),{operation,ifMatch:record.etag,...(operation==='reset'&&only?{fields:only}:{}),...(operation==='write'||operation==='check'?{values}:{})});
   if(operation==='check'){setNotice('校验通过，尚未保存。');return;}
   accept(value);setReset(false);setNotice(operation==='reset'?'已恢复默认。':operation==='apply'?'已重新应用保存的配置。':'设置已保存。');
   window.dispatchEvent(new Event('ksf:config-change'));
   if(value.application.error)setError(value.application.error.message);
  }catch(e){setError(settingsError(e,true));}finally{setBusy(false);}
 }
 const body=<>
  {!record&&!error&&<SettingsStatus>正在读取设置…</SettingsStatus>}
  {record?.capabilities.includes('write')&&(arbitrary?<AbilityFields raw={raw} change={value=>{setRaw(value);setDirty(true);setNotice('');}}/>:markdown?<><div className="settings-form-body"><label className="settings-field is-wide"><span>协作原文</span><textarea className="configuration-prose" rows={16} value={raw} spellCheck={false} onChange={event=>{setRaw(event.target.value);setDirty(true);setNotice('');}}/></label></div><SettingsActions><button className="settings-button" type="button" onClick={()=>setPreview(!preview)}>{preview?'收起预览':'预览原文'}</button></SettingsActions>{preview&&<div className="configuration-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{raw}</ReactMarkdown></div>}</>:<div className="settings-form-body">{record.fields.filter(item=>!only||only.includes(item.name)).map(item=>{
   if(domain==='program'&&item.name==='routing')return <label className="settings-checkbox" key={item.name}><span>记录 Agent 路由安排</span><input type="checkbox" role="switch" checked={(draft.routing as {enabled?:boolean})?.enabled!==false} onChange={e=>field('routing',{enabled:e.target.checked})}/></label>;
   if(domain==='program'&&item.name==='updates'){const values=draft.updates as Record<string,number>;return <div key={item.name}>{[['check_interval_seconds','显式检查间隔（秒）'],['request_timeout_seconds','请求超时（秒）']].map(([key,label])=><label className="settings-field" key={key}><span>{label}</span><input type="number" value={values?.[key]??''} onChange={e=>field('updates',{...values,[key]:e.target.valueAsNumber})}/></label>)}</div>;}
   return <label key={item.name} className={item.type==='boolean'?'settings-checkbox':'settings-field'}><span>{item.label}</span>{item.type==='boolean'?<input type="checkbox" role="switch" checked={draft[item.name]===true} onChange={e=>field(item.name,e.target.checked)}/>:<input type={item.type==='number'?'number':'text'} value={String(draft[item.name]??'')} onChange={e=>field(item.name,item.type==='number'?e.target.valueAsNumber:e.target.value)}/>}</label>;
  })}</div>)}
  {record&&!record.capabilities.includes('write')&&(domain==='sources'?<div className="settings-group-body"><dl className="settings-metadata">{((record.values.entries??[]) as {id:string;path:string}[]).map(item=><div key={item.id}><dt>{item.id}</dt><dd>{item.path}</dd></div>)}</dl>{!(record.values.entries as unknown[])?.length&&<SettingsEmpty>尚未关联能力源。</SettingsEmpty>}</div>:<SettingsTechnical><pre>{JSON.stringify(record.values,null,2)}</pre></SettingsTechnical>)}
  {record&&<div className="configuration-effect"><span>{record.scope==='device'?'仅当前设备':record.scope==='mixed'?'实例配置，含本机路径':'当前 KSF 实例'}</span><span className={'settings-status-badge '+(record.application.state==='failed'?'is-error':'')}>{effects[record.application.state]??record.application.state}</span>{record.state==='missing'&&<span>使用默认设置</span>}</div>}
  {domain==='capture'&&record&&<SettingsTechnical title="归档接入状态"><p>轮次追踪：{record.details?.trackingEnabled?'已接入':'未接入'}；Hooks：{record.details?.hookConfigured?'已配置':'未配置'}。宿主信任状态以 Codex 审核为准。</p><p>关闭正文归档保留历史和逐聊天隐私规则。</p></SettingsTechnical>}
  {dirty&&<SettingsStatus>有尚未保存的修改</SettingsStatus>}{notice&&<SettingsStatus>{notice}</SettingsStatus>}{error&&<SettingsStatus error>{error}</SettingsStatus>}
  {reset&&<div className="settings-reset-confirm"><p>清除这项设置的覆盖值并恢复默认？</p><SettingsActions><button type="button" disabled={busy} onClick={()=>setReset(false)}>取消</button><button type="button" className="settings-danger" disabled={busy} onClick={()=>void act('reset')}>确认恢复默认</button></SettingsActions></div>}
  <SettingsActions>
   {record?.capabilities.includes('reset')&&<button disabled={busy} className="settings-reset-button" onClick={()=>setReset(true)}>恢复默认</button>}
   {record?.capabilities.includes('apply')&&record.application.state==='failed'&&<button disabled={busy||dirty} onClick={()=>void act('apply')}>重试应用</button>}
   <button disabled={busy} onClick={()=>navigate(()=>void load())}>{dirty?'重新读取':'刷新'}</button>
   {record?.capabilities.includes('write')&&<><button disabled={busy} onClick={()=>void act('check')}>校验</button><button className="settings-primary" disabled={busy} onClick={()=>void act('write')}>{busy?'处理中…':'保存'}</button></>}
  </SettingsActions>
 </>;
 return <section className="configuration-domain">{!hideTitle&&<div className="settings-group-heading"><div><h4>{domain==='program'&&only?.includes('routing')?'Agent 路由记录':record?.label??domainNames[domain]??'设置'}</h4>{record?.description&&<p>{domain==='program'&&only?.includes('routing')?'保存 Agent 明确报告的项目归属与能力安排。':record.description}</p>}</div></div>}{hideTitle&&record?.description&&<p className="settings-description">{record.description}</p>}<fieldset className="settings-domain-fields" disabled={busy}>{body}</fieldset></section>;
}
function PreferenceMigration<T>({store,label}:{store:ConfigurationPreferences<T>;label:string}){
 const state=useInstancePreferences(store);
 if(state.legacy===null&&!['failed','conflict'].includes(state.status))return null;
 return <section className="configuration-migration settings-group-body">{['failed','conflict'].includes(state.status)&&<SettingsStatus>{preferenceStatus(state.status)}</SettingsStatus>}{state.error&&<SettingsStatus error>{state.error}</SettingsStatus>}
  {state.legacy!==null&&<><h4>发现浏览器旧{label}</h4><p>导入会替换实例的这项设置；旧浏览器原件保留。</p><SettingsTechnical title="比较迁移内容"><h5>当前实例</h5><pre>{JSON.stringify(state.value,null,2)}</pre><h5>浏览器旧设置</h5><pre>{JSON.stringify(state.legacy,null,2)}</pre></SettingsTechnical><SettingsActions><button disabled={!state.ready||state.status==='saving'} onClick={()=>void store.importLegacy()}>导入浏览器{label}</button><button onClick={store.keepInstance}>保留实例设置</button></SettingsActions></>}
  {state.dirty&&['failed','conflict'].includes(state.status)&&<SettingsTechnical title="查看保留的本地草稿"><pre>{JSON.stringify(state.value,null,2)}</pre></SettingsTechnical>}
  {['failed','conflict'].includes(state.status)&&<SettingsActions><button onClick={()=>void store.reload()}>读取实例设置</button>{state.status!=='conflict'&&state.ready&&<button onClick={()=>void store.retry()}>核对后重试保存</button>}</SettingsActions>}
 </section>;
}
export function DesktopMigration(){return <PreferenceMigration store={desktopPreferences} label="桌面布局"/>;}
export function AppearanceMigration(){return <PreferenceMigration store={appearancePreferences} label="外观"/>;}
export function ConfigurationExport(){
 const [device,setDevice]=useState(false),[collaboration,setCollaboration]=useState(false),[error,setError]=useState('');
 async function download(){try{const data=await request('/api/config/export',{includeDevice:device,includeCollaboration:collaboration});const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='ksf-configuration.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setError('');}catch(e){setError(message(e));}}
 return <SettingsGroup title="导出配置" description="导出设置及省略清单，不包含凭据、消息和运行队列。"><div className="settings-export"><label className="settings-checkbox"><span>包含本机配置与程序路径</span><input type="checkbox" checked={device} onChange={e=>setDevice(e.target.checked)}/></label><label className="settings-checkbox"><span>包含 USER/BOT 协作原文</span><input type="checkbox" checked={collaboration} onChange={e=>setCollaboration(e.target.checked)}/></label><SettingsActions><button onClick={()=>void download()}>下载配置 JSON</button></SettingsActions>{error&&<SettingsStatus error>{error}</SettingsStatus>}<p className="settings-description">配置导出不替代完整备份，本版不提供一键恢复。</p></div></SettingsGroup>;
}
type AvailableAbility={id:string;objectId:string;label:string;type:string;description:string;source:string;version:string};
const abilityTypes:Record<string,string>={cooperation:'协同',partner:'搭档',competency:'基本功','data-package':'数据包'};
export function AbilityConfiguration(){
 const [catalog,setCatalog]=useState<{abilities:AvailableAbility[];complete:boolean;errors:{code:string;message:string}[]}|null>(null),[selected,setSelected]=useState<AvailableAbility|null>(null),[query,setQuery]=useState(''),[error,setError]=useState(''),navigate=useSettingsNavigation();
 function load(){setError('');request<NonNullable<typeof catalog>>('/api/config').then(setCatalog,e=>setError(settingsError(e)));}
 useEffect(load,[]);
 useSettingsDetail(selected?.id??null,selected?.label??'',()=>setSelected(null));
 if(selected)return <><div className="settings-group-body"><div className="settings-detail-summary"><p>{selected.description}</p><span className="settings-status-badge">{abilityTypes[selected.type]??selected.type} · {selected.source}</span></div><SettingsTechnical title="能力标识与版本"><p>{selected.objectId} · {selected.version}</p></SettingsTechnical></div><DomainEditor key={selected.id} domain={selected.id} hideTitle/></>;
 const available=catalog?.abilities.filter(item=>(item.label+' '+item.objectId+' '+item.description).toLocaleLowerCase().includes(query.toLocaleLowerCase()))??[];
 return <><label className="settings-search"><span className="sr-only">搜索能力</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索名称或能力 ID"/></label>
 {!catalog&&!error&&<SettingsStatus>正在读取可用能力…</SettingsStatus>}
 <SettingsGroup title="可用能力" description={catalog?`共 ${catalog.abilities.length} 项${query?'，匹配 '+available.length+' 项':''}`:undefined} action={<button className="settings-button" onClick={load}>刷新</button>}>{available.map(item=><SettingsLink key={item.id} title={item.label} description={item.objectId} value={abilityTypes[item.type]+' · '+item.source} onClick={()=>navigate(()=>setSelected(item))}/>)}{catalog&&!available.length&&<SettingsEmpty>{query?'没有匹配的能力。':'当前没有可用能力。'}</SettingsEmpty>}</SettingsGroup>
 {!!catalog?.errors.length&&<SettingsStatus error>能力目录不完整：{catalog.errors.map(item=>item.code+'：'+item.message).join('；')}</SettingsStatus>}{error&&<SettingsStatus error>{error}</SettingsStatus>}<DomainEditor domain="sources"/></>;
}
