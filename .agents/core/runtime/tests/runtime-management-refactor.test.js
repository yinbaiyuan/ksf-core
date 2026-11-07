import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,cpSync,symlinkSync,existsSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {types,protectedPaths,parseDependencyReference} from '../src/objects/schema.js';
import {catalog} from '../src/objects/catalog.js';
import {referenceResults} from '../src/objects/references.js';
import {orphanCompetencies} from '../src/services/orphan-competencies.js';
import {contextEntry} from '../src/services/entry-context.js';
import {collaborationContext} from '../src/services/collaboration-context.js';
import {objectQuery} from '../src/services/objects.js';
import {runConfigurationCommand} from '../src/commands/configuration.js';
import {validateSystemDefinitions} from '../src/services/validate-system.js';
import {runContextCommand} from '../src/commands/context.js';
import {writeUserData} from '../src/services/user-data.js';
import {migrateAbilityManager,oldManagerId,newManagerId} from '../src/migrations/ability-manager.js';
import {sha256} from '../src/shared/hash.js';
import {readMaterial,copyMaterial} from '../src/shared/material-files.js';
import {validateTarget,validateStoredTarget} from '../src/routing/schema.js';
import {resolveExistingTarget,definitionContext} from '../src/routing/definitions.js';
import {mutateRoute,readRoute} from '../src/services/routes.js';
import YAML from '../src/vendor/yaml/dist/index.js';
import {readCurrentWork,bindCurrentWork,currentWorkContext,acceptWorkContext,resetWorkContext} from '../src/services/work-context.js';
import {workContextHook} from '../src/services/context-hook.js';
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
test('shipped Core contains exactly 35 valid objects, four protected entries and closed references',t=>{
  const f=fixture(t,{shipped:true}),c=catalog(f.root);
  assert.deepEqual(c.errors,[]);assert.equal(c.rows.length,35);
  assert.deepEqual(c.rows.reduce((a,r)=>(a[r.type]=(a[r.type]??0)+1,a),{}),{cooperation:1,partner:10,competency:24});
  assert.equal(Object.keys(protectedPaths).length,4);
  for(const r of c.rows){assert.deepEqual(r.errors,[],r.path);assert.ok(referenceResults(c,r).every(x=>!x.error),JSON.stringify(referenceResults(c,r)));}
  assert.ok(!c.rows.some(r=>r.id==='competency.ksf.asset-maintenance'||r.id===oldManagerId));
  const orphans=orphanCompetencies(f.root);assert.deepEqual(orphans.errors,[]);assert.deepEqual(orphans.data.objects,[]);
});
test('candidate validation supports legacy schema exports and uses the candidate expansion parser when present',async t=>{
  const schema=pathToFileURL(join(repo,'.agents/core/runtime/src/objects/schema.js')).href;
  const catalogModule=pathToFileURL(join(repo,'.agents/core/runtime/src/objects/catalog.js')).href;
  const referencesModule=pathToFileURL(join(repo,'.agents/core/runtime/src/objects/references.js')).href;
  for(const legacy of [true,false]){
    const f=fixture(t,{shipped:true});
    f.put('.agents/core/runtime/package.json','{"type":"module"}');
    // A legacy candidate exposes only the original parser API, not the new helper.
    f.put('.agents/core/runtime/src/objects/schema.js',`export {protectedPaths,parseReference${legacy?'':',parseDependencyReference'}} from ${JSON.stringify(schema)};\n`);
    f.put('.agents/core/runtime/src/objects/catalog.js',`export {catalog,problems,resolveObject} from ${JSON.stringify(catalogModule)};\n`);
    if(!legacy)f.put('.agents/core/runtime/src/objects/references.js',`export {resolveDependency} from ${JSON.stringify(referencesModule)};\n`);
    if(legacy){
      // Legacy definitions contain plain ability references and no file locators.
      for(const row of catalog(f.root).rows){
        const references=(row.metadata.references??[]).flatMap(reference=>{
          const parsed=parseDependencyReference(reference);
          return parsed.kind==='file'?[]:[`${parsed.id}@${parsed.version}`];
        });
        const metadata={...row.metadata,...(row.metadata.references===undefined?{}:{references})};
        f.put(row.path,`---\n${YAML.stringify(metadata)}---\n${row.parsed.body.toString('utf8')}`);
      }
    }
    const result=await validateSystemDefinitions(f.root);assert.equal(result.valid,true);assert.equal(result.objects,35);
  }
});
test('normal entry returns the root only and never independently loads profiles or route definitions',t=>{
  const f=fixture(t);f.put('USER.md','PRIVATE_USER_SENTINEL\n');f.put('BOT.md','PRIVATE_BOT_SENTINEL\n');
  const before=contextEntry(f.root),again=contextEntry(f.root);
  assert.deepEqual(before,again);assert.equal(before.complete,true);
  assert.equal(before.context.protocol,'ksf-entry-context-v3');
  assert.deepEqual(before.context.items.map(i=>i.key),['runtime']);
  assert.equal(before.entry.content,readFileSync(join(f.root,before.entry.path),'utf8'));
  assert.equal(before.context.items[0].sha256,sha256(before.entry.content));
  assert.equal(before.context.items[0].content,undefined);assert.equal(before.context.expanded,undefined);
  assert.doesNotMatch(JSON.stringify(before),/PRIVATE_USER_SENTINEL|PRIVATE_BOT_SENTINEL|ability-route sentinel|project-route sentinel/);
  for(const name of ['ability-route','project-route'])rmSync(join(f.root,`.agents/core/abilities/competencies/${name}`),{recursive:true});
  f.put('USER.md',Buffer.from([0xff]));assert.deepEqual(contextEntry(f.root),before);
});
test('shipped Runtime loads persona files and retains exact route dependencies without preloading their texts',async t=>{
  const f=fixture(t,{shipped:true});
  const expected=['competency.ksf.persona-route'];
  const c=catalog(f.root),runtime=c.rows.find(r=>r.id==='partner.ksf.runtime');
  assert.equal(runtime.metadata.references.length,3);assert.ok(runtime.metadata.references[0].startsWith('#'));assert.ok(runtime.metadata.references.slice(1).every(r=>parseDependencyReference(r).expansion==='none'));
  f.put('USER.md','\uFEFF# 用户\r\nUSER_FULL_SENTINEL\r\n');f.put('BOT.md','# BOT\nBOT_FULL_SENTINEL\n');
  const entry=contextEntry(f.root);assert.equal(entry.complete,true,JSON.stringify(entry.context.errors));
  assert.deepEqual(entry.context.items.map(i=>i.key),['runtime']);
  assert.deepEqual(entry.context.expanded.filter(x=>x.kind!=='file').map(x=>x.object.id),expected);
  const profiles=entry.context.expanded.filter(x=>x.kind==='file');assert.deepEqual(profiles.map(x=>x.file.path),['USER.md','BOT.md']);
  for(const profile of profiles){assert.equal(profile.file.content,readFileSync(join(f.root,profile.file.path),'utf8'));assert.equal(profile.file.sha256,sha256(readFileSync(join(f.root,profile.file.path))));}
  assert.ok(!entry.context.expanded.some(x=>x.kind!=='file'&&(x.object.id==='partner.ksf.persona-manager'||x.object.id==='competency.ksf.persona-maintenance')));
  const text=runContextCommand(['entry'],f.root).stdout;assert.match(text,/USER_FULL_SENTINEL/);assert.match(text,/BOT_FULL_SENTINEL/);
  for(const path of ['USER.md','BOT.md'])assert.equal((text.match(new RegExp('## File '+path.replace('.', '\\.'),'g'))??[]).length,1);
  const persona=entry.context.expanded[0].object;
  assert.match(persona.body,/config read collaboration\.user --json/);assert.match(persona.body,/config read collaboration\.bot --json/);
  for(const [domain,path] of [['collaboration.user','USER.md'],['collaboration.bot','BOT.md']]){
    const call=await runConfigurationCommand(['read',domain,'--json'],f.root),value=JSON.parse(call.stdout);
    assert.equal(call.exitCode,0);assert.equal(value.ok,true);assert.equal(value.data.state,'present');
    assert.equal(value.data.path,path);assert.equal(value.data.values.text,readFileSync(join(f.root,path),'utf8'));
    assert.equal(value.data.etag,sha256(readFileSync(join(f.root,path))));
  }
});
test('shipped routes load on demand, reuse acknowledgments and retire only temporary purposes',t=>{
  const f=fixture(t,{shipped:true}),o={root:f.root,identity:{host:'codex',sessionId:'lazy-routes'}};
  f.put('USER.md','# User\n');f.put('BOT.md','# Bot\n');resetWorkContext(o);
  const get=extras=>currentWorkContext({...o,...(extras?{extras}:{})}),accept=p=>acceptWorkContext({...o,delivery:p.delivery});
  const runtime=catalog(f.root).rows.find(r=>r.id==='partner.ksf.runtime');
  const routes=referenceResults(catalog(f.root),runtime).filter(r=>r.id!=='competency.ksf.persona-route').map(r=>({ref:`${r.id}@${r.version}`,source:r.source}));
  const before=readCurrentWork(o),base=get();assert.equal(base.active.length,4);assert.equal(base.bodies.length,4);accept(base);
  let p=get([routes[0]]);assert.equal(p.complete,true);assert.deepEqual(p.bodies.map(x=>x.ref),[routes[0].ref]);
  assert.deepEqual(p.active.find(x=>x.ref===routes[0].ref).purposes,['turn-support']);accept(p);assert.equal(get([routes[0]]).bodies.length,0);
  p=get(routes);assert.deepEqual(p.bodies.map(x=>x.ref),[routes[1].ref]);accept(p);assert.equal(get(routes).bodies.length,0);
  p=get();assert.equal(p.bodies.length,0);assert.deepEqual(p.retired.map(x=>x.ref),routes.map(x=>x.ref));accept(p);
  assert.equal(get().retired.length,0);p=get([routes[1]]);assert.equal(p.bodies.length,0);accept(p);
  assert.deepEqual(readCurrentWork(o),before);assert.equal(p.active.length,5);
});
test('compact Hook restores selected work without finished routes and restores a route still needed as a method',t=>{
  const f=fixture(t,{shipped:true}),identity={host:'codex',sessionId:'lazy-route-compact'},o={root:f.root,identity};
  f.put('USER.md','# User\n');f.put('BOT.md','# Bot\n');resetWorkContext(o);
  const get=extras=>currentWorkContext({...o,...(extras?{extras}:{})}),accept=p=>acceptWorkContext({...o,delivery:p.delivery});
  const c=catalog(f.root),runtime=c.rows.find(r=>r.id==='partner.ksf.runtime'),route=referenceResults(c,runtime).find(r=>r.id==='competency.ksf.project-route');
  const routeRef={ref:`${route.id}@${route.version}`,source:route.source};accept(get([routeRef]));
  f.put('项目/lazy/project.md','# Lazy project\n');f.put('项目/lazy/任务/current.md','# Actual checkpoint\n');
  const method=c.rows.find(r=>r.id==='competency.ksf.ability-maintenance'),current={schemaVersion:1,goal:'continue selected work',status:'active',ownership:{state:'bound',target:{kind:'project',name:'lazy',scope:'current'}},executor:null,methods:[{ref:`${method.id}@${method.metadata.version}`,source:method.source}],files:[],taskRef:'项目/lazy/任务/current.md'};
  const bind=value=>bindCurrentWork({...o,current:value,ifMatch:readCurrentWork(o).etag});bind(current);accept(get());
  const before=readCurrentWork(o),generation=get().generation;
  const transcript=join(f.root,'native.jsonl');f.put('native.jsonl',JSON.stringify({type:'session_meta',payload:{id:identity.sessionId,cwd:f.root}})+'\n');
  const compact=()=>workContextHook({root:f.root,input:{session_id:identity.sessionId,transcript_path:transcript,hook_event_name:'SessionStart',source:'compact'}});
  assert.match(compact().hookSpecificOutput.additionalContext,/"readRequired":true/);
  let p=get();assert.notEqual(p.generation,generation);assert.deepEqual(readCurrentWork(o),before);assert.equal(p.complete,true);assert.equal(p.bodies.length,7);
  assert(p.bodies.some(x=>x.ref===current.methods[0].ref));assert(p.bodies.some(x=>x.path===current.taskRef));assert(!p.active.some(x=>x.ref===routeRef.ref));accept(p);assert.equal(get().bodies.length,0);
  p=get([routeRef]);assert.deepEqual(p.bodies.map(x=>x.ref),[routeRef.ref]);accept(p);assert.equal(get([routeRef]).bodies.length,0);
  bind({...current,status:'paused',methods:[routeRef]});accept(get());compact();p=get();
  assert.equal(p.current.status,'paused');assert(p.bodies.some(x=>x.ref===routeRef.ref));assert.deepEqual(p.active.find(x=>x.ref===routeRef.ref).purposes,['method']);
  assert(!p.active.some(x=>x.ref?.startsWith('competency.ksf.ability-route@')));accept(p);assert.equal(get().bodies.length,0);
});
test('entry respects shallow route boundaries even when the route internally marks another competency',t=>{
  const f=fixture(t),id='competency.test.detail';f.add(id);
  const route='.agents/core/abilities/competencies/ability-route/competency.md';
  f.put(route,readFileSync(join(f.root,route),'utf8').replace('status: active','status: active\nreferences: ["#'+id+'@0.1.0"]'));
  const runtime='.agents/core/abilities/partners/ksf-runtime/partner.md';
  f.put(runtime,readFileSync(join(f.root,runtime),'utf8').replace('references: []','references: ["+competency.ksf.ability-route@0.1.0"]'));
  assert.deepEqual(contextEntry(f.root).context.expanded.map(x=>x.object.id),['competency.ksf.ability-route']);
  assert.deepEqual(objectQuery({root:f.root,type:'competency',operation:'read',reference:'competency.ksf.ability-route'}).data.expanded.map(x=>x.object.id),[id]);
});
test('entry JSON and text include marked main texts once, while fixed definitions stay raw and protected',t=>{
  const f=fixture(t),a='competency.test.first',b='competency.test.second';
  f.add(a,{references:['+'+b+'@0.1.0']});f.add(b);
  const p='.agents/core/abilities/partners/ksf-runtime/partner.md',before=readFileSync(join(f.root,p),'utf8');
  const source=before.replace('references: []','references: ["#'+a+'@0.1.0", "+competency.ksf.ability-route@0.1.0"]');f.put(p,source);
  const entry=contextEntry(f.root);assert.equal(entry.complete,true,JSON.stringify(entry.context.errors));
  assert.equal(entry.entry.content,source);assert.equal(entry.context.items.length,1);
  assert.deepEqual(entry.context.expanded.map(x=>x.object.id),[a,b,'competency.ksf.ability-route']);
  const json=JSON.parse(runContextCommand(['entry','--json'],f.root).stdout);
  assert.equal(json.data.context.expanded[0].object.body,'# method\n');
  const text=runContextCommand(['entry'],f.root).stdout;
  assert.match(text,/## Expanded competency.test.first/);assert.match(text,/## Expanded competency.test.second/);
  assert.equal((text.match(/## Expanded competency.ksf.ability-route\n/g)??[]).length,1);
  assert.equal((text.match(/Runtime sentinel/g)??[]).length,1);
  const child=JSON.parse(JSON.stringify(entry.context.expanded[0].object));
  assert.equal(sha256(readFileSync(join(f.root,child.path))),child.definition_digest);
  f.add(a,{references:['#competency.test.missing@0.1.0']});
  const failed=JSON.parse(runContextCommand(['entry','--json'],f.root).stdout);
  assert.equal(failed.ok,false);assert.equal(failed.data.complete,false);
  assert.ok(failed.data.context.expanded.some(x=>x.object.id===a));assert.ok(failed.errors.some(e=>e.code==='OBJECT_NOT_FOUND'));
});
test('fixed entry checks exact versions after removing the loading prefix',t=>{
  const f=fixture(t),p='.agents/core/abilities/partners/ksf-runtime/partner.md';
  f.put(p,readFileSync(join(f.root,p),'utf8').replace('references: []','references: ["+competency.ksf.ability-route@9.0.0"]'));
  const result=JSON.parse(runContextCommand(['entry','--json'],f.root).stdout);
  assert.equal(result.ok,false);assert.ok(result.errors.some(e=>e.code==='OBJECT_VERSION_MISMATCH'));
});
test('load prefixes do not alter dependency reachability or orphan classification',t=>{
  const f=fixture(t);f.add('competency.test.plain');f.add('competency.test.leaf');
  f.add('competency.test.mid',{references:['#competency.test.leaf@0.1.0']});
  f.add('competency.test.orphan');
  for(const prefix of ['','+','#']) {
    f.add('partner.test.owner',{references:[prefix+'competency.test.mid@0.1.0','competency.test.plain@0.1.0']});
    const result=orphanCompetencies(f.root);assert.deepEqual(result.errors,[]);
    assert.deepEqual(result.data.objects.map(x=>x.id),['competency.test.orphan']);
  }
});
test('file references do not infer capability ownership from their contents',t=>{
  const f=fixture(t);f.add('competency.test.direct');f.add('competency.test.resource-only');
  f.add('partner.test.files',{references:['+competency.test.direct@0.1.0','#/notes.md','+/missing.md']});
  f.put('notes.md','---\nreferences: ["+competency.test.resource-only@0.1.0"]\n---\nResource metadata is not a formal capability ownership edge.\n');
  const result=orphanCompetencies(f.root);assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.data.objects.map(x=>x.id),['competency.test.resource-only']);
});
test('persona configuration reads distinguish missing, failed and complete content without changing entry or files',async t=>{
  const f=fixture(t),read=async domain=>JSON.parse((await runConfigurationCommand(['read',domain,'--json'],f.root)).stdout);
  assert.equal((await read('collaboration.user')).data.state,'missing');assert.equal(existsSync(join(f.root,'USER.md')),false);
  f.put('BOT.md','VALID_BOT');
  for(const bad of [Buffer.from([0xff]),Buffer.alloc(1024*1024+1,120)]){
    f.put('USER.md',bad);const result=await read('collaboration.user');
    assert.equal(result.ok,false);assert.ok(result.errors.length);assert.deepEqual(readFileSync(join(f.root,'USER.md')),bad);
    assert.equal((await read('collaboration.bot')).data.values.text,'VALID_BOT');assert.equal(contextEntry(f.root).complete,true);
  }
  rmSync(join(f.root,'USER.md'));symlinkSync('BOT.md',join(f.root,'USER.md'));
  assert.equal((await read('collaboration.user')).ok,false);assert.equal((await read('collaboration.bot')).ok,true);
  assert.equal(contextEntry(f.root).complete,true);
});
test('entry detects a root changed during generic context assembly and retains the original root',t=>{
  const f=fixture(t),before=contextEntry(f.root),path=before.entry.path;
  f.put(path,readFileSync(join(f.root,path),'utf8')+'changed\n');
  const result=collaborationContext(f.root,before.entry);
  assert.equal(result.complete,false);assert.ok(result.errors.some(e=>e.code==='CONTEXT_DEFINITION_CHANGED'));
  assert.equal(result.items[0].sha256,before.entry.sha256);assert.equal(result.items[0].contentRef,'entry.content');
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
test('manager migration detects prefixed legacy references without rewriting custom definitions',t=>{
  const f=fixture(t,{shipped:true});
  for(const prefix of ['','+','#']){
    const p=f.add('partner.test.custom',{source:'user',references:[prefix+oldManagerId+'@0.1.7']});
    const bytes=readFileSync(join(f.root,p));
    assert.throws(()=>migrateAbilityManager({root:f.root}),error=>{
      assert.equal(error.code,'MIGRATION_REVIEW_REQUIRED');assert.ok(error.details.paths.includes(p));return true;
    });
    assert.deepEqual(readFileSync(join(f.root,p)),bytes);
  }
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
