/** Query projection only; it never changes the selected project or creates business state. */
export const workspaceProjectKey=project=>project.scope+':'+project.name;
export function workspaceTarget(key){
 if(typeof key!=='string')return null;const colon=key.indexOf(':'),scope=key.slice(0,colon),name=key.slice(colon+1);
 return ['current','archived'].includes(scope)&&name&&!['.','..'].includes(name)&&!/[\/\\\x00-\x1f]/.test(name)?{scope,name}:null;
}
export function workspaceProjects(projects,{query='',scope='all',selected=''}={}){
 const text=query.trim().toLocaleLowerCase(),entries=projects.filter(p=>(scope==='all'||p.scope===scope)&&[p.title,p.name,p.description].some(value=>typeof value==='string'&&value.toLocaleLowerCase().includes(text)));
 return {entries,excluded:!!selected&&!entries.some(p=>workspaceProjectKey(p)===selected)};
}
export function workspaceReadState(error){
 const code=error?.code??'';
 if(['PROJECT_NOT_FOUND','FILE_NOT_FOUND','APP_OBJECT_NOT_FOUND'].includes(code))return 'unavailable';
 if(['APP_PERMISSION_REQUIRED','PROJECT_PERMISSION_DENIED','PROJECT_ACCESS_DENIED'].includes(code))return 'unauthorized';
 return 'error';
}
/** A recovery record carries view coordinates only, never project facts or draft values. */
export function workspaceContext(value={}){
 const position=n=>Number.isFinite(n)?Math.max(0,Math.min(1e7,Math.round(n))):0;
 const safePath=p=>typeof p==='string'&&!p.startsWith('/')&&!p.split('/').some(part=>['.','..',''].includes(part))&&!/[\\\x00-\x1f]/.test(p);
 const file=value.fileView,fileView=file&&safePath(file.objectPath)&&safePath(file.path)&&['file','directory'].includes(file.kind)&&(!file.digest||/^[a-f0-9]{64}$/.test(file.digest))?{objectPath:file.objectPath,path:file.path,kind:file.kind,scroll:position(file.scroll),...(file.digest?{digest:file.digest}:{})}:null;
 const path=typeof value.objectPath==='string'&&!value.objectPath.startsWith('/')&&!value.objectPath.split('/').some(part=>['.','..',''].includes(part))&&!/[\\\x00-\x1f]/.test(value.objectPath)?value.objectPath:null;
 return {schema:1,query:typeof value.query==='string'?value.query.slice(0,4096):'',scope:['all','current','archived'].includes(value.scope)?value.scope:'all',selected:workspaceTarget(value.selected)?value.selected:'',pane:value.pane==='detail'?'detail':'list',splitSize:Number.isFinite(value.splitSize)?Math.max(10,Math.min(90,value.splitSize)):30,objectPath:path,listScroll:position(value.listScroll),detailScroll:position(value.detailScroll),objectScroll:position(value.objectScroll),navigationScroll:position(value.navigationScroll),...(['plan','progress','materials'].includes(value.projectTab)?{projectTab:value.projectTab}:{}),...(['overview','tasks','materials','acceptance','original'].includes(value.detailSection)?{detailSection:value.detailSection}:{}),...(fileView?{fileView}:{}),...(value.projectView==='chats'?{projectView:'chats'}:{}),...(typeof value.aiSessionKey==='string'&&value.aiSessionKey.startsWith('projects-ai-')&&value.aiSessionKey.length<=256?{aiSessionKey:value.aiSessionKey}:{})};
}
/** A project opened directly from the catalog has no explicit objectPath yet. */
export function workspaceFileReference(location,projectPath){
 const file=workspaceContext(location).fileView;
 return file?.objectPath===(location.objectPath??projectPath)?{path:file.path,kind:file.kind,...(file.digest?{digest:file.digest}:{})}:null;
}
/** Facts come from the checked owning-service view. Unsaved drafts invalidate its conclusions. */
export function workspaceDomainFacts(document,record,{draft=false}={}){
 const m=document.metadata,stale=!!record.stale?.includes(m.id),usable=record.valid===true&&!stale&&!draft,readiness=record.projection?.readiness?.find(r=>r.id===m.id);
 const review=m.review_ref&&record.documents.find(r=>r.path===m.review_ref.path&&r.metadata.id===m.review_ref.id),confirmation=review?.metadata?.user_confirmation;
 const confirmed=usable&&m.status==='completed'&&review?.metadata.status==='completed'&&review.metadata.outcome==='passed'&&review.metadata.subject?.id===m.id&&review.metadata.subject.path===document.path&&confirmation?.subject?.id===m.id;
 return {...(readiness&&!draft?{readiness:{ready:readiness.ready,reasons:readiness.reasons}}:{}),...(m.kind==='task'?{verification:{state:stale?'stale':usable&&m.status==='completed'?'passed':'unavailable',reason:draft?'当前含未保存草稿，服务验收结论尚未核对。':stale?'项目服务要求复核原证据。':usable&&m.status==='completed'?'项目服务读取检查通过，原任务记录为已完成。':'本次尚未取得任务验收结论。'}}:{}),...(m.kind==='milestone'?{confirmation:confirmed?{state:'confirmed',at:confirmation.confirmed_at,reason:confirmation.subject.path===document.path?'项目服务返回当前阶段的用户确认和通过复盘。':'项目服务核对通过；以稳定ID保留合并前原路径的用户确认。'}:{state:stale?'stale':'unavailable',reason:draft?'当前含未保存草稿，阶段确认尚未核对。':'未取得有效用户确认；任务数量不能代替。'}}:{})};
}
