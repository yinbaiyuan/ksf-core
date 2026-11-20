import type {ConversationQuestion,ConversationToolEvent,NativeRequestRef} from '../codex-conversations.ts';

export type RunIdentity=
  | {source:'ai-task-v1';idempotencyKey:string;aiTaskId?:string}
  | {source:'codex-conversations-v1';operationId:string;threadId?:string;turnId?:string;continuation?:{operationId:string;turnId:string}};
export type RunPhase='queued'|'running'|'retry-wait'|'reconciling'|'waiting-input'|'waiting-native'|'stopping'|'succeeded'|'failed'|'cancelled'|'unknown';
export interface RunIssue {code:string;message:string;outcomeUnknown:boolean}
export interface RunCapability {state:'available'|'unavailable'|'unsupported';reason:string}
export interface RunCapabilities {
  cancel:RunCapability;results:RunCapability;toolEvents:RunCapability;publicQuestions:RunCapability;nativeApprovals:RunCapability;privateInput:RunCapability;
}
export interface RunResult {
  runId:string;source:RunIdentity['source'];version:string;format:'text'|'json';value:unknown;
  persistence:'service-reported'|'service-verified'|'native-history';sha256?:string;truncated?:boolean;
}
export interface RunQuestion extends ConversationQuestion {version:string;answerFormat:'single-text'}
export interface RunObservation {
  identity:RunIdentity;
  version:string;
  rawStatus:string;
  /** Actual source execution status, independent of nonblocking attention/waiting UI. */
  executionStatus:string;
  phase:RunPhase;
  stopConfirmed:boolean|null;
  cancelRequested:boolean;
  capabilities:RunCapabilities;
  tools:{records:ConversationToolEvent[];total:number|null;truncated:boolean;scope:'latest-turn'|'unsupported'|'unavailable'};
  questions:RunQuestion[];
  native:{approvals:boolean;privateInput:boolean;planRevision?:string};
  result:{state:'none'|'available'|'verified'|'unknown';record:RunResult|null;error?:RunIssue};
  error:RunIssue|null;
}
export interface RunReceipt {
  identity:RunIdentity;
  state:'accepted'|'unknown'|'failed';
  /** Actual task/operation status; accepting a request never certifies execution completion. */
  status:string;
  error?:RunIssue;
}
export interface RunActionReceipt {operationId:string;state:'accepted'|'confirmed'|'unknown'|'failed';status:string;error?:RunIssue;native?:{threadId:string;turnId?:string}}
export interface RunAnswer {version:string;turnId:string;request:NativeRequestRef;answers:Record<string,string>}
export type RunCursor={source:'ai-task-v1';afterSeq:number}|{source:'codex-conversations-v1';version:string};
export interface RunUpdate {receipt?:RunReceipt;observation?:RunObservation;cursor?:RunCursor;hasMore?:boolean}
export interface RunAdapter<Request> {
  readonly source:RunIdentity['source'];
  identity(request:Request):RunIdentity;
  submit(request:Request):Promise<RunUpdate>;
  /** Query/replay only this original identity and immutable request according to the real service contract. */
  reconcile(identity:RunIdentity,request:Request):Promise<RunUpdate>;
  /** Optional, explicit replay supported by the underlying service's durable idempotency contract. */
  retrySubmission?(identity:RunIdentity,request:Request):Promise<RunUpdate>;
  read(identity:RunIdentity,cursor?:RunCursor):Promise<RunUpdate>;
  cancel(identity:RunIdentity,operationId:string):Promise<RunActionReceipt>;
  cancelStatus?(identity:RunIdentity,operationId:string):Promise<RunActionReceipt>;
  retryCancel?(identity:RunIdentity,operationId:string):Promise<RunActionReceipt>;
  answer?(identity:RunIdentity,input:RunAnswer,operationId:string):Promise<RunActionReceipt>;
  answerStatus?(identity:RunIdentity,operationId:string):Promise<RunActionReceipt>;
  retryAnswer?(identity:RunIdentity,input:RunAnswer,operationId:string):Promise<RunActionReceipt>;
  openNative?(identity:RunIdentity):Promise<unknown>;
}
export interface RunPending<Request> {request:Request;identity:RunIdentity}
export interface RunView<Request=unknown> {
  source:RunIdentity['source'];
  identity:RunIdentity|null;
  submission:{state:'idle'|'submitting'|'accepted'|'unknown'|'failed';receipt:RunReceipt|null};
  observation:RunObservation|null;
  connection:'idle'|'connecting'|'connected'|'disconnected';
  pending:RunPending<Request>|null;
  cancellation:RunActionReceipt|null;
  answer:RunActionReceipt|null;
  previousResults:RunResult[];
  error:RunIssue|null;
}
export interface RunCheckpoint<Request> {
  schemaVersion:1;source:RunIdentity['source'];request:Request;identity:RunIdentity;
  cancellation?:{operationId:string;baseVersion?:string};answer?:{operationId:string;input:RunAnswer};previousResults:RunResult[];
}
