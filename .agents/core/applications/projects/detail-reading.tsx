import {useState,type ReactNode} from 'react';
import {Button} from '@ksf/sdk/button';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {SearchField} from '@ksf/sdk/search-field';
import {Select} from '@ksf/sdk/select';
import {Block,Fold,Markdown,Status,labels} from './project-components';
import {ReferenceLink,ReferencesView} from './references-view';
import {detailReading,scopeOverview} from './detail-reading-model.js';
import {taskLabel} from './hierarchy-model.js';
import {workspaceDomainFacts} from './workspace-model.js';

export function ReadingSection({title,onEdit,children}:{title:string;onEdit?:()=>void;children:ReactNode}){
 return <section className="project-block"><header className="project-section-heading"><h3>{title}</h3>{onEdit&&<Button size="small" variant="text" aria-label={'编辑'+title} onClick={onEdit}>编辑</Button>}</header>{children}</section>;
}

export function CompactWorkList({rows,onOpen,empty='暂无相关工作'}:{rows:any[];onOpen:(path:string)=>void;empty?:string}){
 return rows.length?<div className="project-compact-work">{rows.map(row=>{const d=row.document??row,m=d.metadata;return <article key={d.path}><div className="project-work-title"><Button variant="text" onClick={()=>onOpen(d.path)}>{m.kind==='task'?taskLabel(d):m.name}</Button><Status value={m.status}/>{row.stale&&<Status value="待复核"/>}</div>{m.next_action&&<p className="project-task-next">{m.next_action}</p>}{m.blocker&&<p className="project-task-blocker">受阻：{m.blocker}</p>}{m.status==='planned'&&row.reasons?.length>0&&<Fold title="启动条件">{row.reasons.map((r:string)=><p key={r}>{r}</p>)}</Fold>}</article>;})}</div>:<p className="project-muted">{empty}</p>;
}

export function RecordedText({text,path,onOpen,compact=false}:{text:string;path:string;onOpen:(ref:any)=>void;compact?:boolean}){
 return text.length>(compact?96:520)||text.split('\n').length>(compact?3:9)?<><p className={compact?'project-result-excerpt project-result-brief':'project-result-excerpt'}>{text}</p><Fold title="展开完整记录"><Markdown text={text} path={path} open={path=>onOpen({path})}/></Fold></>:<Markdown text={text} path={path} open={path=>onOpen({path})}/>;
}

export function ScopeOverviewReading({document,record,children:items=[],onEdit,onAcceptance}:{document:any;record:any;children?:any[];onEdit?:(group:string)=>void;onAcceptance:()=>void}){
 const view=scopeOverview(document,record,items),sections=[['当前结果',view.result,'content:当前结果'],['还差什么',[view.gaps,document.metadata.blocker?'受阻：'+document.metadata.blocker:''].filter(Boolean).join('\n'),'content:未决与缺口'],['下一步',view.next,'arrangement']];
 return <div className="project-work-overview project-scope-overview">{sections.map(([title,text,group])=><ReadingSection key={title} title={title} onEdit={onEdit?()=>onEdit(group):undefined}><p className="project-result-excerpt project-result-brief">{text}</p></ReadingSection>)}<div className="project-overview-links"><Button variant="text" onClick={onAcceptance}>{document.metadata.kind==='project'?'查看整体验收与过程记录':'查看阶段验收与过程记录'}</Button></div></div>;
}

export function SummaryReading({document,record,onEdit,onOpen,children}:{document:any;record:any;onEdit?:(group:string)=>void;onOpen:(ref:any)=>void;children?:ReactNode}){
 const reading=detailReading(document,record),m=document.metadata,sections=reading.sections;
 return <div className={m.kind==='task'?'project-task-overview project-work-overview':undefined}>{!reading.hasSummary?<ReadingSection title="原始说明" onEdit={onEdit?()=>onEdit('source'):undefined}><p className="project-muted">尚无独立摘要，以下保留已有正文。</p><RecordedText text={document.body||'原记录没有正文。'} path={document.path} onOpen={onOpen} compact={m.kind==='task'}/></ReadingSection>:<>{sections['目标']&&!reading.ended&&m.kind!=='task'&&<ReadingSection title="阶段目标" onEdit={onEdit?()=>onEdit(reading.goalFromAlias?'source':'content:目标'):undefined}><RecordedText text={sections['目标']} path={document.path} onOpen={onOpen}/></ReadingSection>}{sections['当前结果']&&<ReadingSection title={m.kind==='milestone'?'阶段成果':'当前结果'} onEdit={onEdit?()=>onEdit('content:当前结果'):undefined}><RecordedText text={sections['当前结果']} path={document.path} onOpen={onOpen} compact={m.kind==='task'}/></ReadingSection>}{sections['未决与缺口']&&<ReadingSection title="还差什么" onEdit={onEdit?()=>onEdit('content:未决与缺口'):undefined}><RecordedText text={sections['未决与缺口']} path={document.path} onOpen={onOpen} compact={m.kind==='task'}/></ReadingSection>}</>}
 {m.blocker&&<InlineAlert tone="warning" heading="当前受阻">{m.blocker}{m.resume_condition&&<p>恢复条件：{m.resume_condition}</p>}</InlineAlert>}
 {m.status==='paused'&&<Block title="暂停与恢复条件"><Markdown text={m.status_reason||'原记录未说明暂停原因。'} path={document.path}/><Markdown text={m.resume_condition||'恢复前需核对条件。'} path={document.path}/></Block>}
 {m.status==='cancelled'&&<Block title="取消原因"><Markdown text={m.status_reason||'原记录未说明取消原因。'} path={document.path}/></Block>}
 {children}
 {sections['目标']&&(m.kind==='task'||reading.ended)&&<Fold title={m.kind==='task'?'任务目标':'原阶段目标'}><Markdown text={sections['目标']} path={document.path}/>{onEdit&&<Button variant="text" onClick={()=>onEdit(reading.goalFromAlias?'source':'content:目标')}>编辑目标</Button>}</Fold>}
 {reading.hasSummary&&reading.original&&<Fold title="原始说明与过程材料"><Markdown text={reading.original} path={document.path} open={path=>onOpen({path})}/>{onEdit&&<Button variant="text" onClick={()=>onEdit('source')}>编辑原始说明</Button>}</Fold>}
 </div>;
}

export function ConditionReading({document,record,onOpen,onEdit}:{document:any;record:any;onOpen:(ref:any)=>void;onEdit?:(id:string)=>void}){
 const r=detailReading(document,record);
 return <Block title="逐项条件与证据">{r.conditions.map((c:any)=><section key={c.id}><h4>{c.text}</h4><Status value={c.review?.result??'pending'}/><Fold title="原复核记录">{(c.review?.evidence??[]).map((ref:any,i:number)=><ReferenceLink key={i} reference={ref} onOpen={onOpen}/>)}</Fold>{onEdit&&<Button onClick={()=>onEdit(c.id)}>维护此项验收</Button>}</section>)}</Block>;
}

export function ObjectMaterials({document,record,onOpen,onObject,onEdit}:{document:any;record:any;onOpen:(ref:any)=>void;onObject:(path:string)=>void;onEdit?:()=>void}){
 return <><ReadingSection title="结果入口" onEdit={onEdit}><ReferencesView record={record} subject={document} onOpen={onOpen} onObject={onObject} mode="results"/></ReadingSection><Block title="参考资料">{(document.metadata.context_refs??[]).length?document.metadata.context_refs.map((r:any,i:number)=><p key={i}><ReferenceLink reference={r} onOpen={onOpen}/>{r.role&&<span className="project-muted"> · {r.role}</span>}</p>):<p className="project-muted">尚未记录参考资料，相关文件保留在中栏。</p>}</Block></>;
}

export function StageReadiness({document,record,tasks,onAcceptance}:{document:any;record:any;tasks:any[];onAcceptance?:()=>void}){
 const r=detailReading(document,record),facts=workspaceDomainFacts(document,record),open=tasks.filter(t=>!['completed','cancelled'].includes(t.metadata.status));
 return <ReadingSection title={r.ended?'阶段验收结论':'距离阶段通过还差什么'}><div className="project-fact-line"><span>下级任务未结束 {open.length} / {tasks.length}</span><span>条件通过记录 {r.passed} / {r.conditions.length}</span><span>{facts.confirmation?.state==='confirmed'?'已取得阶段确认':facts.confirmation?.state==='stale'?'阶段依据待复核':'阶段确认尚未核对通过'}</span></div>{r.unresolved.length>0&&<p className="project-muted">{r.unresolved.length} 项条件尚未取得完整通过依据。</p>}{r.review?.metadata.status==='draft'&&<p className="project-muted">复盘仍是草稿。</p>}{onAcceptance&&<Button variant="text" onClick={onAcceptance}>查看阶段验收与复盘</Button>}</ReadingSection>;
}

export function StageTasks({document,tasks,onOpen}:{document:any;tasks:any[];onOpen:(path:string)=>void}){
 const [filter,setFilter]=useState('open'),visible=tasks.filter(t=>filter==='all'||(filter==='open'?!['completed','cancelled'].includes(t.metadata.status):t.metadata.status===filter)),stages=document.metadata.task_stages??[];
 const groups=[...stages.map((s:any)=>({code:s.code,name:s.name})),{code:'',name:'其他任务'}].map(g=>({...g,rows:visible.filter(t=>g.code?t.metadata.task_code?.match(/^[A-Z]/)?.[0]===g.code:!stages.some((s:any)=>t.metadata.task_code?.startsWith(s.code)))})).filter(g=>g.rows.length);
 return <><Select label="所属任务范围" value={filter} onValueChange={setFilter} options={[{value:'open',label:'未结束'},{value:'all',label:'全部 · '+tasks.length},...['active','review','completed','cancelled'].map(value=>({value,label:labels[value]}))]}/>{groups.map(g=><Block key={g.code} title={g.code?g.code+' · '+g.name:g.name}><CompactWorkList rows={g.rows} onOpen={onOpen}/></Block>)}{!visible.length&&<p className="project-muted">当前范围没有任务，可切换查看全部记录。</p>}</>;
}
