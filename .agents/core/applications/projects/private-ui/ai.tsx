import {useId,type HTMLAttributes,type ReactNode} from 'react';
import {ArrowUp,ArrowUpRight,Paperclip,Square} from 'lucide-react';
import {Button,RadioGroup,Textarea,type ControlTone} from './controls';
import {Field} from './field';
import {Badge,Disclosure,InlineAlert} from './feedback';
import {ContentState,Form,SaveStatus,type ContentLoadState,type SaveStatusProps} from './collections';
import {ContentPreview,ResourceList,type ContentPreviewProps} from './resources';
import {useUI} from './provider';
import {stableIds} from './composition-model';
import {answerSnapshot,promptSnapshot,questionSchemaIssue,requestActionable,requestStateLabels,runStatusAxes,resultReadyForIntent,canRequestStop,type AIRequestState} from './ai-model';
import type {UIValueChangeDetail} from './events';
import type {UIResource} from '@ksf/sdk/controllers';
import type {RunAnswer,RunCapability,RunObservation,RunQuestion,RunView} from '@ksf/sdk/controllers';
import type {ConversationToolEvent} from '@ksf/sdk/codex-conversations';
export type {AIRequestState} from './ai-model';

type ContainerProps=Omit<HTMLAttributes<HTMLDivElement>,'title'|'onChange'>;
const requestTone=(state:AIRequestState):ControlTone=>state==='confirmed'?'success':state==='failed'?'danger':state==='unknown'||state==='expired'?'warning':'info';
function RequestStateBadge({state}:{state:AIRequestState}){const ui=useUI();return <Badge tone={requestTone(state)} role="status" aria-live={ui.environment.active&&ui.environment.visible?'polite':'off'} aria-atomic>{requestStateLabels[state]}</Badge>;}
function NativeAction({onOpenNative,reason}:{onOpenNative?:()=>void;reason?:string}){return <InlineAlert title={onOpenNative?'在原生界面处理':'处理入口暂不可用'} description={reason??'该交互由Desktop原生界面持有。'} actions={onOpenNative?<Button icon={<ArrowUpRight/>} onActivate={onOpenNative}>打开原生界面</Button>:undefined}/>;}

export interface PromptComposerProps extends ContainerProps {
 draft:string;draftVersion:number;onDraftChange:(draft:string,detail:UIValueChangeDetail)=>void;
 resources?:readonly UIResource[];onAddResourcesIntent?:()=>void;onRemoveResourceIntent?:(id:string)=>void;
 submitState:RunView['submission']['state'];capability:RunCapability;validationMessage?:string;disabled?:boolean;
 label?:string;placeholder?:string;variant?:'plain'|'context';actions?:ReactNode;
 onSubmitIntent:(snapshot:ReturnType<typeof promptSnapshot>)=>void;onReconcileIntent?:()=>void;
}
/** Draft and request identities belong to the app. No automatic clearing, execution or shortcut listener. */
export function PromptComposer({draft,draftVersion,onDraftChange,resources=[],onAddResourcesIntent,onRemoveResourceIntent,submitState,capability,validationMessage,disabled=false,label='任务目标',placeholder='说明希望完成的工作，以及需要遵守的条件',variant='context',actions,onSubmitIntent,onReconcileIntent,className='',...props}:PromptComposerProps){
 const ui=useUI(),id=useId(),busy=submitState==='submitting',unknown=submitState==='unknown',unusable=capability.state!=='available',invalid=validationMessage??(!draft.trim()?'请填写任务目标':resources.some(item=>item.availability!=='available')?'请先核对不可用资源，或移除其引用':undefined);
 const errors=invalid?[{id:'prompt-validation',fieldId:id,message:invalid}]:[];
 return <div {...props} data-ksf-component="prompt-composer" data-variant={variant} data-state={submitState} className={`ksf-ai-panel ksf-prompt-composer ${className}`.trim()}>
  <Form noValidate errors={validationMessage?errors:[]} busy={busy} disabled={disabled} onSubmitIntent={()=>{if(!unknown&&!invalid&&!unusable&&ui.environment.active&&ui.environment.enabled)onSubmitIntent(promptSnapshot(draft,draftVersion,resources));}}>
   <Field id={id} label={label} error={validationMessage}><Textarea id={id} value={draft} onValueChange={onDraftChange} autoGrow rows={2} placeholder={placeholder}/></Field>
   {!!resources.length&&<ResourceList label="本次任务资源" variant="chips" resources={resources} onRemove={onRemoveResourceIntent} busy={busy||disabled}/>}
   {invalid&&!validationMessage&&<p className="ksf-ai-description">{invalid}</p>}{unusable&&<InlineAlert tone="warning" title="当前不能提交">{capability.reason}</InlineAlert>}
   {unknown&&<InlineAlert tone="warning" title="原提交结果待核实" actions={onReconcileIntent&&<Button onActivate={onReconcileIntent}>核对原提交</Button>}>草稿仍在。沿原请求核对后，再决定下一次提交。</InlineAlert>}
   <div className="ksf-ai-actions">{onAddResourcesIntent&&<Button variant="ghost" icon={<Paperclip/>} disabled={disabled||busy} onActivate={onAddResourcesIntent}>添加资源</Button>}{actions}<span className="ksf-ai-action-spacer"/><Button type="submit" variant="primary" icon={<ArrowUp/>} busy={busy} busyLabel="正在提交" disabled={disabled||unknown||unusable||!!invalid} disabledReason={invalid??(unusable?capability.reason:undefined)}>提交任务</Button></div>
  </Form>
 </div>;
}

export interface RunStatusProps extends ContainerProps {
 view:RunView;label?:string;startedAt?:string;finishedAt?:string;durationMs?:number;onCancelIntent?:()=>void;onReconcileIntent?:()=>void;
 onRetrySubmissionIntent?:()=>void;onRetryStopIntent?:()=>void;onOpenNative?:()=>void;
}
export function RunStatus({view,label='运行状态',startedAt,finishedAt,durationMs,onCancelIntent,onReconcileIntent,onRetrySubmissionIntent,onRetryStopIntent,onOpenNative,className='',...props}:RunStatusProps){
 const ui=useUI(),axes=runStatusAxes(view),observation=view.observation,stopPending=view.cancellation?.state==='accepted'||view.cancellation?.state==='unknown',capability=observation?.capabilities.cancel;
 const nativeReady=view.identity?.source==='codex-conversations-v1'&&!!view.identity.threadId;
 const tone:ControlTone=view.submission.state==='unknown'||view.connection==='disconnected'||observation?.phase==='unknown'?'warning':observation?.phase==='failed'?'danger':observation?.phase==='succeeded'?'success':'info';
 return <div {...props} data-ksf-component="run-status" data-phase={observation?.phase} className={`ksf-ai-panel ${className}`.trim()}>
  <div className="ksf-ai-heading"><h3>{label}</h3><Badge tone={tone}>{axes.submission}</Badge><Badge>{view.source==='ai-task-v1'?'AI任务':'Desktop会话'}</Badge></div>
  <dl className="ksf-run-axes" role="status" aria-live={ui.environment.active&&ui.environment.visible?'polite':'off'}>{[['阶段',axes.phase],['实际执行',axes.execution],['连接',axes.connection],['停止确认',axes.stop],['结果',axes.result]].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
  {(startedAt||finishedAt||durationMs!==undefined)&&<dl className="ksf-run-axes" aria-label="来源报告的运行时间">{startedAt&&<div><dt>开始</dt><dd><ReportedTime value={startedAt}/></dd></div>}{finishedAt&&<div><dt>结束</dt><dd><ReportedTime value={finishedAt}/></dd></div>}{durationMs!==undefined&&<div><dt>已报告耗时</dt><dd>{Number.isFinite(durationMs)&&durationMs>=0?new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(durationMs/1000)+'秒':'耗时待核实'}</dd></div>}</dl>}
  {axes.attention&&<InlineAlert title={axes.attention} description="待处理交互与执行状态分别呈现。"/>}
  {view.error&&<InlineAlert tone={view.error.outcomeUnknown?'warning':'danger'} title="运行需要处理">{view.error.message}</InlineAlert>}
  <div className="ksf-ai-actions">{onReconcileIntent&&<Button onActivate={onReconcileIntent}>核对原运行</Button>}{onCancelIntent&&<Button icon={<Square/>} disabled={!canRequestStop(view)} disabledReason={capability?.state!=='available'?capability?.reason:stopPending?'原停止请求尚待确认':undefined} onActivate={onCancelIntent}>请求停止</Button>}{(view.submission.state==='failed'&&!view.error?.outcomeUnknown||view.submission.state==='unknown'&&view.submission.receipt?.status==='missing')&&onRetrySubmissionIntent&&<Button onActivate={onRetrySubmissionIntent}>重试原提交</Button>}{view.cancellation?.state==='failed'&&onRetryStopIntent&&<Button onActivate={onRetryStopIntent}>重试原停止请求</Button>}{view.source==='codex-conversations-v1'&&onOpenNative&&<Button icon={<ArrowUpRight/>} disabled={!nativeReady} disabledReason={nativeReady?undefined:'需先取得原生会话身份'} onActivate={onOpenNative}>打开原生会话</Button>}</div>
 </div>;
}

function ReportedTime({value}:{value:string}){const date=new Date(value);return Number.isFinite(date.getTime())?<time dateTime={value}>{new Intl.DateTimeFormat(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date)}</time>:<span>时间待核实</span>;}

export interface ToolCallListProps extends ContainerProps {
 observation:Pick<RunObservation,'tools'|'capabilities'>|null;loadState?:ContentLoadState;
 expandedIds:readonly string[];onExpandedChange:(ids:readonly string[])=>void;onOpenOutputIntent?:(id:string)=>void;
 onOpenNative?:()=>void;hasMore?:boolean;onLoadMoreIntent?:()=>void;onRetryIntent?:()=>void;
}
const toolLabels:Record<ConversationToolEvent['status'],string>={queued:'待执行',running:'执行中',completed:'已完成',failed:'失败',cancelled:'已取消',unknown:'待核实'};
const toolName=(item:ConversationToolEvent)=>item.kind==='mcp'?[item.server,item.tool].filter(Boolean).join(' / ')||'MCP工具':item.kind==='file-change'?'文件变更':'命令执行';
export function ToolCallList({observation,loadState='ready',expandedIds,onExpandedChange,onOpenOutputIntent,onOpenNative,hasMore=false,onLoadMoreIntent,onRetryIntent,className='',...props}:ToolCallListProps){
 useUI();const tools=observation?.tools,capability=observation?.capabilities.toolEvents,records=tools?.records??[];stableIds(records,item=>item.id);const available=capability?.state==='available'&&tools?.scope==='latest-turn';
 return <div {...props} data-ksf-component="tool-call-list" className={`ksf-ai-panel ${className}`.trim()}><div className="ksf-ai-heading"><h3>工具调用</h3>{available&&loadState!=='unauthorized'&&<Badge>{records.length}{tools?.total!=null?' / '+tools.total:''} 条</Badge>}</div>
  <ContentState state={loadState==='unauthorized'?loadState:available?loadState==='ready'&&!records.length?'empty':loadState:'unavailable'} title={!available?'此执行路径未提供可展示的工具记录':undefined} description={!available?capability?.reason??'尚未取得能力快照。':tools?.truncated?'仅展示服务返回的最新轮次部分记录。':undefined} onRetry={onRetryIntent}>
   {tools?.truncated&&<InlineAlert title="工具记录不完整">当前为最新轮次的部分记录，不代表完整历史。</InlineAlert>}
   <ol className="ksf-tool-list">{records.map(item=><li key={item.id}><Disclosure open={expandedIds.includes(item.id)} onOpenChange={open=>onExpandedChange(open?[...expandedIds.filter(id=>id!==item.id),item.id]:expandedIds.filter(id=>id!==item.id))} title={<span className="ksf-tool-heading"><strong>{toolName(item)}</strong><Badge tone={item.status==='failed'?'danger':item.status==='completed'?'success':item.status==='unknown'?'warning':'neutral'}>{toolLabels[item.status]}</Badge></span>}>
    <ContentPreview format="structured-summary" content={{id:item.id,turnId:item.turnId,kind:item.kind,status:item.status,...(item.nativeStatus?{nativeStatus:item.nativeStatus}:{}),...(item.startedAt?{startedAt:item.startedAt}:{}),...(item.finishedAt?{finishedAt:item.finishedAt}:{}),...(item.durationMs!==undefined?{durationMs:item.durationMs}:{}),...(item.exitCode!==undefined?{exitCode:item.exitCode}:{}),...(item.changeCount!==undefined?{changeCount:item.changeCount}:{})}}/>{onOpenOutputIntent&&<Button onActivate={()=>onOpenOutputIntent(item.id)}>打开该条记录</Button>}
   </Disclosure></li>)}</ol>{hasMore&&onLoadMoreIntent&&<Button busy={loadState==='refreshing'} onActivate={onLoadMoreIntent}>加载更多记录</Button>}
  </ContentState>{onOpenNative&&<div className="ksf-ai-actions"><Button disabled={loadState==='unauthorized'} onActivate={onOpenNative}>在原生界面查看详情</Button></div>}
 </div>;
}

interface RequestCommon extends Pick<ContainerProps,'id'|'className'|'aria-label'|'aria-describedby'> {state:AIRequestState;error?:string;expiresAt?:string;onReconcileIntent?:()=>void;onOpenNative?:()=>void;onDismissView?:()=>void}
export type InputRequestProps=RequestCommon&({kind:'public';request:RunQuestion;capability:RunCapability;values:Readonly<Record<string,string>>;onValuesChange:(values:Readonly<Record<string,string>>)=>void;onAnswerIntent:(answer:Readonly<RunAnswer>)=>void}|{kind:'native';capability:RunCapability;reason?:string});
export function InputRequest(props:InputRequestProps){
 useUI();const prefix=useId(),{state,error,expiresAt,onReconcileIntent,onOpenNative,onDismissView,className=''}=props,busy=state==='submitting';
 const schemaIssue=props.kind==='public'?questionSchemaIssue(props.request):null;
 let validation='';if(props.kind==='public'&&!schemaIssue){try{answerSnapshot(props.request,props.values);}catch(issue){validation=(issue as Error).message;}}
 const actionable=props.kind==='public'&&!schemaIssue&&requestActionable(state,props.capability);
 return <div id={props.id} aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} data-ksf-component="input-request" data-state={state} className={`ksf-ai-panel ${className}`.trim()}><div className="ksf-ai-heading"><h3>需要补充信息</h3><RequestStateBadge state={state}/></div>
  {props.kind==='native'?<NativeAction onOpenNative={props.capability.state==='available'?onOpenNative:undefined} reason={props.capability.state==='available'?props.reason:props.capability.reason}/>:schemaIssue?<NativeAction reason={schemaIssue} onOpenNative={onOpenNative}/>:<Form noValidate busy={busy} onSubmitIntent={()=>{if(actionable&&!validation)props.onAnswerIntent(answerSnapshot(props.request,props.values));}}>
   {props.request.questions.map((question,index)=><Field key={question.id} id={prefix+'-'+index} label={question.header??'问题 '+(index+1)} description={question.question} readOnly={!actionable}>
    {question.options?.length&&question.isOther===false?<RadioGroup label="选择回答" value={props.values[question.id]??''} options={question.options.map(option=>({value:option.label,label:option.label,description:option.description}))} disabled={!actionable} onValueChange={value=>props.onValuesChange({...props.values,[question.id]:value})}/>:<><Textarea value={props.values[question.id]??''} readOnly={!actionable} maxLength={8000} onValueChange={value=>props.onValuesChange({...props.values,[question.id]:value})}/>{!!question.options?.length&&<div className="ksf-ai-suggestions" aria-label="建议回答">{question.options.map((option,index)=><Button key={index} variant="ghost" disabled={!actionable} title={option.description} onActivate={()=>props.onValuesChange({...props.values,[question.id]:option.label})}>{option.label}</Button>)}</div>}</>}
   </Field>)}
   {props.capability.state!=='available'&&<NativeAction reason={props.capability.reason} onOpenNative={onOpenNative}/>}
   {validation&&actionable&&<p className="ksf-ai-description">{validation}</p>}<div className="ksf-ai-actions"><Button type="submit" variant="primary" busy={busy} busyLabel="正在回答" disabled={!actionable||!!validation}>提交回答</Button></div>
  </Form>}
  <RequestFooter state={state} error={error} expiresAt={expiresAt} onReconcileIntent={onReconcileIntent} onDismissView={onDismissView}/>
 </div>;
}

export interface BusinessApprovalOption {id:string;label:string;description?:string;danger?:boolean}
export interface BusinessDecisionIntent {service:string;requestId:string;version:string;optionId:string}
export type ApprovalRequestProps=RequestCommon&({kind:'business';service:string;requestId:string;version:string;title:string;impact:ReactNode;options:readonly BusinessApprovalOption[];capability:RunCapability;onDecisionIntent:(intent:Readonly<BusinessDecisionIntent>)=>void}|{kind:'native';capability:RunCapability;reason?:string});
export function ApprovalRequest(props:ApprovalRequestProps){
 useUI();const {state,error,expiresAt,onReconcileIntent,onDismissView,onOpenNative,className=''}=props;
 if(props.kind==='business'){stableIds(props.options,option=>option.id);if(!props.service||!props.requestId||!props.version)throw Error('业务确认需要所属服务、请求编号和版本。');}
 return <div id={props.id} aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} data-ksf-component="approval-request" data-state={state} className={`ksf-ai-panel ${className}`.trim()}><div className="ksf-ai-heading"><h3>{props.kind==='business'?props.title:'需要原生审批'}</h3><RequestStateBadge state={state}/></div>
  {props.kind==='native'?<NativeAction reason={props.capability.state!=='available'?props.capability.reason:props.reason??'权限审批由Desktop原生界面持有，组件不提供批准或拒绝操作。'} onOpenNative={props.capability.state==='available'?onOpenNative:undefined}/>:<><div className="ksf-ai-impact">{props.impact}</div><small className="ksf-ai-description">处理服务：{props.service}</small>{props.capability.state!=='available'&&<InlineAlert tone="warning" title="当前不能提交决定">{props.capability.reason}</InlineAlert>}<div className="ksf-ai-decisions">{props.options.map(option=><div key={option.id}><Button variant={option.danger?'danger':'secondary'} disabled={!requestActionable(state,props.capability)} onActivate={()=>{if(requestActionable(state,props.capability))props.onDecisionIntent(Object.freeze({service:props.service,requestId:props.requestId,version:props.version,optionId:option.id}));}}>{option.label}</Button>{option.description&&<small>{option.description}</small>}</div>)}</div></>}
  <RequestFooter state={state} error={error} expiresAt={expiresAt} onReconcileIntent={onReconcileIntent} onDismissView={onDismissView}/>
 </div>;
}
function RequestFooter({state,error,expiresAt,onReconcileIntent,onDismissView}:Pick<RequestCommon,'state'|'error'|'expiresAt'|'onReconcileIntent'|'onDismissView'>){return <>{expiresAt&&<p className="ksf-ai-description">服务声明的有效期：<time dateTime={expiresAt}>{expiresAt}</time></p>}{error&&<InlineAlert tone={state==='unknown'?'warning':'danger'} title="请求尚未完成">{error}</InlineAlert>}{state==='unknown'&&<InlineAlert tone="warning" title="沿原请求核对">当前不重复提交回答或决定。</InlineAlert>}<div className="ksf-ai-actions">{onReconcileIntent&&(state==='unknown'||state==='accepted')&&<Button onActivate={onReconcileIntent}>核对原请求</Button>}{onDismissView&&<Button variant="ghost" onActivate={onDismissView}>收起展示</Button>}</div></>;}

export interface ResultViewProps extends Omit<ContainerProps,'onCopy'> {
 view:RunView;loadState?:ContentLoadState;format?:ContentPreviewProps['format'];artifacts?:readonly UIResource[];
 save?:SaveStatusProps;onSaveIntent?:()=>void;onCopy?:(text:string)=>void;onOpenFullIntent?:()=>void;
 onOpenArtifactIntent?:(id:string)=>void;onReconcileIntent?:()=>void;onRetryRunIntent?:()=>void;
}
export function ResultView({view,loadState,format,artifacts=[],save,onSaveIntent,onCopy,onOpenFullIntent,onOpenArtifactIntent,onReconcileIntent,onRetryRunIntent,className='',...props}:ResultViewProps){
 useUI();const observation=view.observation,result=observation?.result.record,state=loadState??(observation?.result.error?'error':observation?.result.state==='unknown'?'unavailable':result?'ready':'empty'),ready=resultReadyForIntent(view),unknown=view.submission.state==='unknown'||observation?.phase==='unknown';
 return <div {...props} data-ksf-component="result-view" className={`ksf-ai-panel ${className}`.trim()}><div className="ksf-ai-heading"><h3>执行结果</h3><Badge tone={observation?.phase==='succeeded'?'success':observation?.phase==='failed'?'danger':'neutral'}>{observation?.phase==='succeeded'?'执行成功':observation?.phase==='failed'?'执行失败':observation?.phase==='cancelled'?'执行已标记取消':result?'已取得结果内容':'结果尚未确认'}</Badge></div>
  <ContentState state={state} description={observation?.result.error?.message} onRetry={onReconcileIntent}>
   {result&&<>{(!ready||result.truncated)&&<InlineAlert tone="warning" title={result.truncated?'当前结果包含截断内容':'结果仍待核实'}>保留来源与版本，不据内容出现推断执行完成或业务采用。</InlineAlert>}<div className="ksf-ai-result-meta"><Badge>{result.persistence==='native-history'?'原生历史':result.persistence==='service-verified'?'服务已核实':'服务已报告'}</Badge><span>{result.runId}</span><span>版本 {result.version}</span></div><ContentPreview content={result.value} format={format??(result.format==='json'?'structured-summary':'text')} onCopy={onCopy} onOpen={onOpenFullIntent}/></>}
   {!!artifacts.length&&<ResourceList label="结果产物引用" resources={artifacts} variant="detailed" onOpen={onOpenArtifactIntent}/>}
   {onSaveIntent&&<div className="ksf-ai-actions"><Button busy={save?.view.status==='saving'} disabled={!ready||save?.view.status==='loading'||!!save?.view.pending||!!save?.validating||save?.view.status==='unknown'||save?.view.status==='conflict'} disabledReason={!ready?'请先核实结果来源与版本':undefined} onActivate={onSaveIntent}>保存结果</Button></div>}
  </ContentState>{save&&<SaveStatus {...save} variant={state==='unauthorized'?'inline':save.variant} actionsDisabled={state==='unauthorized'||save.actionsDisabled}/>} {state!=='unauthorized'&&!!view.previousResults.length&&<Disclosure title="前次运行结果">{view.previousResults.map((previous,index)=><div key={previous.runId+':'+previous.version+':'+index} className="ksf-ai-history-result"><strong>前次结果 · {previous.runId}</strong><ContentPreview content={previous.value} format={previous.format==='json'?'structured-summary':'text'}/></div>)}</Disclosure>}
  <div className="ksf-ai-actions">{onReconcileIntent&&<Button onActivate={onReconcileIntent}>核对结果来源</Button>}{onRetryRunIntent&&!unknown&&observation&&['failed','cancelled'].includes(observation.phase)&&observation.stopConfirmed===true&&<Button onActivate={onRetryRunIntent}>新建一次重试</Button>}</div>
 </div>;
}
