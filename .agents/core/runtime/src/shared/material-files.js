import {lstatSync,existsSync,linkSync,unlinkSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {managedFilePath} from './managed-path.js';
import {sha256} from './hash.js';
import {readFileSnapshot,sameIdentity,withTemporaryFile} from './files.js';
import {syncDirectorySync} from '../platform/index.js';

const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,details});};
function target(root,path,prefixes,createParents=false) {
  if(typeof path!=='string'||!Array.isArray(prefixes)||!prefixes.length||!prefixes.some(p=>path.startsWith(p+'/')))fail('MATERIAL_SCOPE_INVALID','Caller must provide the allowed material directories.');
  return managedFilePath(root,path,{createParents});
}
// The caller owns destination meaning, authorization and navigation updates.
export function readMaterial(root,path,{prefixes,maxBytes=64*1024*1024}={}) {
  const file=target(root,path,prefixes),entry=lstatSync(file);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!entry.isFile()||entry.size>maxBytes)fail('MATERIAL_UNSUPPORTED','Expected an ordinary file within the explicit byte limit.');
  const conflict=()=>fail('MATERIAL_CONFLICT','Material changed while reading; preserve and reconcile.',{path});
  const snapshot=readFileSnapshot(file,{entry,validateOpen(a,b){if(!b.isFile()||!sameIdentity(a,b))conflict();},validateRead(a,b,bytes){if(!sameIdentity(a,b)||bytes.length>maxBytes)conflict();}});
  return {...snapshot,path,sha256:sha256(snapshot.bytes)};
}
export function copyMaterial(root,{source,destination,ifMatch,prefixes,maxBytes,dryRun=false,move=false},hooks={}) {
  const options={prefixes,maxBytes},before=readMaterial(root,source,options);
  if(!/^[a-f0-9]{64}$/.test(ifMatch??'')||before.sha256!==ifMatch)fail('MATERIAL_CONFLICT','Supply the current source SHA-256.');
  const out=target(root,destination,prefixes);
  const result={source,destination,sha256:ifMatch,dryRun,changed:false,sourceRemoved:false};
  if(before.target===out)return result;
  if(existsSync(out)) {
    const current=readMaterial(root,destination,options);
    if(current.sha256!==ifMatch)fail('MATERIAL_TARGET_EXISTS','Different destination content was preserved.',{destination});
  } else if(!dryRun) {
    const published=target(root,destination,prefixes,true);
    withTemporaryFile(published+'.'+randomUUID()+'.tmp',before.bytes,{mode:before.stat.mode&0o777},tmp=>{
      hooks.beforePublish?.();
      const latest=readMaterial(root,source,options);
      if(latest.sha256!==ifMatch||!sameIdentity(before.stat,latest.stat))fail('MATERIAL_CONFLICT','Source changed before publication.');
      target(root,destination,prefixes);linkSync(tmp,published);syncDirectorySync(dirname(published));result.changed=true;
    });
  }
  if(!dryRun) {
    const after=readMaterial(root,destination,options);
    if(after.sha256!==ifMatch)fail('MATERIAL_VERIFY_FAILED','Destination verification failed; source retained.',{...result});
    if(move) {
      hooks.beforeRemove?.();
      const latest=readMaterial(root,source,options);
      if(latest.sha256!==ifMatch||!sameIdentity(before.stat,latest.stat))fail('MATERIAL_CONFLICT','Source changed after copy; both files were preserved.',{...result});
      unlinkSync(target(root,source,prefixes));syncDirectorySync(dirname(before.target));result.changed=true;result.sourceRemoved=true;
    }
  }
  return {...result,wouldChange:result.changed||dryRun&&(!existsSync(out)||move)};
}
