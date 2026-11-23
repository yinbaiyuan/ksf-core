import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transformPreparedArchive} from '../src/testing/prepared-archive.js';
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
