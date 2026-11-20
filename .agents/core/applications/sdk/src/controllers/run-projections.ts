import type {AITask,AIResult} from '../ai-tasks.ts';
import type {ConversationSnapshot} from '../codex-conversations.ts';
import type {RunCapabilities,RunCapability,RunIdentity,RunObservation,RunPhase} from './run-types.ts';

const capability=(state:RunCapability['state'],reason:string):RunCapability=>({state,reason});
export function projectAITask(task:AITask,identity:Extract<RunIdentity,{source:'ai-task-v1'}>,result?:AIResult):RunObservation {
  const attempt=task.execution.attempts.at(-1),stopConfirmed=attempt?attempt.stopConfirmed:!['running','reconciling'].includes(task.status)?true:null;
  const phase:RunPhase=task.status==='retry_wait'?'retry-wait':task.status==='cancelled'&&stopConfirmed!==true?'stopping':task.status;
  const terminal=['succeeded','failed','cancelled'].includes(task.status),artifact=task.output?.artifacts[0];
  const capabilities:RunCapabilities={
    cancel:capability(terminal?'unavailable':'available',terminal?'本任务已进入终态；原进程停止事实另行显示。':'取消任务请求；实际停止需等待确认。'),
    results:capability(task.status==='succeeded'?'available':'unavailable','成功结果由AI任务服务持久保存，readResult核对摘要；业务采用由应用决定。'),
    toolEvents:capability('unsupported','ai-task-v1目前公开状态事件，未公开结构化工具记录。'),
    publicQuestions:capability('unsupported','通用任务没有运行内公开问答契约。'),
    nativeApprovals:capability('unsupported','通用任务不代理原生审批。'),privateInput:capability('unsupported','通用任务不代理私密输入。'),
  };
  const verified=!!result&&!!artifact&&result.resultId===artifact.resultId&&result.sha256===artifact.sha256;
  return {identity:{...identity,aiTaskId:task.aiTaskId},version:String(task.revision),rawStatus:task.status,executionStatus:attempt?.executionOutcome??'not-started',phase,stopConfirmed,cancelRequested:!!task.timestamps.cancelRequestedAt,capabilities,
    tools:{records:[],total:null,truncated:false,scope:'unsupported'},questions:[],native:{approvals:false,privateInput:false},error:task.error,
    result:result&&!verified?{state:'unknown',record:null,error:{code:'RUN_RESULT_MISMATCH',message:'成功结果与本次任务的持久摘要不一致，请先核对。',outcomeUnknown:true}}:verified?{state:'verified',record:{runId:task.aiTaskId,source:'ai-task-v1',version:String(task.revision),format:result.format,value:result.value,sha256:result.sha256,persistence:'service-verified'}}:
      task.output?{state:'available',record:{runId:task.aiTaskId,source:'ai-task-v1',version:String(task.revision),format:task.output.format,value:task.output.value,...(artifact?{sha256:artifact.sha256}:{}),persistence:'service-reported'}}:{state:'none',record:null}};
}

export const conversationAnchor=(identity:Extract<RunIdentity,{source:'codex-conversations-v1'}>)=>identity.continuation?.turnId??identity.turnId;
export function projectConversation(snapshot:ConversationSnapshot,identity:Extract<RunIdentity,{source:'codex-conversations-v1'}>):RunObservation {
  const last=snapshot.lastTurn,anchor=conversationAnchor(identity)??last?.turnId;
  const mismatch=!!conversationAnchor(identity)&&last?.turnId!==conversationAnchor(identity);
  const supported=!!snapshot.viewCapabilities?.turnOutcomes,toolsSupported=snapshot.viewCapabilities?.toolEvents==='native-metadata-v1'&&!!snapshot.tools;
  const current=snapshot.turnId===anchor,privateInput=snapshot.privateInput===true;
  let phase:RunPhase='unknown';
  if(!mismatch&&supported&&last){
    if(snapshot.approvals||privateInput)phase='waiting-native';else if(snapshot.questions.some(q=>q.turnId===anchor))phase='waiting-input';
    else if(last.status==='completed')phase='succeeded';else if(last.status==='failed')phase='failed';else if(last.status==='cancelled')phase='cancelled';
    else if(current)phase=snapshot.approvals||privateInput?'waiting-native':snapshot.questions.length?'waiting-input':'running';
  }
  const final=!mismatch&&last?.status==='completed'?snapshot.messages.filter(m=>m.turnId===anchor&&m.role==='assistant'&&['final_answer','final'].includes(m.phase??'')).at(-1):undefined;
  const capabilities:RunCapabilities={
    cancel:capability(current&&!mismatch?'available':'unavailable',current&&!mismatch?'按原轮次请求停止；IPC受理与实际停止分别显示。':'此页未持有可确认的活动轮次。'),
    results:capability(supported?final?'available':'unavailable':'unsupported',supported?'结果来自原生历史，未代表应用已采用或写入业务数据。':'旧宿主未公开可靠的轮次结束事实。'),
    toolEvents:capability(toolsSupported?mismatch?'unavailable':'available':'unsupported',mismatch?'原会话已进入其他轮次，当前快照不包含原轮次工具记录。':toolsSupported?'仅最新轮次的命令/MCP/文件变更结构元数据，原始参数与输出留在原生界面。':'当前宿主未提供结构化原生工具投影。'),
    publicQuestions:capability(snapshot.viewCapabilities?.publicQuestions==='single-text-v1'?snapshot.questions.some(q=>q.turnId===anchor)?'available':'unavailable':'unsupported','每题仅一个字符串，携带当前版本与原生问题身份；不把选项数组当多选回答。'),
    nativeApprovals:capability(snapshot.approvals?'available':'unavailable','原生审批通过打开Desktop处理；此接口不提供批准按钮。'),
    privateInput:capability(privateInput?'available':'unavailable','私密输入只在Desktop处理，不向应用传递问题或答案。'),
  };
  const tools=toolsSupported&&!mismatch&&snapshot.tools!.turnId===anchor?snapshot.tools!:null;
  return {identity:{...identity,threadId:snapshot.threadId,...(identity.turnId??anchor?{turnId:identity.turnId??anchor}:{})},version:snapshot.version,rawStatus:snapshot.status,executionStatus:mismatch?'unknown':last?.status??'unknown',phase,
    stopConfirmed:mismatch||!supported||!last?null:['completed','failed','cancelled'].includes(last.status)?true:last.status==='running'?false:null,
    cancelRequested:false,capabilities,tools:tools?{...tools,records:tools.records,scope:'latest-turn'}:{records:[],total:null,truncated:false,scope:toolsSupported?'unavailable':'unsupported'},
    questions:!mismatch?snapshot.questions.filter(q=>q.turnId===anchor).map(q=>({...q,version:snapshot.version,answerFormat:'single-text'})):[],native:{approvals:snapshot.approvals,privateInput,...(snapshot.plan?{planRevision:snapshot.plan.revision}:{})},
    result:final?{state:'available',record:{runId:snapshot.threadId+'/'+anchor,source:'codex-conversations-v1',version:snapshot.version,format:'text',value:final.text,persistence:'native-history',truncated:!!final.truncated}}:{state:phase==='succeeded'?'unknown':'none',record:null},
    error:mismatch?{code:'RUN_TURN_CHANGED',message:'原会话已进入其他轮次，不能把新轮次结果归入本次请求。',outcomeUnknown:true}:null};
}
