import {digest,fail,object,timestamp} from './model.js';
import {createTaskReviewSource} from '../../services/task-review.js';
import {projectMergeRecords} from './locations.js';

export function confirmationScope(subject,review,graph){
  const m=subject.metadata;
  const versions=value=>Array.isArray(value)?value.map(versions):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='path').map(([key,v])=>[key,versions(v)])):value;
  return digest({subject:m.id,project:m.project?.id,criteria:m.criteria,
    results:versions(review.metadata.criterion_results),
    children:(m.tasks??[]).map(ref=>{const d=graph.docs.get(ref.path);return {id:ref.id,status:d?.metadata.status,reason:d?.metadata.status_reason,verification:versions(d?.metadata.verification)};})});
}
export function confirmationValid(subject,review,graph){
  const c=review?.metadata.user_confirmation;
  if(!c||c.subject?.id!==subject.metadata.id||!timestamp(c.confirmed_at)||!['workbench','chat'].includes(c.source?.kind)||!/^[a-f0-9]{64}$/.test(c.scope_digest??''))return false;
  const scope=confirmationScope(subject,review,graph);
  if(c.subject.path===subject.path&&c.scope_digest===scope)return true;
  const roots=[...graph.docs.values()].filter(d=>d.metadata.kind==='project');
  return projectMergeRecords(graph.root,roots,graph.overlay?.mergeRecords).some(r=>r.targetProject.id===subject.metadata.project?.id&&r.confirmations?.some(e=>e.id===subject.metadata.id&&e.from===c.subject.path&&e.beforeScope===c.scope_digest&&e.confirmationDigest===digest(c)&&e.afterScope===scope));
}
function chatSource(root,input){
  if(!object(input)||typeof input.chat_id!=='string'||typeof input.turn_id!=='string'||typeof input.message_id!=='string')fail('PROJECT_CONFIRMATION_SOURCE','对话确认需要真实聊天、轮次和用户消息入口。');
  const reader=createTaskReviewSource(root);let offset=0;
  while(true){
    let page;try{page=reader.read({taskId:input.chat_id,turnId:input.turn_id,offset,limit:100});}catch{fail('PROJECT_CONFIRMATION_SOURCE','用户原始消息尚不可核验，请同步原轮次后重试，或由用户在工作台确认。');}
    const message=page.messages.find(m=>m.id===input.message_id);
    if(message){
      if(message.role!=='user'||message.truncated||!message.text.trim())fail('PROJECT_CONFIRMATION_SOURCE','确认来源必须是完整的实际用户消息。');
      return {record:{kind:'chat',chat_id:input.chat_id,turn_id:input.turn_id,message_id:message.id,message_digest:digest(message.text),revision:page.revision},quote:message.text};
    }
    if(page.nextOffset===null)break;offset=page.nextOffset;
  }
  fail('PROJECT_CONFIRMATION_SOURCE','没有找到指定的实际用户消息。');
}
export function prepareConfirmation(root,state,input,caller){
  const subject=state.graph.docs.get(input?.subject?.path),m=subject?.metadata;
  if(!m||m.kind!=='milestone'||m.id!==input.subject.id)fail('PROJECT_CONFIRMATION_SUBJECT','请选择本项目的明确里程碑。');
  const review=state.graph.docs.get(m.review_ref?.path);
  if(!review||review.metadata.id!==m.review_ref?.id||review.metadata.subject?.id!==m.id||review.metadata.subject?.path!==subject.path)fail('PROJECT_CONFIRMATION_SUBJECT','里程碑与复盘引用不一致。');
  const scope=confirmationScope(subject,review,state.graph);
  if(input.scope_digest!==scope)fail('PROJECT_CONFIRMATION_CHANGED','阶段条件、证据或下级结果已变化，请重新核对确认范围。');
  let source,quote;
  if(input.source?.kind==='workbench'){
    if(caller?.source!=='surface'||caller?.humanWindow!==true||caller?.appId!=='com.ksf.projects')fail('PROJECT_CONFIRMATION_SOURCE','工作台确认需要本实例项目窗口的真实调用来源。');
    source={kind:'workbench',app_id:caller.appId,instance_id:caller.instanceId};
  }else if(input.source?.kind==='chat')({record:source,quote}=chatSource(root,input.source));
  else fail('PROJECT_CONFIRMATION_SOURCE','需要工作台或实际用户对话确认来源。');
  const confirmation={subject:{id:m.id,path:subject.path},scope_digest:scope,confirmed_at:new Date().toISOString(),source};
  const body=review.body.trimEnd()+'\n\n## 用户阶段确认\n\n确认方式：'+(source.kind==='workbench'?'用户在工作台明确点击“确认本里程碑通过并完成”。':'用户对话，聊天 '+source.chat_id+'，轮次 '+source.turn_id+'，消息 '+source.message_id+'。')+
    '\n确认时间：'+confirmation.confirmed_at+'\n阶段：'+m.id+'（'+subject.path+'）\n确认范围摘要：'+scope+'\n'+(quote?'\n用户原文：\n'+quote+'\n':'');
  return {path:review.path,confirmation,body};
}
export function requireMilestoneConfirmation(before,after,data){
  for(const d of after.graph.docs.values()){
    if(d.metadata.kind!=='milestone'||d.metadata.status!=='completed')continue;
    const previous=before.graph.docs.get(d.path),review=after.graph.docs.get(d.metadata.review_ref?.path);
    const newCompletion=!previous||previous.metadata.status!=='completed';
    if(newCompletion&&data.confirmMilestone?.subject?.id!==d.metadata.id)fail('PROJECT_CONFIRMATION_REQUIRED','里程碑完成须取得用户对本阶段的明确确认。',{target:d.path});
    const touched=data.changes.some(c=>c.path===d.path||c.path===review?.path);
    if((newCompletion||touched&&review?.metadata.user_confirmation)&&!confirmationValid(d,review,after.graph))fail('PROJECT_CONFIRMATION_CHANGED','阶段确认缺失或已不对应当前条件与证据。',{target:d.path});
  }
}
