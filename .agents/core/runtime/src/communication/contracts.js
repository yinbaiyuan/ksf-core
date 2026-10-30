import {createHash,timingSafeEqual} from 'node:crypto';
import {safeDirectory as ensureDirectory,readJSON as readDurableJSON} from '../shared/durable-json.js';
import {networkInterfaces} from 'node:os';
export const error=(code,message,status=400,data)=>Object.assign(new Error(message),{code,status,data});
export const ensure=(condition,code,message,status=400)=>{if(!condition)throw error(code,message,status);};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const label=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value);
export const endpoint=value=>value&&['app','agent'].includes(value.kind)&&label(value.id);
export const endpointKey=value=>`${value.kind}:${value.id}`;
export const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
export const serialize=e=>({code:e.code??'COMMUNICATION_FAILED',message:e.message,status:e.status??500,...(e.data?{data:e.data}:{})});
export {atomicJSON,syncDirectory,replaceFile} from '../shared/durable-json.js';
export const safeDirectory=(root,path)=>ensureDirectory(root,path,{invalid:message=>{throw error('COMM_PATH_INVALID',message);}});
export const readJSON=(path,fallback)=>readDurableJSON(path,fallback,{invalid:message=>{throw error('COMM_STORAGE_INVALID',message);}});
export const DEFAULTS=Object.freeze({enabled:false,host:'',port:0,discovery:true,maxMessageBytes:1024**3,maxParts:32,maxManifestBytes:128*1024,maxStorageBytes:8*1024**3,maxTransfers:4,maxPeerTransfers:2,connectTimeoutMs:3000,controlTimeoutMs:10000,idleTimeoutMs:30000,operationTimeoutMs:15*60*1000,temporaryTTL:30*60*1000});
export function validateCommunicationConfiguration(value){
 const addresses=Object.values(networkInterfaces()).flat().filter(Boolean).map(item=>item.address);
 ensure(typeof value.enabled==='boolean'&&typeof value.discovery==='boolean'&&typeof value.host==='string'&&(!value.enabled||addresses.includes(value.host))&&(value.pairingPort===undefined||Number.isInteger(value.pairingPort)&&value.pairingPort>=0&&value.pairingPort<=65535)&&Number.isInteger(value.port)&&value.port>=0&&value.port<=65535&&Number.isSafeInteger(value.maxMessageBytes)&&value.maxMessageBytes>0&&value.maxMessageBytes<=16*1024**3&&Number.isSafeInteger(value.maxParts)&&value.maxParts>0&&value.maxParts<=256&&Number.isSafeInteger(value.maxStorageBytes)&&value.maxStorageBytes>=value.maxMessageBytes,'COMM_CONFIG_INVALID','请选择本机 IPv4 接口，并核对端口与容量。');
 return value;
}
