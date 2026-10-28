import {randomBytes} from 'node:crypto';
import {join,relative,resolve} from 'node:path';
import {realpath,lstat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {hostname} from 'node:os';
import {ensure,error,equal,safeDirectory,atomicJSON,readJSON} from './contracts.js';

export async function readControlInput(request){ensure(request.headers['content-type']?.split(';')[0]==='application/json','COMM_CONTENT_TYPE','控制请求需要 application/json。',415);let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;ensure(size<=1024*1024,'COMM_CONTROL_TOO_LARGE','控制参数超过 1 MiB。',413);chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks));ensure(value&&typeof value==='object'&&!Array.isArray(value),'COMM_INPUT_INVALID','请求需要 JSON 对象。');return value;}catch(e){if(e.code)throw e;throw error('COMM_INPUT_INVALID','无效 JSON。');}}
export function createLocalControl(root,{applications,communication}){
 const token=randomBytes(32).toString('hex'),home=join(root,'.agents/runtime-data/web'),path=join(home,'control.json');let published=false;const pending=new Set();
 async function publish(url){await safeDirectory(root,home);const previous=await readJSON(path,null);if(previous?.hostname===hostname()&&previous.pid!==process.pid){let live=true;try{process.kill(previous.pid,0);}catch(e){live=e.code!=='ESRCH';}ensure(!live,'WEB_OTHER_HOST_RUNNING','当前 KSF 根已有本机控制入口。',409);}await atomicJSON(path,{protocol:'ksf-local-control-v1',url,token,pid:process.pid,hostname:hostname()});published=true;}
 async function invoke(operation,input={},caller){const service=await communication;
  switch(operation){
   case 'state':return {...await service.snapshot(),routes:await applications.messageRoutes(),background:await applications.backgroundHolds(),operations:(await service.store.listOperations()).sort((a,b)=>b.createdAt-a.createdAt).slice(0,50)};
   case 'configure':return service.configure(input);
   case 'identity':return service.identityExport();
   case 'trust':return service.trust(input);
   case 'untrust':return service.untrust(input.nodeId);
   case 'grant':return service.grant(input);
   case 'retry':return service.retryDelivery(input.messageId);
   case 'endpoints.open':return service.openEndpoint(input);
   case 'endpoints.close':return service.closeEndpoint(input.endpointId);
   case 'endpoints.configure':return service.configureEndpoint(input.endpointId,input);
   case 'messages.send':return service.send(caller,input);
   case 'messages.status':return service.getOperation(caller,input.operationId);
   case 'messages.reconcile':return service.reconcile(caller,input.operationId);
   case 'messages.cancel':return service.cancel(caller,input.operationId);
   case 'messages.inbox':return service.inbox(caller,input);
   case 'messages.read':return service.readMessage(caller,input.messageId);
   case 'messages.readPart':return service.readPart(caller,input.messageId,input.partId);
   case 'messages.ack':return service.ack(caller,input.messageId);
   default:throw error('COMM_OPERATION_UNKNOWN','未知通信操作。',404);
  }
 }
 async function streamPart(response,part){response.writeHead(200,{'content-type':part.mediaType,'content-length':part.byteLength,'cache-control':'no-store','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(part.name??part.partId)}`});await pipeline(createReadStream(part.path),response);}
 async function handleRequest(request,url,send,response,{local=false}={}){
  const json=(data,status=200)=>send(status,JSON.stringify({ok:true,data})+'\n');const service=await communication;
  if(local){ensure(equal(request.headers.authorization?.replace(/^Bearer /,''),token),'COMM_CONTROL_FORBIDDEN','本机控制凭据无效。',403);ensure(request.method==='POST','WEB_METHOD_NOT_ALLOWED','本机控制只支持 POST。',405);
   if(url.pathname==='/api/local/materials/upload'){const caller=await service.authenticateToken(request.headers['x-ksf-agent-token']);request.allowLargeBody?.();json(await service.registerMaterial(caller,request,{name:url.searchParams.get('name')??'material',mediaType:request.headers['content-type']??'application/octet-stream'}),201);return true;}
   const {operation,input={}}=await readControlInput(request);
   if(url.pathname==='/api/local/apps'){if(operation==='list')json(await applications.listApplications());else if(operation==='docs')json(await applications.cliDocs(input.appId,input));else if(operation==='exec')json(await applications.cliExec(input.appId,input.commandId,input.request));else throw error('APP_CLI_COMMAND_UNKNOWN','未知应用网关操作。');return true;}
   ensure(url.pathname==='/api/local/communication','COMM_ROUTE_NOT_FOUND','本机控制路由不存在。',404);const caller=operation?.startsWith('messages.')?await service.authenticateToken(request.headers['x-ksf-agent-token']):undefined;
   if(operation==='messages.readPart'&&input.stream){await streamPart(response,await service.readPart(caller,input.messageId,input.partId));return true;}
   json(await invoke(operation,input,caller));return true;
  }
  if(url.pathname==='/api/communication/material-upload'){ensure(request.method==='POST','WEB_METHOD_NOT_ALLOWED','材料上传需要 POST。',405);const caller=applications.caller(url.searchParams.get('instanceId'));await applications.communicationPermission(caller.appId,'messages.send');request.allowLargeBody?.();json(await service.registerMaterial({kind:'app',id:caller.appId},request,{name:url.searchParams.get('name')??'material',mediaType:request.headers['content-type']??'application/octet-stream'}),201);return true;}
  if(url.pathname==='/api/communication/material-read'){ensure(request.method==='GET','WEB_METHOD_NOT_ALLOWED','材料只支持 GET。',405);const caller=applications.caller(url.searchParams.get('instanceId'));await applications.communicationPermission(caller.appId,'messages.receive');await streamPart(response,await service.readPart({kind:'app',id:caller.appId},url.searchParams.get('messageId'),url.searchParams.get('partId')));return true;}
  const operation=url.pathname.slice('/api/communication/'.length);ensure(operation==='state'||request.method==='POST','WEB_METHOD_NOT_ALLOWED','通信管理需要 POST。',405);const input=request.method==='POST'?await readControlInput(request):{};json(await invoke(operation,input));return true;
 }
 async function registerFile(caller,input){ensure(typeof input?.path==='string','COMM_MATERIAL_INVALID','材料需要应用数据目录中的路径。');const base=await realpath(join(root,'.agents/user-data/applications/data',caller.appId)),file=await realpath(resolve(input.path)),rel=relative(base,file);ensure(rel&&!rel.startsWith('..')&&!rel.includes(':'),'COMM_FORBIDDEN','应用材料必须位于自身数据目录。',403);const stat=await lstat(file);ensure(stat.isFile()&&!stat.isSymbolicLink(),'COMM_MATERIAL_INVALID','材料需要普通文件。');return (await communication).registerMaterial({kind:'app',id:caller.appId},createReadStream(file),{name:input.name??rel,mediaType:input.mediaType??'application/octet-stream'});}
 async function handle(...args){const task=handleRequest(...args);pending.add(task);try{return await task;}finally{pending.delete(task);}}
 const drain=()=>Promise.allSettled([...pending]);
 async function close(){await drain();if(published&&(await readJSON(path,null))?.token===token)await rm(path,{force:true});}
 return {publish,handle,invoke,registerFile,drain,close};
}
