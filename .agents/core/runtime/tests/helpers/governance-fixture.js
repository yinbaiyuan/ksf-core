import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultMetadata,criteriaDigest,hash} from '../../src/projects/governance/model.js';
import {projectGovernance} from '../../src/services/project-governance.js';
export function fixture(t,name='示例'){
  const root=mkdtempSync(join(tmpdir(),'ksf-gov-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'项目',name),{recursive:true});writeFileSync(join(root,'项目',name,'project.md'),'---\nname: '+name+'\n---\n# 项目\n');
  const pp='项目/'+name+'/project.md',mp='项目/'+name+'/M1-交付/milestone.md',tp='项目/'+name+'/M1-交付/T1-验证/task.md';
  const r=(id,path)=>({id,path}),p=defaultMetadata('project','p_'+name,name),m=defaultMetadata('milestone','m_'+name,'交付'),task=defaultMetadata('task','t_'+name,'验证');
  // Stable IDs are independent of Chinese directory names.
  p.id='p1';m.id='m1';task.id='t1';p.status='active';p.phase='execution';p.owner='Agent';p.next_action='完成交付';p.goals=[{id:'g1',title:'取得可验证成果'}];p.criteria=[{id:'p_done',text:'整体交付达成'}];p.milestones=[r('m1',mp)];p.focus_milestones=[r('m1',mp)];
  m.status='active';m.project=r('p1',pp);m.goal_ids=['g1'];m.criteria=[{id:'m_done',text:'阶段结果达成'}];m.tasks=[r('t1',tp)];m.next_action='核对本阶段结果';
  task.project=r('p1',pp);task.milestone=r('m1',mp);task.goal_ids=['g1'];task.owner='Agent';task.next_action='取得验证证据';task.commitment='now';task.criteria=[{id:'t_done',text:'假设得到验证或排除'}];
  const call=(operation='read',data,dryRun=false)=>projectGovernance({root,name,operation,data,dryRun});let count=0;
  const read=()=>call().data;
  const change=(path,metadata,body)=>({path,ifMatch:read().documents.find(d=>d.path===path)?.etag??(path===pp?read().project.etag:'missing'),...(metadata?{metadata}:{}),...(body!==undefined?{body}:{})});
  const apply=(changes,extra={})=>call('apply',{operationId:'test-operation-'+(++count),ifMatch:read().etag,changes,...extra});
  const initialize=()=>apply([change(pp,p,'# 项目\n\n方案与约束。\n'),change(mp,m,'# 里程碑\n\n阶段结果。\n'),change(tp,task,'# 任务\n\n验证结果可以为负面结论。\n')]);
  const proof=(metadata,path,text)=>({basis_digest:criteriaDigest(metadata),results:metadata.criteria.map(c=>({criterion_id:c.id,result:'passed',reviewer:'测试核验者',reviewed_at:new Date().toISOString(),evidence:[{path,digest:hash(text)}]}))});
  return {root,name,pp,mp,tp,p,m,task,call,read,change,apply,initialize,proof};
}
