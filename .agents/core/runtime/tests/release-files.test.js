import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,mkdirSync,symlinkSync,chmodSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {writeReleaseFiles} from '../src/distribution/release-files.js';
import {systemFingerprint} from '../src/distribution/system.js';
import {digestObject,sha256} from '../src/shared/hash.js';
import {fileMode,readRegularRecord} from '../src/distribution/files.js';
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

test('disposable release staging preserves bytes and modes before durable publication',async t=>{
 const path=root(t),entries=[{path:'目录/source.js',bytes:Buffer.from('staged source\n'),mode:0o755}];
 await writeReleaseFiles(path,entries,{durable:false});
 assert.deepEqual(readFileSync(join(path,entries[0].path)),entries[0].bytes);
 assert.equal(fileMode(join(path,entries[0].path),0o755),0o755);
 assert.equal(files(path).length,1);
});

test('paired source reads preserve bytes and mode, refresh each read and reject directories and escaping parents',t=>{
 const path=root(t),file=join(path,'source.js');writeFileSync(file,'original',{mode:0o755});
 const first=readRegularRecord(path,'source.js',{declared:0o755});assert.equal(first.bytes.toString(),'original');assert.equal(first.mode,fileMode(file,0o755));
 writeFileSync(file,'new value');assert.equal(first.bytes.toString(),'original');assert.equal(readRegularRecord(path,'source.js').bytes.toString(),'new value');
 assert.equal(readRegularRecord(path,'missing',{optional:true}),null);assert.throws(()=>readRegularRecord(path,'missing'),{code:'FILE_MISSING'});
 mkdirSync(join(path,'directory'));assert.throws(()=>readRegularRecord(path,'directory'),{code:'UNSAFE_PATH'});
 const outside=root(t);writeFileSync(join(outside,'private'),'outside');symlinkSync(outside,join(path,'escape'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>readRegularRecord(path,'escape/private'),{code:'UNSAFE_PATH'});
});

test('streamed system fingerprints preserve the existing path, byte and mode digest contract',t=>{
 const path=root(t),files={'.agents/core/资料/文件.txt':'source text','.agents/core/build.json':'synthetic build','AGENTS.md':'entry','.agents/ksf':'launcher','.agents/ksf.ps1':'launcher ps'};
 for(const [relative,value] of Object.entries(files)){const absolute=join(path,relative);mkdirSync(dirname(absolute),{recursive:true});writeFileSync(absolute,value,{mode:relative==='.agents/ksf'?0o755:0o644});chmodSync(absolute,relative==='.agents/ksf'?0o755:0o644);}
 mkdirSync(join(path,'.agents/core/applications/example/node_modules'),{recursive:true});writeFileSync(join(path,'.agents/core/applications/example/node_modules/ignored'),'development-only');
 const expected=digestObject(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([relative,value])=>[relative,sha256(Buffer.from(value)),relative==='.agents/ksf'?0o755:0o644]));
 assert.equal(systemFingerprint(path),expected);
});
