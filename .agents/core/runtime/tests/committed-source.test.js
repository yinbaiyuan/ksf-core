import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {committedSource} from '../src/distribution/committed-source.js';
import {gitBinary,nullDevice} from './helpers/platform.js';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'ksf Git 中文 '));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'.agents/core'),{recursive:true});
 const git=args=>{const r=spawnSync(gitBinary,['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:nullDevice,GIT_CONFIG_SYSTEM:nullDevice}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git(['init','--template=','--initial-branch=main']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['config','commit.gpgsign','false']);
 return {root,git,commit(){git(['add','.']);git(['commit','-m','fictional checkpoint']);return git(['rev-parse','HEAD']);}};
}
test('bounded committed batches preserve binary bytes, Chinese paths, modes and pinned commit semantics',t=>{
 const f=fixture(t),binary=Buffer.from([0,255,10,13,0,128]),path='.agents/core/中文 空格.bin';writeFileSync(join(f.root,path),binary);writeFileSync(join(f.root,'.agents/core/run'),'#!/bin/sh\n');
 for(let i=0;i<260;i++)writeFileSync(join(f.root,'.agents/core/'+i),String(i));
 f.git(['add','.']);f.git(['update-index','--chmod=+x','.agents/core/run']);f.git(['commit','-m','pinned baseline']);const commit=f.git(['rev-parse','HEAD']);
 const source=committedSource(f.root,{commit});
 rmSync(join(f.root,path));writeFileSync(join(f.root,'.agents/core/0'),'new');f.commit();
 const batches=[...source.readBatches([...source.entries.keys(),'.agents/core/deleted'])],files=new Map(batches.flat());
 assert.ok(batches.length>=3);assert.ok(batches.every(b=>b.length<=128));assert.deepEqual(files.get(path).bytes,binary);assert.equal(files.get('.agents/core/run').mode,0o755);assert.equal(files.get('.agents/core/0').bytes.toString(),'0');assert.equal(files.get('.agents/core/deleted'),null);
});
test('committed batch rejects unsupported modes and unreadable pinned objects',t=>{
 const f=fixture(t);writeFileSync(join(f.root,'.agents/core/a'),'one');f.commit();const source=committedSource(f.root,{}),entry=source.entries.get('.agents/core/a');
 entry.mode='120000';assert.throws(()=>[...source.readBatches(['.agents/core/a'])],{code:'CONTRIBUTION_FILE_TYPE'});
 entry.mode='100644';entry.object='f'.repeat(entry.object.length);assert.throws(()=>[...source.readBatches(['.agents/core/a'])],{code:'CONTRIBUTION_SOURCE_MISSING'});
});


test('combined root and HEAD reads retain unborn, nested-root and fresh-head boundaries',t=>{
 const f=fixture(t);assert.throws(()=>committedSource(f.root),{code:'CONTRIBUTION_HEAD_REQUIRED'});
 writeFileSync(join(f.root,'.agents/core/a'),'original');const first=f.commit();
 assert.equal(committedSource(f.root).headCommit,first);
 assert.throws(()=>committedSource(join(f.root,'.agents/core')),{code:'CONTRIBUTION_GIT_ROOT_MISMATCH'});
 writeFileSync(join(f.root,'.agents/core/a'),'next');const second=f.commit();const pinned=committedSource(f.root,{commit:first});
 assert.equal(pinned.headCommit,second);assert.equal(pinned.sourceCommit,first);assert.equal(pinned.read('.agents/core/a').bytes.toString(),'original');
 assert.throws(()=>committedSource(f.root,{commit:'not-a-commit'}),{code:'CONTRIBUTION_INVALID'});
});
