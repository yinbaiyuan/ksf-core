import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useApplicationSDK} from '@ksf/sdk/react';
import {createPortal} from 'react-dom';
import {Button} from '@ksf/sdk/button';
import {TextArea} from '@ksf/sdk/text-area';
import {TextField} from '@ksf/sdk/text-field';
import {Select} from '@ksf/sdk/select';
import {Form} from '@ksf/sdk/form';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {SaveStatus} from '@ksf/sdk/save-status';
import {Dialog} from '@ksf/sdk/dialog';
import {AttachmentList} from '@ksf/sdk/attachment-list';
import {AgentActivity} from '@ksf/sdk/agent-activity';
import {ToolCalls} from '@ksf/sdk/tool-calls';
import {Block,Fold,Markdown} from './project-components';
export interface ConversationPresentation {node:HTMLElement;model:any;renderMarkdown?:(text:string)=>HTMLElement}
const phases:Record<string,string>={queued:'等待执行',running:'正在执行','waiting-input':'等待回答','waiting-native':'等待原生处理',stopping:'正在请求停止',succeeded:'已执行完成',failed:'执行失败',cancelled:'已停止',unknown:'结果尚待核对',reconciling:'正在核对'};
export function ConversationView({model,readOnly=false}:{model:any;readOnly?:boolean}){
 const [saveConflict,setSaveConflict]=useState(false);
 const {entry:e}:any=useSyncExternalStore(model.subscribe,model.getSnapshot);
 if(!e?.ready)return <InlineAlert tone={e?.loading?'info':'warning'} heading={e?.loading?'正在读取会话':'会话尚未就绪'} actions={<Button onClick={()=>void model.reload()}>重新读取</Button>}>{e?.issue}</InlineAlert>;
 const record=e.record,run=e.run,observation=run?.observation,canSubmit=!readOnly&&model.canSubmit(),result=observation?.result.record;
 const currentSave=!!result&&e.save?.value?.runId===result.runId&&e.save?.value?.version===result.version&&e.save?.value?.source===result.source;
 const messages=e.history?.records??e.snapshot?.messages??[];
 const submit=()=>{if(canSubmit&&record.draft.trim())void model.submit({draft:record.draft,draftVersion:record.draftVersion,resources:record.resources});};
 return <div className="project-conversation">
  <header className="project-heading"><div><h2>项目对话</h2><p className="project-muted">{e.project.name} · Codex Desktop</p></div><div className="project-actions">{record.threadId&&<Button onClick={()=>void model.openNative()}>在 Desktop 打开</Button>}{record.threadId&&<Button disabled={e.busy||!canSubmit} onClick={()=>void model.newConversation()}>新建会话</Button>}{!record.threadId&&e.recent?.threadId&&<Button onClick={()=>void model.resumeRecent()}>接续最近会话</Button>}</div></header>
  {e.issue&&<InlineAlert tone="warning" heading="会话需要核对" actions={<Button onClick={()=>void model.reconcile()}>核对原操作</Button>}>{e.issue}</InlineAlert>}
  {record.legacyPending&&<InlineAlert tone="warning" heading="旧提交结果待核对">原操作 {record.legacyPending.operationId} 保持原身份；恢复不会重新发送。<Button onClick={()=>void model.reconcile()}>核对原操作</Button></InlineAlert>}
  <Form onCommit={submit} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();submit();}}}>
   <TextArea label="项目工作目标" value={record.draft} onValueChange={value=>model.draft(value)} minRows={6} placeholder="填写工作目标，或核对准备好的接续草稿"/>
   <AttachmentList aria-label="草稿参考文件" items={record.resources.map((r:any)=>({id:r.id,name:r.name??r.ref?.path??r.id}))} onRemove={id=>model.removeResource(id)}/>
   <div className="project-actions"><Button onClick={()=>void model.addResource()}>添加参考文件</Button>{!readOnly&&<Button type="submit" variant="solid" tone="primary" disabled={!canSubmit||!record.draft.trim()} loading={run?.submission.state==='submitting'}>发送当前草稿</Button>}</div>
   {readOnly&&<p className="project-muted">归档或取消的项目保留原会话供查阅；继续执行前先核对恢复与工作安排。</p>}
   {!canSubmit&&<p className="project-muted">{e.availability?.available!==true?e.availability?.message??'正在核对 Desktop 连接':'当前轮次或原生交互尚未结束；后续草稿仍可编辑和保留。'}</p>}
  </Form>
  {record.submitted&&<Fold title="已提交快照" initial={record.submittedExpanded}><Markdown text={record.submitted.draft}/><AttachmentList items={record.submitted.resources.map((r:any)=>({id:r.id,name:r.ref?.path??r.name??r.id}))}/></Fold>}
  {run?.identity&&<Block title="当前运行"><AgentActivity label="当前运行状态" collapseWhenDone={false} steps={[{id:'run',label:phases[observation?.phase]??run.submission.state,status:observation?.phase==='succeeded'?'done':observation?.phase==='failed'?'error':observation?.phase==='cancelled'?'cancelled':'running',detail:run.error?.message??observation?.error?.message}]}/><p className="project-muted">提交：{run.submission.state} · 连接：{run.connection} · 停止确认：{observation?.stopConfirmed===true?'已确认':observation?.stopConfirmed===false?'尚在执行':'未知'}</p>
   <div className="project-actions"><Button onClick={()=>void model.reconcile()}>核对运行</Button>{observation?.capabilities.cancel.state==='available'&&<Button onClick={()=>void model.cancel()}>请求停止</Button>}{run.submission.state==='unknown'&&<Button onClick={()=>void model.retryOriginal()}>沿原请求重试</Button>}{run.cancellation?.state==='unknown'&&<Button onClick={()=>void model.retryStop()}>核对停止请求</Button>}</div>
  </Block>}
  {observation?.questions.map((question:any)=><Question key={JSON.stringify([question.request,question.turnId,question.version])} model={model} question={question} run={run} enabled={observation.capabilities.publicQuestions.state==='available'}/>)}
  {(observation?.native.approvals||observation?.native.privateInput||observation?.native.planRevision)&&<InlineAlert heading="请在 Desktop 处理原生交互" actions={<Button onClick={()=>void model.openNative()}>打开原生会话</Button>}>审批、私密输入及计划确认保留在原生入口。</InlineAlert>}
  {!!observation?.tools.records.length&&<Fold title="工具活动"><ToolCalls label="公开工具活动" calls={observation.tools.records.map((tool:any,index:number)=>({id:tool.id??String(index),name:tool.title??tool.name??tool.kind??'工具活动',status:tool.status==='failed'?'error':tool.status==='completed'?'done':'ready',inputSummary:tool.summary??tool.description}))}/>{observation.tools.truncated&&<p>此处只显示部分公开元数据，完整内容请在 Desktop 查看。</p>}</Fold>}
  {result&&<Block title="本次结果"><Markdown text={typeof result.value==='string'?result.value:JSON.stringify(result.value,null,2)}/>{result.truncated&&<InlineAlert tone="warning">结果为部分内容，完整原文请在 Desktop 查看。</InlineAlert>}<div className="project-actions"><Button onClick={()=>void model.saveResult()}>保存结果副本</Button><Button onClick={()=>void navigator.clipboard.writeText(typeof result.value==='string'?result.value:JSON.stringify(result.value))}>复制结果</Button><Button onClick={()=>void model.openNative()}>查看完整原文</Button></div></Block>}
  {e.save&&currentSave&&<SaveStatus status={e.save.status==='saving'?'saving':e.save.status==='saved'?'saved':e.save.error?'error':'editing'} message={e.save.error?.message??'此应用的持久结果副本'} onRetry={()=>void model.retrySave()}/>}
  {e.save?.pending&&<InlineAlert tone="warning" heading={currentSave?'结果副本保存待核对':'前次结果副本保存待核对'} actions={<><Button onClick={()=>void model.reconcileSave()}>核对保存回执</Button><Button onClick={()=>setSaveConflict(true)}>比较保存副本</Button></>}>保留原保存身份；准备后续工作不改写此结果。</InlineAlert>}
  {e.save?.status==='conflict'&&<InlineAlert tone="warning" heading="结果副本存在另一份修改" actions={<Button onClick={()=>setSaveConflict(true)}>比较保存副本</Button>}>保留原运行结果与待保存副本，核对后再决定是否采用存储返回的内容。</InlineAlert>}
  {e.savedResult&&<Fold title="已持久保存的结果副本"><p>{e.savedResult.runId} · {e.savedResult.version}</p><Markdown text={typeof e.savedResult.result.value==='string'?e.savedResult.result.value:JSON.stringify(e.savedResult.result.value)}/></Fold>}
  <Fold title="原生会话历史"><p className="project-muted">原文由 Desktop 保存；读取历史不会重放旧操作。</p>{messages.map((message:any)=><article className="project-history-message" key={message.id}><strong>{message.role==='user'?'你':'Codex'}</strong><Markdown text={message.text}/>{message.truncated&&<p>本条为部分内容，请在 Desktop 查看原文。</p>}</article>)}{record.threadId&&(!e.history||e.history.nextOffset!==null)&&<Button loading={e.historyBusy} onClick={()=>void model.loadHistory()}>{e.history?'继续读取历史':'从头读取历史'}</Button>}</Fold>
  <Fold title="项目关联聊天"><ProjectChats project={e.project} model={model}/></Fold>
  <Dialog open={saveConflict} title="比较结果副本" onClose={()=>setSaveConflict(false)} footer={<><Button onClick={()=>setSaveConflict(false)}>保留待保存副本</Button><Button loading={e.busy} onClick={()=>void model.reloadSave().then((read:boolean)=>{if(read)setSaveConflict(false);})}>读取已保存副本</Button></>}><TextArea label="待保存副本" value={JSON.stringify(e.save?.value,null,2)??''} readOnly rows={7}/><TextArea label="存储返回副本" value={JSON.stringify(e.save?.remote?.value,null,2)??''} readOnly rows={7}/></Dialog>
 </div>;
}
function ProjectChats({project,model}:{project:any;model:any}){
 const sdk=useApplicationSDK(),generation=useRef(0),[rows,setRows]=useState<any[]>([]),[next,setNext]=useState<number|null>(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(offset=0){const token=++generation.current;setBusy(true);setError('');try{const result:any=await sdk.call('chats',{...project,offset});if(token!==generation.current)return;setRows(old=>[...new Map([...(offset?old:[]),...result.records].map((row:any)=>[row.taskId,row])).values()]);setNext(result.nextOffset??null);setError((result.warnings??[]).join('；'));}catch(e:any){if(token===generation.current)setError(e.message);}finally{if(token===generation.current)setBusy(false);}}
 useEffect(()=>{generation.current++;setRows([]);setNext(0);setBusy(false);return()=>{generation.current++;};},[project.name,project.scope]);
 return <><p className="project-muted">沿原项目归属查找已有聊天，接续前由原生会话接口核对身份与状态。</p>{rows.map(row=><article key={row.taskId}><Button variant="text" onClick={()=>void model.attach(row.taskId)}>{row.title||row.taskId}</Button><p>{row.summary}</p><small>{row.updatedAt} · {row.turnCount} 轮</small></article>)}{error&&<InlineAlert tone="warning">{error}</InlineAlert>}{next!==null&&<Button loading={busy} onClick={()=>void load(next)}>{rows.length?'继续读取关联聊天':'读取项目关联聊天'}</Button>}</>;
}
function Question({model,question,run,enabled}:{model:any;question:any;run:any;enabled:boolean}){
 const values=model.values(question),uncertain=run.answer&&['accepted','unknown'].includes(run.answer.state);
 return <Block title="需要回答"><Form onCommit={()=>model.answer({version:question.version,turnId:question.turnId,request:question.request,answers:values})}>{question.questions.map((q:any)=><div key={q.id}>{q.options?.length>0&&<Select label={q.header??q.question} placeholder="选择或在下方填写回答" value={values[q.id]??''} options={q.options.map((o:any)=>({value:o.label,label:o.label,description:o.description}))} onValueChange={v=>model.answerValues(question,{...values,[q.id]:v})} disabled={!enabled||uncertain}/>}<TextField label={q.question} value={values[q.id]??''} disabled={!enabled||uncertain} onValueChange={v=>model.answerValues(question,{...values,[q.id]:v})}/></div>)}<Button type="submit" disabled={!enabled||uncertain||run.answer?.status==='requesting'}>提交回答</Button>{uncertain&&<Button onClick={()=>void model.reconcile()}>核对原回答</Button>}</Form></Block>;
}
export function ConversationPortal({panel}:{panel:ConversationPresentation}){return createPortal(<ConversationView model={panel.model}/>,panel.node);}
