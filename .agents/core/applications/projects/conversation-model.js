const initial=()=>({schemaVersion:1,draft:'',draftVersion:0,resources:[],checkpoint:null,submitted:null,threadId:null,legacyPending:null,answers:{},expandedToolIds:[],submittedExpanded:false,contextExpanded:false,resultSave:null});
const knownRejected=view=>view?.submission.state==='failed'&&view.error?.outcomeUnknown===false;
const terminal=view=>!!view.observation&&['succeeded','failed','cancelled'].includes(view.observation.phase)&&view.observation.stopConfirmed===true;
const questionKey=q=>JSON.stringify([q.turnId,q.request.type,q.request.value]);
const failure=message=>Object.assign(Error(message),{code:'RUN_ARGUMENT',outcomeUnknown:false});
function validate(value){
 if(!value||value.schemaVersion!==1||typeof value.draft!=='string'||!Number.isSafeInteger(value.draftVersion)||value.draftVersion<0||!Array.isArray(value.resources)||!Array.isArray(value.expandedToolIds)||!value.answers||typeof value.answers!=='object')throw failure('AI 工作区恢复记录格式不兼容，原记录已保留。');
 if(value.threadId!==null&&typeof value.threadId!=='string')throw failure('原生会话定位不兼容。');
 return value;
}
/** Per-window/project orchestration. All execution facts come from the public RunController. */
export function createConversationWorkspace(sdk,{RunController,createDesktopRunAdapter,SaveController,createSessionSaveAdapter,files,projectFileResource,randomId,readLegacy=async()=>null}){
 const entries=new Map(),listeners=new Set();let selected=null,visible=false,alive=true,currentSnapshot=Object.freeze({entry:null}),generation=0;
 const notify=()=>{if(!alive)return;const e=selected;currentSnapshot=Object.freeze({entry:e?{key:e.key,project:e.project,record:e.record,ready:e.ready,loading:e.loading,issue:e.issue||e.writer?.getSnapshot().error?.message||'',availability:e.availability,run:e.run?.getSnapshot()??null,snapshot:e.snapshot,recent:e.recent,history:e.history,historyBusy:e.historyBusy,connection:e.connection,save:e.resultWriter?.getSnapshot()??null,savedResult:e.resultWriter?.getSnapshot().committed?.value??null,busy:e.busy}:null});for(const fn of listeners)fn();};
 const call=(e,action,input={})=>sdk.call('conversation.'+action,{...e.project,...input});
 const storage=sdk.durableSession;
 const validateResult=(key,value)=>{if(value===null)return;if(!value||typeof value.runId!=='string'||typeof value.version!=='string'||value.source!=='codex-conversations-v1'||!value.result||value.result.runId!==value.runId||value.result.version!==value.version||value.result.source!==value.source||resultKey(value)!==key)throw failure('结果副本的来源或版本不兼容，原件已保留。');};
 async function settle(writer){
  await writer.save();let state=writer.getSnapshot();if(state.pending){await writer.reconcile();state=writer.getSnapshot();if(state.canRetrySameAttempt)await writer.retry();}
  state=writer.getSnapshot();return state.ready&&!state.dirty&&!state.pending&&state.status==='saved';
 }
 function update(e,patch){const next={...e.record,...patch};if(JSON.stringify(next)===JSON.stringify(e.record)){notify();return;}e.record=next;if(e.ready){e.writer.update(e.record);clearTimeout(e.saveTimer);e.saveTimer=setTimeout(()=>{void flushEntry(e).catch(error=>{e.issue=error.message;notify();});},250);}notify();}
 async function flushEntry(e){clearTimeout(e.saveTimer);if(!e.ready||!e.writer)return false;if(JSON.stringify(e.record)!==JSON.stringify(e.writer.getSnapshot().value))e.writer.update(e.record);return settle(e.writer);}
 function client(e){return {create:params=>call(e,'create',params),send:params=>call(e,'send',params),operation:operationId=>call(e,'operation',{operationId}),read:async threadId=>{const value=await call(e,'read',{threadId});e.snapshot=value;notify();return value;},events:async(threadId,afterVersion)=>{const value=await call(e,'events',{threadId,afterVersion});if(value.snapshot){e.snapshot=value.snapshot;notify();}return value;},interrupt:params=>call(e,'interrupt',params),answer:params=>call(e,'answer',params),openDesktop:threadId=>call(e,'openDesktop',{threadId})};}
 function setupRun(e){
  e.unwatch?.();e.offRun?.();const adapter=createDesktopRunAdapter(client(e));
  e.run=new RunController(adapter,{...(e.record.checkpoint?{checkpoint:e.record.checkpoint}:{}),operationId:randomId,preserve:async point=>{update(e,{checkpoint:point});if(!await flushEntry(e))throw Error('原请求恢复记录尚未确认保存。');}});
  e.offRun=e.run.subscribe(()=>{const point=e.run.getCheckpoint(),threadId=e.run.getSnapshot().identity?.threadId??e.record.threadId;if(point)update(e,{checkpoint:point,threadId});else notify();});
  if(e.record.checkpoint)void e.run.refresh();watch(e);
 }
 function watch(e){e.unwatch?.();e.unwatch=null;clearTimeout(e.readTimer);if(!alive||!visible||selected!==e||!e.ready)return;if(e.run?.getSnapshot().identity)e.unwatch=e.run.watch({intervalMs:1200});else if(e.record.threadId||e.record.legacyPending)void readAttached(e);}
 async function readAttached(e){
  if(e.reading)return;e.reading=true;
  try{if(e.record.legacyPending){const op=await call(e,'operation',{operationId:e.record.legacyPending.operationId});e.legacyOperation=op;if(op.threadId)update(e,{threadId:op.threadId});if(['accepted','succeeded','failed'].includes(op.status))update(e,{legacyPending:null});}
   if(e.record.threadId)e.snapshot=await call(e,'read',{threadId:e.record.threadId});e.connection='connected';e.issue='';
  }catch(error){e.connection='disconnected';e.issue=error.message;}
  finally{e.reading=false;notify();if(alive&&visible&&selected===e&&!e.run?.getSnapshot().identity)e.readTimer=setTimeout(()=>void readAttached(e),2000);}
 }
 function resultKey(result){return 'projects-run-result-'+encodeURIComponent(result.runId)+':'+encodeURIComponent(result.version);}
 async function resultWriter(e,result){
  const key=resultKey(result);if(e.resultWriter&&e.resultKey===key)return e.resultWriter;
  if(e.resultWriter?.getSnapshot().pending)throw failure('上一次结果保存仍待核对，请先核对原保存。');
  const retained=e.record.resultSave?.key===key?e.record.resultSave.checkpoint:null;
  e.offResult?.();e.resultKey=key;
  e.resultWriter=new SaveController(createSessionSaveAdapter(storage,{key,recordVersion:1,initial:null}),{initial:null,validate:value=>validateResult(key,value),...(retained?{checkpoint:retained}:{}),preserve:async point=>{update(e,{resultSave:{key,checkpoint:point}});if(!await flushEntry(e))throw Error('原结果保存请求尚未保全。');}});
  e.offResult=e.resultWriter.subscribe(()=>{update(e,{resultSave:{key,checkpoint:e.resultWriter.getCheckpoint()}});});
  if(retained?.pending)await e.resultWriter.reconcile();else await e.resultWriter.refresh();notify();return e.resultWriter;
 }
 async function restoreResult(e){if(!e.record.resultSave)return;const saved=e.record.resultSave;
  if(e.resultKey!==saved.key){e.offResult?.();e.resultKey=saved.key;e.resultWriter=new SaveController(createSessionSaveAdapter(storage,{key:saved.key,recordVersion:1,initial:null}),{initial:null,validate:value=>validateResult(saved.key,value),checkpoint:saved.checkpoint,preserve:async point=>{update(e,{resultSave:{key:saved.key,checkpoint:point}});if(!await flushEntry(e))throw Error('原保存尚未保全。');}});e.offResult=e.resultWriter.subscribe(()=>update(e,{resultSave:{key:saved.key,checkpoint:e.resultWriter.getCheckpoint()}}));if(saved.checkpoint.pending)await e.resultWriter.reconcile();else await e.resultWriter.refresh();}}
 async function load(e){
  if(e.loadPromise)return e.loadPromise;
  e.loadPromise=(async()=>{e.loading=true;notify();try{
   if(!storage)throw Error('当前宿主不支持持久恢复，不能安全派发新任务。');
   const key='projects-ai-'+encodeURIComponent(sdk.surfaceId)+':'+encodeURIComponent(e.key);e.sessionKey=key;e.writer=new SaveController(createSessionSaveAdapter(storage,{key,recordVersion:1,initial:initial()}),{initial:initial(),validate});e.offWriter=e.writer.subscribe(notify);await e.writer.refresh();const saved=e.writer.getSnapshot();if(!saved.ready)throw Error(saved.error?.message??'AI 工作区暂不可读取。');e.record=validate(saved.value);e.ready=true;
   if(saved.committed.revision===null){const legacy=await readLegacy(e.project);if(legacy&&typeof legacy.text==='string'){update(e,{draft:legacy.text,draftVersion:1,legacyPending:legacy.sending?.operationId?{operationId:legacy.sending.operationId,text:legacy.sending.text}:null});if(!await flushEntry(e))throw Error('旧草稿尚未确认迁移，原件已保留。');}}
   setupRun(e);await restoreResult(e);
   const results=await Promise.allSettled([call(e,'check'),call(e,'resume')]);if(results[0].status==='fulfilled')e.availability=results[0].value;else e.issue=results[0].reason.message;
   if(results[1].status==='fulfilled')e.recent=results[1].value;
   if(!e.record.checkpoint&&(e.record.threadId||e.record.legacyPending))await readAttached(e);
  }catch(error){e.issue=error.message;}finally{e.loading=false;notify();watch(e);}})();return e.loadPromise;
 }
 const active=()=>{if(!selected?.ready)throw failure('请先读回当前工作区。');return selected;};
 async function act(fn){const e=active();if(e.busy)return;e.busy=true;e.issue='';notify();try{return await fn(e);}catch(error){e.issue=error.message;return null;}finally{e.busy=false;notify();}}
 function canSubmit(e){const view=e.run?.getSnapshot();return !!e.ready&&e.availability?.available===true&&!e.busy&&!e.record.legacyPending&&(!view?.identity||terminal(view)||knownRejected(view))&&(!view?.identity||view.connection==='connected'||knownRejected(view))&&!(view?.cancellation&&['accepted','unknown'].includes(view.cancellation.state))&&!(view?.answer&&['accepted','unknown'].includes(view.answer.state))&&(!e.record.threadId||!!e.snapshot&&e.connection!=='disconnected'&&e.snapshot.status==='idle'&&!e.snapshot.turnId);}
 async function submit(e,snapshot){
  if(!canSubmit({...e,busy:false}))throw failure('请先核对当前运行及原生交互，再提交后续工作。');
  if(snapshot.draft!==e.record.draft||snapshot.draftVersion!==e.record.draftVersion||JSON.stringify(snapshot.resources)!==JSON.stringify(e.record.resources))throw failure('草稿或资源已变化，请重新提交当前快照。');
  for(const resource of snapshot.resources){if(!resource.ref||resource.ref.scope!=='workspace'||resource.kind!=='file')throw failure('当前仅支持工作区文件引用。');const fact=await files.stat(resource.ref);if(fact.version!==resource.version)throw failure('资源版本已变化，请移除旧引用并重新选择。');}
  const refs=snapshot.resources.map(resource=>`- ${resource.ref.path}（版本 ${resource.version}）`),text=snapshot.draft+(refs.length?'\n\n参考文件（路径引用，访问权限由宿主核对）：\n'+refs.join('\n'):'');
  const operationId=randomId(),request=e.record.threadId?{kind:'send',params:{operationId,threadId:e.record.threadId,text,mode:'new'}}:{kind:'create',params:{operationId,project:e.project,text}};
  update(e,{submitted:structuredClone(snapshot)});await e.run.submit(request);await e.run.refresh();watch(e);
 }
 return {
  getSnapshot:()=>currentSnapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async select(project,{restoreKey}={}){
   if(!project)return;const key=project.scope+':'+project.name;
   if(selected?.key!==key){selected?.unwatch?.();clearTimeout(selected?.readTimer);generation++;let e=entries.get(key);if(!e){e={key,project:{...project},record:initial(),ready:false,loading:false,issue:'',availability:null,recent:null,snapshot:null,connection:'idle',history:null,historyBusy:false,busy:false};entries.set(key,e);}selected=e;notify();}
   const e=selected;await load(e);
   if(restoreKey&&restoreKey!==e.sessionKey&&e.ready&&!e.record.checkpoint){
    if(typeof restoreKey!=='string'||!restoreKey.startsWith('projects-ai-')||!restoreKey.endsWith(':'+encodeURIComponent(e.key)))throw failure('旧会话不属于当前项目，原件已保留。');
    if(e.record.draft||e.record.resources.length||e.record.threadId||e.record.legacyPending)throw failure('当前窗口已有 AI 草稿，请先保留它再恢复关闭视图。');
    const old=await storage.read(restoreKey,1);if(old.exists&&old.record){e.record=structuredClone(validate(old.record.value));e.writer.update(e.record);if(!await flushEntry(e))throw Error('原会话恢复副本尚未保存。');setupRun(e);await restoreResult(e);}
   }watch(e);
  },
  setActive(value){visible=value;for(const e of entries.values())watch(e);},
  prefill(text){const e=active();update(e,{draft:e.record.draft?e.record.draft+'\n\n'+text:text,draftVersion:e.record.draftVersion+1});},
  draft(value){const e=active();update(e,{draft:value,draftVersion:e.record.draftVersion+1});},
  canSubmit:()=>selected?canSubmit(selected):false,
  submit:snapshot=>act(e=>submit(e,snapshot)),
  async reload(){if(!selected)return;selected.loadPromise=null;selected.offWriter?.();await load(selected);},
  reconcile:()=>act(async e=>{if(e.run?.getSnapshot().identity)await e.run.refresh();else await readAttached(e);e.availability=await call(e,'check');}),
  retryOriginal:()=>act(async e=>{await e.run.retryOriginal();watch(e);}),
  cancel:()=>act(async e=>{await e.run.cancel();watch(e);}),
  retryStop:()=>act(async e=>{await e.run.retryCancellation();watch(e);}),
  answer:answer=>act(async e=>{await e.run.answer(answer);await e.run.refresh();watch(e);}),
  answerValues(question,values){const e=active();update(e,{answers:{...e.record.answers,[questionKey(question)]:{...values}}});},
  values:question=>selected?.record.answers[questionKey(question)]??selected?.record.answers[JSON.stringify([question.turnId,question.request.type,question.request.value,question.version])]??{},
  expanded(ids){update(active(),{expandedToolIds:[...ids]});},
  submittedExpanded(open){update(active(),{submittedExpanded:open});},
  contextExpanded(open){update(active(),{contextExpanded:open});},
  addResource:()=>act(async e=>{const selection=await files.pickFile({scope:'workspace',rootPath:'项目',title:'添加工作区参考文件'});if(!selection)return;const ref=selection.ref??selection,info=await files.stat(ref);if(info.kind!=='file'||info.ref.scope!=='workspace')throw failure('请选择工作区文件。');const resource=projectFileResource(info);update(e,{resources:[...e.record.resources.filter(r=>r.id!==resource.id),resource],draftVersion:e.record.draftVersion+1});}),
  removeResource(id){const e=active();update(e,{resources:e.record.resources.filter(r=>r.id!==id),draftVersion:e.record.draftVersion+1});},
  openNative:()=>act(e=>{const threadId=e.run?.getSnapshot().identity?.threadId??e.record.threadId;if(!threadId)throw failure('尚未取得原生会话定位。');return call(e,'openDesktop',{threadId});}),
  attach:taskId=>act(async e=>{if(e.run?.getSnapshot().identity&&!terminal(e.run.getSnapshot())&&!knownRejected(e.run.getSnapshot())||e.record.legacyPending)throw failure('原运行尚未核对完成。');const result=await call(e,'attach',{taskId});if(!result.attached||!result.threadId)throw failure(result.reason??'没有可接续的原生会话。');update(e,{threadId:result.threadId,checkpoint:null,submitted:null});e.snapshot=null;e.history=null;setupRun(e);await flushEntry(e);await readAttached(e);watch(e);}),
  resumeRecent:()=>act(async e=>{if(!e.recent?.threadId)throw failure('尚无可接续的项目会话。');if(e.record.checkpoint||e.record.legacyPending)throw failure('请先核对当前原请求。');update(e,{threadId:e.recent.threadId,legacyPending:e.recent.operationId?{operationId:e.recent.operationId,text:''}:null});if(!await flushEntry(e))throw Error('原会话定位尚未保存。');await readAttached(e);watch(e);}),
  newConversation:()=>act(async e=>{if(e.run?.getSnapshot().identity&&!terminal(e.run.getSnapshot())&&!knownRejected(e.run.getSnapshot())||e.record.legacyPending||e.resultWriter?.getSnapshot().pending)throw failure('原请求或保存尚待核对，不能清除其身份。');update(e,{threadId:null,checkpoint:null,submitted:null});e.snapshot=null;e.history=null;setupRun(e);if(!await flushEntry(e))throw Error('新会话草稿尚未保全。');}),
  loadHistory:()=>act(async e=>{if(!e.record.threadId)return;e.historyBusy=true;notify();try{const result=await call(e,'history',{threadId:e.record.threadId,offset:e.history?.nextOffset??0,...(e.history?{version:e.history.version}:{})});e.history={...result,records:[...(e.history?.records??[]),...result.records]};}finally{e.historyBusy=false;notify();}}),
  saveResult:()=>act(async e=>{const view=e.run.getSnapshot(),result=view.observation?.result.record;if(!result||!terminal(view)||result.persistence==='service-reported'||view.connection!=='connected')throw failure('结果尚未核实，不能保存为当前结果。');const writer=await resultWriter(e,result);if(!writer.getSnapshot().ready)throw Error('结果存储尚未读取成功，原结果和已有副本均已保留。');writer.update({source:result.source,runId:result.runId,version:result.version,result:structuredClone(result)});await writer.save();notify();}),
  reconcileSave:()=>act(async e=>{await e.resultWriter?.reconcile();notify();}),
  retrySave:()=>act(async e=>{if(e.resultWriter&&!e.resultWriter.getSnapshot().ready){await e.resultWriter.refresh();notify();return;}if(e.resultWriter?.getSnapshot().canRetrySameAttempt)await e.resultWriter.retry();else await e.resultWriter?.save();notify();}),
  reloadSave:()=>act(async e=>{const read=await e.resultWriter?.discard();notify();return read;}),
  async flush(){for(const e of entries.values()){if(!await flushEntry(e))return false;}return true;},
  getLocation:()=>selected?.sessionKey?{aiSessionKey:selected.sessionKey}:{},
  getGeneration:()=>[generation,...[...entries.values()].map(e=>e.writer?.getSnapshot().draftVersion??-1)].join(':'),
  dispose(){alive=false;for(const e of entries.values()){e.unwatch?.();e.offRun?.();e.offWriter?.();e.offResult?.();clearTimeout(e.readTimer);clearTimeout(e.saveTimer);}listeners.clear();},
 };
}
