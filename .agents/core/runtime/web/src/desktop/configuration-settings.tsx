import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {SaveController,createConfigurationMutationSaveAdapter} from '../../../../applications/sdk/src/controllers';
import {request} from '../apps/client';
import {desktopPreferences,appearancePreferences,useInstancePreferences,preferenceStatus} from '../instance-preferences';
import type {ConfigurationPreferences} from '../configuration-preferences';
import {settingsError,SettingsGroup,SettingsLink,SettingsStatus,SettingsActions,SettingsEmpty,SettingsTechnical,useSettingsDraft,useSettingsDetail,useSettingsNavigation} from './settings-controls';
import {Field,Input,Textarea,Switch,NumberInput,Button,Form,ContentState,ContentPreview,SaveStatus,Surface,InlineAlert,Badge,AlertDialog} from '../internal-ui/index';
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
 type Draft={fields:Record<string,unknown>;raw:string;reset:boolean;numericPaths:string[][]};
 const [record,setRecord]=useState<RecordValue|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[acting,setActing]=useState(false),[preview,setPreview]=useState(false),[reset,setReset]=useState(false);
 const markdown=domain.startsWith('collaboration.'),arbitrary=domain.startsWith('ability:'),navigate=useSettingsNavigation(),onlyKey=only?.join('|')??'';
 const currentDomain=useRef(domain+'|'+onlyKey);currentDomain.current=domain+'|'+onlyKey;
 function values(value:Draft){
  if(markdown)return {text:value.raw};
  if(arbitrary){const parsed:unknown=JSON.parse(value.raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('配置需要有效的JSON对象。');return parsed as Record<string,unknown>;}
  const fields=structuredClone(value.fields);
  for(const path of value.numericPaths){let parent=fields;for(const key of path.slice(0,-1)){if(!parent[key]||typeof parent[key]!=='object'||Array.isArray(parent[key]))throw Error('数值分组暂不可用。');parent=parent[key] as Record<string,unknown>;}const key=path.at(-1)!;if(!Object.hasOwn(parent,key))continue;const text=String(parent[key]).trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)||!Number.isFinite(Number(text)))throw Error('请填写有效的有限数值。');parent[key]=Number(text);}
  return onlyKey?Object.fromEntries(onlyKey.split('|').map(key=>[key,fields[key]])):fields;
 }
 const store=useMemo(()=>new SaveController(createConfigurationMutationSaveAdapter<Draft>({request,domain,valueReconciliation:true,
  select:value=>{if(currentDomain.current===domain+'|'+onlyKey)setRecord(value as RecordValue);const fields={...value.defaults,...value.values},schema=(value as RecordValue).fields??[],numericPaths=schema.filter(item=>item.type==='number').map(item=>[item.name]);if(domain==='program')for(const key of ['check_interval_seconds','request_timeout_seconds'])numericPaths.push(['updates',key]);return {fields,raw:arbitrary?JSON.stringify(value.values,null,2):String(fields.text??''),reset:false,numericPaths};},
  values,intent:value=>value.reset?{operation:'reset',...(onlyKey?{fields:onlyKey.split('|')}:{}),...(domain==='capture'?{confirmation:'value' as const}:{})}:{operation:'write'},
 }),{initial:{fields:{},raw:'',reset:false,numericPaths:[]}}),[domain,onlyKey,markdown,arbitrary]);
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot),draft=state.value.fields,raw=state.value.raw,dirty=state.dirty,busy=acting||state.status==='saving';
 const save=async()=>{await act('write');const latest=store.getSnapshot();return latest.status==='saved'&&!latest.dirty&&!latest.pending;};
 useSettingsDraft(dirty||!!state.pending,busy&&record!==null,()=>store.discard(),save,!!state.pending);
 async function load(){await store.refresh();if(currentDomain.current===domain+'|'+onlyKey){setError('');setNotice('');}}
 useEffect(()=>{setRecord(null);void load();},[store]);
 function field(name:string,value:unknown){store.update(current=>({...current,fields:{...current.fields,[name]:value},reset:false}));setNotice('');}
 function changeRaw(value:string){store.update(current=>({...current,raw:value,reset:false}));setNotice('');}
 function stageDefaults(){if(!record||state.pending)return;store.update({fields:structuredClone(record.defaults),raw:arbitrary?JSON.stringify(record.defaults,null,2):String(record.defaults.text??''),numericPaths:state.value.numericPaths,reset:true});setReset(false);setNotice('默认草稿已准备，保存后生效。');}
 async function act(operation:'write'|'check'|'apply'){
  if(!record)return;setActing(true);setError('');setNotice('');const version=state.draftVersion;
  try{
   if(operation==='write'){await store.save();const result=store.getSnapshot();if(result.status==='saved'||result.status==='pending'&&!result.pending){setNotice(result.dirty?'上次提交已保存；新修改仍待保存。':'设置已保存。');window.dispatchEvent(new Event('ksf:config-change'));}return;}
   if(state.pending)throw Error('请先核对原提交结果。');
   const input=operation==='check'?(state.value.reset?{operation:'reset',dryRun:true,ifMatch:state.committed?.revision,...(onlyKey?{fields:onlyKey.split('|')}:{})}:{operation:'check',ifMatch:state.committed?.revision,values:values(state.value)}):{operation:'apply',ifMatch:state.committed?.revision};
   const value=await request<RecordValue>('/api/config/'+encodeURIComponent(domain),input);
   if(operation==='check'){setNotice(store.getSnapshot().draftVersion===version?'校验通过，尚未保存。':'上次草稿校验通过；新修改仍需核对。');return;}
   await store.discard();setNotice('已重新应用保存的配置。');window.dispatchEvent(new Event('ksf:config-change'));if(value.application.error)setError(value.application.error.message);
  }catch(issue){setError(settingsError(issue,true));}finally{setActing(false);}
 }
 const editor=record?.capabilities.includes('write')?<fieldset className="settings-domain-fields" disabled={state.value.reset}>
  {arbitrary?<AbilityFields raw={raw} change={changeRaw}/>:markdown?<><Field label="协作原文"><Textarea className="configuration-prose" rows={16} value={raw} spellCheck={false} onValueChange={changeRaw}/></Field><Button onActivate={()=>setPreview(!preview)}>{preview?'收起预览':'预览原文'}</Button>{preview&&<ContentPreview content={raw} format="markdown"/>}</>:<div className="ksf-settings-field-stack">{record.fields.filter(item=>!only||only.includes(item.name)).map(item=>{
   if(domain==='program'&&item.name==='routing')return <Field key={item.name} label="记录 Agent 路由安排" layout="inline"><Switch checked={(draft.routing as {enabled?:boolean})?.enabled!==false} onCheckedChange={enabled=>field('routing',{enabled})}/></Field>;
   if(domain==='program'&&item.name==='updates'){const current=draft.updates as Record<string,unknown>;return <Surface key={item.name} title="更新检查参数">{[['check_interval_seconds','显式检查间隔（秒）'],['request_timeout_seconds','请求超时（秒）']].map(([key,label])=><Field key={key} label={label}><NumberInput draft={String(current?.[key]??'')} onDraftChange={text=>field('updates',{...current,[key]:text})}/></Field>)}</Surface>;}
   return <Field key={item.name} label={item.label} layout={item.type==='boolean'?'inline':'stacked'}>{item.type==='boolean'?<Switch checked={draft[item.name]===true} onCheckedChange={checked=>field(item.name,checked)}/>:item.type==='number'?<NumberInput draft={String(draft[item.name]??'')} onDraftChange={text=>field(item.name,text)}/>:<Input value={String(draft[item.name]??'')} onValueChange={text=>field(item.name,text)}/>}</Field>;
  })}</div>}
 </fieldset>:record?<ContentPreview content={record.values} format="structured-summary"/>:null;
 return <section className="configuration-domain"><Surface title={hideTitle?undefined:domain==='program'&&only?.includes('routing')?'Agent 路由记录':record?.label??domainNames[domain]??'设置'} description={record?.description}>
  <ContentState state={!record?(state.status==='loading'?'loading':'error'):'ready'} description={state.error?.message} onRetry={()=>void load()}><Form noValidate className="ksf-settings-field-stack" busy={busy} onSubmitIntent={()=>void save()}>
   {state.value.reset&&<InlineAlert title="默认草稿待保存" description="此草稿保存后移除相应覆盖值。保存或放弃默认草稿后可继续自定义编辑。"/>}{editor}
   {record&&<div className="configuration-effect"><Badge>{record.scope==='device'?'仅当前设备':record.scope==='mixed'?'实例配置，含本机路径':'当前 KSF 实例'}</Badge><Badge tone={record.application.state==='failed'?'danger':'info'}>{effects[record.application.state]??record.application.state}</Badge>{record.state==='missing'&&<Badge>使用默认设置</Badge>}</div>}
   {domain==='capture'&&record&&<SettingsTechnical title="归档接入状态"><p>轮次追踪：{record.details?.trackingEnabled?'已接入':'未接入'}；Hooks：{record.details?.hookConfigured?'已配置':'未配置'}。宿主信任状态以 Codex 审核为准。</p><p>关闭正文归档保留历史和逐聊天隐私规则。</p></SettingsTechnical>}
   <SaveStatus view={state} variant="detailed" onReconcile={()=>void store.reconcile()} onRetry={()=>void store.retry()} onResolve={()=>setNotice('请比较草稿和最新实例值。')}/>
   {state.status==='conflict'&&state.remote&&<Surface title="比较草稿与实例值"><ContentPreview format="structured-summary" content={{draft:state.value,latest:state.remote.value}}/><Button onActivate={()=>store.merge(state.value)}>保留草稿并采用此实例版本</Button><Button onActivate={()=>void store.discard()}>采用最新实例值</Button></Surface>}
   {notice&&<InlineAlert title={notice}/>} {error&&<InlineAlert tone="danger" title="设置尚未完成" description={error}/>}
   <div className="settings-editor-actions">{record?.capabilities.includes('reset')&&<Button disabled={busy||!!state.pending} onActivate={()=>setReset(true)}>恢复默认</Button>}{record?.capabilities.includes('apply')&&record.application.state==='failed'&&<Button disabled={busy||dirty||!!state.pending} onActivate={()=>void act('apply')}>重试应用</Button>}<Button disabled={busy} onActivate={()=>navigate(()=>void load())}>刷新</Button>{record?.capabilities.includes('write')&&<><Button disabled={busy||!!state.pending||!dirty} onActivate={()=>void store.discard()}>放弃修改</Button><Button disabled={busy||!!state.pending} onActivate={()=>void act('check')}>校验</Button><Button type="submit" variant="primary" busy={state.status==='saving'} disabled={acting||!!state.pending||state.status==='conflict'||!dirty}>保存</Button></>}</div>
  </Form></ContentState>
 </Surface><AlertDialog open={reset} onOpenChange={setReset} title="采用默认草稿？" description="替换当前草稿；相应覆盖值会在随后保存时移除。" confirmLabel="采用默认草稿" cancelLabel="取消" danger={false} confirmDisabled={!!state.pending||busy} onConfirmIntent={stageDefaults}/></section>;
}
function PreferenceMigration<T>({store,label}:{store:ConfigurationPreferences<T>;label:string}){
 const state=useInstancePreferences(store);
 if(state.legacy===null&&!['failed','conflict','unknown'].includes(state.status))return null;
 return <section className="configuration-migration settings-group-body">{['failed','conflict','unknown'].includes(state.status)&&<SettingsStatus>{preferenceStatus(state.status)}</SettingsStatus>}{state.error&&<SettingsStatus error>{settingsError(state.error,true)}</SettingsStatus>}
  {state.legacy!==null&&<><h4>发现浏览器旧{label}</h4><p>导入会替换实例的这项设置；旧浏览器原件保留。</p><SettingsTechnical title="比较迁移内容"><h5>当前实例</h5><pre>{JSON.stringify(state.value,null,2)}</pre><h5>浏览器旧设置</h5><pre>{JSON.stringify(state.legacy,null,2)}</pre></SettingsTechnical><SettingsActions><button disabled={!state.ready||['saving','unknown','conflict'].includes(state.status)} onClick={()=>void store.importLegacy()}>导入浏览器{label}</button><button onClick={store.keepInstance}>保留实例设置</button></SettingsActions></>}
  {state.dirty&&['failed','conflict','unknown'].includes(state.status)&&<SettingsTechnical title="查看保留的本地草稿"><pre>{JSON.stringify(state.value,null,2)}</pre></SettingsTechnical>}
  {['failed','conflict','unknown'].includes(state.status)&&<SettingsActions><button onClick={()=>void store.reload()}>{state.status==='unknown'?'核对保存结果':'读取实例设置'}</button>{state.status!=='conflict'&&state.ready&&<button onClick={()=>void store.retry()}>核对后重试保存</button>}</SettingsActions>}
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
