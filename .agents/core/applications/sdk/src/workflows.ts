import type {ApplicationBackendContext} from './application-sdk';
export interface WorkflowField {key:string;label:string;type:'text'|'textarea'|'number'|'boolean'|'select'|'materials';required:boolean;options?:string[]}
export interface WorkflowMaterial {digest:string;name:string;size:number;mediaType:string}
export interface WorkflowDescriptor {id:string;revision:number;name:string;description:string;inputs:WorkflowField[];outputs:{key:string;label:string;type:'text'|'materials'}[]}
export interface WorkflowBinding {appId:string;packageDigest:string;workflowId:string;revision:number;fixedInputs:Record<string,unknown>;outputMapping:{summary:string;materials?:string}}
export interface WorkflowRun {runId:string;workflowId:string;status:'queued'|'running'|'waiting'|'paused'|'ready'|'completed'|'failed'|'cancelled'|'unknown';revision:number;progress:string;waitReason:string;actionLabel:string;result?:{summary:string;materials:WorkflowMaterial[]}}
export interface CooperationRequest {operationId:string;taskId:string;workflowRunId:string;waitId:string;peerId:string;offerId?:string;offerRevision?:number;goal:string;materials?:WorkflowMaterial[];offerInputs?:Record<string,unknown>}
export interface WorkflowResultEvent {eventId:string;runId:string;waitId:string;taskId:string;sourcePeerId:string;outcome:'completed'|'declined'|'cancelled';delivery?:{version:number;summary:string;digest:string;materials:WorkflowMaterial[]}}
export function createWorkflowClient(context:Pick<ApplicationBackendContext,'services'>){const call=<T>(method:string,input:unknown={})=>context.services.call<T>('workflows',method,[input]);return {
 list:()=>call<{flows:(WorkflowDescriptor&{appId:string;appName:string;packageDigest:string})[];issues:{appId:string;code:string;message:string}[]}>('list'),
 describe:(binding:WorkflowBinding)=>call<{binding:WorkflowBinding;descriptor:WorkflowDescriptor}>('describe',binding),
 start:(input:{runId:string;taskId:string;contentDigest:string;goal:string;inputs:Record<string,unknown>;materials:WorkflowMaterial[];grant:{id:string;revision:number}})=>call<WorkflowRun>('start',input),
 get:(binding:WorkflowBinding,runId:string)=>call<WorkflowRun>('get',{binding,runId}),reconcile:(binding:WorkflowBinding,runId:string)=>call<WorkflowRun>('reconcile',{binding,runId}),
 cancel:(binding:WorkflowBinding,runId:string,operationId:string)=>call<WorkflowRun>('cancel',{binding,runId,operationId}),
 };}
export function createCooperationClient(context:Pick<ApplicationBackendContext,'services'>){return {request:<T=unknown>(input:CooperationRequest)=>context.services.call<T>('cooperation','request',[input])};}
