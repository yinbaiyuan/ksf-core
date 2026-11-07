// Isolated browser fixture. Never packaged into an application release.
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createBackend} from '../backend.mjs';
import {project} from '../../../runtime/src/services/projects.js';
import {projectManagement,emptyProjectPlan} from '../../../runtime/src/services/project-management.js';
import {projectGovernance} from '../../../runtime/src/services/project-governance.js';
import {defaultMetadata} from '../../../runtime/src/projects/governance/model.js';
import {createProjectContextFiles} from '../../../runtime/src/services/project-context-files.js';
import {createApplicationStorage} from '../../../runtime/src/services/application-storage.js';
import {createWorkspaceFiles} from '../../../runtime/src/services/workspace-files.js';
import {createCoordinator} from '../../../runtime/src/services/workbench-common.js';
import {briefDigest} from '../project-brief-source.mjs';
import {defaultMaterialSettings} from '../../sdk/src/shared/material-settings.js';
const root=mkdtempSync(join(tmpdir(),'ksf-pm-browser-')),source=resolve(import.meta.dirname,'../.build/frontend');
mkdirSync(join(root,'项目/示例/任务'),{recursive:true});writeFileSync(join(root,'项目/示例/project.md'),'---\nname: 社区工作坊\nstatus: active\ndescription: 从筹备到实际交付，围绕阶段成果推进协作。\n---\n# 社区工作坊\n## 项目目标\n交付一次可复用的社区工作坊。\n[原始检查点](任务/筹备.md)');
writeFileSync(join(root,'项目/示例/任务/筹备.md'),'---\ncheckpoint_schema: 1\nname: 场地信息整理\ntask_id: fixture-legacy\nstate: completed\nupdated: "2026-11-01"\n---\n# 场地信息整理\n## 下一步\n复核容纳人数与费用口径。');
const plan=emptyProjectPlan();Object.assign(plan,{purpose:'让参与者完成一次可带走的作品，并留下可复用的组织方法。',scope:'本阶段完成活动方案与一次演练；正式对外邀约另行确认。',summary:'活动内容已确定，先用小规模演练验证流程；场地费用仍待核实。',reviewedAt:new Date().toISOString(),currentStageId:'stage_pilot',wipLimit:2});
plan.goals=[{id:'goal_delivery',title:'一次顺畅、可复用的工作坊',successCriteria:'参与者完成作品；组织流程经过演练并有记录。'}];
plan.stages=[{id:'stage_pilot',title:'用一次演练，把交付标准跑通',goalIds:['goal_delivery'],description:'确定参与流程，完成一轮小规模演练和证据复核。',state:'active',criteria:[{id:'criterion_stage',text:'演练完整走通，遗留问题有明确处理',result:'pending',evidence:[],reviewer:'',reviewedAt:''}]}];
const item=(id,title,state,commitment,dependsOn=[],nextAction='')=>({id,title,goalIds:['goal_delivery'],stageId:'stage_pilot',description:title,state,commitment,priority:'normal',priorityReason:'',owner:'活动负责人',dueDate:'',dependsOn,blocker:'',nextAction,acceptance:[{id:'accept_'+id,text:'成果与约定条件一致，实际核对并保留证据',result:'pending',evidence:[],reviewer:'',reviewedAt:''}],links:[],source:null});
plan.items=[item('work_script','完成可直接使用的演练脚本','ready','now',[],'将 90 分钟流程写成主持脚本，核对参与者的每一步。'),item('work_pilot','组织小规模流程演练','backlog','next',['work_script'],'按脚本演练，并记录卡点与参与反馈。'),item('work_venue','核实场地容量与费用','blocked','next',[],'取得场地方的容量与费用原件。')];plan.items[2].blocker='等待场地方回复书面费用口径。';
plan.risks=[{id:'risk_time',title:'首次活动的流程可能超时',impact:'压缩作品展示与反馈时间。',response:'先演练，记录各环节实际时长并预留机动。',owner:'活动负责人',state:'mitigating',reviewTrigger:'演练结束后复核。'}];plan.decisions=[{id:'decision_invite',title:'正式邀约人数与开放范围',rationale:'依演练结果和场地确认后决定。',impact:'影响材料、费用与组织工作量。',state:'proposed',reviewTrigger:'演练结果与场地口径齐备。'}];
const initialized=projectManagement({root,name:'示例',operation:'write',data:{ifMatch:'missing',operationId:'browser-fixture-init',plan}});if(initialized.errors.length)throw Error(JSON.stringify(initialized.errors));
if(process.env.KSF_PROJECTS_PREVIEW_GOVERNANCE==='1'){
  const mapping={items:{work_venue:{status:'planned'}}};
  const preview=projectGovernance({root,name:'示例',operation:'migrate',data:{mapping}});if(preview.errors.length)throw Error(JSON.stringify(preview.errors));
  const done=projectGovernance({root,name:'示例',operation:'migrate',data:{operationId:'browser-governance-init',approvalDigest:preview.data.approvalDigest,mapping}});if(done.errors.length)throw Error(JSON.stringify(done.errors));
}
if(process.env.KSF_PROJECTS_PREVIEW_FAMILY==='1'){
 const g=projectGovernance({root,name:'示例'}).data,p=g.project,ref=(id,path)=>({id,path});
 const cp='项目/内容共创/project.md',gp='项目/练习设计/project.md',cm='项目/内容共创/M1-内容框架/milestone.md',m2='项目/示例/M2-正式交付/milestone.md';
 const child={...defaultMetadata('project','preview_child','内容共创'),level:'B',phase:'planning',parent_project:ref(p.metadata.id,p.path),child_projects:[ref('preview_grand',gp)],milestones:[ref('preview_child_stage',cm)],owner:'内容负责人',goals:[{id:'content_goal',title:'形成可直接使用的内容'}],criteria:[{id:'content_done',text:'内容和练习可独立使用'}],next_action:'确定内容方案，再拆当前任务'};
 const grand={...defaultMetadata('project','preview_grand','练习设计'),parent_project:ref(child.id,cp),owner:'练习负责人',goals:[{id:'exercise_goal',title:'设计一个检验理解的练习'}],criteria:[{id:'exercise_done',text:'练习可独立完成并检查结果'}],next_action:'先验证练习输入是否清楚'};
 const childStage={...defaultMetadata('milestone','preview_child_stage','形成内容框架'),project:ref(child.id,cp),goal_ids:['content_goal'],criteria:[{id:'content_outline',text:'结构能够承接参与者目标'}],next_action:'确定内容范围和交付条件'};
 const stage={...defaultMetadata('milestone','preview_delivery','正式交付并核对效果'),project:ref(p.metadata.id,p.path),goal_ids:p.metadata.goals.map(x=>x.id),criteria:[{id:'delivery_done',text:'实际交付完成并核对参与者反馈'}],owner:'活动负责人',next_action:'演练通过后再细化交付安排'};
 const changes=[{path:p.path,ifMatch:p.etag,metadata:{child_projects:[ref(child.id,cp)],milestones:[...p.metadata.milestones,ref(stage.id,m2)]}},...[[cp,child],[gp,grand],[cm,childStage],[m2,stage]].map(([path,metadata])=>({path,ifMatch:'missing',metadata,body:'# '+metadata.name+'\n\n隔离界面样例，不是真实项目安排。\n'}))];
 const out=projectGovernance({root,name:'示例',operation:'apply',data:{operationId:'browser-family-ux-001',ifMatch:g.etag,changes}});if(out.errors.length)throw Error(JSON.stringify(out.errors));
}
if(process.env.KSF_PROJECTS_PREVIEW_LIFECYCLE==='1'){
 const ref=(id,path)=>({id,path}),pp='项目/示例/project.md',mp='项目/示例/M1-现场留存/milestone.md',tp='项目/示例/M1-现场留存/T1-等待下一轮/task.md',cp='项目/封存子项目/project.md',ev=tp.replace('task.md','10-现场.txt');
 const p={...defaultMetadata('project','lifecycle_parent','封存演示'),status:'paused',owner:'演示负责人',status_reason:'等待新一轮输入',resume_status:'active',resume_condition:'取得新输入后核对目标',next_action:'恢复时核对已有结果与未决',goals:[{id:'g1',title:'保留可接续的工作现场'}],criteria:[{id:'p1',text:'现场完整且可以找回'}],milestones:[ref('lifecycle_stage',mp)],focus_milestones:[ref('lifecycle_stage',mp)],child_projects:[ref('lifecycle_child',cp)]};
 const child={...defaultMetadata('project','lifecycle_child','封存子项目'),status:'paused',owner:'演示负责人',status_reason:'阶段暂停',resume_status:'planned',resume_condition:'父项目重新安排',next_action:'恢复前核对原安排',parent_project:ref(p.id,pp),criteria:[{id:'c1',text:'子项目结果'}]};
 const m={...defaultMetadata('milestone','lifecycle_stage','保留当前现场'),project:ref(p.id,pp),goal_ids:['g1'],tasks:[ref('lifecycle_task',tp)],criteria:[{id:'m1',text:'现场可复核'}],next_action:'等待项目恢复后再安排'};
 const task={...defaultMetadata('task','lifecycle_task','等待下一轮'),project:ref(p.id,pp),milestone:ref(m.id,mp),goal_ids:['g1'],owner:'演示负责人',commitment:'next',criteria:[{id:'t1',text:'根据输入形成结果'}],next_action:'核对新输入',context_refs:[{path:ev}]};
 const before=projectGovernance({root,name:'示例'}).data,changes=[{path:pp,ifMatch:before.project.etag,metadata:p,body:'# 封存演示\n\n已有判断和未决原样保留。\n\n[现场原件](M1-现场留存/T1-等待下一轮/10-现场.txt)\n'},...[ [mp,m],[tp,task],[cp,child]].map(([path,metadata])=>({path,ifMatch:'missing',metadata,body:'# '+metadata.name+'\n\n隔离验收样例；没有真实项目数据。\n'})),{path:ev,ifMatch:'missing',contentBase64:Buffer.from('隔离现场原始字节。').toString('base64')}];
 const out=projectGovernance({root,name:'示例',operation:'apply',data:{operationId:'lifecycle-browser-fixture',ifMatch:before.etag,changes}});if(out.errors.length)throw Error(JSON.stringify(out.errors));
}
if(process.env.KSF_PROJECTS_PREVIEW_NUMBERING==='1'){
 const g=projectGovernance({root,name:'示例'}).data,pp='项目/示例/project.md',mp='项目/示例/M1-字母阶段/milestone.md',ref=(id,path)=>({id,path});
 const stages=[{code:'A',name:'计划准备',purpose:'明确输入和路径',exit_criteria:'可以执行'},{code:'B',name:'小样验证',purpose:'取得可检查结果',exit_criteria:'可以验收'},{code:'Z',name:'验收复盘',purpose:'核对成果和遗留',exit_criteria:'本层结论明确'}];
 const p={...defaultMetadata('project',g.project.metadata.id??'letter_project','字母任务演示'),status:'active',owner:'示例负责人',next_action:'推进小样',criteria:[{id:'p1',text:'完整闭环'}],milestones:[ref('letter_stage',mp)]};
 const tasks=['A1','B2','B10','Z1'].map((code,i)=>{const path=mp.replace('milestone.md',code+'-'+['细化目标','验证小样','备用方案','验收与复盘'][i]+'/task.md');return {path,metadata:{...defaultMetadata('task','letter_task_'+i,['细化目标','验证小样','备用方案','验收与复盘'][i]),task_code:code,owner:'示例负责人',commitment:'next',work_type:code[0]==='Z'?'acceptance':'delivery',status:code==='B10'?'cancelled':'planned',status_reason:code==='B10'?'不再需要':null,project:ref(p.id,pp),milestone:ref('letter_stage',mp),next_action:'核对输入再推进',criteria:[{id:'c1',text:'拿到实际结果'}]}};});
 const m={...defaultMetadata('milestone','letter_stage','按字母阶段推进'),status:'active',project:ref(p.id,pp),task_stages:stages,tasks:tasks.map(d=>ref(d.metadata.id,d.path)),criteria:[{id:'m1',text:'形成阶段结果'}]};
 const changes=[{path:pp,ifMatch:g.project.etag,metadata:p,body:'# 字母任务隔离演示\n'},...[{path:mp,metadata:m},...tasks].map(d=>({...d,ifMatch:'missing',body:'# '+d.metadata.name+'\n\n这是隔离示例，不影响真实项目。\n'}))];
 changes.push(
  {path:pp.replace('project.md','P00-项目背景.md'),ifMatch:'missing',body:'# 共用背景\n'},
  {path:mp.replace('milestone.md','M01-阶段样本/样本一.md'),ifMatch:'missing',body:'# 阶段原件\n'},
  {path:tasks[0].path.replace('task.md','00-输入.md'),ifMatch:'missing',body:'# 任务输入\n'},
 );
 const out=projectGovernance({root,name:'示例',operation:'apply',data:{operationId:'numbering-browser-fixture',ifMatch:g.etag,changes}});if(out.errors.length)throw Error(JSON.stringify(out.errors));
}
const files=createWorkspaceFiles(root,createCoordinator());
const contextFiles=createProjectContextFiles(files,createApplicationStorage(root));
const contextFileCall=input=>{
  if(process.env.KSF_PROJECTS_PREVIEW_OLD_SCOPE!=='1')return contextFiles.call(input);
  const {objectPath,...legacy}=input;
  return contextFiles.call(legacy);
};
const previewGovernance=async(operation,input)=>{
  const delay=Number(process.env.KSF_PROJECTS_PREVIEW_READ_DELAY_MS??0);
  if(operation==='read'&&delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
  const saveDelay=Number(process.env.KSF_PROJECTS_PREVIEW_SAVE_DELAY_MS??0);
  if(operation==='apply'&&saveDelay>0)await new Promise(resolve=>setTimeout(resolve,saveDelay));
  const result=projectGovernance({root,operation,...input});
  const lostReply=join(root,'.project-fixture-lost-save-reply');
  if(operation==='apply'&&existsSync(lostReply)){
    rmSync(lostReply);throw Object.assign(Error('隔离验收：保存已执行，但回执未收到。'),{code:'FIXTURE_REPLY_UNKNOWN'});
  }
  return result;
};
const previewTasks=new Map();
const previewReport={content:'隔离验收模拟输出，不是真实项目分析。',sections:{plan:'隔离验收：目标与范围分析。只依据已保存原件，保留待核实事项。',progress:'隔离验收：人工关注与实际在制分开核对。这里是模拟建议，尚未成为项目承诺。',materials:'隔离验收：引用不等于验收，需对照条件与固定版本证据。'}};
async function previewAI(method,args){
 if(method==='describe')return {profiles:[{id:'preview',name:'隔离验收 Agent',kind:'codex',model:'fixture',capabilities:['text','json'],limits:{maxInputBytes:131072,maxOutputBytes:32768,timeoutMs:60000,maxAttempts:1}}]};
 if(method==='submit'){
  const old=[...previewTasks.entries()].find(([,task])=>task.request.idempotencyKey===args[0].idempotencyKey);if(old)return {aiTaskId:old[0],status:'queued'};
  const id='fixture-'+(previewTasks.size+1);previewTasks.set(id,{request:args[0],reads:0});return {aiTaskId:id,status:'queued'};
 }
 const [id]=args,task=previewTasks.get(id);if(!task)throw Error('隔离 AI 任务不存在。');
 if(method==='get'){
  const fail=existsSync(join(root,'.brief-fixture-fail')),status=++task.reads<3?'running':fail?'failed':'succeeded';
  return {aiTaskId:id,status,application:{appId:'com.ksf.projects'},context:task.request.context,execution:{model:'fixture'},...(fail?{error:{code:'FIXTURE',message:'隔离验收：本次生成失败，上一份简报应保留。'}}:{})};
 }
 if(method==='readResult')return {resultId:id,value:previewReport,sha256:briefDigest(previewReport)};
 throw Error('未知隔离 AI 操作。');
}
const app=createBackend({workspace:root,dataDirectory:join(root,'.app-data'),services:{call:async(service,method,args)=>service==='ai'&&process.env.KSF_PROJECTS_PREVIEW_AI==='1'?previewAI(method,args):service==='projects'&&method==='contextFiles'?contextFileCall(...args):({available:false,message:'隔离验收环境：不会启动 Desktop 执行。'})}},{cli:async args=>args[0]==='project'?project({root,operation:args[1],name:args[2]==='--scope'?undefined:args[2],scope:args[1]==='list'?'all':args[4]??'current'}):{data:{records:[],total:0,nextOffset:null},errors:[]},management:(operation,input)=>projectManagement({root,operation,...input}),governance:previewGovernance,lifecycle:(operation,input)=>operation==='resolve'?project({root,operation:'locate',name:input.path,source:input.source,digest:input.digest,data:input.read?{read:true}:undefined}):project({root,operation,name:input.name,...input})});
const server=createServer(async(req,res)=>{try{if(req.url==='/api/workspace/upload'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;res.setHeader('content-type','application/json');try{res.end(JSON.stringify({data:await files.upload(JSON.parse(body))}));}catch(error){res.statusCode=400;res.end(JSON.stringify({error:{message:error.message}}));}return;}if(req.url.startsWith('/api/workspace/media?')){const path=new URL(req.url,'http://localhost').searchParams.get('path');const image=await files.media(path);res.setHeader('content-type',image.type);res.end(image.bytes);return;}if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}if(req.url==='/rpc'){let body='';for await(const chunk of req)body+=chunk;const {method,params}=JSON.parse(body);try{res.setHeader('content-type','application/json');res.end(JSON.stringify({data:await app.call(method,params)}));}catch(e){res.end(JSON.stringify({error:{message:e.message,code:e.code}}));}return;}if(req.url.split('?')[0]==='/'){const compact=new URL(req.url,'http://localhost').searchParams.get('compact')==='1';const manifest=JSON.parse(readFileSync(join(source,'../manifest.json'),'utf8'));const css=manifest.window.styles.map(path=>readFileSync(join(source,'..',path),'utf8')).join('\n');res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>KSF 项目管理 · 隔离验收</title><style>html,body{height:100%;margin:0}${compact?'body{width:540px;height:420px}':''}body{display:flex;flex-direction:column;background:#fafbf8}#workspace{position:relative;flex:1;min-height:0;display:flex}#app{flex:1;min-height:0}#overlay{position:absolute;inset:0;pointer-events:none;overflow:hidden}#toolbar{min-height:36px;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #e1e7ed}button,input,textarea,select{font:inherit}${css}</style><div id="toolbar"></div><div id="workspace"><div id="app" class="ksf-app-com_ksf_projects--${manifest.version.replaceAll('.','_')}"></div><div id="overlay"></div></div><script type="module">import{mount}from'/index.js';const session=new Map(),positions=new Map(),content=document.querySelector('#app');const snapshot={id:'isolated-browser',active:true,enabled:true,search:location.search,root:{current:document.body},material:${JSON.stringify(defaultMaterialSettings())},contentHost:content,overlayHost:document.querySelector('#overlay'),toolbarHost:document.querySelector('#toolbar')};await mount(content,{appId:'com.ksf.projects',version:'${manifest.version}',kind:'window',instanceId:'browser-fixture',surfaceId:'isolated-browser',getSnapshot:()=>snapshot,subscribe:()=>()=>{},openApp(){},onBeforeClose:()=>()=>{},reportError:e=>{content.textContent=e.message;},session:{get:k=>session.get(k),set:(k,v)=>session.set(k,v),getPosition:k=>positions.get(k),setPosition:(k,v)=>positions.set(k,v)},setTitle(){},request:async(url,input)=>{const result=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json());if(result.error)throw Error(result.error.message);return result.data;},call:async(method,params)=>{const r=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,params})}).then(r=>r.json());if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}});</script></html>`);return;}const path=resolve(source,'.'+decodeURIComponent(req.url.split('?')[0]));if(!path.startsWith(source+'/')||!existsSync(path)){res.statusCode=404;res.end();return;}res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.woff2')?'font/woff2':'application/octet-stream');res.end(readFileSync(path));}catch(e){res.statusCode=500;res.end(e.message);}});
const previewPort=Number(process.env.KSF_PROJECTS_PREVIEW_PORT??18431);server.listen(previewPort,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+previewPort+'/',fixture:root})));
process.on('SIGTERM',()=>server.close(async()=>{contextFiles.close();await app.dispose();rmSync(root,{recursive:true,force:true});process.exit();}));
