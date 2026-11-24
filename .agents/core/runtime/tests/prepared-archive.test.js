import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,mkdirSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {zstdDecompressSync} from 'node:zlib';
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

test('private prepared transport streams binary input and output without changing bytes or overwriting a file',t=>{
 const root=fixture(t),cli=fileURLToPath(new URL('../src/testing/prepared-archive.js',import.meta.url)),compressed=join(root,'prepared.zst');
 const bytes=Buffer.concat([Buffer.from('流式 tar\0\r\n'),Buffer.from(Array.from({length:256},(_,i)=>i)),Buffer.alloc(1024*1024,7)]);
 const call=(args,input)=>spawnSync(process.execPath,[cli,...args],{input,maxBuffer:4*1024*1024,timeout:15000});
 const saved=call(['compress','-',compressed],bytes);assert.equal(saved.status,0,saved.stderr.toString());
 const restored=call(['decompress',compressed,'-']);assert.equal(restored.status,0,restored.stderr.toString());assert.deepEqual(restored.stdout,bytes);
 const original=readFileSync(compressed),duplicate=call(['compress','-',compressed],Buffer.from('replacement'));
 assert.notEqual(duplicate.status,0);assert.deepEqual(readFileSync(compressed),original);
 const piped=call(['compress','-','-'],bytes);assert.equal(piped.status,0,piped.stderr.toString());
 const roundtrip=call(['decompress','-','-'],piped.stdout);assert.equal(roundtrip.status,0,roundtrip.stderr.toString());assert.deepEqual(roundtrip.stdout,bytes);
 const corrupt=call(['decompress','-','-'],piped.stdout.subarray(0,-4));assert.notEqual(corrupt.status,0,'A truncated stream cannot report success after producing partial output.');
 assert.notEqual(call(['decompress',join(root,'missing'),'-']).status,0);
});

test('private prepared transport verifies its trailer even when a decoder accepts an incomplete frame',async t=>{
 const root=fixture(t),cli=fileURLToPath(new URL('../src/testing/prepared-archive.js',import.meta.url)),input=join(root,'input'),compressed=join(root,'prepared.zst'),output=join(root,'output');
 const bytes=Buffer.concat([Buffer.alloc(70000,4),Buffer.from(Array.from({length:256},(_,i)=>i))]);writeFileSync(input,bytes);
 await transformPreparedArchive(input,compressed,'compress');const packed=readFileSync(compressed),trailer=packed.subarray(-56);
 assert.deepEqual(zstdDecompressSync(packed),bytes,'The integrity frame must remain compatible with standard Zstd decoding.');
 const damaged=[...new Set([1,4,8,16,32,55,56,57])].map(cut=>packed.subarray(0,-cut));
 damaged.push(Buffer.concat([packed.subarray(0,-60),trailer]));
 for(const offset of [packed.length-1,packed.length-32,packed.length-40,packed.length-48]){const changed=Buffer.from(packed);changed[offset]^=1;damaged.push(changed);}
 for(const data of damaged){
  writeFileSync(compressed,data);await assert.rejects(transformPreparedArchive(compressed,output,'decompress'));assert.equal(existsSync(output),false);
  const result=spawnSync(process.execPath,[cli,'decompress','-','-'],{input:data,maxBuffer:1024*1024,timeout:15000});assert.notEqual(result.status,0,'Corrupt or incomplete transport must fail for stdout too.');
 }
 writeFileSync(input,Buffer.alloc(0));const empty=join(root,'empty.zst');await transformPreparedArchive(input,empty,'compress');await transformPreparedArchive(empty,output,'decompress');assert.equal(readFileSync(output).length,0);
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
