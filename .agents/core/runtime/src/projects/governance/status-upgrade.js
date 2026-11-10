import {dirname} from 'node:path';
import {readGovernance,applyGovernance,publicState} from './store.js';
import {SCHEMA,MAIN_STATES} from './states.js';
import {digest,snapshot,fail,object} from './model.js';

// Explicit schema migration: source bytes and every mapping are retained with
// the receiving task. Reading old projects never rewrites their business data.
export function statusUpgradeProposal(root,name,scope,mapping={}){
  const state=readGovernance(root,name,scope);
  if(scope!=='current'||state.format!=='documents'||!state.valid)fail('PROJECT_GOVERNANCE_MIGRATION','仅升级有效的当前治理项目。');
  const roots=new Set(),visit=d=>{if(!d||roots.has(d.path))return;roots.add(d.path);for(const r of d.metadata.child_projects??[])visit(state.graph.docs.get(r.path));};visit(state.project);
  const selected=state.documents.filter(d=>roots.has(d.path)||roots.has(d.metadata.project?.path)||d.metadata.kind==='review'&&roots.has(state.graph.docs.get(d.metadata.subject?.path)?.metadata.project?.path)||d.metadata.kind==='review'&&roots.has(d.metadata.subject?.path));
  const sources=selected.filter(d=>d.metadata.governance_schema===1);
  if(!sources.length)return {alreadyMigrated:true,state:publicState(state)};
  if(!object(mapping)||!object(mapping.objects??{}))fail('PROJECT_GOVERNANCE_MIGRATION','升级映射应为objects字段集合。');
  const changes=[],questions=[],rows=[];
  for(const d of sources){
    const m=d.metadata,choice=mapping.objects?.[m.id]??{};
    if(!object(choice)||Object.keys(choice).some(k=>!['status','work_type','resume_status','status_reason','next_action'].includes(k)))fail('PROJECT_GOVERNANCE_MIGRATION','对象映射字段无效。');
    const next={governance_schema:SCHEMA};
    if(m.kind!=='review'){
      let status=({backlog:'planned',ready:'planned',in_progress:'active'})[m.status]??m.status;
      if(m.status==='blocked'&&!choice.status)questions.push({id:m.id,path:d.path,blocking:true,message:'受阻旧状态不能推断原推进阶段，请明确status并保留blocker。'});
      status=choice.status??status;
      Object.assign(next,{status,status_reason:m.status_reason??null,resume_status:m.resume_status??null});
      if(m.kind==='task')next.work_type=m.work_type??'delivery';
      Object.assign(next,choice);
      if(status==='paused'&&(!next.resume_status||!next.status_reason))questions.push({id:m.id,path:d.path,blocking:true,message:'请明确暂停前状态及暂停原因。'});
      if(status==='cancelled'&&!next.status_reason)next.status_reason='保留旧记录的取消结论；原原因及成果见原件。';
      if(status!=='blocked'&&!MAIN_STATES.includes(status))fail('PROJECT_GOVERNANCE_MIGRATION','不支持目标状态。');
    }else if(Object.keys(choice).length)fail('PROJECT_GOVERNANCE_MIGRATION','复盘记录不使用主状态映射。');
    changes.push({path:d.path,ifMatch:d.etag,metadata:next});rows.push({id:m.id,path:d.path,from:m.status,to:next.status??m.status,blocker:m.blocker??null,work_type:next.work_type??null});
  }
  for(const id of Object.keys(mapping.objects??{}))if(!sources.some(d=>d.metadata.id===id))fail('PROJECT_GOVERNANCE_MIGRATION','映射对象不在本次升级范围：'+id);
  const receiver=selected.find(d=>d.metadata.kind==='task'&&d.metadata.id===mapping.evidence_task_id);
  if(!receiver)fail('PROJECT_GOVERNANCE_MIGRATION','需要evidence_task_id指定保存备份的现行任务。');
  const folder=dirname(receiver.path),backup=folder+'/00-统一状态迁移前原件';
  const inventory={fromSchema:1,toSchema:SCHEMA,roots:[...roots],rows,questions,sources:sources.map(d=>({path:d.path,digest:d.etag,backup:backup+'/'+d.path+'.txt'}))};
  for(const d of sources)changes.push({path:backup+'/'+d.path+'.txt',ifMatch:'missing',contentBase64:snapshot(root,d.path).bytes.toString('base64')});
  changes.push({path:folder+'/10-统一状态迁移清单.json',ifMatch:'missing',contentBase64:Buffer.from(JSON.stringify(inventory,null,2)+'\n').toString('base64')});
  return {alreadyMigrated:false,requiresReview:true,approvalDigest:digest({mapping,inventory}),ifMatch:state.etag,inventory,changes};
}
export function upgradeStatusGovernance(root,name,scope,data={},options={}){
  const proposal=statusUpgradeProposal(root,name,scope,data.mapping??{});
  if(proposal.alreadyMigrated)return {...proposal.state,alreadyMigrated:true,changed:false};
  if(options.dryRun||!data.approvalDigest)return {...proposal,changed:false,dryRun:true};
  if(proposal.inventory.questions.some(q=>q.blocking))fail('PROJECT_GOVERNANCE_MIGRATION','先明确旧受阻/暂停状态的实际映射。',{issues:proposal.inventory.questions});
  if(data.approvalDigest!==proposal.approvalDigest)fail('PROJECT_GOVERNANCE_CONFLICT','映射或来源已变化，请重新预演。');
  return applyGovernance(root,name,scope,{operationId:data.operationId,ifMatch:proposal.ifMatch,changes:proposal.changes},options);
}
