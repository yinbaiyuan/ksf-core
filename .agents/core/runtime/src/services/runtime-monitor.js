import {randomUUID} from 'node:crypto';
import {createHash} from 'node:crypto';
import {createProcessMetrics} from './process-metrics.js';
import {processIdentity} from './service-lock.js';
import {assert,problem} from './workbench-common.js';

const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const live=task=>!['succeeded','failed','cancelled','stopped','idle'].includes(task.status);
const issue=(source,error)=>({source,code:error.code??'MONITOR_SOURCE_FAILED',message:error.message??'状态暂时无法读取。'});

export function createRuntimeMonitor({applications,ai,conversations,service,metrics=createProcessMetrics(),now=Date.now,identity=processIdentity()}={}) {
  const sources=new Map(),operations=new Map(),serviceVersion=randomUUID();let closed=false;
  function refresh(name,load,ttl=2000){
    let source=sources.get(name);if(!source){source={};sources.set(name,source);}
    if(!source.pending&&(!source.at||now()-source.at>=ttl))source.pending=Promise.resolve().then(load).then(value=>{if(!closed){source.value=value;source.at=now();source.error=null;}}).catch(error=>{source.error=issue(name,error);source.at=now();}).finally(()=>{source.pending=null;});
    return source;
  }
  async function snapshot(){
    const app=refresh('applications',()=>applications.monitorSnapshot()),a=refresh('ai',()=>ai.monitorSnapshot());
    await app.pending;
    const conv=refresh('conversations',()=>conversations.monitorSnapshot());
    const host=refresh('service',()=>service?.status?.()??{state:'running',pid:identity.pid,startedAt:null});
    // Desktop IPC may need several seconds. Return available sources immediately.
    const apps=(app.value?.applications??[]).map(item=>({...item,actions:app.error?[]:item.enabled&&item.lifecycle!=='frontend'?['start','stop','restart','logs']:['logs']}));
    const terminalTasks=(app.value?.terminals??[]).map(row=>({id:'terminal:'+row.monitorId,nativeId:row.monitorId,kind:'terminal',appId:row.appId,name:row.shell.split(/[\\/]/).at(-1)+' · '+row.cwd,status:row.exited?(row.stopped?'cancelled':row.exitCode===0?'succeeded':'failed'):'running',version:row.monitorId,startedAt:row.startedAt,finishedAt:row.finishedAt,cwd:row.cwd,pid:row.pid,actions:row.exited?[]:['stop'],historyScope:'当前受管终端会话'}));
    const groups=[[app,app.value?.tasks??[]],[app,terminalTasks],[a,a.value?.tasks??[]],[conv,conv.value?.tasks??[]]];
    let tasks=groups.flatMap(([source,rows])=>rows.map(row=>({...row,...(source.error?{status:'unknown',actions:[],error:{message:source.error.message}}:{}),observedAt:source.at?new Date(source.at).toISOString():null})));
    const active=tasks.filter(live),recent=tasks.filter(t=>!live(t)).sort((x,y)=>(y.finishedAt??y.startedAt??'').localeCompare(x.finishedAt??x.startedAt??'')).slice(0,100);tasks=[...active,...recent];
    const owners=[{id:'service',...identity},...apps.flatMap(app=>app.runtimes.map(runtime=>({id:app.id,pid:runtime.pid,processStart:runtime.processStart}))),...(a.value?.owners??[]),...(app.value?.terminals??[]).filter(t=>!t.exited).map(t=>({id:'terminal:'+t.monitorId,pid:t.pid,processStart:t.processStart}))].filter(o=>Number.isSafeInteger(o.pid));
    const resources=refresh('resources',()=>metrics.sample(owners));await resources.pending;
    const issues=[...sources.values()].flatMap(s=>s.error?[s.error]:[]).concat(conv.value?.issues??[],app.value?.errors??[]);
    if(conv.pending&&!conv.value)issues.push({source:'conversations',code:'MONITOR_LOADING',message:'正在核实已关联的对话状态…'});
    for(const [source,name] of [[a,'AI 服务'],[host,'主服务']])if(source.pending&&!source.value)issues.push({source:name,code:'MONITOR_LOADING',message:'正在读取'+name+'状态…'});
    const totals=Object.fromEntries(['background','ai','conversation','terminal'].map(kind=>{const rows=tasks.filter(t=>t.kind===kind),source=kind==='ai'?a:kind==='conversation'?conv:app,known=source.value&&!source.error;return [kind,{active:known?rows.filter(live).length:null,running:known?rows.filter(t=>t.status==='running').length:null,queued:known?rows.filter(t=>t.status==='queued').length:null,waiting:known?rows.filter(t=>['waiting','retry_wait','reconciling','unknown'].includes(t.status)).length:null}];}));
    return {contractVersion:'runtime-monitor-v1',at:new Date(now()).toISOString(),service:{...(host.value??{state:'running',pid:identity.pid}),version:serviceVersion,actions:host.error?[]:['stop','restart','logs','doctor']},applications:apps,tasks,counts:totals,resources:resources.error?{at:null,processes:[],total:{cpuPercent:null,memoryBytes:null,processCount:null},history:resources.value?.history??[],error:resources.error}:resources.value,issues,recentLimit:100};
  }
  function clearCaches(){for(const s of sources.values())s.at=0;}
  async function perform(input){
    assert(input&&typeof input==='object'&&['snapshot','act','logs','doctor'].includes(input.operation),'MONITOR_ARGUMENT','监控操作无效。');
    await applications.authorizeMonitor(input.instanceId,input.operation==='act'?'runtime.manage':'runtime.read');
    if(input.operation==='snapshot')return snapshot();
    if(input.operation==='doctor'){assert(service?.doctor,'SERVICE_UNAVAILABLE','主服务诊断不可用。',503);return service.doctor();}
    if(input.operation==='logs'){if(input.kind==='service'){assert(service?.logs,'SERVICE_UNAVAILABLE','主服务日志不可用。',503);return {text:Object.entries(await service.logs()).map(([name,text])=>name+'\n'+text).join('\n')};}assert(typeof input.id==='string','MONITOR_ARGUMENT','请选择应用。');return applications.runtimeManage({action:'logs',appId:input.id});}
    assert(['task','app','service'].includes(input.kind)&&typeof input.id==='string'&&typeof input.version==='string'&&['start','stop','restart'].includes(input.action)&&typeof input.operationId==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(input.operationId),'MONITOR_ARGUMENT','操作需要目标、版本和操作编号。');
    assert(input.force===undefined||typeof input.force==='boolean','MONITOR_ARGUMENT','强制操作标记无效。');
    const key=input.instanceId+':'+input.operationId,digest=fingerprint({kind:input.kind,id:input.id,version:input.version,action:input.action,force:input.force===true});
    const previous=operations.get(key);if(previous){assert(previous.digest===digest,'MONITOR_OPERATION_CONFLICT','操作编号已经用于其他请求。',409);return previous.promise;}
    if(operations.size>=500){const settled=[...operations].find(([,entry])=>entry.settled);assert(settled,'MONITOR_BUSY','监控操作过多，请等待当前操作完成。',429);operations.delete(settled[0]);}
    const promise=(async()=>{
      if(input.kind==='app')return applications.runtimeManage({appId:input.id,action:input.action,force:input.force===true,expectedVersion:input.version});
      if(input.kind==='service'){assert(input.id==='service'&&input.version===serviceVersion&&['stop','restart'].includes(input.action),'MONITOR_STALE','主服务已经变化，请刷新。',409);assert(service?.[input.action],'SERVICE_UNAVAILABLE','主服务管理不可用。',503);return service[input.action]({force:input.force===true});}
      assert(input.action==='stop'&&!input.force,'MONITOR_ARGUMENT','任务只支持其声明的停止方式。');
      const data=await snapshot(),task=data.tasks.find(t=>t.id===input.id);assert(task&&task.version===input.version&&task.actions.includes('stop'),'MONITOR_STALE','任务已结束或状态变化，请刷新。',409);
      if(task.kind==='background')return applications.monitorCancelTask(task.id,input.version);
      if(task.kind==='ai')return ai.monitorCancel(task.nativeId,input.version);
      if(task.kind==='terminal')return applications.monitorCloseTerminal({monitorId:task.nativeId});
      return conversations.monitorInterrupt({threadId:task.nativeId,turnId:task.turnId,version:task.version,operationId:input.operationId});
    })().finally(()=>{clearCaches();const entry=operations.get(key);if(entry)entry.settled=true;});
    operations.set(key,{digest,promise,settled:false});
    return promise;
  }
  return {perform,snapshot,close(){closed=true;operations.clear();}};
}
