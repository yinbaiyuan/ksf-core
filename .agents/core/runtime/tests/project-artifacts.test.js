import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,readFileSync,rmSync,symlinkSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture} from './helpers/governance-fixture.js';
import {project} from '../src/services/projects.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {defaultMetadata,hash,criteriaDigest} from '../src/projects/governance/model.js';
import {readSnapshot} from '../src/metadata/files.js';

const name='新建项目',pp='项目/'+name+'/project.md',ap='项目/'+name+'/成果';
const write=(f,extra={},hooks={})=>project({root:f.root,name,operation:'write',data:{body:'# 项目',...extra.data},...extra},hooks);
const request=()=>({operationId:'artifacts-create-project',ifMatch:'missing',changes:[{path:pp,ifMatch:'missing',metadata:defaultMetadata('project','artifact-project',name),body:'# 项目'}]});
const govern=(f,data,dryRun=false,hooks={})=>projectGovernance({root:f.root,name,operation:'apply',data,dryRun},hooks);

test('project write previews creation, creates one empty artifacts directory and never backfills ordinary updates',t=>{
  const f=fixture(t),preview=write(f,{dryRun:true});
  assert.deepEqual(preview.data.directoryChanges,[{path:ap,action:'create'}]);assert(!existsSync(join(f.root,ap)));
  assert(write(f).data.created);assert.deepEqual(readdirSync(join(f.root,ap)),[]);
  assert.equal(write(f).data.changed,false);
  rmSync(join(f.root,ap),{recursive:true});write(f,{data:{body:'# 更新'}});assert(!existsSync(join(f.root,ap)));
});

test('new-project directory conflicts fail before publishing and existing directory contents survive',async t=>{
  for(const mode of ['existing','file','symlink'])await t.test(mode,t=>{
    const f=fixture(t);mkdirSync(join(f.root,'项目',name));
    if(mode==='existing'){mkdirSync(join(f.root,ap));writeFileSync(join(f.root,ap,'已有.pdf'),'原件');}
    if(mode==='file')writeFileSync(join(f.root,ap),'同名文件');
    if(mode==='symlink'){
      try{symlinkSync(join(f.root,'项目'),join(f.root,ap),'dir');}catch(e){if(e.code==='EPERM'){t.skip('directory symlinks unavailable');return;}throw e;}
    }
    if(mode==='existing'){assert(write(f).data.created);assert.equal(readFileSync(join(f.root,ap,'已有.pdf'),'utf8'),'原件');}
    else{assert.throws(()=>write(f),{code:'PROJECT_ARTIFACTS_PATH'});assert(!existsSync(join(f.root,pp)));}
  });
});

test('project write removes only its own empty artifacts directory on publication failure',t=>{
  const f=fixture(t);
  assert.throws(()=>write(f,{}, {beforeCheck(){throw Error('controlled publication failure');}}),{code:'FILE_WRITE_FAILED'});
  assert(!existsSync(join(f.root,'项目',name)));
});

test('governance creation previews, commits and replays the same directory without manufacturing files',t=>{
  const f=fixture(t),data=request(),preview=govern(f,data,true);assert.deepEqual(preview.errors,[]);
  assert.deepEqual(preview.data.directoryChanges,[{path:ap,action:'create'}]);assert(!existsSync(join(f.root,ap)));
  const saved=govern(f,data);assert.deepEqual(saved.errors,[]);assert(saved.data.valid);
  assert.deepEqual(readdirSync(join(f.root,ap)),[]);assert(govern(f,data).data.replayed);
  assert.deepEqual(f.call().errors,[]);assert(!existsSync(join(f.root,'项目/示例/成果')));
});

test('governance artifact conflicts do not write a root or a pending transaction',t=>{
  const f=fixture(t);mkdirSync(join(f.root,'项目',name));writeFileSync(join(f.root,ap),'文件');
  assert.equal(govern(f,request()).errors[0].code,'PROJECT_ARTIFACTS_PATH');
  assert(!existsSync(join(f.root,pp)));assert(!existsSync(join(f.root,'.agents/runtime-data/projects/pending.json')));
});

test('interrupted governance creation recovers the directory and preserves concurrent artifact contents',async t=>{
  for(const concurrent of [false,true])await t.test(String(concurrent),t=>{
    const f=fixture(t),data=request();
    const out=govern(f,data,false,{fault(phase){if(phase==='artifact-directory-created')throw Error('controlled interruption');}});
    assert.equal(out.errors.length,1);assert(existsSync(join(f.root,ap)));
    if(concurrent)writeFileSync(join(f.root,ap,'并发成果.bin'),'保留');
    const recovered=projectGovernance({root:f.root,name,operation:'recover',data:{operationId:data.operationId}});
    assert.deepEqual(recovered.errors,[]);
    if(concurrent)assert.equal(readFileSync(join(f.root,ap,'并发成果.bin'),'utf8'),'保留');else assert(!existsSync(join(f.root,'项目',name)));
  });
});

test('large binary evidence can complete a task, read back, and detect changes without raising the document limit',t=>{
  const f=fixture(t);assert.deepEqual(f.initialize().errors,[]);
  const path='项目/示例/成果/安装包-v1.zip',bytes=Buffer.alloc(3*1024*1024,0xfe);mkdirSync(join(f.root,'项目/示例/成果'));writeFileSync(join(f.root,path),bytes);
  const streamed=readSnapshot(join(f.root,path),{digestOnly:true});assert.equal(streamed.digest,hash(bytes));assert(!Object.hasOwn(streamed,'bytes'));
  const task=f.read().documents.find(d=>d.path===f.tp).metadata;
  const verification={basis_digest:criteriaDigest(task),results:task.criteria.map(c=>({criterion_id:c.id,result:'passed',evidence:[{path,digest:streamed.digest}],reviewer:'test',reviewed_at:new Date().toISOString()}))};
  assert.deepEqual(f.apply([f.change(f.tp,{status:'completed',next_action:null,result_refs:[{path}],verification})]).errors,[]);
  assert(f.read().valid);assert(!f.read().stale.includes(task.id));
  bytes[bytes.length-1]=0xff;writeFileSync(join(f.root,path),bytes);assert(f.read().stale.includes(task.id));
  const oversized=f.apply([{path:'项目/示例/P00-过大主文.md',ifMatch:'missing',body:'x'.repeat(3*1024*1024)}]);
  assert.equal(oversized.errors[0].code,'PROJECT_GOVERNANCE_SIZE');
});

test('large artifacts and their fixed evidence survive archive and restore without adding missing directories',t=>{
  const f=fixture(t);f.initialize();
  const path='项目/示例/成果/交付-v1.zip',bytes=Buffer.alloc(3*1024*1024,0xfa);mkdirSync(join(f.root,'项目/示例/成果'));writeFileSync(join(f.root,path),bytes);
  const task=f.read().documents.find(d=>d.path===f.tp).metadata;
  assert.deepEqual(f.apply([f.change(f.tp,{status:'completed',next_action:null,result_refs:[{path}],verification:f.proof(task,path,bytes)})]).errors,[]);
  assert.deepEqual(f.apply([f.change(f.pp,{status:'paused',status_reason:'测试封存',resume_condition:'明确恢复后继续',next_action:'等待用户恢复'})]).errors,[]);
  for(const operation of ['archive','restore']){
    const data={reason:'验证大文件历史引用',actor:'test',operationId:'artifact-'+operation+'-roundtrip'};
    const preview=project({root:f.root,name:f.name,operation,data,dryRun:true});assert.deepEqual(preview.errors,[]);assert(preview.data.allowed);
    const out=project({root:f.root,name:f.name,operation,data:{...data,ifMatch:preview.data.ifMatch}});assert.deepEqual(out.errors,[]);
    const scope=operation==='archive'?'archived':'current',read=projectGovernance({root:f.root,name:f.name,scope}).data;
    assert(read.valid);assert(!read.stale.includes(task.id));
    const actual=operation==='archive'?path.replace(/^项目\//,'档案/项目/'):path;assert.deepEqual(readFileSync(join(f.root,actual)),bytes);
  }
  // An older project without artifacts is not backfilled by position recovery.
  const g=fixture(t,'旧项目');g.initialize();
  assert.deepEqual(g.apply([g.change(g.pp,{status:'paused',status_reason:'暂存旧项目',resume_condition:'用户选择恢复',next_action:'以后再安排'})]).errors,[]);
  for(const operation of ['archive','restore']){
    const data={reason:'旧项目不补目录',actor:'test',operationId:'no-backfill-'+operation};
    const p=project({root:g.root,name:g.name,operation,data,dryRun:true});assert(p.data.allowed);
    project({root:g.root,name:g.name,operation,data:{...data,ifMatch:p.data.ifMatch}});
    assert(!existsSync(join(g.root,(operation==='archive'?'档案/':'')+'项目/旧项目/成果')));
  }
});
