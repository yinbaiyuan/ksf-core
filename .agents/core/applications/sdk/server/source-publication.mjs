import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,openSync,closeSync,rmSync,fsyncSync,lstatSync} from 'node:fs';import {join,resolve} from 'node:path';import {randomUUID} from 'node:crypto';
import {buildCatalog} from './catalog/build.js';import {digest} from './catalog/protocol.js';import {decodePackage} from './protocol.js';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const write=(path,bytes)=>{const temporary=path+'.'+randomUUID()+'.tmp';let fd;try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,path);}finally{if(fd!==undefined)closeSync(fd);rmSync(temporary,{force:true});}};
function publicationLock(path){
 const acquire=()=>{const fd=openSync(path,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid,nonce:randomUUID()}));fsyncSync(fd);return fd;};
 try{return acquire();}catch(error){if(error.code!=='EEXIST')throw error;}
 let raw,stat,owner;try{raw=readFileSync(path,'utf8');stat=lstatSync(path);owner=JSON.parse(raw);}catch{fail('PUBLICATION_BUSY','发布锁无法核对，请保留现场并检查。');}
 if(!stat.isFile()||!Number.isSafeInteger(owner.pid)||owner.pid<=0)fail('PUBLICATION_BUSY','发布锁身份无法核对，请保留现场并检查。');
 try{process.kill(owner.pid,0);fail('PUBLICATION_BUSY','另一个发布仍在进行。');}catch(error){if(error.code!=='ESRCH')throw error;}
 const guard=path+'.reclaim';let fd;
 try{fd=openSync(guard,'wx',0o600);writeFileSync(fd,JSON.stringify({pid:process.pid}));const current=lstatSync(path);if(current.dev!==stat.dev||current.ino!==stat.ino||readFileSync(path,'utf8')!==raw)fail('PUBLICATION_BUSY','发布锁已变化，请重试。');rmSync(path);return acquire();}
 catch(error){if(error.code==='EEXIST')fail('PUBLICATION_BUSY','另一个进程正在恢复发布锁，请重试。');throw error;}
 finally{if(fd!==undefined){closeSync(fd);rmSync(guard,{force:true});}}
}
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return y[0]-x[0]||y[1]-x[1]||y[2]-x[2];};
export function publishSource(input,{kind='applications',describe}={}){
 const directory=resolve(input.directory),source=input.source;if(!source||!/^[a-z][a-z0-9-]{0,63}$/.test(source.id)||typeof source.name!=='string'||!source.name.trim())fail('PUBLICATION_SOURCE_INVALID','请提供稳定的源 ID 和名称。');mkdirSync(directory,{recursive:true});const lock=join(directory,'.publication.lock');let fd;
 try{fd=publicationLock(lock);
  const historyPath=join(directory,'.publication.json'),history=existsSync(historyPath)?JSON.parse(readFileSync(historyPath)): {schemaVersion:1,kind,source,objects:[]};if(history.kind!==kind||history.source.id!==source.id)fail('PUBLICATION_SOURCE_CHANGED','不能静默更换已有目录的源身份。');
  let published=[];
  if(input.bytes){const data=describe?describe(input.bytes):(()=>{const value=decodePackage(input.bytes);return{bytes:input.bytes,extension:'ksfapp',releases:[{id:value.manifest.id,type:'application',name:value.manifest.name,description:value.manifest.description,version:value.manifest.version,identity:digest(input.bytes),manifest:value.manifest,listing:value.listing}]};})();const bytes=data.bytes,sha256=digest(bytes),url='packages/'+sha256+'.'+data.extension;mkdirSync(join(directory,'packages'),{recursive:true});if(existsSync(join(directory,url))){if(digest(readFileSync(join(directory,url)))!==sha256)fail('PUBLICATION_INTEGRITY','已有内容寻址包被修改。');}else write(join(directory,url),bytes);input.fault?.('package-written');
   for(const release of data.releases){const namespace=release.id.split('.')[1];if(namespace==='ksf')fail('PUBLICATION_CORE_MANAGED','Core 内置或旧 ksf 场景对象不能新增源发布，请使用已确认的开发者身份。');if(input.publisher&&namespace!==input.publisher.toLowerCase())fail('PUBLISHER_NAMESPACE','发布对象必须使用声明开发者的命名空间。');let object=history.objects.find(o=>o.id===release.id);if(!object){object={id:release.id,type:release.type,name:release.name,description:release.description,versions:[]};history.objects.push(object);}const old=object.versions.find(v=>v.version===release.version&&(v.manifest?.target??'*')===(release.manifest?.target??'*')&&(v.manifest?.nodeAbi??'*')===(release.manifest?.nodeAbi??'*'));if(old&&old.identity!==release.identity)fail('PUBLICATION_VERSION_REUSED','同一发布版本的冻结内容不同，请提升版本：'+release.id);if(!old){object.versions.push({...release,package:{url,size:bytes.length,sha256},publisherVerification:{verified:false,method:'local-declaration',login:input.publisher??null}});object.versions.sort((a,b)=>compare(a.version,b.version));published.push(release.id+'@'+release.version);}}
  }
  if(input.withdraw){const {id,version,reason}=input.withdraw;if(typeof reason!=='string'||!reason.trim())fail('PUBLICATION_WITHDRAW_REASON','撤回必须说明原因。');const release=history.objects.find(o=>o.id===id)?.versions.find(v=>v.version===version);if(!release)fail('PUBLICATION_RELEASE_MISSING','没有找到待撤回的历史版本。');release.withdrawn=true;release.withdrawalReason=reason;}
  write(historyPath,Buffer.from(JSON.stringify(history)+'\n'));input.fault?.('history-written');const index=buildCatalog({directory,kind,source,objects:history.objects});input.fault?.('catalog-published');return{ok:true,directory,index:join(directory,'index.json'),revision:index.revision,published,publisherVerification:{verified:false,method:'local-declaration'},consumerVerificationRequired:true};
 }finally{if(fd!==undefined){closeSync(fd);rmSync(lock,{force:true});}}
}
export const publishApplicationSource=input=>publishSource(input);
export async function verifyPublishedSource({url,kind='applications',ids,validatePackage}){
 const address=new URL(url);if(!['http:','https:'].includes(address.protocol)||address.username||address.password||address.hash||!Array.isArray(ids)||!ids.length)fail('PUBLICATION_VERIFY_INVALID','请提供 HTTP(S) 消费者入口和待核验对象。');const {createCatalogClient}=await import('./catalog/client.js'),client=createCatalogClient({url:address.href,kind}),root=await client.open({refresh:true}),releases=[];
 if(!root.freshness.latestConfirmed)fail('PUBLICATION_UNCONFIRMED','消费者入口未能确认最新目录。');
 for(const id of ids){let cursor,release;do{const page=await client.versions(id,{cursor});if(!page)break;release=page.items.find(v=>!v.withdrawn);cursor=page.nextCursor;}while(!release&&cursor);if(!release)fail('PUBLICATION_RELEASE_MISSING','消费者入口没有可获取的版本：'+id);const bytes=await client.binary(release.package);if(validatePackage)validatePackage(bytes,id,release);else{const value=decodePackage(bytes);if(value.manifest.id!==id||value.manifest.version!==release.manifest.version)fail('PUBLICATION_INTEGRITY','消费者包与发布目录不一致。');}releases.push({id,version:release.version??release.manifest.version,sha256:release.package.sha256});}
 return{verified:true,scope:'consumer-content',publisherVerified:false,revision:root.revision,sourceId:root.source.id,releases};
}
