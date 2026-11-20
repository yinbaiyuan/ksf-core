import {projectCardHierarchy} from './hierarchy-model.js';

// A view of the existing document, never another source of business state.
export function resultSections(body='') {
  const names=['目标','当前结果','未决与缺口'];
  const sections=Object.fromEntries(names.map(name=>[name,[]]));
  const original=[];
  let current=null,fence=null;
  for(const line of body.split('\n')){
    const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if(marker){
      if(!fence)fence={char:marker[1][0],length:marker[1].length};
      else if(marker[1][0]===fence.char&&marker[1].length>=fence.length&&/^\s{0,3}(`+|~+)\s*$/.test(line))fence=null;
    }else if(!fence){
      const heading=line.match(/^ {0,3}(#{1,2})\s+(.+?)\s*#*\s*$/);
      if(heading){
        current=heading[1]==='##'&&names.includes(heading[2])?heading[2]:null;
        if(current)continue;
      }
    }
    (current?sections[current]:original).push(line);
  }
  return {sections:Object.fromEntries(names.map(name=>[name,sections[name].join('\n').trim()])),original:original.join('\n').trim()};
}

export function taskProgressAction(document,record){
  const m=document.metadata;
  if(record.readOnly||record.valid===false||['completed','cancelled'].includes(m.status))return null;
  if(record.project){
    const branch=projectCardHierarchy(record).branches.find(b=>b.tasks.some(t=>t.path===document.path&&t.metadata.id===m.id));
    if(!branch||['completed','cancelled'].includes(record.project.metadata.status)||['completed','cancelled'].includes(branch.milestone.metadata.status))return null;
    const reasons=[];
    for(const d of [record.project,branch.milestone]){
      if(['paused','planned'].includes(d.metadata.status))reasons.push('所属'+(d.metadata.kind==='project'?'项目':'里程碑')+'尚未处于可执行环节');
      if(d.metadata.status==='review'&&m.work_type!=='acceptance')reasons.push('所属层级待验收，交付返工须先核对阶段状态');
    }
    if(reasons.length)return {label:'核对推进条件',intent:'先核对所属层级及任务条件，不自动恢复或重开阶段',reasons};
  }
  const ready=record.projection?.readiness?.find(row=>row.id===m.id&&row.path===document.path);
  if(m.status==='planned'&&ready?.ready!==true)return {label:'核对启动条件',intent:'先核对启动条件，缺口未解除不要启动',reasons:ready?.reasons??['启动条件尚未核对']};
  const action={planned:['开始此任务','在启动条件满足后开始本任务'],active:['继续此任务','继续当前任务内部的必要工作'],paused:['核对后恢复','先核对暂停原因与恢复条件，再恢复原环节'],review:['继续验收','按原完成条件继续验收和补证，不以程序成功代替业务验收']}[m.status];
  return action?{label:action[0],intent:action[1],reasons:[]}:null;
}

export function taskProgressPrompt(document,record,projectName){
  const action=taskProgressAction(document,record);
  if(!action)return null;
  const m=document.metadata;
  return ['请在项目「'+projectName+'」中'+action.label+'：'+m.name+'（稳定ID：'+m.id+'）。',
    '先读取 '+record.path+'、'+m.milestone.path+' 和 '+document.path+'，再按当前索引选择必要原件；将同一任务入口保存到 taskRef；查看和准备草稿不取得执行占用。开始实际执行前用 context execute 的 acquire 动作获取本任务占用，遇到其他聊天占用先停止执行并说明来源；显式接手前核对旧运行和未决操作。外部动作及执行保存前检查令牌，交还用户或结束时释放占用。',
    action.intent+'。'+(action.reasons.length?'当前原因：'+action.reasons.join('；')+'。':''),
    '下一步：'+(m.next_action??'核对当前结果和未决缺口'),
    '用户发送这条指令后，在本任务的输入、依赖、容量和授权边界内连续推进，维护同一稳定任务，不按讨论、测试或返工另建任务。不要自动暂停其他任务或扩大范围。',
    '本次执行单位是这个任务，不为具体工作新增里程碑，不顺次执行所属阶段的其他任务；无合适阶段时先给归属建议，等待用户确定。',
    '按完成条件读取实际产物和证据；充分则完成并清空本任务 next_action，需要用户体验、业务判断或未知外部结果则保留待验收。',
    '收尾后核对阶段缺口，在所属里程碑 next_action 给出一项下一任务建议及理由，等待用户选择，不启动下一任务。每个里程碑须用户明确确认后完成，局部成功或停止尝试不作为阶段确认。未知外部操作先对账。'].join('\n\n');
}

export function milestoneTasks(document,record){
  const m=document.metadata;
  return (m.tasks??[]).map(ref=>record.documents.find(d=>d.path===ref.path&&d.metadata.id===ref.id&&d.metadata.kind==='task'
    &&d.metadata.milestone?.id===m.id&&d.metadata.milestone?.path===document.path
    &&d.metadata.project?.id===m.project?.id&&d.metadata.project?.path===m.project?.path)).filter(Boolean);
}

export function workTasks(subject,record){
  const hierarchy=projectCardHierarchy(record),m=subject.metadata;
  const branches=hierarchy.branches.filter(b=>m.kind==='project'?subject.path===hierarchy.project.path&&m.id===hierarchy.project.metadata.id:b.milestone.path===subject.path&&b.milestone.metadata.id===m.id);
  const available=branches.filter(b=>!['completed','cancelled'].includes(b.milestone.metadata.status)).flatMap(b=>b.tasks);
  const tasks=['completed','cancelled'].includes(m.status)?[]:available.filter(t=>!['completed','cancelled'].includes(t.metadata.status));
  const current=tasks.filter(t=>['active','review'].includes(t.metadata.status));
  const focused=tasks.filter(t=>branches.some(b=>b.milestone.metadata.focus_tasks?.some(r=>r.id===t.metadata.id&&r.path===t.path)
    &&(m.kind==='milestone'||hierarchy.project.metadata.focus_milestones?.some(r=>r.id===b.milestone.metadata.id&&r.path===b.milestone.path))));
  const explicit=current.length?current:focused;
  return {current,focused,candidates:tasks.filter(t=>!explicit.includes(t)),primary:explicit.length===1?explicit[0]:null};
}

export function milestoneAcceptancePrompt(subject,record,projectName){
  if(record.readOnly||record.valid===false||!['active','review'].includes(subject.metadata.status)||!projectCardHierarchy(record).branches.some(b=>b.milestone.path===subject.path&&b.milestone.metadata.id===subject.metadata.id))return null;
  return ['请在项目「'+projectName+'」中核对里程碑「'+subject.metadata.name+'」的阶段验收（稳定ID：'+subject.metadata.id+'）。',
    '先读取 '+record.path+'、'+subject.path+' 及其 review_ref 指向的复盘，按当前索引补读实际证据。',
    '只核对本阶段标准、证据及必需下级工作，整理验收结论与遗留；复用明确的验收任务，不自动开展交付或新增阶段。',
    'Agent 预检可记录逐项通过，但阶段复盘保留 draft/pending；具备验收条件后里程碑置 review，向用户呈现阶段、交付版本、证据与确认范围，等待用户明确确认。',
    '只有用户针对该阶段明确确认通过后，才用同一治理事务完成复盘和里程碑，并记录实际确认来源、时间、原生轮次及范围。局部“可以了”或停止尝试不作为阶段确认。阶段完成不启动下一任务或下一阶段。'].join('\n\n');
}

/** Candidate for the existing governance check/apply transaction; calling this never writes. */
export function milestoneCompletionChanges(subject,review,record,{basis,at}={}){
  const m=subject.metadata,v=review.metadata,fail=message=>{throw Error(message);};
  if(record.readOnly||record.valid===false||!['active','review'].includes(record.project.metadata.status))fail('当前项目不可进行阶段确认。');
  const branch=projectCardHierarchy(record).branches.find(b=>b.milestone.path===subject.path&&b.milestone.metadata.id===m.id);
  if(!branch||!['active','review'].includes(m.status))fail('请选择本项目正在进行或待验收的里程碑。');
  if(v.kind!=='review'||m.review_ref?.id!==v.id||m.review_ref?.path!==review.path||v.subject?.id!==m.id||v.subject?.path!==subject.path)fail('阶段与复盘的身份及双向引用不一致。');
  if(m.blocker)fail('阶段阻塞尚未解除。');
  if(!m.criteria?.length||!basis||v.basis_digest!==basis)fail('验收依据与当前阶段标准不一致，请重新核对。');
  if(branch.tasks.length!==(m.tasks??[]).length||branch.tasks.some(t=>!['completed','cancelled'].includes(t.metadata.status)))fail('仍有未结束或归属失效的下级任务。');
  const rows=v.criterion_results??[];
  if(rows.length!==m.criteria.length||new Set(rows.map(r=>r.criterion_id)).size!==rows.length||m.criteria.some(c=>{
    const r=rows.find(r=>r.criterion_id===c.id);
    return !r||r.result!=='passed'||!r.reviewer?.trim()||!Number.isFinite(Date.parse(r.reviewed_at))||!r.evidence?.length;
  }))fail('阶段条件尚未全部取得通过证据。');
  if(!Number.isFinite(Date.parse(at)))fail('阶段确认需要实际时间。');
  return [{path:subject.path,ifMatch:subject.etag,metadata:{...m,status:'completed',next_action:null}},
    {path:review.path,ifMatch:review.etag??'missing',metadata:{...v,status:'completed',outcome:'passed',next_action:null},body:review.body}];
}
