import type {ApplicationSDK} from './application-sdk';
export interface MessageEndpoint {kind:'app'|'agent';id:string}
export interface MessagePart {partId:string;name?:string;mediaType:string;byteLength:number;sha256:string}
export interface MessageMaterial {materialId:string;name:string;mediaType:string;byteLength:number;sha256:string}
export interface MessageManifest {protocol:'ksf-message-v1';messageId:string;from:{nodeId:string;endpoint:MessageEndpoint};to:{nodeId:string;endpoint:MessageEndpoint};channel:string;payloadPartId:string;parts:MessagePart[]}
export interface MessageReceipt {protocol:'ksf-receipt-v1';messageId:string;manifestSha256:string;fromNodeId:string;toNodeId:string;toEndpoint:MessageEndpoint;status:'received';receivedAt:string}
export interface MessageSend {operationId:string;to:MessageManifest['to'];channel:string;payloadPartId:string;parts:{partId:string;materialId:string}[]}
export interface MessageOperation {operationId:string;messageId:string;status:'preparing'|'sending'|'confirming'|'delivered'|'failed'|'cancelled'|'unconfirmed';sentBytes:number;manifest:MessageManifest;receipt?:MessageReceipt;error?:{code:string;message:string}|null}
export interface ReceivedMessage {messageId:string;manifest:MessageManifest;receipt:MessageReceipt;delivery:{state:string;attempts:number}}
export interface MessageEvent {eventId:string;messageId:string;channel:string;from:MessageManifest['from'];parts:MessagePart[]}
export interface MessageService {
 registerFile(input:{path:string;name?:string;mediaType?:string}):Promise<MessageMaterial>;
 send(input:MessageSend):Promise<MessageOperation>;status(operationId:string):Promise<MessageOperation>;
 reconcile(operationId:string):Promise<MessageOperation>;cancel(operationId:string):Promise<MessageOperation>;
 inbox(input?:{after?:string;limit?:number}):Promise<{messages:(ReceivedMessage&{cursor:string})[];nextCursor:string;hasMore:boolean}>;
 read(messageId:string):Promise<ReceivedMessage>;readPart(messageId:string,partId:string):Promise<MessagePart&{path:string}>;
}
export interface PeerDirectory {
 pairingRequests?:PeerPairingRequest[];
 paired:{nodeId:string;name:string;host:string;port:number;fingerprint:string}[];
 discovered:{nodeId:string;name:string;host:string;port:number;pairingPort?:number;seenAt:number}[];
 local?:{device?:{name:string;custom:boolean};identity:{protocol:'ksf-peer-identity-v1';nodeId:string;fingerprint:string;certificate:string;validTo:string}|null;enabled:boolean;discovery:boolean;listener:{host:string;port:number}|null;pairingListener?:{host:string;port:number}|null;pairingError?:{code?:string;message:string}|null;limits:{maxMessageBytes:number;maxParts:number};discoveryError:{code?:string;message:string}|null};
}
export interface PeerService {list():Promise<PeerDirectory>}
export interface PeerPairingRequest {requestId:string;direction:'incoming'|'outgoing';nodeId:string;name:string;host:string;appId:string;appName?:string;channel:string;status:'requesting'|'pending'|'accepting'|'confirming'|'accepted'|'rejected'|'expired'|'cancelled'|'failed';createdAt:number;expiresAt:number;code:string;error?:{message:string}|null}
/** Human pairing actions use the authenticated frontend session, scoped to this installed app. */
export function createPeerPairingClient(sdk:Pick<ApplicationSDK,'instanceId'|'getSession'>,fetcher:typeof fetch=fetch){
 async function post(operation:string,input:unknown):Promise<PeerPairingRequest>{
  const session=await sdk.getSession(),response=await fetcher('/api/communication/pairing-'+operation+'?'+new URLSearchParams({instanceId:sdk.instanceId}),{method:'POST',headers:{'X-KSF-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify(input)}),body=await response.json();
  if(!response.ok||body.ok===false)throw Object.assign(new Error(body.error?.message??'配对操作失败。'),{code:body.error?.code});return body.data;
 }
 return {request:(input:{requestId:string;nodeId:string;channel:string})=>post('request',input),answer:(requestId:string,accept:boolean)=>post('answer',{requestId,accept})};
}

/** Browser bytes use a streaming HTTP route; business commands still go through sdk.call. */
export function createMessageMaterialClient(sdk:Pick<ApplicationSDK,'instanceId'|'getSession'>,fetcher:typeof fetch=fetch){return {
 downloadURL(messageId:string,partId:string):string{return '/api/communication/material-read?'+new URLSearchParams({instanceId:sdk.instanceId,messageId,partId});},
 async upload(file:Blob,name:string,signal?:AbortSignal):Promise<MessageMaterial>{
  const session=await sdk.getSession(),query=new URLSearchParams({instanceId:sdk.instanceId,name});
  const response=await fetcher('/api/communication/material-upload?'+query,{method:'POST',headers:{'X-KSF-Token':session.token,'Content-Type':file.type||'application/octet-stream'},body:file,signal});
  const body=await response.json();if(!response.ok||body.ok===false)throw Object.assign(new Error(body.error?.message??'材料上传失败。'),{code:body.error?.code});return body.data;
 },
 async read(messageId:string,partId:string,signal?:AbortSignal):Promise<Response>{const query=new URLSearchParams({instanceId:sdk.instanceId,messageId,partId});const response=await fetcher('/api/communication/material-read?'+query,{signal,cache:'no-store'});if(!response.ok)throw new Error('消息材料读取失败。');return response;}
};}

/** Explicit human action, authenticated by a live application window lease. */
export function createDeviceNameClient(sdk:Pick<ApplicationSDK,'instanceId'|'getSession'>,fetcher:typeof fetch=fetch){return {async set(name:string):Promise<{name:string;custom:boolean}>{
 const session=await sdk.getSession(),response=await fetcher('/api/communication/device-name?'+new URLSearchParams({instanceId:sdk.instanceId}),{method:'POST',headers:{'X-KSF-Token':session.token,'Content-Type':'application/json'},body:JSON.stringify({name})}),body=await response.json();
 if(!response.ok||body.ok===false)throw Object.assign(new Error(body.error?.message??'本机名称保存失败。'),{code:body.error?.code});return body.data;
}};}
