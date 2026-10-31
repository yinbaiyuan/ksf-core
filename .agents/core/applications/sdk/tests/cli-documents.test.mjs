import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePackage,decodePackage,checksum} from '../server/protocol.js';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkApplication} from '../scripts/ksf-app.mjs';
import {validateBuiltPackage} from '../server/pack.mjs';
const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[],id:'com.example.docs',name:'CLI',description:'fixture',version:'1.0.0',permissions:[],backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'},cli:{contractVersion:1,entry:'cli/index.mjs',documentation:'docs/cli.md',commands:[{id:'read'}]}};
const file=value=>{const bytes=Buffer.from(value);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
const files={'backend/index.mjs':file('export function activate(){return{}}'),'cli/index.mjs':file('export function createCLI(){return{execute(){}}}'),'docs/cli.md':file('# CLI')};
test('SDK pack and shared host decode reject missing, blank, invalid UTF-8 and oversized main docs',async()=>{
 for(const [value,code] of [[undefined,'APP_PACKAGE_INVALID'],[' \n\ufeff','APP_CLI_DOCUMENT_INVALID'],[Buffer.from([0xff,0xc0]),'APP_CLI_DOCUMENT_INVALID'],['a'.repeat(256*1024+1),'APP_CLI_DOCUMENT_TOO_LARGE']]){
  const content={...files};if(value===undefined)delete content['docs/cli.md'];else content['docs/cli.md']=file(value);
  const bytes=encodePackage(manifest,content);assert.throws(()=>decodePackage(bytes),{code});await assert.rejects(validateBuiltPackage(bytes),{code});
 }
 const valid=encodePackage(manifest,{...files,'docs/cli.md':file('a'.repeat(256*1024))});assert.equal(decodePackage(valid).manifest.schemaVersion,1);await validateBuiltPackage(valid);
});

test('SDK source check reports the same main document contract before build',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-doc-check-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'manifest.json'),JSON.stringify(manifest));await mkdir(join(root,'docs'));await mkdir(join(root,'cli'));
 await writeFile(join(root,'backend.mjs'),'export function activate(){return{}}');await writeFile(join(root,'cli/index.mjs'),'export function createCLI(){return{}}');
 await writeFile(join(root,'docs/cli.md'),Buffer.from([0xff]));const result=await checkApplication(root);assert.equal(result.ok,false);assert(result.diagnostics.some(item=>item.code==='APP_CLI_DOCUMENT_INVALID'));
});
