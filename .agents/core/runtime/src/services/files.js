import {lstat,open,mkdir,readdir,rm,rmdir,rename,link,unlink} from 'node:fs/promises';
import {watch as watchFS} from 'node:fs';
import {join,dirname,relative,resolve,isAbsolute,sep} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {Transform,Writable} from 'node:stream';
import {platform} from '../platform/index.js';
import {safeDirectory,atomicJSON,readJSON,replaceFile,syncDirectory} from '../shared/durable-json.js';
import {withAsyncFileLock} from '../shared/async-lock.js';
import {publishTemporary} from '../shared/durable-files.js';
import {filePolicy,workspaceFileSkip} from '../shared/file-policy.js';
import {createCoordinator,assert,problem,digest} from './workbench-common.js';

export const MAX_FILE_BYTES=128*1024*1024;
const MAX_ENTRIES=50000;
const version=s=>digest(JSON.stringify([s.dev,s.ino,s.birthtimeMs,s.mtimeMs,s.ctimeMs,s.size,s.mode]));
const inside=(root,path)=>{const p=relative(root,path);return !isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep);};
const idOK=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(id);
const absent=e=>e.code==='ENOENT';
const fileWriter=handle=>new Writable({write(chunk,encoding,done){handle.writeFile(chunk).then(()=>done(),done);}});
async function* fileChunks(handle){for(;;){const buffer=Buffer.allocUnsafe(64*1024),{bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)return;yield buffer.subarray(0,bytesRead);}}
async function treeDigest(path){
 const stat=await lstat(path);assert(!stat.isSymbolicLink(),'WORKSPACE_SYMLINK','不跟随符号链接。',403);
 if(stat.isDirectory()){const entries=[];for(const name of (await readdir(path)).sort())entries.push([name,await treeDigest(join(path,name))]);return digest(JSON.stringify(entries));}
 const handle=await open(path,'r'),hash=createHash('sha256');try{for await(const chunk of fileChunks(handle))hash.update(chunk);return hash.digest('hex');}finally{await handle.close();}
}

/** Root-bound file operations. App identity is supplied by the host, never by FileRef. */
export function createFileService(root,{workspace,coordinator=createCoordinator(),guard=async()=>{},fault}={}){
  root=resolve(root);
  const home=join(root,'.agents/runtime-data/files'),receipts=join(home,'operations'),trashHome=join(home,'trash');
  const inflight=new Map(),pendingOperations=new Map(),subscriptions=new Map(),watchers=new Map();
  const epoch=randomUUID();let sequence=0,closed=false;
  const appKey=caller=>{assert(/^[a-z][a-z0-9.-]{1,79}$/.test(caller?.appId??''),'APP_PATH_INVALID','文件操作需要有效应用身份。');return caller.appId;};
  function reference(caller,ref){
    appKey(caller);
    assert(ref&&['workspace','user','runtime'].includes(ref.scope)&&typeof ref.path==='string'&&ref.path.length<=4096&&!/[\\\x00-\x1f\x7f]/.test(ref.path)&&!isAbsolute(ref.path),'FILE_PATH_INVALID','请选择有效范围内的相对路径。');
    const parts=ref.path.split('/').filter(Boolean);
    assert(parts.every(p=>p!=='.'&&p!=='..'&&platform.validSegment(p)&&!/^\.ksf-(?:edit|file|copy)-/.test(p)),'FILE_PATH_INVALID','文件路径无效。');
    const base=ref.scope==='workspace'?root:join(root,ref.scope==='user'?'.agents/user-data/applications/data':'.agents/runtime-data/applications/data',caller.appId);
    const path=parts.join('/'),target=resolve(base,...parts);
    assert(inside(base,target),'FILE_PATH_INVALID','路径不能越出文件范围。');
    if(ref.scope==='workspace')assert(filePolicy(path)!=='blocked','WORKSPACE_PROTECTED','此文件不开放内容访问。',403);
    return {ref:{scope:ref.scope,path},base,target};
  }
  async function locate(caller,ref,{missing=false,parents=false}={}){
    const item=reference(caller,ref),parts=relative(root,item.target).split(sep).filter(Boolean);let path=root;
    for(let n=0;n<parts.length;n++){
      path=join(path,parts[n]);let stat;
      try{stat=await lstat(path);}catch(e){if(absent(e)&&missing&&(parents||n===parts.length-1))return {...item,stat:null};throw e;}
      assert(!stat.isSymbolicLink(),'WORKSPACE_SYMLINK','不跟随符号链接。',403);
      if(n<parts.length-1)assert(stat.isDirectory(),'FILE_PATH_INVALID','父路径不是目录。');
    }
    return {...item,stat:await lstat(item.target)};
  }
  async function writable(caller,ref,action='write'){
    const item=reference(caller,ref);assert(item.ref.path,'FILE_ROOT_PROTECTED','不能修改文件范围根目录。',403);
    if(ref.scope==='workspace'){
      assert(filePolicy(item.ref.path)==='editable','WORKSPACE_READONLY','此路径请使用对应的专用入口。',403);
      await guard({...item.ref,action});
    }else{
      assert(!caller.dataStores?.some(s=>s.scope===ref.scope&&(s.name.toLowerCase()===item.ref.path.toLowerCase()||s.name.toLowerCase().startsWith(item.ref.path.toLowerCase()+'/'))),'APP_DATA_MANAGED','受管数据请使用 storage 和显式迁移接口。',403);
      assert(!/\.(?:lock|tmp)$/i.test(item.ref.path),'FILE_PATH_PROTECTED','宿主存储锁和暂存文件不能通过通用接口修改。',403);
    }
    return item;
  }
  async function snapshot(caller,ref,{recursive=false}={}){
    const item=await locate(caller,ref);assert(item.stat.isDirectory()||item.stat.isFile(),'FILE_TYPE_INVALID','仅支持普通文件和目录。');
    if(item.stat.isFile())return {...item,version:version(item.stat)};
    const entries=[];
    async function walk(folder,prefix=''){
      for(const e of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        if(e.name.startsWith('.ksf-'))continue;
        assert(entries.length<MAX_ENTRIES,'FILE_DIRECTORY_LIMIT','目录超过50,000项。',413);
        const path=join(folder,e.name),s=await lstat(path);
        entries.push([prefix+e.name,version(s)]);if(recursive&&s.isDirectory()&&!s.isSymbolicLink()&&(ref.scope!=='workspace'||!workspaceFileSkip.has(e.name)&&filePolicy(relative(root,path).split(sep).join('/'))!=='blocked'))await walk(path,prefix+e.name+'/');
      }
    }
    await walk(item.target);return {...item,version:digest(JSON.stringify([version(item.stat),entries]))};
  }
  const info=item=>({ref:item.ref,path:item.ref.path,kind:item.stat.isDirectory()?'directory':'file',size:item.stat.size,modifiedAt:item.stat.mtime.toISOString(),version:item.version,policy:item.ref.scope==='workspace'?filePolicy(item.ref.path):'editable',writable:!!item.ref.path&&(item.ref.scope!=='workspace'||filePolicy(item.ref.path)==='editable')});
  async function stat(caller,ref){try{const value=info(await snapshot(caller,ref,{recursive:!!ref.path&&(ref.scope!=='workspace'||filePolicy(ref.path)==='editable')}));try{await writable(caller,ref);}catch(e){value.writable=false;value.protection={code:e.code,message:e.message};}return value;}catch(e){if(absent(e)&&ref.scope!=='workspace'&&!ref.path){reference(caller,ref);return {ref,path:'',kind:'directory',size:0,modifiedAt:new Date(0).toISOString(),version:'missing',policy:'editable',writable:true};}throw e;}}
  async function exists(caller,ref){try{await locate(caller,ref);return true;}catch(e){if(absent(e))return false;throw e;}}
  async function list(caller,ref){
    let folder;try{folder=await locate(caller,ref);}catch(e){if(absent(e)&&ref.scope!=='workspace'&&!ref.path)return {...await stat(caller,ref),entries:[]};throw e;}assert(folder.stat.isDirectory(),'WORKSPACE_NOT_DIRECTORY','请选择目录。');
    const entries=[];
    for(const e of await readdir(folder.target,{withFileTypes:true})){
      if(workspaceFileSkip.has(e.name)||e.name.startsWith('.ksf-')||e.isSymbolicLink())continue;
      const child={scope:ref.scope,path:[folder.ref.path,e.name].filter(Boolean).join('/')};
      if(ref.scope==='workspace'&&filePolicy(child.path)==='blocked')continue;
      assert(entries.length<MAX_ENTRIES,'FILE_DIRECTORY_LIMIT','目录超过50,000项。',413);
      try{entries.push(await stat(caller,child));}catch(e){if(e.code!=='FILE_DIRECTORY_LIMIT')throw e;entries.push({...info(await snapshot(caller,child)),writable:false,protection:{code:e.code,message:e.message}});}
    }
    entries.sort((a,b)=>(a.kind==='directory'?0:1)-(b.kind==='directory'?0:1)||a.path.localeCompare(b.path,'zh-CN'));
    return {...await stat(caller,ref),entries};
  }
  async function openRead(caller,ref,{ifMatch}={}){
    const item=await snapshot(caller,ref);assert(item.stat.isFile(),'WORKSPACE_NOT_FILE','请选择普通文件。');assert(item.stat.size<=MAX_FILE_BYTES,'FILE_TOO_LARGE','文件超过128 MiB。',413);
    if(ifMatch!==undefined)assert(item.version===ifMatch,'WORKSPACE_CONFLICT','文件已变化，请重新读取。',409);
    const handle=await open(item.target,'r');try{assert(version(await handle.stat())===item.version,'WORKSPACE_CONFLICT','打开时文件已变化。',409);}catch(e){await handle.close();throw e;}
    let finish;const pending=new Promise(resolve=>{finish=resolve;});void tracked(caller,()=>pending);const close=handle.close.bind(handle);handle.close=async()=>{try{return await close();}finally{finish();}};
    return {info:info(item),handle,async verify(){assert(version(await handle.stat())===item.version&&version(await lstat(item.target))===item.version,'WORKSPACE_CONFLICT','读取时文件已变化。',409);}};
  }
  async function read(caller,ref,options){const r=await openRead(caller,ref,options);try{const bytes=await r.handle.readFile();assert(bytes.length<=MAX_FILE_BYTES,'FILE_TOO_LARGE','文件超过128 MiB。',413);await r.verify();return {...r.info,bytes};}finally{await r.handle.close();}}
  async function readText(caller,ref,options){const r=await read(caller,ref,options);let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(r.bytes);}catch{throw problem('WORKSPACE_BINARY','此文件不是UTF-8文本。',415);}return {...r,bytes:undefined,text};}
  async function lockKey(caller,ref){return ref.scope==='workspace'&&workspace?workspace.lockKey(ref.path):reference(caller,ref).target.normalize('NFC').toLowerCase();}
  async function locked(caller,refs,action){const keys=await Promise.all(refs.map(ref=>lockKey(caller,ref)));return coordinator.runMany(keys,action);}
  function tracked(caller,action){const key=appKey(caller),set=inflight.get(key)??new Set();inflight.set(key,set);const p=Promise.resolve().then(action);set.add(p);return p.finally(()=>{set.delete(p);if(!set.size)inflight.delete(key);});}
  const operationPath=(caller,id)=>join(receipts,appKey(caller),id+'.json');
  async function operation(caller,id){
    assert(idOK(id),'FILE_OPERATION_INVALID','操作编号无效。');const record=await readJSON(operationPath(caller,id));
    if(record.state==='committed')return record;
    const input=record.input??{},inspection={};
    for(const [key,ref]of Object.entries({source:input.ref,destination:input.destination}))if(ref)inspection[key]=await stat(caller,ref).catch(e=>{if(absent(e))return null;return {error:{code:e.code,message:e.message}};});
    if(record.kind==='write'&&input.contentDigest&&inspection.source?.kind==='file'){
      const content=await read(caller,input.ref);if(digest(content.bytes)===input.contentDigest)return {...record,state:'committed',reconciled:true,result:{...inspection.source,operationId:id}};
    }
    if(record.kind==='trash'){const entry=(await listTrash(caller)).find(e=>e.id===(record.candidate?.trashId??id)&&e.appId===caller.appId&&JSON.stringify(e.ref)===JSON.stringify(input.ref));if(entry)return {...record,state:'committed',reconciled:true,result:{...entry,operationId:id}};}
    if(['copy','move'].includes(record.kind)&&record.candidate?.targetDigest&&inspection.destination&&!inspection.destination.error&&
      (record.kind==='copy'||inspection.source===null)&&await treeDigest(reference(caller,input.destination).target)===record.candidate.targetDigest)return {...record,state:'committed',reconciled:true,result:{...inspection.destination,operationId:id}};
    if(record.kind==='restore'){
      const folder=await findTrash(caller,input.trashId),entry=await readJSON(join(folder,'entry.json'),null);
      if(entry&&['restoring','restored'].includes(entry.state)){const ref=entry.destination,current=await stat(caller,ref).catch(()=>null),payload=await lstat(join(folder,'payload')).catch(e=>{if(absent(e))return null;throw e;});if(!payload&&current&&entry.contentDigest===await treeDigest(reference(caller,ref).target))return {...record,state:'committed',reconciled:true,result:{...current,operationId:id}};}
    }
    return {...record,inspection};
  }
  async function mutate(caller,kind,input,action){
    const id=input.operationId??randomUUID();assert(idOK(id),'FILE_OPERATION_INVALID','操作编号无效。');
    const key=appKey(caller)+':'+id,fingerprint=digest(JSON.stringify([kind,input.ref,input.destination,input.version,input.ifMatch,input.recursive,input.trashId,input.ids,input.contentDigest,input.confirm]));
    if(pendingOperations.has(key)){const entry=pendingOperations.get(key);assert(entry.fingerprint===fingerprint,'FILE_OPERATION_CONFLICT','操作编号已用于其他请求。',409);return entry.promise;}
    const promise=tracked(caller,async()=>{
      const path=operationPath(caller,id);await safeDirectory(root,dirname(path));
      return withAsyncFileLock(path+'.lock',async()=>{
        const previous=await readJSON(path,null);
        if(previous){assert(previous.fingerprint===fingerprint,'FILE_OPERATION_CONFLICT','操作编号已用于其他请求。',409);if(previous.state==='committed')return previous.result;const observed=await operation(caller,id);if(observed.state==='committed'){await atomicJSON(path,observed);return observed.result;}throw problem('FILE_OPERATION_UNKNOWN','请先核对上次操作及原件，不能盲目重试。',409,{operationId:id,record:observed});}
        const {bytes,text,...metadata}=input;
        const record={schemaVersion:1,operationId:id,appId:caller.appId,kind,fingerprint,state:'prepared',createdAt:new Date().toISOString(),input:metadata};
        await atomicJSON(path,record);
        try{const value=await action(record,patch=>{Object.assign(record,patch);return atomicJSON(path,record);});const result={...value,operationId:id};await atomicJSON(path,{...record,state:'committed',result});return result;}
        catch(e){e.data={...e.data,operationId:id};await atomicJSON(path,{...record,state:'unconfirmed',error:{code:e.code,message:e.message}}).catch(()=>{});throw e;}
      });
    }).finally(()=>pendingOperations.delete(key));pendingOperations.set(key,{fingerprint,promise});return promise;
  }
  async function publish(temp,target,{replace=false,directory=false}={}){
    await publishTemporary(temp,target,{replace,directory});
  }
  function emit(caller,type,ref,previousRef){sequence++;for(const sub of subscriptions.values())if(sub.caller.appId===caller.appId||ref.scope==='workspace'){
    if(sub.ref.scope===ref.scope&&(ref.path===sub.ref.path||ref.path.startsWith(sub.ref.path?sub.ref.path+'/':'' )||sub.ref.path.startsWith(ref.path+'/')||previousRef&&(previousRef.path===sub.ref.path||previousRef.path.startsWith(sub.ref.path+'/')||sub.ref.path.startsWith(previousRef.path+'/'))))sub.events.push({type,ref,previousRef,cursor:epoch+':'+sequence});
  }}
  function write(caller,input,source){
    if(!source){const bytes=Buffer.from(input.bytes??input.text??'');input={...input,bytes,contentDigest:digest(bytes)};}
    else assert(/^[a-f0-9]{64}$/.test(input.contentDigest??''),'FILE_DIGEST_REQUIRED','上传需要内容摘要。');
    return mutate(caller,'write',input,(record,checkpoint)=>locked(caller,[input.ref],async()=>{
    const item=await writable(caller,input.ref);if(input.ref.scope!=='workspace')await safeDirectory(root,item.base);await locate(caller,input.ref,{missing:true});
    const current=await exists(caller,input.ref)?await snapshot(caller,input.ref):null;
    assert(current?typeof input.ifMatch==='string'&&current.version===input.ifMatch:input.ifMatch===undefined||input.ifMatch===null,'WORKSPACE_CONFLICT','目标已存在或文件已变化，请核对后保存。',409);
    const temp=join(dirname(item.target),'.ksf-file-'+randomUUID());let handle;
    try{
      await checkpoint({candidate:{temporary:relative(root,temp),ref:item.ref,contentDigest:input.contentDigest}});
      handle=await open(temp,'wx',current?current.stat.mode&0o777:0o600);let size=0;const hash=createHash('sha256');
      const limit=new Transform({transform(chunk,encoding,done){size+=chunk.length;if(size>MAX_FILE_BYTES)return done(problem('FILE_TOO_LARGE','文件超过128 MiB。',413));hash.update(chunk);done(null,chunk);}});
      await pipeline(source??Readable.from([Buffer.from(input.bytes??input.text??'')]),limit,fileWriter(handle));
      await handle.sync();await handle.close();handle=undefined;
      if(input.contentDigest)assert(hash.digest('hex')===input.contentDigest,'FILE_DIGEST_MISMATCH','上传内容摘要与请求不符。');
      await fault?.('before-publish',{temp,target:item.target});
      const latest=await exists(caller,input.ref)?await snapshot(caller,input.ref):null;assert(current?latest?.version===current.version:!latest,'WORKSPACE_CONFLICT','发布前文件已变化。',409);
      await publish(temp,item.target,{replace:!!current});await fault?.('after-publish',{target:item.target});emit(caller,current?'update':'create',item.ref);return stat(caller,item.ref);
    }finally{await handle?.close();await rm(temp,{force:true});}
  }));}
  async function inspectTree(caller,ref,action){
    await writable(caller,ref,action);
    const original=await snapshot(caller,ref,{recursive:true});let count=0;
    async function check(current){assert(++count<=MAX_ENTRIES,'FILE_DIRECTORY_LIMIT','目录超过50,000项。',413);await writable(caller,current,action);const item=await locate(caller,current);if(item.stat.isDirectory())for(const name of await readdir(item.target))await check({scope:current.scope,path:current.path+'/'+name});}
    await check(ref);return original;
  }
  function mkdirPath(caller,input){return mutate(caller,'mkdir',input,()=>locked(caller,[input.ref],async()=>{const item=await writable(caller,input.ref,'mkdir');if(input.ref.scope!=='workspace')await safeDirectory(root,item.base);await locate(caller,input.ref,{missing:true,parents:!!input.recursive});if(input.recursive)await safeDirectory(root,item.target);else await mkdir(item.target);emit(caller,'create',item.ref);return stat(caller,item.ref);}));}
  async function validateDestinations(caller,source,ref,action){
    let count=0;async function walk(path,target){assert(++count<=MAX_ENTRIES,'FILE_DIRECTORY_LIMIT','目录超过50,000项。',413);await writable(caller,target,action);const stat=await lstat(path);assert(!stat.isSymbolicLink(),'WORKSPACE_SYMLINK','不跟随符号链接。',403);if(stat.isDirectory())for(const name of await readdir(path))await walk(join(path,name),{scope:target.scope,path:target.path+'/'+name});}await walk(source,ref);
  }
  async function copyTree(source,target){const s=await lstat(source);if(s.isDirectory()){await mkdir(target,{mode:s.mode&0o777});for(const name of await readdir(source))await copyTree(join(source,name),join(target,name));await syncDirectory(target);}else{const before=version(s),src=await open(source,'r'),dst=await open(target,'wx',s.mode&0o777);try{await pipeline(Readable.from(fileChunks(src)),fileWriter(dst));await dst.sync();assert(version(await src.stat())===before&&version(await lstat(source))===before,'WORKSPACE_CONFLICT','复制时来源已变化。',409);}finally{await src.close();await dst.close();}}}
  function transfer(caller,input,copy){return mutate(caller,copy?'copy':'move',input,(record,checkpoint)=>locked(caller,[input.ref,input.destination],async()=>{
    const source=await inspectTree(caller,input.ref,copy?'copy':'move'),target=await writable(caller,input.destination,copy?'copy-target':'move-target');
    assert(source.version===input.version,'WORKSPACE_CONFLICT','来源已变化，请重新选择。',409);if(input.destination.scope!=='workspace')await safeDirectory(root,target.base);await locate(caller,input.destination,{missing:true});
    assert(!inside(source.target,target.target),'FILE_MOVE_INVALID','目标不能位于来源内部。');assert(!await exists(caller,input.destination),'WORKSPACE_EXISTS','目标已存在。',409);await validateDestinations(caller,source.target,target.ref,copy?'copy-target':'move-target');
    const temp=copy?join(dirname(target.target),'.ksf-copy-'+randomUUID()):source.target;
    await checkpoint({candidate:{temporary:relative(root,temp),ref:target.ref}});
    try{if(copy){await copyTree(source.target,temp);assert((await snapshot(caller,input.ref,{recursive:true})).version===source.version,'WORKSPACE_CONFLICT','复制时来源目录已变化。',409);}else assert(source.stat.dev===(await lstat(dirname(target.target))).dev,'FILE_CROSS_DEVICE','跨文件系统移动不受支持，来源已保留。',409);
      await checkpoint({candidate:{temporary:relative(root,temp),ref:target.ref,targetDigest:await treeDigest(temp)}});
      await fault?.('before-publish',{temp,target:target.target});assert((await snapshot(caller,input.ref,{recursive:true})).version===source.version,'WORKSPACE_CONFLICT','发布前来源已变化。',409);await publish(temp,target.target,{directory:source.stat.isDirectory()});if(!copy)await syncDirectory(dirname(source.target));await fault?.('after-publish',{target:target.target});emit(caller,copy?'create':'move',target.ref,copy?undefined:source.ref);return stat(caller,target.ref);
    }finally{if(copy)await rm(temp,{recursive:true,force:true});}
  }));}
  const trashPath=(caller,id,scope)=>{assert(idOK(id),'FILE_TRASH_INVALID','回收条目编号无效。');return join(trashHome,scope==='workspace'?'workspace':appKey(caller),id);};
  async function findTrash(caller,id){const own=trashPath(caller,id),shared=trashPath(caller,id,'workspace');try{await lstat(join(own,'entry.json'));return own;}catch(e){if(!absent(e))throw e;}return shared;}
  function trash(caller,input){return mutate(caller,'trash',input,(operation,checkpoint)=>locked(caller,[input.ref],async()=>{
    const source=await inspectTree(caller,input.ref,'trash');assert(source.version===input.version,'WORKSPACE_CONFLICT','文件已变化，请重新选择。',409);
    const id=randomUUID(),folder=trashPath(caller,id,input.ref.scope);await checkpoint({candidate:{trashId:id}});await safeDirectory(root,dirname(folder));await mkdir(folder,{mode:0o700});assert(source.stat.dev===(await lstat(folder)).dev,'FILE_CROSS_DEVICE','跨文件系统回收不受支持，来源已保留。',409);
    const record={schemaVersion:1,id,appId:caller.appId,ref:source.ref,kind:source.stat.isDirectory()?'directory':'file',version:source.version,contentDigest:await treeDigest(source.target),deletedAt:new Date().toISOString(),state:'prepared'};await atomicJSON(join(folder,'entry.json'),record);
    await fault?.('before-trash',{source:source.target,folder});assert((await snapshot(caller,input.ref,{recursive:true})).version===source.version,'WORKSPACE_CONFLICT','回收前来源已变化。',409);await rename(source.target,join(folder,'payload'));await syncDirectory(dirname(source.target));await syncDirectory(folder);await fault?.('after-trash',{folder});await atomicJSON(join(folder,'entry.json'),{...record,state:'trashed'});emit(caller,'delete',source.ref);return {...record,state:'trashed'};
  }));}
  async function listTrash(caller){
    const values=[];
    for(const bucket of [appKey(caller),'workspace']){const base=join(trashHome,bucket);let names;try{names=await readdir(base);}catch(e){if(absent(e))continue;throw e;}
      for(const id of names){if(!idOK(id))continue;const folder=join(base,id),record=await readJSON(join(folder,'entry.json'),null);if(!record)continue;const payload=await lstat(join(folder,'payload')).catch(e=>{if(absent(e))return null;throw e;});if(payload)values.push({...record,state:record.state==='prepared'?'trashed':record.state});}
    }
    return values.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
  }
  function restore(caller,input){return mutate(caller,'restore',input,async()=>{const folder=await findTrash(caller,input.trashId),record=await readJSON(join(folder,'entry.json')),ref=input.destination??record.ref;return locked(caller,[ref],()=>withAsyncFileLock(folder+'.lock',async()=>{
    assert((record.ref.scope==='workspace'||record.appId===caller.appId)&&ref.scope===record.ref.scope,'FILE_TRASH_INVALID','回收条目归属或范围无效。');const target=await writable(caller,ref,'restore');await locate(caller,ref,{missing:true,parents:true});assert(!await exists(caller,ref),'WORKSPACE_EXISTS','原路径已占用，请选择其他恢复位置。',409);const payload=join(folder,'payload');await validateDestinations(caller,payload,target.ref,'restore');await safeDirectory(root,dirname(target.target));
    const s=await lstat(payload);assert(s.dev===(await lstat(dirname(target.target))).dev,'FILE_CROSS_DEVICE','跨文件系统恢复不受支持。',409);await atomicJSON(join(folder,'entry.json'),{...record,state:'restoring',destination:ref});await fault?.('before-restore',{payload,target:target.target});await publish(payload,target.target,{directory:s.isDirectory()});await fault?.('after-restore',{payload,target:target.target});await atomicJSON(join(folder,'entry.json'),{...record,state:'restored',destination:ref});emit(caller,'create',ref);return stat(caller,ref);
  }));});}
  function purge(caller,input){return mutate(caller,'purge',input,async()=>{assert(input.confirm===true,'FILE_CONFIRM_REQUIRED','永久删除需要明确确认。');const folder=await findTrash(caller,input.trashId);return withAsyncFileLock(folder+'.lock',async()=>{await readJSON(join(folder,'entry.json'));await rm(folder,{recursive:true});await syncDirectory(dirname(folder));return {trashId:input.trashId,purged:true};});});}
  async function emptyTrash(caller,input){assert(input.confirm===true&&Array.isArray(input.ids),'FILE_CONFIRM_REQUIRED','请确认要永久删除的回收条目。');const results=[];for(const trashId of input.ids){try{results.push(await purge(caller,{trashId,confirm:true,operationId:(input.operationId??randomUUID())+'_'+digest(trashId).slice(0,12)}));}catch(e){results.push({trashId,error:{code:e.code,message:e.message}});}}return {results};}
  async function watchSnapshot(caller,ref){const map=new Map();let count=0;async function walk(current){let item;try{item=await locate(caller,current);}catch(e){if(absent(e))return;throw e;}map.set(current.path,version(item.stat));if(item.stat.isDirectory())for(const e of await readdir(item.target,{withFileTypes:true})){if(e.isSymbolicLink()||workspaceFileSkip.has(e.name)||e.name.startsWith('.ksf-'))continue;const path=[current.path,e.name].filter(Boolean).join('/');if(current.scope==='workspace'&&filePolicy(path)==='blocked')continue;assert(++count<=MAX_ENTRIES,'FILE_DIRECTORY_LIMIT','监听目录超过50,000项。',413);await walk({scope:current.scope,path});}}await walk(ref);return map;}
  function attachWatcher(sub,target){
    let shared=watchers.get(target);
    if(!shared){shared={subscribers:new Set(),watcher:null};try{shared.watcher=watchFS(target,{recursive:true,persistent:false},()=>{for(const value of shared.subscribers)value.dirty=true;});shared.watcher.on('error',()=>{shared.watcher?.close();shared.watcher=null;});}catch{}watchers.set(target,shared);}
    shared.subscribers.add(sub);sub.target=target;
  }
  function detachWatcher(sub){sub.closed=true;const shared=watchers.get(sub.target);shared?.subscribers.delete(sub);if(shared&&!shared.subscribers.size){shared.watcher?.close();watchers.delete(sub.target);}}
  async function changes(caller,{ref,cursor,waitMs=10000,subscriptionId}={}){
    const item=reference(caller,ref),key=appKey(caller)+':'+(subscriptionId??digest(JSON.stringify(item.ref)));let sub=subscriptions.get(key),resync=false;
    if(!sub){const baseline=await watchSnapshot(caller,item.ref);sub={caller,ref:item.ref,events:[],baseline,touched:Date.now(),watcher:null,dirty:false};attachWatcher(sub,item.target);subscriptions.set(key,sub);resync=true;}
    assert(JSON.stringify(sub.ref)===JSON.stringify(item.ref),'FILE_SUBSCRIPTION_INVALID','订阅编号已用于其他目录。');sub.touched=Date.now();const position=typeof cursor==='string'&&cursor.startsWith(epoch+':')?Number(cursor.slice(epoch.length+1)):NaN;resync ||=!Number.isSafeInteger(position)||position<0||position>sequence||(sub.discardedThrough!==undefined&&position<sub.discardedThrough);
    const after=resync?0:Number(cursor.split(':').at(-1));const deadline=Date.now()+Math.min(10000,Math.max(0,waitMs));
    do{
      if(closed||sub.closed)break;
      if(sub.dirty||!sub.scanned||Date.now()-sub.scanned>=1000){sub.dirty=false;const next=await watchSnapshot(caller,item.ref);for(const [path,v]of next)if(sub.baseline.get(path)!==v){sequence++;sub.events.push({type:sub.baseline.has(path)?'update':'create',ref:{scope:ref.scope,path},cursor:epoch+':'+sequence});}for(const path of sub.baseline.keys())if(!next.has(path)){sequence++;sub.events.push({type:'delete',ref:{scope:ref.scope,path},cursor:epoch+':'+sequence});}sub.baseline=next;sub.scanned=Date.now();}
      if(resync||sub.events.some(e=>Number(e.cursor.split(':').at(-1))>after))break;
      await new Promise(r=>setTimeout(r,100));
    }while(Date.now()<deadline);
    const events=sub.events.filter(e=>Number(e.cursor.split(':').at(-1))>after);if(sub.events.length>2000){const removed=sub.events.splice(0,sub.events.length-1000);sub.discardedThrough=Number(removed.at(-1).cursor.split(':').at(-1));}return {subscriptionId:key.slice(caller.appId.length+1),cursor:epoch+':'+sequence,resync,events};
  }
  function unwatch(caller,{subscriptionId}){const key=appKey(caller)+':'+subscriptionId,sub=subscriptions.get(key);if(sub)detachWatcher(sub);subscriptions.delete(key);return {closed:true};}
  const reaper=setInterval(()=>{for(const [key,sub]of subscriptions)if(Date.now()-sub.touched>30000){detachWatcher(sub);subscriptions.delete(key);}},10000);reaper.unref();
  return {stat,exists,list,read,readText,openRead,write,writeText:(caller,input)=>write(caller,{...input,bytes:Buffer.from(input.text,'utf8')}),mkdir:mkdirPath,copy:(caller,input)=>transfer(caller,input,true),move:(caller,input)=>transfer(caller,input,false),trash,listTrash,restore,purge,emptyTrash,operation,changes,unwatch,
    pending:appId=>inflight.get(appId)?.size??0,async wait(appId){while(inflight.get(appId)?.size)await Promise.allSettled([...inflight.get(appId)]);},async close(){closed=true;clearInterval(reaper);for(const sub of subscriptions.values())detachWatcher(sub);subscriptions.clear();await Promise.allSettled([...inflight.values()].flatMap(s=>[...s]));}};
}
