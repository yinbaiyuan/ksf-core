import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {sourceIdentity,validateCoverage,validateProof,trustedRun} from '../src/testing/ci.js';
import {gitBinary,nullDevice} from './helpers/platform.js';
import {loadCatalog,catalogPath} from '../src/testing/catalog.js';
test('CI proof requires complete disjoint native coverage and exact trusted source',t=>{
 const root=mkdtempSync(join(tmpdir(),'ksf-proof-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'.agents/core/runtime/tests'),{recursive:true});mkdirSync(join(root,'.agents/core/runtime/testing'));
 writeFileSync(join(root,'.agents/core/runtime/tests/a.test.js'),'// fixture');writeFileSync(join(root,'.agents/core/build.json'),JSON.stringify({runtime:{version:process.version.slice(1),packages:{fixture:'locked'}}}));
 writeFileSync(join(root,catalogPath),JSON.stringify({schemaVersion:1,components:{core:{directory:'.agents/core/runtime',testRoots:['.agents/core/runtime/tests']}},risks:[],tests:[{id:'a',owner:'core',covers:['core'],path:'.agents/core/runtime/tests/a.test.js',suite:'quick',platforms:['darwin','win32'],inputs:[],requirements:[],timeoutMs:1000}]}));
 for(const args of [['init','--template='],['add','.']])assert.equal(spawnSync(gitBinary,['-C',root,...args],{env:{...process.env,GIT_CONFIG_GLOBAL:nullDevice,GIT_CONFIG_SYSTEM:nullDevice}}).status,0);
 const identity=sourceIdentity(root),reports=['darwin','win32'].map(platform=>({complete:true,status:'passed',suite:'full',platform,architecture:platform==='darwin'?'arm64':'x64',nodeVersion:process.version,catalogDigest:loadCatalog(root).digest,sourceDigest:identity.sourceDigest,changedInputs:[],summary:{reused:0},results:[{status:'passed',path:'.agents/core/runtime/tests/a.test.js'}]}));
 assert.equal(validateCoverage(root,reports).full,true);
 assert.throws(()=>validateCoverage(root,[...reports,reports[0]]),{code:'TEST_PROOF_INVALID'});
 assert.throws(()=>validateCoverage(root,reports.slice(0,1)),{code:'TEST_PROOF_INVALID'});
 for(const override of [{summary:{reused:1}},{changedInputs:['x']},{catalogDigest:'stale'},{status:'cancelled'}])assert.throws(()=>validateCoverage(root,[{...reports[0],...override},reports[1]]),{code:'TEST_PROOF_INVALID'});
 writeFileSync(join(root,'.agents/core/runtime/tests/a.test.js'),'changed');assert.throws(()=>validateCoverage(root,reports),{code:'TEST_PROOF_INVALID'});
});
test('release proof trust excludes PRs, foreign repositories, other workflows and failed attempts',()=>{
 const run={id:1,run_attempt:1,conclusion:'success',head_sha:'sha',head_branch:'main',head_repository:{full_name:'official/core'},path:'.github/workflows/check.yml',event:'push'};
 assert.equal(trustedRun(run,'official/core','sha'),true);
 for(const override of [{event:'pull_request'},{head_repository:{full_name:'fork/core'}},{head_branch:'feature'},{conclusion:'failure'},{head_sha:'old'},{path:'.github/workflows/release.yml'}])assert.equal(trustedRun({...run,...override},'official/core','sha'),false);
});
