import type {RunAnswer,RunCapability,RunPhase,RunQuestion,RunView} from '@ksf/sdk/controllers';
import {resourceSnapshot,type UIResource} from '@ksf/sdk/controllers';
import {conversationAnchor} from '@ksf/sdk/controllers';

export type AIRequestState='waiting'|'submitting'|'accepted'|'confirmed'|'expired'|'failed'|'unknown';
export const requestStateLabels:Record<AIRequestState,string>={waiting:'等待处理',submitting:'正在提交',accepted:'已受理，等待确认',confirmed:'已确认处理',expired:'请求已失效',failed:'提交失败',unknown:'处理结果待核实'};
export function requestActionable(state:AIRequestState,capability:RunCapability):boolean{return (state==='waiting'||state==='failed')&&capability.state==='available';}
export function promptSnapshot(draft:string,draftVersion:number,resources:readonly UIResource[]){
 if(!Number.isSafeInteger(draftVersion)||draftVersion<0)throw Error('草稿版本需要为非负安全整数。');
 return Object.freeze({draft,draftVersion,resources:resourceSnapshot(resources)});
}
export function questionSchemaIssue(request:RunQuestion):string|null{
 if(request?.answerFormat!=='single-text'||!request.version||!request.turnId||!request.request||!['number','string'].includes(request.request.type)||typeof request.request.value!=='string'||!request.request.value||!Array.isArray(request.questions)||!request.questions.length)return '当前问题结构需要在原生界面处理。';
 const ids=new Set<string>();for(const question of request.questions){
  if(!question||typeof question.id!=='string'||!question.id||ids.has(question.id)||typeof question.question!=='string')return '问题需要唯一标识和有效文本。';ids.add(question.id);
  if(question.options!==undefined&&(!Array.isArray(question.options)||question.options.some(option=>!option||typeof option.label!=='string'||!option.label.trim())||new Set(question.options.map(option=>option.label)).size!==question.options.length))return '当前问题选项需要在原生界面处理。';
 }
 return null;
}
/** Single-text is the actual Desktop contract, not an inferred multi-select schema. */
export function answerSnapshot(request:RunQuestion,values:Readonly<Record<string,string>>):Readonly<RunAnswer>{
 const schemaIssue=questionSchemaIssue(request);if(schemaIssue)throw Error(schemaIssue);
 const ids=new Set<string>(),answers:Record<string,string>={};
 for(const question of request.questions){
  if(!question.id||ids.has(question.id))throw Error('问题需要唯一标识。');ids.add(question.id);
  const value=values[question.id];if(typeof value!=='string'||!value.trim()||value.length>8000)throw Error('请为每题填写一个不超过8000字符的回答。');
  if(question.options?.length&&question.isOther===false&&!question.options.some(option=>option.label===value))throw Error('请从该问题提供的选项中选择。');
  Object.defineProperty(answers,question.id,{value,enumerable:true});
 }
 return Object.freeze({version:request.version,turnId:request.turnId,request:Object.freeze({...request.request}),answers:Object.freeze(answers)});
}
const executionLabels:Record<string,string>={queued:'排队中',running:'执行中','not-started':'尚未开始','retry-wait':'等待重试',succeeded:'执行成功',completed:'执行已结束',failed:'执行失败',cancelled:'执行标记为已取消',unknown:'执行状态待核实',idle:'空闲'};
const phaseLabels:Record<RunPhase,string>={queued:'排队中',running:'运行中','retry-wait':'等待重试',reconciling:'正在核对','waiting-input':'有输入待处理','waiting-native':'需要原生处理',stopping:'停止待核实',succeeded:'执行成功',failed:'执行失败',cancelled:'已标记取消',unknown:'运行阶段待核实'};
/** A queued job can be cancelled even when no process is active yet. Capability owns action availability. */
export function canRequestStop(view:RunView):boolean{
 const observation=view.observation;
 return !!view.identity&&!!observation&&observation.capabilities.cancel.state==='available'&&!['succeeded','failed','cancelled'].includes(observation.phase)&&view.cancellation?.state!=='accepted'&&view.cancellation?.state!=='unknown';
}
/** Native history is a distinct provenance; it never becomes a service-verified task result. */
export function resultReadyForIntent(view:RunView):boolean{
 const observation=view.observation,record=observation?.result.record;
 if(!observation||!record||!view.identity||record.truncated||view.submission.state==='unknown'||observation.phase==='unknown'||observation.capabilities.results.state!=='available'||view.source!==record.source||view.identity.source!==record.source||observation.identity.source!==record.source||record.version!==observation.version)return false;
 const original=view.identity,observed=observation.identity;
 if(observed.source==='ai-task-v1'){
  if(original.source!=='ai-task-v1'||original.idempotencyKey!==observed.idempotencyKey||!observed.aiTaskId||record.runId!==observed.aiTaskId||original.aiTaskId&&original.aiTaskId!==observed.aiTaskId)return false;
 }else if(original.source!=='codex-conversations-v1'||original.operationId!==observed.operationId||original.threadId!==observed.threadId||!conversationAnchor(observed)||conversationAnchor(original)!==conversationAnchor(observed)||record.runId!==observed.threadId+'/'+conversationAnchor(observed))return false;
 return record.source==='ai-task-v1'&&record.persistence==='service-verified'&&observation.result.state==='verified'||record.source==='codex-conversations-v1'&&record.persistence==='native-history'&&observation.phase==='succeeded'&&observation.stopConfirmed===true;
}
/** Presentation axes preserve the underlying observation; connection loss never invents a terminal outcome. */
export function runStatusAxes(view:RunView){
 const observation=view.observation;
 return Object.freeze({
  submission:({idle:'尚未提交',submitting:'正在提交',accepted:'提交已受理',unknown:'提交结果待核实',failed:'提交失败'} as const)[view.submission.state],
  phase:observation?phaseLabels[observation.phase]:'尚未取得运行阶段',
  execution:observation?(executionLabels[observation.executionStatus]??observation.executionStatus):'尚未取得执行快照',
  attention:observation?.phase==='waiting-input'?'有公开问题待回答':observation?.phase==='waiting-native'?'需要原生界面处理':observation?.phase==='reconciling'?'正在核对原运行':null,
  connection:({idle:'尚未连接',connecting:'正在连接',connected:'已连接',disconnected:'连接中断，保留上次快照'} as const)[view.connection],
  stop:observation?.stopConfirmed===true?observation.phase==='queued'?'尚未开始执行':observation.phase==='retry-wait'?'前次执行已停止':'已确认停止':view.cancellation?.state==='unknown'?'停止请求结果待核实':view.cancellation?.state==='failed'?'停止请求失败':view.cancellation?.state==='accepted'||observation?.cancelRequested?'已请求停止，等待实际确认':observation?.stopConfirmed===false?'尚未确认停止':'未取得停止确认',
  result:!observation?'尚未取得结果状态':({none:'尚无结果',available:'结果已报告，等待核实',verified:'结果已核实',unknown:'结果待核实'} as const)[observation.result.state],
 });
}
