import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,renameSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import YAML from '../src/vendor/yaml/dist/index.js';
import {types} from '../src/objects/schema.js';
import {abilitySource} from '../src/services/sources.js';
import {abilityStoreCatalog,previewAbilityStore,mutateAbilityStore} from '../src/services/ability-store.js';
import {objectQuery} from '../src/services/objects.js';
import {contextCapabilities} from '../src/services/context.js';
import {readStore} from '../src/ability-store/storage.js';
import {runAbilityStoreCommand} from '../src/commands/ability-store.js';
import {checkSourceCompatibility} from '../src/sources/compatibility.js';
import {gitBinary} from './helpers/platform.js';
function fixture(t){
 const folder=realpathSync(mkdtempSync(join(tmpdir(),'ksf-store-'))),root=join(folder,'ksf');t.after(()=>rmSync(folder,{recursive:true,force:true}));
 for(const type of Object.values(types))for(const source of ['system','user'])mkdirSync(join(root,type[source]),{recursive:true});
 const source=(id='team')=>{const path=join(folder,id);mkdirSync(path);assert.equal(spawnSync(gitBinary,['init','--template=','--initial-branch=main',path]).status,0);const r=abilitySource({root,operation:'init',target:path,id,name:id});assert.deepEqual(r.errors,[]);return path;};
 const add=(path,id,refs=[],version='0.1.0',body='# original\n')=>{const where=join(path,types[id.split('.')[0]].user,id);mkdirSync(where,{recursive:true});writeFileSync(join(where,types[id.split('.')[0]].entry),'---\n'+YAML.stringify({id,name:id,description:'Fictional test method',version,status:'draft',references:refs})+'---\n'+body);return where;};
 const mutate=(operation,input={})=>mutateAbilityStore(root,operation,{...input,operationId:randomUUID(),ifMatch:abilityStoreCatalog(root).version});
 const apply=async(action,input={})=>{const p=previewAbilityStore(root,{action,...input});return mutate(action,{...input,planDigest:p.planDigest});};
 const query=(id,source='effective')=>objectQuery({root,type:id.split('.')[0],operation:'read',reference:id,source});
 return {folder,root,source,add,mutate,apply,query};
}
test('catalog-only sources do not activate abilities; installation copies exact dependency closure and stays offline',async t=>{
 const f=fixture(t),source=f.source(),dep='competency.author.shared',id='partner.author.one';f.add(source,dep);const directory=f.add(source,id,[dep+'@0.1.0']);writeFileSync(join(directory,'example.txt'),'asset');f.add(source,'partner.author.not-installed');
 await f.mutate('source-add',{kind:'local',location:source});assert.equal(abilityStoreCatalog(f.root).abilities.length,3);assert.equal(contextCapabilities(f.root).data.partners.objects.length,0);
 const preview=previewAbilityStore(f.root,{action:'install',sourceId:'team',id});assert.equal(preview.objects.length,2);await f.apply('install',{sourceId:'team',id});
 assert.equal(f.query(id).data.object.source,'team');assert.equal(f.query(dep).data.object.version,'0.1.0');assert.throws(()=>f.query('partner.author.not-installed'),{code:'OBJECT_NOT_FOUND'});
 const installed=f.query(id).data.object;assert.equal(readFileSync(join(installed.directory,'example.txt'),'utf8'),'asset');f.add(source,id,[dep+'@0.1.0'],'0.2.0','# changed\n');await f.mutate('refresh',{sourceId:'team'});assert.equal(f.query(id).data.object.version,'0.1.0');assert.equal(abilityStoreCatalog(f.root).abilities.find(a=>a.id===id).updateAvailable,true);
 renameSync(source,source+'-offline');assert.equal(f.query(id).data.object.body,'# original\n');assert.equal(abilityStoreCatalog(f.root).complete,false);
 await f.mutate('source-remove',{sourceId:'team'});assert.equal(f.query(id).data.object.body,'# original\n');assert.equal(abilityStoreCatalog(f.root).abilities.length,2);
});
test('updates include dependent capabilities when exact shared dependency versions change',async t=>{
 const f=fixture(t),s=f.source(),dep='competency.author.shared',a='partner.author.one',b='partner.author.two';f.add(s,dep);f.add(s,a,[dep+'@0.1.0']);f.add(s,b,[dep+'@0.1.0']);await f.mutate('source-add',{kind:'local',location:s});await f.apply('install',{sourceId:'team',ids:[a,b]});
 f.add(s,dep,[],'0.2.0');f.add(s,a,[dep+'@0.2.0'],'0.2.0');f.add(s,b,[dep+'@0.2.0'],'0.2.0');const p=previewAbilityStore(f.root,{action:'update',sourceId:'team',id:a});assert.ok(p.group.includes(b));await f.apply('update',{sourceId:'team',id:a});assert.equal(f.query(b).data.object.version,'0.2.0');assert.equal(f.query(dep).data.object.version,'0.2.0');
 await assert.rejects(f.apply('uninstall',{sourceId:'team',id:dep}),{code:'ABILITY_STORE_REQUIRED'});await f.apply('uninstall',{sourceId:'team',id:a});assert.equal(f.query(dep).data.object.version,'0.2.0');await f.apply('uninstall',{sourceId:'team',id:b});assert.throws(()=>f.query(dep),{code:'OBJECT_NOT_FOUND'});
});
test('personal copies keep resources and precedence; updates never overwrite user edits',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one',dep='competency.author.shared';f.add(s,dep);const dir=f.add(s,id,[dep+'@0.1.0','+../shared.md']);writeFileSync(join(dirname(dir),'shared.md'),'Shared notes');writeFileSync(join(dir,'asset.txt'),'asset');await f.mutate('source-add',{kind:'local',location:s});await f.apply('install',{sourceId:'team',id});const copied=await f.apply('copy',{sourceId:'team',id});assert.equal(copied.source,'user');const user=f.query(id).data.object;assert.equal(user.source,'user');assert.equal(user.user_revision,1);assert.equal(readFileSync(join(f.root,user.directory,'asset.txt'),'utf8'),'asset');assert.match(user.metadata.references[1],/ksf-store-source/);assert.equal(f.query(id).data.expanded[0].file.content,'Shared notes');
 await assert.rejects(f.apply('copy',{sourceId:'team',id}),{code:'ABILITY_STORE_PERSONAL_EXISTS'});f.add(s,id,[dep+'@0.1.0','+../shared.md'],'0.2.0','# new source\n');await f.apply('update',{sourceId:'team',id});assert.equal(f.query(id).data.object.body,'# original\n');await assert.rejects(f.apply('uninstall',{sourceId:'team',id:dep}),{code:'ABILITY_STORE_REQUIRED'});
});
test('migration preserves all identities, draft states and resource bytes while detaching live source discovery',async t=>{
 const f=fixture(t),s=f.source(),ids=Object.keys(types).map(type=>type+'.author.method');for(const id of ids){const path=f.add(s,id);mkdirSync(join(path,'empty'));writeFileSync(join(path,'resource.bin'),Buffer.from([0,1,2,255]));}abilitySource({root:f.root,operation:'link',target:s});await f.apply('migrate',{sourceId:'team'});assert.deepEqual(readStore(f.root).state.adopted,['team']);assert.equal(abilityStoreCatalog(f.root).migrationSources.length,0);
 for(const id of ids){const installed=f.query(id,'team').data.object;assert.equal(installed.metadata.status,'draft');assert.deepEqual(readFileSync(join(installed.directory,'resource.bin')),Buffer.from([0,1,2,255]));assert.ok(existsSync(join(installed.directory,'empty')));assert.ok(installed.directory.startsWith(join(f.root,'.agents/user-data/ability-store')));}
 f.add(s,ids[0],[],'0.2.0');assert.equal(f.query(ids[0],'team').data.object.version,'0.1.0');assert.equal(abilitySource({root:f.root,operation:'read',target:'team'}).data.path,s);
});
test('failed and stale previews preserve active generation; repeated operations are idempotent',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one';f.add(s,id);await f.mutate('source-add',{kind:'local',location:s});const p=previewAbilityStore(f.root,{action:'install',sourceId:'team',id}),input={sourceId:'team',id,planDigest:p.planDigest,ifMatch:p.version,operationId:randomUUID()};const first=await mutateAbilityStore(f.root,'install',input);assert.equal((await mutateAbilityStore(f.root,'install',input)).replayed,true);await assert.rejects(mutateAbilityStore(f.root,'install',{...input,id:'partner.author.other'}),{code:'ABILITY_STORE_OPERATION_CONFLICT'});
 f.add(s,id,[],'0.2.0');const update=previewAbilityStore(f.root,{action:'update',sourceId:'team',id});f.add(s,id,[],'0.3.0');await assert.rejects(f.mutate('update',{sourceId:'team',id,planDigest:update.planDigest}),{code:'ABILITY_STORE_PREVIEW_CHANGED'});assert.equal(readStore(f.root).state.installed.team.generation,first.generation);
 const newer=previewAbilityStore(f.root,{action:'update',sourceId:'team',id});await assert.rejects(mutateAbilityStore(f.root,'update',{sourceId:'team',id,planDigest:newer.planDigest,ifMatch:newer.version,operationId:randomUUID()},{beforePublish(){throw Error('Simulated interruption');}}));assert.equal(f.query(id).data.object.version,'0.1.0');
});
test('source toggle, identity validation, duplicate sources, and CLI validation share one service',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one';f.add(s,id);await f.mutate('source-add',{kind:'local',location:s});await assert.rejects(f.mutate('source-add',{kind:'local',location:s}),{code:'ABILITY_STORE_SOURCE_EXISTS'});await f.apply('install',{sourceId:'team',id});await f.mutate('source-toggle',{sourceId:'team',enabled:false});assert.equal(abilityStoreCatalog(f.root).abilities[0].available,undefined);assert.equal(f.query(id).data.object.version,'0.1.0');
 const cli=await runAbilityStoreCommand(['catalog','--tab','installed','--json'],f.root);assert.equal(cli.exitCode,0);assert.equal(JSON.parse(cli.stdout).data.abilities.length,1);assert.equal((await runAbilityStoreCommand(['catalog','--wat'],f.root)).exitCode,2);
 writeFileSync(join(s,'ksf-source.yaml'),'kind: ksf-ability-source\nschema_version: 2\nid: other\nname: Changed\n');const checked=await f.mutate('check',{sourceId:'team'});assert.ok(checked.error);assert.equal(f.query(id).data.object.version,'0.1.0');
 assert.throws(()=>checkSourceCompatibility(f.root,join(f.folder,'old-core')),{code:'SOURCE_CORE_INCOMPATIBLE'});
});
test('resource symlinks and cross-source duplicate installations are rejected',async t=>{
 const f=fixture(t),s=f.source(),other=f.source('other'),id='partner.author.one';const dir=f.add(s,id);f.add(other,id);await f.mutate('source-add',{kind:'local',location:s});await f.mutate('source-add',{kind:'local',location:other});await f.apply('install',{sourceId:'team',id});await assert.rejects(f.apply('install',{sourceId:'other',id}),{code:'ABILITY_STORE_SOURCE_CONFLICT'});symlinkSync(join(dir,'partner.md'),join(dir,'link.md'));assert.throws(()=>previewAbilityStore(f.root,{action:'update',sourceId:'team',id}));assert.equal(f.query(id).data.object.version,'0.1.0');
});
test('Git sources clone and refresh using a real local Git HTTP endpoint; authentication failure preserves installation',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one';f.add(s,id);const command=args=>{const r=spawnSync(gitBinary,['-C',s,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false',...args]);assert.equal(r.status,0,r.stderr?.toString());};command(['add','.']);command(['commit','-m','Fixture']);command(['update-server-info']);
 const {createServer}=await import('node:http');let denied=false;const server=createServer((req,res)=>{if(denied){res.writeHead(401,{'WWW-Authenticate':'Basic realm="fixture"'});res.end();return;}try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path.includes('..'))throw Error();res.end(readFileSync(join(s,'.git',path)));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url='http://127.0.0.1:'+server.address().port;await f.mutate('source-add',{kind:'git',location:url});await f.apply('install',{sourceId:'team',id});f.add(s,id,[],'0.2.0');command(['add','.']);command(['commit','-m','Second fixture']);command(['update-server-info']);await f.mutate('refresh',{sourceId:'team'});assert.equal(abilityStoreCatalog(f.root).abilities[0].available.version,'0.2.0');assert.equal(f.query(id).data.object.version,'0.1.0');denied=true;const result=await f.mutate('refresh',{sourceId:'team'});assert.equal(result.error.code,'ABILITY_STORE_GIT_FAILED');assert.equal(f.query(id).data.object.version,'0.1.0');
});
test('HTTP exposes the shared catalog and protects every mutation with the workbench session',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one';f.add(s,id);const {startWebServer}=await import('../src/services/web.js');mkdirSync(join(f.root,'项目'));writeFileSync(join(f.root,'USER.md'),'# Fixture\n');const server=await startWebServer({root:f.root,port:0,capture:false});t.after(()=>server.close());
 const get=async path=>(await fetch(server.url+path)).json(),session=(await get('api/workbench/session')).data;
 const post=(path,input,token=session.token)=>fetch(server.url+path,{method:'POST',headers:{Origin:server.url.slice(0,-1),'Content-Type':'application/json','X-KSF-Token':token},body:JSON.stringify(input)});
 const input={kind:'local',location:s,operationId:randomUUID(),ifMatch:'missing'};assert.equal((await post('api/ability-store/source-add',input,'bad')).status,403);assert.equal((await post('api/ability-store/source-add',input)).status,200);
 const p=(await (await post('api/ability-store/preview',{action:'install',sourceId:'team',id})).json()).data;
 const installed=await post('api/ability-store/install',{sourceId:'team',id,ifMatch:p.version,planDigest:p.planDigest,operationId:randomUUID()});assert.equal(installed.status,200);const item=(await get('api/ability-store/detail?sourceId=team&id='+id)).data;assert.equal(item.installed.version,'0.1.0');
 const conflict=await post('api/ability-store/source-toggle',{sourceId:'team',enabled:false,operationId:randomUUID(),ifMatch:p.version});assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'ABILITY_STORE_CONFLICT');
});
test('source changes during publication, live write locks, and concurrent requests cannot replace the active installation',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one';f.add(s,id);await f.mutate('source-add',{kind:'local',location:s});await f.apply('install',{sourceId:'team',id});f.add(s,id,[],'0.2.0');const p=previewAbilityStore(f.root,{action:'update',sourceId:'team',id}),input={sourceId:'team',id,ifMatch:p.version,planDigest:p.planDigest,operationId:randomUUID()};
 await assert.rejects(mutateAbilityStore(f.root,'update',input,{beforePublish(){f.add(s,id,[],'0.3.0');}}),{code:'ABILITY_STORE_SOURCE_CHANGED'});assert.equal(f.query(id).data.object.version,'0.1.0');
 const lock=join(f.root,'.agents/runtime-data/ability-store/write.lock');writeFileSync(lock,JSON.stringify({pid:process.pid}));await assert.rejects(f.apply('update',{sourceId:'team',id}),{code:'ABILITY_STORE_LOCKED'});rmSync(lock);
 const next=previewAbilityStore(f.root,{action:'update',sourceId:'team',id}),results=await Promise.allSettled([mutateAbilityStore(f.root,'update',{...input,operationId:randomUUID(),planDigest:next.planDigest}),mutateAbilityStore(f.root,'update',{...input,operationId:randomUUID(),planDigest:next.planDigest})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.query(id).data.object.version,'0.3.0');
});
test('cyclic dependencies can be removed with their only explicit root; updating a dependency does not make it explicit',async t=>{
 const f=fixture(t),s=f.source(),a='partner.author.root',b='competency.author.cycle';f.add(s,a,[b+'@0.1.0']);f.add(s,b,[a+'@0.1.0']);await f.mutate('source-add',{kind:'local',location:s});await f.apply('install',{sourceId:'team',id:a});f.add(s,a,[b+'@0.2.0'],'0.2.0');f.add(s,b,[a+'@0.2.0'],'0.2.0');await f.apply('update',{sourceId:'team',id:b});assert.deepEqual(readStore(f.root).state.installed.team.roots,[a]);await f.apply('uninstall',{sourceId:'team',id:a});assert.equal(readStore(f.root).state.installed.team.objects.length,0);
});
test('personal copies include only the chosen object and referenced resources, not other installed methods',async t=>{
 const f=fixture(t),s=f.source(),a='partner.author.one',b='partner.author.private';f.add(s,a);f.add(s,b,[],'0.1.0','# other method\n');await f.mutate('source-add',{kind:'local',location:s});await f.apply('install',{sourceId:'team',ids:[a,b]});const result=await f.apply('copy',{sourceId:'team',id:a});assert.equal(existsSync(join(f.root,dirname(result.path),'.ksf-store-source','能力','搭档',b)),false);
});
test('updates reject breaking exact dependencies of personal definitions and preserve both old versions',async t=>{
 const f=fixture(t),s=f.source(),id='partner.author.one',dep='competency.author.shared';f.add(s,dep);f.add(s,id,[dep+'@0.1.0']);await f.mutate('source-add',{kind:'local',location:s});await f.apply('install',{sourceId:'team',id});await f.apply('copy',{sourceId:'team',id});f.add(s,dep,[],'0.2.0');f.add(s,id,[dep+'@0.2.0'],'0.2.0');assert.throws(()=>previewAbilityStore(f.root,{action:'update',sourceId:'team',id}),{code:'ABILITY_STORE_EXTERNAL_DEPENDENCY'});assert.equal(f.query(dep).data.object.version,'0.1.0');assert.equal(f.query(id).data.object.source,'user');assert.equal(f.query(id,'team').data.object.version,'0.1.0');
});
