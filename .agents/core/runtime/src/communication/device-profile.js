import {join} from 'node:path';
import {hostname} from 'node:os';
import {readJSON,atomicJSON,safeDirectory} from '../shared/durable-json.js';
import {ensure} from './contracts.js';
import {readConfigFile,publishConfigFile,expectConfig,withConfigLock} from '../configuration/storage.js';
export function deviceName(value){
 ensure(typeof value==='string','COMM_DEVICE_NAME_INVALID','本机名称需要文本。');const name=value.trim().normalize('NFC');
 ensure(name.length>0&&[...name].length<=64&&Buffer.byteLength(name)<=192&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(name),'COMM_DEVICE_NAME_INVALID','本机名称需要 1–64 个可见字符，不能包含控制字符。');return name;
}
/** Local installation metadata, excluded from Git together with the device identity. */
export async function createDeviceProfile(root){
 const home=join(root,'.agents/runtime-data/communication'),path=join(home,'device-profile.json');
 await safeDirectory(root,home);const saved=await readJSON(path,null);
 if(saved)ensure(saved.schemaVersion===1&&deviceName(saved.name)===saved.name,'COMM_DEVICE_PROFILE_INVALID','本机名称配置无效，请保留原件。');
 let profile={name:saved?.name??hostname(),custom:!!saved};
 return {get:()=>({...profile}),async set(input){const name=deviceName(input?.name);return withConfigLock(root,'device',async()=>{const before=readConfigFile(root,'.agents/runtime-data/communication/device-profile.json');if(input?.ifMatch!==undefined)expectConfig(before,input.ifMatch);if(before.document?.name!==name)publishConfigFile(root,before,{schemaVersion:1,name});profile={name,custom:true};return {...profile};});}};
}
