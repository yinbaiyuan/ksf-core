import type {WorkspaceFile,TreeEntry} from './workspace-types';
import type {AIRequest,AITask,AIResult,AIEvents,AIMaterial,AIServiceDescription} from './ai-tasks';
export interface WorkspaceService {
 tree(path?:string):Promise<{path:string;version:string;entries:TreeEntry[]}>;
 read(path:string):Promise<WorkspaceFile>;
 search(input:{q:string;path?:string}):Promise<{matches:unknown[];errors:unknown[];truncated:boolean;visited:number}>;
 save(input:{path:string;text:string;version:string}):Promise<WorkspaceFile>;
 create(input:{path:string;kind?:'file'|'directory';text?:string}):Promise<{path:string;kind:string}>;
 move(input:{path:string;destination:string;version:string}):Promise<{path:string;previousPath:string;kind?:string}>;
 unlock(input:{path:string}):Promise<WorkspaceFile>;
 upload(input:{path:string;name:string;base64:string}):Promise<{path:string;relativePath:string}>;
}
export interface AIService {
 describe():Promise<AIServiceDescription>;submit<T=unknown>(request:AIRequest):Promise<AITask<T>>;
 get<T=unknown>(id:string):Promise<AITask<T>>;readResult<T=unknown>(id:string):Promise<AIResult<T>>;
 cancel(id:string):Promise<AITask>;events(id:string,afterSeq?:number):Promise<AIEvents>;
 register(metadata:{name:string;mimeType:string},text:string):Promise<AIMaterial>;
}
/** Method signatures for context.services.call(service, method, paramsArray). Identity is host-bound. */
export interface ApplicationPublicServices {workspace:WorkspaceService;ai:AIService}
export interface TaskActivity {taskId:string;turnId:string;startedAt:string;title:string;taskTitle:string;navigationTarget:string;primaryTargets:{key:string;kind:string;label:string;lifecycle:string}[]}
export interface ReviewSourceMessage {id:string;at:string;role:string;phase?:string;timeKnown:boolean;omittedContentTypes:string[]}
export interface ReviewSourceTurn {taskId:string;turnId:string;revision:number;digest:string;allowed:boolean;startedAt:string;updatedAt:string;status:string;issues:{code:string;message?:string}[];route:unknown;messages:ReviewSourceMessage[];title?:string}
export interface ReviewSourceChat {taskId:string;title:string;fingerprint:string;turns:(Omit<ReviewSourceTurn,'messages'|'route'> & {messageCount:number})[];latestMessageAt:string|null;latestTurnId:string|null;errors:{code:string;message:string}[]}
export interface TaskActivityService {
 activity():Promise<{activity:TaskActivity[];errors:{taskId?:string;turnId?:string;code:string;message:string}[];capture:{enabled:boolean;activatedAt:string|null}}>;
 reviewSources(input?:{startAt?:string;endAt?:string;taskId?:string;limit?:number;offset?:number}):Promise<{records:ReviewSourceTurn[];chats:ReviewSourceChat[];total:number;nextOffset:number|null;errors:{taskId?:string;turnId?:string;code:string;message:string}[];capture:{enabled:boolean;activatedAt:string|null}}>;
 readReviewTurn(input:{taskId:string;turnId:string;revision?:number;offset?:number;limit?:number}):Promise<Omit<ReviewSourceTurn,'messages'> & {messages:(ReviewSourceMessage & {text:string;truncated:boolean})[];total:number;nextOffset:number|null}>;
}
export interface ApplicationPublicServices {tasks:TaskActivityService}

import type {MessageService,PeerService} from './communication';
export interface ApplicationPublicServices {messages:MessageService;peers:PeerService}
