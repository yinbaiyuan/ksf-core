// Native same-machine A/B diagnostics only. These results are never suite proof.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname,join,parse} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {sourceIdentity} from '../src/testing/ci.js';
import {createVerificationPlan} from '../src/testing/ci-plan.js';
import {prepareCIFixtures} from '../src/testing/prepare-ci-fixtures.js';
import {readPreparedFixtures} from '../src/testing/fixtures.js';
import {testEnvironment} from '../src/testing/runner.js';

const option=process.argv.slice(2).join(' '),smoke=option==='--smoke',localCheck=option==='--local-native-check';
assert(['','--smoke','--local-native-check'].includes(option),'Unsupported diagnostic option.');
assert(smoke||localCheck||['win32','darwin'].includes(process.platform),'The full diagnostic requires a native release host.');
const root=realpathSync(process.cwd()),out=join(root,'.agents/runtime-data/volume-diagnostic'),seedDirectory=join(root,'.agents/runtime-data/ci-seeds');
assert(!existsSync(seedDirectory),'Do not reuse or remove an existing seed.');assert(!existsSync(out),'Do not overwrite a diagnostic run.');mkdirSync(out,{recursive:true});
const identity=sourceIdentity(root),plan=createVerificationPlan(root,{full:true},identity),runId=process.env.GITHUB_RUN_ID??'local-volume-diagnostic-not-proof',runAttempt=process.env.GITHUB_RUN_ATTEMPT??'1';
const specs=smoke?[{file:'release-files.test.js',expected:9,order:['profile','workspace','workspace','profile']}]:[
 {file:'system-update-recovery.test.js',expected:4,order:localCheck?['profile']:['profile','workspace','workspace','profile']},
 {file:'instance-source-promotion.test.js',expected:5,order:localCheck?['workspace']:['workspace','profile']},
];
const parents={profile:process.platform==='win32'?homedir():tmpdir(),workspace:dirname(root)};
if(!smoke&&!localCheck&&process.platform==='win32')assert.notEqual(parse(parents.profile).root.toLowerCase(),parse(parents.workspace).root.toLowerCase(),'Windows diagnostic requires two different native volumes.');
const devices=Object.fromEntries(Object.entries(parents).map(([name,path])=>[name,statSync(path).dev]));
const result={diagnosticOnly:true,notSuiteProof:true,smoke,platform:process.platform,architecture:process.arch,node:process.execPath,runId,runAttempt,sourceDigest:identity.sourceDigest,parents,devices,specs,trials:[],complete:false};
const save=()=>writeFileSync(join(out,'results.json'),JSON.stringify(result,null,2)+'\n');save();let owned=false;
try{
 owned=true;prepareCIFixtures(root,{include:plan.groups.filter(g=>g.platform===process.platform&&g.toolchains===false)},{runId,runAttempt});
 const prepared=readPreparedFixtures(root,{directory:seedDirectory,identity,runId,runAttempt});
 for(const spec of specs)for(const location of spec.order){
  const index=result.trials.length,scratch=mkdtempSync(join(parents[location],'.ksft-')),metrics=join(out,'metrics-'+index),log=join(out,'trial-'+index+'.tap');
  try{
   assert.equal(sourceIdentity(root).sourceDigest,identity.sourceDigest);
   const env={...testEnvironment(),TMPDIR:scratch,TMP:scratch,TEMP:scratch,KSF_TEST_DISTRIBUTION_SEEDS:prepared.seedPath,KSF_VOLUME_METRICS:metrics};
   const started=performance.now(),execution=spawnSync(process.execPath,['--import',new URL('./volume-diagnostic-preload.mjs',import.meta.url).href,'--test','--test-reporter=tap',join(root,'.agents/core/runtime/tests',spec.file)],{cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024,windowsHide:true});
   const seconds=(performance.now()-started)/1000,text=(execution.stdout??'')+(execution.stderr??'');writeFileSync(log,text);
   const number=name=>Number([...text.matchAll(new RegExp('^# '+name+' (\\d+)$','gm'))].at(-1)?.[1]??NaN);
   const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(name=>[name,number(name)]));
   const trial={file:spec.file,location,temporaryDirectory:scratch,seconds,exitCode:execution.status,signal:execution.signal,error:execution.error?.code??null,counts};
   result.trials.push(trial);save();console.log(JSON.stringify(trial));
   assert.equal(execution.status,0,text.slice(-6000));assert.equal(counts.tests,spec.expected);assert.equal(counts.pass,spec.expected);for(const key of ['fail','cancelled','skipped','todo'])assert.equal(counts[key],0);
   assert(readdirSync(out).some(n=>n.startsWith('metrics-'+index+'-')&&n.endsWith('.json')),'Missing aggregate process metrics.');
   assert.equal(sourceIdentity(root).sourceDigest,identity.sourceDigest);assert.equal(readPreparedFixtures(root,{directory:seedDirectory,identity,runId,runAttempt}).digest,prepared.digest);
  }finally{rmSync(scratch,{recursive:true,force:true,maxRetries:8,retryDelay:50});}
 }
 result.complete=true;save();
}catch(error){result.error={code:error.code??'DIAGNOSTIC_FAILED',message:error.message};save();throw error;}
finally{if(owned)rmSync(seedDirectory,{recursive:true,force:true,maxRetries:8,retryDelay:50});}
