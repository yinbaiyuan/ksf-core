import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,symlinkSync,existsSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {types,protectedPaths} from '../src/objects/schema.js';
import {catalog} from '../src/objects/catalog.js';
import {referenceResults} from '../src/objects/references.js';
import {orphanCompetencies} from '../src/services/orphan-competencies.js';
import {contextEntry} from '../src/services/entry-context.js';
import {runContextCommand} from '../src/commands/context.js';
import {writeUserData} from '../src/services/user-data.js';
import {migrateAbilityManager,oldManagerId,newManagerId} from '../src/migrations/ability-manager.js';
import {sha256} from '../src/shared/hash.js';
import {readMaterial,copyMaterial} from '../src/shared/material-files.js';
import {validateTarget,validateStoredTarget} from '../src/routing/schema.js';
import {resolveExistingTarget,definitionContext} from '../src/routing/definitions.js';
import {mutateRoute,readRoute} from '../src/services/routes.js';
import YAML from '../src/vendor/yaml/dist/index.js';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
function fixture(t,{shipped=false}={}) {
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ksf management 中文 ')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const put=(p,v)=>{mkdirSync(dirname(join(root,p)),{recursive:true});writeFileSync(join(root,p),v);};
  for(const def of Object.values(types))for(const s of ['user','system'])mkdirSync(join(root,def[s]),{recursive:true});
  if(shipped){cpSync(join(repo,'.agents/core/abilities'),join(root,'.agents/core/abilities'),{recursive:true});put('AGENTS.md',readFileSync(join(repo,'AGENTS.md')));}
  else {
    put('.agents/core/abilities/partners/ksf-runtime/partner.md','---\nid: partner.ksf.runtime\nname: runtime\ndescription: runtime\nversion: 0.1.0\nstatus: active\nreferences: []\n---\nRuntime sentinel\n');
    for(const name of ['ability-route','project-route'])put(`.agents/core/abilities/competencies/${name}/competency.md`,`---\nid: competency.ksf.${name}\nname: ${name}\ndescription: route\nversion: 0.1.0\nstatus: active\n---\n${name} sentinel\n`);
  }
  const add=(id,{source='system',...fields}={})=>{
    const type=id.split('.')[0],p=`${types[type][source]}/${id}/${types[type].entry}`;
    put(p,`---\n${YAML.stringify({id,name:id,description:'完整原始摘要\n第二行',version:'0.1.0',status:'active',references:[],...(source==='user'?{user_revision:1}:{}),...fields})}---\n# method\n`);return p;
  };
  return {root,put,add};
}
test('shipped Core contains exactly 34 valid objects, four protected entries and closed references',t=>{
  const f=fixture(t,{shipped:true}),c=catalog(f.root);
  assert.deepEqual(c.errors,[]);assert.equal(c.rows.length,34);
  assert.deepEqual(c.rows.reduce((a,r)=>(a[r.type]=(a[r.type]??0)+1,a),{}),{cooperation:1,partner:10,competency:23});
  assert.equal(Object.keys(protectedPaths).length,4);
  for(const r of c.rows){assert.deepEqual(r.errors,[],r.path);assert.ok(referenceResults(c,r).every(x=>!x.error),JSON.stringify(referenceResults(c,r)));}
  assert.ok(!c.rows.some(r=>r.id==='competency.ksf.asset-maintenance'||r.id===oldManagerId));
  const orphans=orphanCompetencies(f.root);assert.deepEqual(orphans.errors,[]);assert.deepEqual(orphans.data.objects,[]);
});
test('normal entry supplies complete stable raw content exactly once, refreshed on next read',t=>{
  const f=fixture(t);f.put('USER.md','User 原文\n');f.put('BOT.md','Bot 原文\n');
  const before=contextEntry(f.root),again=contextEntry(f.root);
  assert.deepEqual(before,again);assert.equal(before.complete,true);
  assert.deepEqual(before.context.items.map(i=>i.key),['user','bot','runtime','ability-route','project-route']);
  assert.equal(before.entry.content,readFileSync(join(f.root,before.entry.path),'utf8'));
  for(const i of before.context.items){const content=i.contentRef?before.entry.content:i.content;assert.equal(sha256(content),i.sha256);assert.equal(content,readFileSync(join(f.root,i.path),'utf8'));}
  assert.equal(before.context.items[2].content,undefined);assert.equal(before.context.items[0].content,'User 原文\n');
  f.put('USER.md','new');assert.notEqual(contextEntry(f.root).context.items[0].sha256,before.context.items[0].sha256);
});
test('entry distinguishes missing from unreadable/oversized/invalid and never truncates or initializes profiles',t=>{
  const f=fixture(t);assert.equal(contextEntry(f.root).context.items[0].state,'missing');assert.equal(existsSync(join(f.root,'USER.md')),false);
  for(const bad of [Buffer.from([0xff]),Buffer.alloc(1024*1024+1,120)]){
    f.put('USER.md',bad);const result=JSON.parse(runContextCommand(['entry','--json'],f.root).stdout);
    assert.equal(result.ok,false);assert.equal(result.data.complete,false);assert.equal(result.data.context.items[0].content,null);assert.ok(result.errors.length);assert.deepEqual(readFileSync(join(f.root,'USER.md')),bad);
  }
  rmSync(join(f.root,'USER.md'));symlinkSync(join(f.root,'BOT.md'),join(f.root,'USER.md'));assert.equal(contextEntry(f.root).context.items[0].state,'unavailable');
});
test('incubation does not expose or depend on normal profiles and routes',t=>{
  const f=fixture(t);f.put('.agents/core/docs/runtime/incubation.md','---\nversion: 0.1.0\n---\nIncubation\n');
  writeUserData({root:f.root,namespace:'incubation',ifMatch:'missing',values:{status:'pending'}});
  f.put('USER.md',Buffer.from([0xff]));const d=contextEntry(f.root);assert.equal(d.mode,'incubation');assert.equal(d.complete,true);assert.equal(d.context,undefined);
});
test('orphan graph follows transitive exact bindings and ignores archived or shadowed partners and ordinary text',t=>{
  const f=fixture(t),leaf=f.add('competency.test.leaf'),mid=f.add('competency.test.mid',{references:['competency.test.leaf@0.1.0']});
  const p=f.add('partner.test.owner',{references:['competency.test.mid@0.1.0']});
  f.add('competency.test.orphan');f.add('competency.ksf.orphan-competency-match');
  assert.deepEqual(orphanCompetencies(f.root).data.objects.map(o=>o.id),['competency.test.orphan']);
  f.add('partner.test.owner',{source:'user'});assert.equal(orphanCompetencies(f.root).data.objects.length,3);
  f.add('partner.test.archived',{status:'archived',references:['competency.test.orphan@0.1.0']});
  assert.ok(orphanCompetencies(f.root).data.objects.some(o=>o.id==='competency.test.orphan'));
  const before=readFileSync(join(f.root,p));orphanCompetencies(f.root);assert.deepEqual(readFileSync(join(f.root,p)),before);
  // A user override is distinct from the system version bound through an exact reference.
  f.add('competency.test.leaf',{source:'user',version:'0.2.0'});f.add('partner.test.pinned',{references:['competency.test.leaf@0.1.0']});
  assert.ok(orphanCompetencies(f.root).data.objects.some(o=>o.id==='competency.test.leaf'&&o.source==='user'));
});
test('graph errors stay incomplete, broken candidates are excluded, cycles terminate, dynamic use never consumes pool',t=>{
  const f=fixture(t);f.add('competency.test.good');f.add('competency.test.broken',{references:['competency.test.missing@0.1.0']});
  let result=orphanCompetencies(f.root);assert.equal(result.data.complete,false);assert.ok(result.errors.some(e=>e.code==='OBJECT_NOT_FOUND'));assert.ok(!result.data.objects.some(o=>o.id==='competency.test.broken'));
  const a=f.add('competency.test.a',{references:['competency.test.b@0.1.0']});f.add('competency.test.b',{references:['competency.test.a@0.1.0']});
  assert.ok(orphanCompetencies(f.root).data.objects.some(o=>o.id==='competency.test.a'));
  f.add('partner.test.owner',{references:['competency.test.a@0.1.0']});assert.ok(!orphanCompetencies(f.root).data.objects.some(o=>o.id==='competency.test.a'));
  f.put('档案/采用记录.md','competency.test.good');assert.ok(orphanCompetencies(f.root).data.objects.some(o=>o.id==='competency.test.good'));
});
test('linked source ambiguity is explicit and source dependencies never bind to private overrides',t=>{
  const f=fixture(t);const entries=[];
  for(const id of ['one','two']){
    const path=`sources/${id}`;entries.push({id,path});f.put(`${path}/ksf-source.yaml`,`kind: ksf-ability-source\nschema_version: 2\nid: ${id}\nname: ${id}\n`);
    for(const def of Object.values(types))mkdirSync(join(f.root,path,def.user),{recursive:true});
    f.put(`${path}/能力/基本功/competency.test.shared/competency.md`,'---\nid: competency.test.shared\nname: shared\ndescription: original\nversion: 0.1.0\nstatus: active\n---\nmethod\n');
  }
  writeUserData({root:f.root,namespace:'sources',ifMatch:'missing',values:{entries}});
  const ambiguous=orphanCompetencies(f.root);assert.equal(ambiguous.data.complete,false);assert.ok(ambiguous.errors.some(e=>e.code==='SOURCE_AMBIGUOUS'));
  assert.equal(orphanCompetencies(f.root,{source:'one'}).data.complete,true);
  f.add('competency.test.shared',{source:'user',version:'0.2.0'});
  f.put('sources/one/能力/搭档/partner.test.linked/partner.md','---\nid: partner.test.linked\nname: linked\ndescription: linked\nversion: 0.1.0\nstatus: active\nreferences: [competency.test.shared@0.1.0]\n---\nowner\n');
  const one=orphanCompetencies(f.root,{source:'one'});assert.deepEqual(one.errors,[]);assert.ok(one.data.objects.some(o=>o.id==='competency.test.shared'&&o.source==='user'));
});
test('manager migration preserves values, run identity, historical originals, supports preview and no-op repeat',t=>{
  const f=fixture(t,{shipped:true}),chatId='a'.repeat(64),oldPath=`.agents/user-data/chats/${chatId}/abilities/${sha256(oldManagerId)}.json`;
  const doc={schemaVersion:1,kind:'scope',chatId,revision:3,objectId:oldManagerId,runId:'run-1',turnIds:['t1','t2'],values:{choice:'keep'}};
  f.put(oldPath,JSON.stringify(doc));f.put(`.agents/user-data/abilities/${sha256(oldManagerId)}.json`,JSON.stringify({schema_version:1,object_id:oldManagerId,revision:2,values:{language:'zh'}}));
  f.put('项目/demo/project.md',`---\nname: demo\nrouting:\n  partners:\n    - ref: ${oldManagerId}@0.1.7\n---\nOriginal body ${oldManagerId}\n`);
  f.put('档案/历史.md',oldManagerId);
  const preview=migrateAbilityManager({root:f.root});assert.equal(preview.actions.length,3);assert.equal(existsSync(join(f.root,oldPath)),true);
  const applied=migrateAbilityManager({root:f.root,apply:true});assert.equal(applied.completed.length,3);assert.equal(existsSync(join(f.root,oldPath)),false);
  const current=JSON.parse(readFileSync(join(f.root,oldPath.replace(sha256(oldManagerId),sha256(newManagerId)))));
  assert.deepEqual({...current,objectId:oldManagerId,revision:3},doc);assert.equal(readFileSync(join(f.root,'档案/历史.md'),'utf8'),oldManagerId);
  assert.equal(readFileSync(join(f.root,applied.backup,oldPath),'utf8'),JSON.stringify(doc));assert.deepEqual(migrateAbilityManager({root:f.root}).actions,[]);
});
test('migration conflicts and derived definitions preserve both identities and original baselines',t=>{
  const f=fixture(t,{shipped:true}),old=`.agents/user-data/abilities/${sha256(oldManagerId)}.json`,next=old.replace(sha256(oldManagerId),sha256(newManagerId));
  const value={schema_version:1,object_id:oldManagerId,revision:1,values:{x:1}};f.put(old,JSON.stringify(value));f.put(next,'existing');
  assert.throws(()=>migrateAbilityManager({root:f.root,apply:true}),{code:'MIGRATION_CONFLICT'});assert.equal(readFileSync(join(f.root,next),'utf8'),'existing');
  rmSync(join(f.root,next));f.add(oldManagerId,{source:'user'});assert.throws(()=>migrateAbilityManager({root:f.root,apply:true}),{code:'MIGRATION_REVIEW_REQUIRED'});assert.equal(readFileSync(join(f.root,old),'utf8'),JSON.stringify(value));
});
test('binary copy/move checks baselines, keeps originals on conflict, refuses links and supports dry-run',t=>{
  const f=fixture(t),prefixes=['@收件箱','档案'],source='@收件箱/a.pdf',destination='档案/demo/a.pdf',bytes=Buffer.from([0,255,1,2,13,10]);f.put(source,bytes);
  const before=readMaterial(f.root,source,{prefixes});
  assert.equal(copyMaterial(f.root,{source,destination,ifMatch:before.sha256,prefixes,dryRun:true}).wouldChange,true);assert.equal(existsSync(join(f.root,'档案/demo')),false);
  const copied=copyMaterial(f.root,{source,destination,ifMatch:before.sha256,prefixes});assert.equal(copied.changed,true);assert.deepEqual(readFileSync(join(f.root,destination)),bytes);
  assert.equal(copyMaterial(f.root,{source,destination,ifMatch:before.sha256,prefixes}).changed,false);
  assert.throws(()=>copyMaterial(f.root,{source,destination,ifMatch:before.sha256,prefixes,move:true},{beforeRemove(){f.put(source,'changed');}}),{code:'MATERIAL_CONFLICT'});assert.equal(readFileSync(join(f.root,source),'utf8'),'changed');assert.deepEqual(readFileSync(join(f.root,destination)),bytes);
  f.put(source,bytes);assert.equal(copyMaterial(f.root,{source,destination,ifMatch:before.sha256,prefixes,move:true}).sourceRemoved,true);
  symlinkSync(join(f.root,destination),join(f.root,'@收件箱/link'));assert.throws(()=>readMaterial(f.root,'@收件箱/link',{prefixes}));
});
test('inbox and persona target identities are validated, resolved and retained as distinct kinds',t=>{
  const f=fixture(t);f.put('@收件箱/待处理/a.txt','a');f.put('USER.md','user');f.put('BOT.md','bot');
  for(const input of [{kind:'inbox',path:'@收件箱/待处理'},{kind:'persona',path:'USER.md'},{kind:'persona',path:'BOT.md'}]){
    validateTarget(input);const actual=resolveExistingTarget(definitionContext(f.root),input);assert.equal(actual.kind,input.kind);validateStoredTarget(actual);
  }
  for(const input of [{kind:'inbox',path:'@收件箱/../USER.md'},{kind:'persona',path:'知识/私人.md'}])assert.throws(()=>validateTarget(input));
});

test('entry rejects wrong fixed identities and exact route version mismatches',t=>{
  const f=fixture(t);const runtime='.agents/core/abilities/partners/ksf-runtime/partner.md';
  const original=readFileSync(join(f.root,runtime),'utf8');f.put(runtime,original.replace('partner.ksf.runtime','partner.test.other'));
  assert.throws(()=>contextEntry(f.root),{code:'ENTRY_DEFINITION_INVALID'});
  f.put(runtime,original.replace('references: []','references: [competency.ksf.ability-route@0.2.0]'));
  const result=JSON.parse(runContextCommand(['entry','--json'],f.root).stdout);assert.equal(result.ok,false);assert.ok(result.errors.some(e=>e.code==='OBJECT_VERSION_MISMATCH'));
});
test('inbox and persona persist through the shared route store with distinct ownership and unchanged history',t=>{
  const f=fixture(t);f.put('@收件箱/a.md','original');f.put('USER.md','profile');
  const identity={host:'test',sessionId:'six-targets'},report=target=>({summary:'explicit target',status:'working',ownership:{state:'bound',target},relatedTargets:[],abilities:[]});
  const first=mutateRoute({root:f.root,operation:'start',ifMatch:'missing',env:{},input:{identity,eventId:'inbox',report:report({kind:'inbox',path:'@收件箱/a.md'})}});
  assert.equal(first.record.current.ownership.target.kind,'inbox');
  const before=readRoute({root:f.root,key:first.record.sessionKey});
  const next=mutateRoute({root:f.root,operation:'write',ifMatch:before.record.revision,env:{},input:{identity,roundId:before.record.roundId,eventId:'persona',report:report({kind:'persona',path:'USER.md'})}});
  assert.equal(next.record.current.ownership.target.kind,'persona');
  assert.equal(readRoute({root:f.root,key:next.record.sessionKey}).record.current.ownership.target.freshness,'current');
  assert.ok(next.record.history.some(e=>e.snapshot.ownership?.target?.kind==='inbox'));
  assert.equal(readFileSync(join(f.root,'USER.md'),'utf8'),'profile');
});
