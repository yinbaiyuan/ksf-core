import {existsSync,readdirSync,lstatSync,readFileSync,mkdirSync,linkSync,unlinkSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safePath} from '../user-data/storage.js';
import {sha256} from '../shared/hash.js';
import {withTemporaryFile,withExclusiveLock} from '../shared/files.js';
import {readConfigFile,publishConfigFile} from '../configuration/storage.js';
import {parseFrontmatter,encodeFrontmatter,setField} from '../metadata/frontmatter.js';
import {validateObjectDocument} from '../user-data/records.js';
import {validate as validateChat,locked} from '../chat-state/storage.js';
import {syncDirectorySync} from '../platform/index.js';

export const oldManagerId='partner.ksf.object-designer',newManagerId='partner.ksf.ability-manager';
const oldHash=sha256(oldManagerId),newHash=sha256(newManagerId);
const fail=(code,message,details={})=>{throw Object.assign(new Error(message),{code,details});};
function directories(root,path) {
  const absolute=safePath(root,path);if(!existsSync(absolute))return [];
  if(!lstatSync(absolute).isDirectory())fail('MIGRATION_DATA_INVALID','Expected a directory.',{path});
  return readdirSync(absolute).sort().filter(n=>{const p=safePath(root,`${path}/${n}`);return lstatSync(p).isDirectory();});
}
export function migrateAbilityManager({root,apply=false}) {
  const actions=[],review=[];
  // User definitions and their original upstream snapshots are never rewritten.
  for(const scope of ['能力/协同','能力/搭档','能力/基本功','能力/数据包']) {
    for(const name of directories(root,scope)) {
      const base=`${scope}/${name}`;
      for(const entry of ['cooperation.md','partner.md','competency.md','datapackage.md']) {
        const p=`${base}/${entry}`;if(!existsSync(safePath(root,p)))continue;
        const text=readConfigFile(root,p,{text:true}).document,meta=parseFrontmatter(Buffer.from(text),p).values;
        if(meta.id===oldManagerId || meta.references?.some(r=>r.split('@')[0]===oldManagerId))review.push(p);
      }
    }
  }
  if(review.length)fail('MIGRATION_REVIEW_REQUIRED','Custom definitions require a separate identity/derivation review; originals and baselines were preserved.',{paths:review});
  function state(path,chatId) {
    const before=readConfigFile(root,path,{text:true});if(before.state==='missing')return;
    let doc;try{doc=JSON.parse(before.document);}catch{fail('MIGRATION_DATA_INVALID','Invalid JSON was preserved.',{path});}
    const key=chatId?'objectId':'object_id';
    if(doc[key]!==oldManagerId)fail('MIGRATION_DATA_INVALID','State identity does not match filename.',{path});
    if(chatId)validateChat(doc,'scope',chatId,oldManagerId);else validateObjectDocument(doc,oldManagerId);
    const next={...doc,[key]:newManagerId,revision:doc.revision+1};
    if(chatId)validateChat(next,'scope',chatId,newManagerId);else validateObjectDocument(next,newManagerId);
    const target=path.replace(`${oldHash}.json`,`${newHash}.json`);
    if(existsSync(safePath(root,target)))fail('MIGRATION_CONFLICT','Old and new state both exist; neither was merged.',{path,target});
    actions.push({path,target,before,document:JSON.stringify(next,null,2)+'\n',chatId});
  }
  state(`.agents/user-data/abilities/${oldHash}.json`);
  for(const chatId of directories(root,'.agents/user-data/chats'))if(/^[a-f0-9]{64}$/.test(chatId))state(`.agents/user-data/chats/${chatId}/abilities/${oldHash}.json`,chatId);
  const current=readConfigFile(root,'.agents/core/abilities/partners/ability-manager/partner.md',{text:true});
  if(current.state==='missing')fail('MIGRATION_DEFINITION_MISSING','Install the new Core definition first.');
  const version=parseFrontmatter(Buffer.from(current.document),'ability-manager').values.version;
  for(const scope of ['项目','档案/项目'])for(const name of directories(root,scope)) {
    const path=`${scope}/${name}/project.md`,before=readConfigFile(root,path,{text:true});if(before.state==='missing')continue;
    const parsed=parseFrontmatter(Buffer.from(before.document),path);let changed=false;
    const routing=parsed.values.routing;
    if(routing?.partners) {
      const updated=routing.partners.map(item=>{
        if(item.ref?.split('@')[0]!==oldManagerId)return item;
        if(item.source && item.source!=='system')fail('MIGRATION_REVIEW_REQUIRED','A preset pins an external source; preserve and review it.',{path});
        changed=true;return {...item,ref:`${newManagerId}@${version}`};
      });
      if(changed){setField(parsed.doc,'routing',{...routing,partners:updated});actions.push({path,target:path,before,document:encodeFrontmatter(parsed).toString('utf8')});}
    }
  }
  const data={complete:true,dryRun:!apply,from:oldManagerId,to:newManagerId,actions:actions.map(a=>({source:a.path,target:a.target,beforeSha256:a.before.etag,afterSha256:sha256(a.document)})),completed:[],backup:null};
  if(!apply || !actions.length)return data;
  const backup=`.agents/runtime-data/ability-manager-migration/${randomUUID()}`;data.backup=backup;
  const verify=a=>{
    const actual=readConfigFile(root,a.path,{text:true});if(actual.etag!==a.before.etag)fail('MIGRATION_CONFLICT','Source changed before migration; preserve and reconcile.',{path:a.path});
    if(a.path!==a.target && existsSync(safePath(root,a.target)))fail('MIGRATION_CONFLICT','Target appeared during migration.',{path:a.target});
  };
  function publish(a) {
    verify(a);
    const original=safePath(root,`${backup}/${a.path}`,{createParents:true});
    withTemporaryFile(original+'.tmp',Buffer.from(a.before.document),{},tmp=>linkSync(tmp,original));
    if(a.path===a.target)publishConfigFile(root,a.before,a.document,{text:true});
    else {
      const target=safePath(root,a.target,{createParents:true});
      withTemporaryFile(target+'.'+randomUUID()+'.tmp',Buffer.from(a.document),{},tmp=>{verify(a);linkSync(tmp,target);syncDirectorySync(dirname(target));});
      // If the old file changed after publication, retain both for explicit recovery.
      const now=readConfigFile(root,a.path,{text:true});if(now.etag!==a.before.etag)fail('MIGRATION_CONFLICT','Old state changed; both files were preserved.',{path:a.path,target:a.target});
      unlinkSync(safePath(root,a.path));syncDirectorySync(dirname(safePath(root,a.path)));
    }
    data.completed.push(a.target);
  }
  const lock=safePath(root,'.agents/runtime-data/ability-manager-migration/active.lock',{createParents:true});
  return withExclusiveLock(lock,{pid:process.pid},()=>{
    actions.forEach(verify);
    try {
      for(const a of actions) {
        if(a.chatId)locked(root,a.chatId,()=>publish(a));
        else if(a.path.includes('/abilities/')) {
          const locks=[oldHash,newHash].map(h=>safePath(root,`.agents/runtime-data/user-data/abilities/${h}.lock`,{createParents:true}));
          withExclusiveLock(locks[0],{pid:process.pid},()=>withExclusiveLock(locks[1],{pid:process.pid},()=>publish(a)));
        } else publish(a);
      }
    }catch(error){error.details={...error.details,partial:data};throw error;}
    return data;
  });
}
