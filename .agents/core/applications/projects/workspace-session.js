import {workspaceContext} from './workspace-model.js';

/** One writer per surface. The shared record is a closed-view locator, never live selection state. */
export function createWorkspaceSession(sdk,{SaveController,createSessionSaveAdapter,onChange=()=>{}}){
 const storage=sdk.durableSession,key='projects-workspace-'+encodeURIComponent(sdk.surfaceId),initial=workspaceContext();
 let timer=null,ready=false,disposed=false,recent=null,issue='',saveIssue='',unsubscribe=()=>{};
 const controller=storage?new SaveController(createSessionSaveAdapter(storage,{key,recordVersion:1,initial}),{initial,validate:value=>{if(JSON.stringify(value)!==JSON.stringify(workspaceContext(value)))throw Error('项目视图恢复记录格式不兼容；原记录已保留。');}}):null;
 function changed(){const state=controller?.getSnapshot();saveIssue=state?.error?.message??'';if(!disposed)onChange();}
 if(controller)unsubscribe=controller.subscribe(changed);
 async function settle(writer){
  await writer.save();let state=writer.getSnapshot();
  if(state.pending){await writer.reconcile();state=writer.getSnapshot();if(state.canRetrySameAttempt)await writer.retry();}
  state=writer.getSnapshot();return state.ready&&!state.dirty&&!state.pending&&state.status==='saved';
 }
 return {
  async load(){
   if(!controller){issue='当前宿主不支持持久视图恢复；请升级配套 Core。';ready=true;changed();return null;}
   await controller.refresh();const state=controller.getSnapshot();ready=state.ready;
   if(!ready)return null;
   if(state.committed.revision!==null)return state.value;
   try{const last=await storage.read('projects-last-closed',1),target=last.record?.value;if(target&&typeof target.key==='string'&&target.key.startsWith('projects-workspace-')&&target.key!==key){const read=await storage.read(target.key,1);if(read.exists&&read.record)recent=workspaceContext(read.record.value);}}
   catch(error){issue='上次关闭的视图暂不可读取：'+error.message;}
   changed();return null;
  },
  update(value){if(!controller||!ready||disposed)return;const next=workspaceContext(value);if(JSON.stringify(next)===JSON.stringify(controller.getSnapshot().value))return;controller.update(next);clearTimeout(timer);timer=setTimeout(()=>{void settle(controller).catch(error=>{issue=error.message;onChange();});},250);},
  getRecent:()=>recent,
  takeRecent(){const value=recent;recent=null;return value;},
  getIssue:()=>[issue,saveIssue].filter(Boolean).join('；'),
  getGeneration:()=>controller?.getSnapshot().draftVersion??0,
  isReady:()=>ready,
  async flush({closed=false}={}){
   clearTimeout(timer);if(!controller||!ready)return false;
   if(!await settle(controller))return false;
   if(closed){const value={key,closedAt:new Date().toISOString()},writer=new SaveController(createSessionSaveAdapter(storage,{key:'projects-last-closed',recordVersion:1,initial:null}),{initial:null});await writer.refresh();if(!writer.getSnapshot().ready)return false;writer.update(value);if(!await settle(writer)){issue='关闭视图的恢复入口未确认保存。';changed();return false;}}
   return true;
  },
  dispose(){disposed=true;clearTimeout(timer);unsubscribe();},
 };
}
