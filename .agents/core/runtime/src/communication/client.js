import {request} from 'node:http';
import {readFile,open,rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {ensure,error,readJSON,safeDirectory,atomicJSON,sha256,uuid} from './contracts.js';
const unknown=error=>Object.assign(error,{data:{...error.data,outcomeUnknown:true}});

export async function readLocalControl(root){const value=await readJSON(join(root,'.agents/runtime-data/web/control.json'),null);ensure(value?.protocol==='ksf-local-control-v1'&&typeof value.token==='string','COMM_BACKEND_UNAVAILABLE','KSF Web 后端未运行或尚不支持本机控制入口。',503);const url=new URL(value.url);ensure(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password,'COMM_CONTROL_INVALID','本机控制地址无效。');return value;}
export async function controlRequest(root,path,{operation,input={},agentToken,stream,name,mediaType,output}={}){
 const control=await readLocalControl(root),url=new URL(path,control.url);if(name)url.searchParams.set('name',name);const body=stream?null:Buffer.from(JSON.stringify({operation,input}));
 return new Promise((resolve,reject)=>{const req=request(url,{method:'POST',headers:{authorization:'Bearer '+control.token,...(agentToken?{'x-ksf-agent-token':agentToken}:{}),'content-type':stream?mediaType??'application/octet-stream':'application/json',...(body?{'content-length':body.length}:{})}},res=>{
  if(output&&res.statusCode===200){const destination=createWriteStream(output,{flags:'wx',mode:0o600});let opened=false;destination.once('open',()=>{opened=true;});pipeline(res,destination).then(()=>resolve({path:output,byteLength:Number(res.headers['content-length']??0)}),async e=>{if(opened)await rm(output,{force:true});reject(e);});return;}
  let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024)res.destroy(error('COMM_RESPONSE_INVALID','本机控制响应过大。'));else chunks.push(chunk);});res.on('error',e=>reject(unknown(e)));res.on('end',()=>{try{const result=JSON.parse(Buffer.concat(chunks));if(!result.ok)throw Object.assign(error(result.error?.code??'COMM_CONTROL_FAILED',result.error?.message??'本机调用失败。',res.statusCode),{data:result.data??result.error?.data});resolve(result.data);}catch(e){reject(e instanceof SyntaxError?unknown(error('COMM_RESPONSE_INVALID','本机控制响应无效，请核对原操作结果。',502)):e);}});
 });req.on('error',e=>reject(e.code==='ECONNREFUSED'?error('COMM_BACKEND_UNAVAILABLE','无法连接 KSF 后台。',503):unknown(e)));req.setTimeout(stream?30000:25000,()=>req.destroy(error('COMM_CONTROL_TIMEOUT','本机调用等待超时，请核对原操作。',504,{outcomeUnknown:true})));if(stream)pipeline(stream,req).catch(reject);else req.end(body);
 });
}
export async function cacheAgent(root,result){const home=join(root,'.agents/runtime-data/communication/agents');await safeDirectory(root,home);if(result.accessToken)await atomicJSON(join(home,result.endpoint.id+'.json'),{endpoint:result.endpoint,accessToken:result.accessToken});return {endpoint:result.endpoint,reused:!!result.reused};}
export async function agentCredential(root,endpointId){const home=join(root,'.agents/runtime-data/communication/agents');if(endpointId){ensure(uuid(endpointId),'COMM_ENDPOINT_INVALID','Agent 端点 ID 无效。');const value=await readJSON(join(home,endpointId+'.json'),null);ensure(value?.accessToken,'COMM_AGENT_CREDENTIAL_MISSING','当前本机没有此收件箱的凭据。',403);return value;}
 const key=sha256(root+':'+(process.env.CODEX_THREAD_ID??process.env.KSF_AGENT_ID??'local-owner')),mapping=await readJSON(join(home,key+'.json'),null);if(mapping)return agentCredential(root,mapping.endpoint.id);
 const result=await controlRequest(root,'/api/local/communication',{operation:'endpoints.open',input:{key:'agent:'+key,channels:['message.v1'],peers:[]}});await cacheAgent(root,result);ensure(result.accessToken,'COMM_AGENT_CREDENTIAL_MISSING','收件箱已存在但凭据不可用，请使用已登记端点或明确建立新的 key。',403);await atomicJSON(join(home,key+'.json'),{endpoint:result.endpoint});return result;
}
