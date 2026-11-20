import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptsFile,validateFiles} from '../src/uploads/file-model.ts';
const file=(name,type,size)=>({name,type,size});
test('file acceptance uses case-insensitive suffixes, MIME wildcards and exact MIME rather than trusting picker filters',()=>{
 assert.equal(acceptsFile(file('PLAN.MD','',20),'.txt, .md'),true);
 assert.equal(acceptsFile(file('picture','image/jpeg',20),'image/*'),true);
 assert.equal(acceptsFile(file('report.pdf','application/pdf',20),'application/pdf'),true);
 assert.equal(acceptsFile(file('file.txt.exe','application/octet-stream',20),'.txt'),false);
 assert.equal(acceptsFile(file('no-type.png','',20),'image/*'),false);
});
test('drop and pick share size/count rejection, rejected files do not consume remaining slots',()=>{
 const input=[file('wrong.exe','',10),file('large.md','text/markdown',1025),file('a.md','text/markdown',1024),file('b.md','text/markdown',20)];
 const r=validateFiles(input,{accept:'.md',maxSize:1024,maxFiles:2},1);
 assert.deepEqual(r.accepted.map(f=>f.name),['a.md']);assert.deepEqual(r.rejected.map(f=>f.reason),['type','size','count']);
 assert.equal(validateFiles(input,{maxFiles:0}).accepted.length,0);
});
