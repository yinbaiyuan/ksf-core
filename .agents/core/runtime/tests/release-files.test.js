import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writeReleaseFiles} from '../src/distribution/release-files.js';
import {fileMode} from '../src/distribution/files.js';
function root(t){const path=mkdtempSync(join(tmpdir(),'ksf-release-files-'));t.after(()=>rmSync(path,{recursive:true,force:true}));return path;}
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):join(path,entry.name));}

test('release file publication preserves every byte, declared mode and nested Unicode path without temporary files',async t=>{
 const path=root(t),entries=Array.from({length:40},(_,i)=>({path:'目录/'+i+'/entry.js',bytes:Buffer.from('export default '+i+';\n'),mode:i%2?0o644:0o755}));
 await writeReleaseFiles(path,entries);
 assert.equal(files(path).length,entries.length);
 for(const entry of entries){assert.deepEqual(readFileSync(join(path,entry.path)),entry.bytes);assert.equal(fileMode(join(path,entry.path),entry.mode),entry.mode);}
});

test('release write failure drains pending writers before cleanup and preserves obstructing files',async t=>{
 const path=root(t);writeFileSync(join(path,'obstruction'),'original');
 const entries=[{path:'started/first',bytes:Buffer.alloc(1024*1024,1),mode:0o644},{path:'obstruction/child',bytes:Buffer.from('rejected'),mode:0o644},...Array.from({length:20},(_,i)=>({path:'started/'+i,bytes:Buffer.alloc(1024,2),mode:0o644}))];
 await assert.rejects(writeReleaseFiles(path,entries));
 assert.equal(readFileSync(join(path,'obstruction'),'utf8'),'original');
 assert.ok(files(path).every(file=>!file.endsWith('.tmp')));
 // On Windows this also requires all writer handles to have been closed.
 rmSync(path,{recursive:true,force:true});
});
