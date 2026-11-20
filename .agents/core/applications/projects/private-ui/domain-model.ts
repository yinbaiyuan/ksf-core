/** Structural public project documents. The projects service owns validation and effects. */
export type DomainKind='project'|'task'|'milestone';
export interface DomainDocument {path:string;etag?:string;metadata:Readonly<Record<string,unknown>>}
export interface DomainTarget {readonly kind:DomainKind;readonly id:string|null;readonly path:string;readonly version:string|null}
export interface DomainAction {id:string;label:string;disabled?:boolean;disabledReason?:string;danger?:boolean}
export interface DomainMetric {id:string;label:string;value:string;basis:string}
export interface DomainAssessment {state:'pending'|'passed'|'failed'|'stale'|'unavailable';reason?:string}
export interface DomainConfirmation {state:'awaiting-user'|'confirmed'|'stale'|'unavailable';reason?:string;by?:string;at?:string}
export interface DomainFacts {
 /** Supplied from the owning service. Neither counters nor metadata imply valid acceptance. */
 verification?:DomainAssessment;confirmation?:DomainConfirmation;
 readiness?:{ready:boolean;reasons:readonly string[]};metrics?:readonly DomainMetric[];
}
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const statusLabels:Record<string,string>={planned:'未开始',active:'进行中',paused:'已暂停',review:'待验收',completed:'已完成',cancelled:'已取消',in_progress:'进行中',blocked:'受阻（旧状态）',ready:'待开始（旧状态）',backlog:'待梳理（旧状态）',archived:'已归档（旧状态）'};
export function domainStatus(value:unknown){
 const raw=text(value),known=!!raw&&Object.hasOwn(statusLabels,raw);
 return Object.freeze({raw,label:known?statusLabels[raw!]:raw?'原状态：'+raw:'未标注状态',known,tone:known&&raw==='completed'?'success' as const:known&&['active','in_progress'].includes(raw!)?'info' as const:known&&['review','blocked'].includes(raw!)?'warning' as const:'neutral' as const});
}
function references(value:unknown){return (Array.isArray(value)?value:[]).filter(object).flatMap(item=>text(item.id)||text(item.path)?[Object.freeze({id:text(item.id),path:text(item.path),label:text(item.name)??text(item.title)??text(item.id)??text(item.path)!})]:[]);}
/** A display projection only: no state transitions, progress calculation or authority inference. */
export function domainDocument(document:DomainDocument|null,kind:DomainKind){
 if(!document||!object(document.metadata)||!text(document.path))return null;
 const m=document.metadata;if(text(m.kind)&&m.kind!==kind)return null;
 const target:Readonly<DomainTarget>=Object.freeze({kind,id:text(m.id),path:document.path,version:text(document.etag)});
 const criteria=(Array.isArray(m.criteria)?m.criteria:[]).filter(object).flatMap((c,index)=>text(c.text)?[Object.freeze({id:text(c.id),key:index,text:text(c.text)!})]:[]);
 const goals=(Array.isArray(m.goals)?m.goals:[]).filter(object).flatMap(g=>text(g.title)?[text(g.title)!]:[]);
 const goalIds=(Array.isArray(m.goal_ids)?m.goal_ids:[]).flatMap(g=>text(g)?[text(g)!]:[]);
 return Object.freeze({target,name:text(m.name)??({project:'未命名项目',task:'未命名任务',milestone:'未命名里程碑'}[kind]),status:domainStatus(m.status),owner:text(m.owner),nextAction:text(m.next_action),blocker:text(m.blocker),resumeCondition:text(m.resume_condition),description:text(m.description),code:text(m.task_code),goals:Object.freeze(goals),goalIds:Object.freeze(goalIds),criteria:Object.freeze(criteria),dependencies:Object.freeze(references(m.depends_on)),reviewRef:object(m.review_ref)?Object.freeze({id:text(m.review_ref.id),path:text(m.review_ref.path)}):null});
}
/** Capture the displayed original identity and version; the app/service decides what may happen. */
export function domainIntent(target:DomainTarget,actionId:string){if(!text(actionId))throw Error('操作意图需要稳定标识。');return Object.freeze({target:Object.freeze({...target}),actionId});}
