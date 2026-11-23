import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,mkdirSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transformPreparedArchive} from '../src/testing/prepared-archive.js';
import {fixtureDigest,readPreparedFixtures} from '../src/testing/fixtures.js';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'ksf prepared archive '));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
test('private prepared transport roundtrips binary tar bytes and refuses to replace existing output',async t=>{
 const root=fixture(t),input=join(root,'准备.tar'),compressed=join(root,'prepared.tar.zst'),restored=join(root,'restored.tar');
 const bytes=Buffer.concat([Buffer.from('Fictional tar header\0中文'),Buffer.from(Array.from({length:256},(_,i)=>i)),Buffer.alloc(8192,7)]);writeFileSync(input,bytes);
 await transformPreparedArchive(input,compressed,'compress');await transformPreparedArchive(compressed,restored,'decompress');assert.deepEqual(readFileSync(restored),bytes);assert.deepEqual(readFileSync(input),bytes);
 await assert.rejects(transformPreparedArchive(input,restored,'compress'),{code:'EEXIST'});assert.deepEqual(readFileSync(restored),bytes);
});
test('private prepared transport removes only its incomplete output and propagates missing or corrupt input',async t=>{
 const root=fixture(t),output=join(root,'output.tar');
 await assert.rejects(transformPreparedArchive(join(root,'missing'),output,'compress'),{code:'ENOENT'});assert.equal(existsSync(output),false);
 const corrupt=join(root,'corrupt.zst');writeFileSync(corrupt,'not a zstd stream');await assert.rejects(transformPreparedArchive(corrupt,output,'decompress'));assert.equal(existsSync(output),false);assert.equal(readFileSync(corrupt,'utf8'),'not a zstd stream');
 const valid=join(root,'valid.zst'),input=join(root,'input.tar');writeFileSync(input,Buffer.alloc(4096,3));await transformPreparedArchive(input,valid,'compress');writeFileSync(valid,readFileSync(valid).subarray(0,-4));await assert.rejects(transformPreparedArchive(valid,output,'decompress'));assert.equal(existsSync(output),false);
});

test('prepared distribution seeds require matching source runtime and attempt before independent copies run',t=>{
 const root=fixture(t),directory=join(root,'prepared'),payload=join(directory,'payload'),base=join(payload,'fixture');
 for(const path of ['core','workspace','release'])mkdirSync(join(base,path),{recursive:true});
 writeFileSync(join(base,'core','source'),'original');
 const seed={directory:base,root:join(base,'core'),workspace:join(base,'workspace'),first:{output:join(base,'release')}};
 const manifest={schemaVersion:1,platform:process.platform,node:process.execPath,repository:root,seeds:{true:seed,false:seed}};
 writeFileSync(join(payload,'manifest.json'),JSON.stringify(manifest));
 const identity={sourceDigest:'source',catalogDigest:'catalog',runtime:{version:process.version}};
 const metadata={schemaVersion:1,complete:true,...identity,platform:process.platform,architecture:process.arch,node:process.execPath,repository:root,runId:'7',runAttempt:'2',digest:fixtureDigest(payload)};
 const save=()=>writeFileSync(join(directory,'prepared.json'),JSON.stringify(metadata));save();
 const request={directory,identity,runId:'7',runAttempt:'2'},verified=readPreparedFixtures(root,request);
 assert.equal(verified.seedPath,join(payload,'manifest.json'));
 assert.equal(readPreparedFixtures(root,{...request,runAttempt:'3'}).preparedAttempt,'2','Rerunning a failed job may consume unchanged preparation from this same run.');
 for(const path of ['one','two'])cpSync(seed.root,join(root,path),{recursive:true});
 writeFileSync(join(root,'one','source'),'changed independent scenario');
 assert.equal(readFileSync(join(root,'two','source'),'utf8'),'original');assert.equal(fixtureDigest(payload),verified.digest);
 for(const change of [{runAttempt:'1'},{runId:'8'},{identity:{...identity,sourceDigest:'other'}},{identity:{...identity,catalogDigest:'other'}},{identity:{...identity,runtime:{version:'other'}}}])
  assert.throws(()=>readPreparedFixtures(root,{...request,...change}),{code:'TEST_CI_PREPARATION_INVALID'});
 for(const key of ['node','platform','architecture','repository']){const value=metadata[key];metadata[key]='other';save();assert.throws(()=>readPreparedFixtures(root,request),{code:'TEST_CI_PREPARATION_INVALID'});metadata[key]=value;save();}
 writeFileSync(join(base,'core','source'),'tampered transported seed');
 assert.throws(()=>readPreparedFixtures(root,request),{code:'TEST_CI_PREPARATION_INVALID'});
});
