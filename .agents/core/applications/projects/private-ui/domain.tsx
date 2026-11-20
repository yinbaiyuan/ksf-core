import {type HTMLAttributes,type ReactNode} from 'react';
import {Button} from './controls';
import {FolderOpen,ArrowUpRight} from 'lucide-react';
import {Badge,InlineAlert} from './feedback';
import {Surface} from './layouts';
import {ContentState,type ContentLoadState} from './collections';
import {useUI} from './provider';
import {stableIds} from './composition-model';
import {domainDocument,domainIntent,type DomainKind,type DomainDocument,type DomainTarget,type DomainAction,type DomainFacts} from './domain-model';
export type {DomainDocument,DomainTarget,DomainAction,DomainMetric,DomainAssessment,DomainConfirmation,DomainFacts} from './domain-model';
export interface DomainSummaryProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'|'onSelect'> {
 document:DomainDocument|null;facts?:DomainFacts;loadState?:ContentLoadState;stale?:boolean;message?:ReactNode;
 actions?:readonly DomainAction[];onOpenIntent?:(target:Readonly<DomainTarget>)=>void;
 onActionIntent?:(intent:ReturnType<typeof domainIntent>)=>void;onRetryIntent?:()=>void;
}
export interface ProjectSummaryProps extends DomainSummaryProps {variant?:'list'|'summary'}
export interface MilestoneSummaryProps extends DomainSummaryProps {variant?:'list'|'summary'}
export interface TaskItemProps extends DomainSummaryProps {variant?:'compact'|'detailed';selected?:boolean;onSelectIntent?:(target:Readonly<DomainTarget>)=>void}
const assessmentLabels={pending:'任务验收待处理',passed:'任务验收已通过',failed:'任务验收未通过',stale:'任务证据需复核',unavailable:'任务验收尚未核对'};
const confirmationLabels={'awaiting-user':'等待用户确认阶段',confirmed:'用户阶段确认已记录',stale:'阶段确认需复核',unavailable:'阶段确认尚未核对'};
function Summary({kind,variant,selected,onSelectIntent,document,facts,loadState='ready',stale=false,message,actions=[],onOpenIntent,onActionIntent,onRetryIntent,className='',...props}:DomainSummaryProps&{kind:DomainKind;variant:string;selected?:boolean;onSelectIntent?:TaskItemProps['onSelectIntent']}){
 useUI();stableIds(actions,action=>action.id);stableIds(facts?.metrics??[],metric=>metric.id);
 const overview=kind==='project'&&variant==='summary';
 const view=domainDocument(document,kind),detailed=variant==='summary'||variant==='detailed',state=loadState==='ready'&&!view?'unavailable':loadState,usable=state==='ready'&&!stale,showReadiness=kind==='task'&&['planned','ready','backlog'].includes(view?.status.raw??'');
 return <div {...props} data-ksf-component={kind==='task'?'task-item':kind+'-summary'} data-variant={variant} data-selected={selected||undefined} className={`ksf-domain-summary ${className}`.trim()}>
  <ContentState state={state} stale={stale} description={message??(!view?'尚未取得对应对象的有效视图。':undefined)} onRetry={onRetryIntent}>
   {view&&<Surface variant={kind!=='task'&&variant==='summary'?'summary':'plain'} actions={overview?<Badge tone={view.status.tone}>{view.status.label}</Badge>:undefined} title={<span className="ksf-domain-title">{overview&&<span className="ksf-domain-symbol"><FolderOpen aria-hidden/></span>}{view.code&&<small>{view.code}</small>}<span>{view.name}</span></span>}>
    {(!overview||view.blocker||stale||!view.status.known)&&<div className="ksf-domain-status"><Badge tone={view.status.tone}>{view.status.label}</Badge>{!view.status.known&&<Badge tone="warning">状态需核对</Badge>}{view.blocker&&<Badge tone="warning">存在阻塞</Badge>}{stale&&<Badge tone="warning">上次快照</Badge>}{showReadiness&&facts?.readiness?.ready&&<Badge tone="info">可开始（服务判断）</Badge>}</div>}
    {view.description&&<p className="ksf-domain-description">{view.description}</p>}
    <dl className="ksf-domain-fields"><div><dt>负责人</dt><dd>{view.owner??'未指定负责人'}</dd></div><div><dt>下一行动</dt><dd>{view.nextAction??'未提供下一行动'}</dd></div></dl>
    {view.blocker&&<InlineAlert tone="warning" title="阻塞原因" description={view.blocker}/>} {view.resumeCondition&&<p className="ksf-domain-description">恢复条件：{view.resumeCondition}</p>}
    {showReadiness&&facts?.readiness&&!facts.readiness.ready&&!!facts.readiness.reasons.length&&<div className="ksf-domain-description"><strong>当前不可开始</strong><ul>{facts.readiness.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div>}
    {kind==='task'?<div className="ksf-domain-assessment"><Badge tone={facts?.verification?.state==='passed'?'success':facts?.verification?.state==='failed'?'danger':'neutral'}>{assessmentLabels[facts?.verification?.state??'unavailable']}</Badge>{facts?.verification?.reason&&<p>{facts.verification.reason}</p>}</div>:kind==='milestone'?<div className="ksf-domain-assessment"><Badge tone={facts?.confirmation?.state==='confirmed'?'success':'neutral'}>{confirmationLabels[facts?.confirmation?.state??'unavailable']}</Badge><p>{facts?.confirmation?.reason??'任务完成统计与本阶段的用户确认分别核对。'}</p>{facts?.confirmation?.by&&<span>确认人：{facts.confirmation.by}</span>}{facts?.confirmation?.at&&<span>记录时间：{facts.confirmation.at}</span>}</div>:null}
    {!overview&&!!view.goals.length&&<div className="ksf-domain-description"><strong>目标</strong><ul>{view.goals.map((goal,index)=><li key={index}>{goal}</li>)}</ul></div>}
    {detailed&&!!view.goalIds.length&&<p className="ksf-domain-description">关联目标：{view.goalIds.join('、')}</p>}
    {!!facts?.metrics?.length&&<dl className="ksf-domain-metrics">{facts.metrics.map(metric=><div key={metric.id}><dt>{metric.label}</dt><dd>{metric.value}</dd><small>{metric.basis}</small></div>)}</dl>}
    {detailed&&<details className="ksf-domain-origin" open={overview?undefined:true} data-overview={overview}><summary>依据与来源</summary><div className="ksf-domain-origin-content">{overview&&!!view.goals.length&&<div className="ksf-domain-description"><strong>目标</strong><ul>{view.goals.map((goal,index)=><li key={index}>{goal}</li>)}</ul></div>}<div className="ksf-domain-description"><strong>完成条件</strong>{view.criteria.length?<ul>{view.criteria.map(c=><li key={c.key}>{c.text}</li>)}</ul>:<p>未提供完成条件</p>}</div>{!!view.dependencies.length&&<div className="ksf-domain-description"><strong>前置引用</strong><ul>{view.dependencies.map((ref,index)=><li key={index}>{ref.label}{ref.path&&ref.path!==ref.label&&<small>{ref.path}</small>}</li>)}</ul></div>}<dl className="ksf-domain-fields"><div><dt>来源</dt><dd>{view.target.path}</dd></div><div><dt>对象身份</dt><dd>{view.target.id??'未提供稳定ID'}</dd></div><div><dt>视图版本</dt><dd>{view.target.version??'未提供版本'}</dd></div>{view.reviewRef&&<div><dt>阶段复盘引用</dt><dd>{view.reviewRef.path??view.reviewRef.id}</dd></div>}</dl></div></details>}
    <div className="ksf-domain-actions">{onSelectIntent&&<Button variant="ghost" aria-pressed={!!selected} onActivate={()=>onSelectIntent(view.target)}>选择{view.name}</Button>}{onOpenIntent&&<Button variant={overview?'ghost':'secondary'} icon={overview?<ArrowUpRight/>:undefined} onActivate={()=>onOpenIntent(view.target)}>打开{kind==='task'?'任务':kind==='project'?'项目':'里程碑'}</Button>}{actions.map(action=><Button key={action.id} variant={action.danger?'danger':'secondary'} disabled={!usable||action.disabled||!onActionIntent} disabledReason={!usable?'请先取得最新对象视图':action.disabledReason} onActivate={()=>{if(usable&&!action.disabled)onActionIntent?.(domainIntent(view.target,action.id));}}>{action.label}</Button>)}</div>
   </Surface>}
  </ContentState>
 </div>;
}
/** Controlled presentation of existing project-service records. */
export function ProjectSummary({variant='summary',...props}:ProjectSummaryProps){return <Summary {...props} kind="project" variant={variant}/>;}
export function TaskItem({variant='compact',...props}:TaskItemProps){return <Summary {...props} kind="task" variant={variant}/>;}
export function MilestoneSummary({variant='summary',...props}:MilestoneSummaryProps){return <Summary {...props} kind="milestone" variant={variant}/>;}
