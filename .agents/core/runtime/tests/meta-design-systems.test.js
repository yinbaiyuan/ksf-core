import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,readdirSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {types,validateObject} from '../src/objects/schema.js';
import {catalog} from '../src/objects/catalog.js';
import {referenceResults} from '../src/objects/references.js';
import {parseFrontmatter} from '../src/metadata/frontmatter.js';
import {objectQuery,objectMutation} from '../src/services/objects.js';
import {orphanCompetencies} from '../src/services/orphan-competencies.js';
import {contextEntry} from '../src/services/entry-context.js';
import {readCurrentWork,bindCurrentWork,currentWorkContext,acceptWorkContext,resetWorkContext} from '../src/services/work-context.js';
import {workContextHook} from '../src/services/context-hook.js';
import {sha256} from '../src/shared/hash.js';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const designs=['competency-design','partner-design','cooperation-design'];
const diagnosis='competency.ksf.ability-diagnosis';
function files(root,prefix='') {
  return readdirSync(join(root,prefix),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(root,join(prefix,e.name)):[join(prefix,e.name)]).sort();
}
function fixture(t) {
  const root=realpathSync(mkdtempSync(join(tmpdir(),'ksf meta 中文 ')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const d of Object.values(types))for(const s of ['system','user'])mkdirSync(join(root,d[s]),{recursive:true});
  cpSync(join(repo,'.agents/core/abilities'),join(root,'.agents/core/abilities'),{recursive:true});
  const put=(path,text)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text);};
  put('AGENTS.md',readFileSync(join(repo,'AGENTS.md')));
  put('.agents/core/manifest.yaml','name: KSF\nversion: 0.0.1\n');
  put('USER.md','# Fixture user\n');put('BOT.md','# Fixture bot\n');
  return {root,put};
}
const read=(root,id,part='all')=>objectQuery({root,type:id.split('.')[0],operation:'read',reference:id,source:'system',part});

test('Core diagnosis keeps the pinned upstream bytes and the entire method except its requested title',()=>{
  const base=join(repo,'.agents/core/abilities/competencies/ability-diagnosis');
  const manifest=JSON.parse(readFileSync(join(base,'资料/source-manifest.json'),'utf8'));
  for(const f of manifest.snapshot.files) {
    const bytes=readFileSync(join(base,'资料/upstream',f.path));
    assert.equal(bytes.length,f.bytes,f.path);assert.equal(sha256(bytes),f.sha256,f.path);
  }
  const original=parseFrontmatter(readFileSync(join(base,'资料/upstream/SKILL.md')),'upstream').values;
  const content=readFileSync(join(base,'competency.md'),'utf8');
  const metadata=parseFrontmatter(Buffer.from(content),'diagnosis').values;
  const upstream=readFileSync(join(base,'资料/upstream/SKILL.md'),'utf8');
  assert.equal(metadata.id,diagnosis);assert.equal(metadata.name,'能力诊断');
  assert.equal(metadata.description,original.description);assert.equal(metadata.user_revision,undefined);
  assert.equal(content.slice(content.indexOf('# 能力诊断')),upstream.slice(upstream.indexOf('# Better Skill ·')).replace('# Better Skill · Skill 工艺定版标准（技能医生）','# 能力诊断'));
});

test('three design packages resolve their resources independently and do not eagerly expand diagnosis',()=>{
  for(const name of designs) {
    const id='competency.ksf.'+name,query=read(repo,id);
    assert.deepEqual(query.errors,[]);assert.equal(query.data.object.version,'0.2.0');
    assert.equal(query.data.expanded,undefined);
    assert.deepEqual(query.data.references.map(r=>r.id),[diagnosis]);
    const base=join(repo,query.data.object.directory);
    for(const rel of files(base).filter(p=>p.endsWith('.md'))) {
      const text=readFileSync(join(base,rel),'utf8');
      for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target=m[1].split('#')[0];
        if(!target||/^[a-z]+:/i.test(target))continue;
        const path=resolve(dirname(join(base,rel)),decodeURIComponent(target));
        assert.ok(!relative(join(repo,'.agents/core'),path).startsWith('..'),rel+': '+target);
        assert.ok(existsSync(path),rel+': '+target);
      }
    }
    const cases=JSON.parse(readFileSync(join(base,'evals/cases.json'),'utf8')).cases;
    assert.deepEqual(new Set(cases.map(c=>c.mode)),new Set(['create','refactor','boundary']));
    const triggers=JSON.parse(readFileSync(join(base,'evals/trigger-eval.json'),'utf8'));
    assert.equal(triggers.shouldUse.length,20);assert.ok(triggers.shouldNotUse.length>0);
  }
});

test('manager expands only diagnosis and retired identities are absent from the effective graph',t=>{
  const f=fixture(t),query=read(f.root,'partner.ksf.ability-manager');
  assert.deepEqual(query.errors,[]);assert.equal(query.data.object.version,'0.2.0');
  assert.deepEqual(query.data.expanded.map(x=>x.object.id),[diagnosis]);
  assert.equal(read(f.root,'partner.ksf.ability-manager','metadata').data.expanded,undefined);
  const c=catalog(f.root);assert.deepEqual(c.errors,[]);
  assert.equal(c.rows.filter(r=>r.source==='system').length,35);
  assert.ok(c.rows.some(r=>r.id==='competency.ksf.project-definition'&&r.source==='system'));
  for(const row of c.rows)assert.deepEqual(referenceResults(c,row).filter(r=>r.error),[],row.id);
  for(const id of ['competency.ksf.capability-validation','competency.yinbaiyuan.better-skill'])
    assert.ok(!c.rows.some(r=>r.id===id));
  const orphans=orphanCompetencies(f.root);
  assert.deepEqual(orphans.errors,[]);
  assert.ok(!orphans.data.objects.some(o=>o.id===diagnosis||designs.some(n=>o.id==='competency.ksf.'+n)));
});

test('native derivation preserves source bytes and rebases resource links to the same targets',t=>{
  const f=fixture(t);
  for(const id of [...designs.map(n=>'competency.ksf.'+n),diagnosis]) {
    const original=read(f.root,id).data.object,base=join(f.root,original.directory);
    const expected=new Map(files(base).map(p=>[p,readFileSync(join(base,p))]));
    const output=objectMutation({root:f.root,type:'competency',operation:'write',id,input:{}}).data;
    assert.equal(output.derived,true);
    const directory=join(f.root,output.directory);
    for(const [path,bytes] of expected) {
      assert.deepEqual(readFileSync(join(directory,'.upstream/snapshot',path)),bytes,path);
      if(path==='competency.md')continue;
      const actual=readFileSync(join(directory,path));
      if(!path.endsWith('.md')) {assert.deepEqual(actual,bytes,path);continue;}
      const normalized=(text,owner,bundle)=>text.replace(/\[([^\]]*)\]\(([^)]+)\)/g,(all,label,url)=>{
        if(!url||url.startsWith('#')||/^[a-z]+:/i.test(url))return all;
        const [target,...anchor]=url.split('#'),resolved=resolve(dirname(join(owner,path)),decodeURIComponent(target));
        const local=relative(bundle,resolved),location=local.startsWith('..')?resolved:'bundle:'+local;
        return '['+label+']('+location+(anchor.length?'#'+anchor.join('#'):'')+')';
      });
      assert.equal(normalized(actual.toString('utf8'),directory,directory),normalized(bytes.toString('utf8'),base,base),path);
    }
    assert.deepEqual(objectQuery({root:f.root,type:'competency',operation:'check',reference:id,source:'user'}).errors,[]);
  }
});

test('selected manager, design and method resource switch incrementally and restore after compact',t=>{
  const f=fixture(t),identity={host:'codex',sessionId:'meta-design-compact'},o={root:f.root,identity};
  f.put('项目/meta/project.md','# Meta project\n');f.put('项目/meta/任务/current.md','# Actual design checkpoint\n');
  const get=()=>currentWorkContext(o),accept=p=>acceptWorkContext({...o,delivery:p.delivery});
  const bind=current=>bindCurrentWork({...o,current,ifMatch:readCurrentWork(o).etag});
  resetWorkContext(o);const base=get();assert.equal(base.active.length,4);accept(base);
  const selected=name=>({ref:'competency.ksf.'+name+'@0.2.0',source:'system'});
  const resource=name=>({path:'.agents/core/abilities/competencies/'+name+'/references/workflow.md',purpose:'current method'});
  const current={schemaVersion:1,goal:'design current object',status:'active',ownership:{state:'bound',target:{kind:'project',name:'meta',scope:'current'}},executor:{ref:'partner.ksf.ability-manager@0.2.0',source:'system'},methods:[selected(designs[0]),{ref:diagnosis+'@1.1.0',source:'system'}],files:[resource(designs[0])],taskRef:'项目/meta/任务/current.md'};
  bind(current);let p=get();assert.equal(p.complete,true,JSON.stringify(p.errors));
  assert.equal(p.bodies.filter(x=>x.ref===diagnosis+'@1.1.0').length,1);
  assert(p.bodies.some(x=>x.path===resource(designs[0]).path));
  assert(!p.active.some(x=>x.ref?.startsWith('competency.ksf.partner-design@')));
  accept(p);assert.equal(get().bodies.length,0);
  bind({...current,methods:[selected(designs[1]),{ref:diagnosis+'@1.1.0',source:'system'}],files:[resource(designs[1])]});
  p=get();assert.equal(p.complete,true);
  assert.deepEqual(new Set(p.bodies.map(x=>x.ref??x.path)),new Set([selected(designs[1]).ref,resource(designs[1]).path]));
  assert(p.retired.some(x=>x.ref===selected(designs[0]).ref));
  accept(p);assert.equal(get().bodies.length,0);
  const before=readCurrentWork(o),generation=get().generation;
  const transcript=join(f.root,'native.jsonl');
  f.put('native.jsonl',JSON.stringify({type:'session_meta',payload:{id:identity.sessionId,cwd:f.root}})+'\n');
  const hook=workContextHook({root:f.root,input:{session_id:identity.sessionId,transcript_path:transcript,hook_event_name:'SessionStart',source:'compact'}});
  assert.match(hook.hookSpecificOutput.additionalContext,/"readRequired":true/);
  p=get();assert.equal(p.complete,true);assert.notEqual(p.generation,generation);
  assert.deepEqual(readCurrentWork(o),before);assert.equal(p.bodies.length,p.active.length);
  assert(p.bodies.some(x=>x.ref===selected(designs[1]).ref));assert(p.bodies.some(x=>x.path===resource(designs[1]).path));
  assert(!p.active.some(x=>x.ref===selected(designs[0]).ref));
  accept(p);assert.equal(get().bodies.length,0);
  bind(null);p=get();assert.equal(p.active.length,4);accept(p);assert.equal(get().bodies.length,0);
  const entry=contextEntry(f.root);assert.equal(entry.complete,true);
  assert.deepEqual(entry.context.expanded.filter(x=>x.kind!=='file').map(x=>x.object.id),['competency.ksf.persona-route']);
});

test('complete creation examples form a resolvable isolated graph without registering example objects in Core',t=>{
  const f=fixture(t),inputs=[
    ['competency-design','examples/quote-check.md'],
    ['partner-design','examples/delivery-planner.md'],
    ['cooperation-design','examples/delivery-review.md']
  ];
  const definitions=[];
  for(const [name,path] of inputs) {
    const text=readFileSync(join(repo,'.agents/core/abilities/competencies',name,path),'utf8');
    for(const m of text.matchAll(/^~~~markdown\n([\s\S]*?)^~~~\s*$/gm)) {
      const parsed=parseFrontmatter(Buffer.from(m[1]),path),metadata=parsed.values,type=metadata.id.split('.')[0];
      assert.deepEqual(validateObject(metadata,{type,source:'system',path}),[]);
      const dest=types[type].system+'/'+metadata.id+'/'+types[type].entry;
      f.put(dest,m[1]);definitions.push(metadata.id);
    }
  }
  assert.equal(definitions.length,4);
  const c=catalog(f.root);
  for(const id of definitions) {
    const row=c.rows.find(r=>r.id===id);assert.deepEqual(row.errors,[]);
    assert.deepEqual(referenceResults(c,row).filter(r=>r.error),[]);
  }
  const query=read(f.root,'cooperation.example.delivery-review');
  assert.deepEqual(query.errors,[]);
  assert.deepEqual(query.data.expanded.map(x=>x.object.id),['partner.example.delivery-planner','partner.example.delivery-reviewer']);
  assert.ok(!catalog(repo).rows.some(r=>definitions.includes(r.id)));
});
