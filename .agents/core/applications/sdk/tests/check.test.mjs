import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkApplication} from '../server/check.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'ksf-check 中文 '));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'tests'));await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[],id:'com.example.check',name:'Check',description:'Synthetic',version:'1.0.0',backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'},permissions:[]}));
 await writeFile(join(root,'backend.mjs'),'export function activate(){}');
 return root;
}
test('source checks allow isolated host test fixtures and still reject private production imports',async t=>{
 const root=await fixture(t);await writeFile(join(root,'tests/fixture.mjs'),"import {host} from '../../../runtime/src/private.js';");
 assert.equal((await checkApplication(root)).ok,true);
 await writeFile(join(root,'backend.mjs'),"import {host} from '../../../runtime/src/private.js';");
 assert.ok((await checkApplication(root)).diagnostics.some(d=>d.code==='APP_PRIVATE_IMPORT'));
 await writeFile(join(root,'backend.mjs'),"const host=require('../../../runtime/src/private.js');");
 assert.ok((await checkApplication(root)).diagnostics.some(d=>d.code==='APP_PRIVATE_IMPORT'));
});
test('production entry closure rejects both direct and indirect imports through test directories',async t=>{
 const root=await fixture(t);await writeFile(join(root,'backend.mjs'),"import './tests/helper.mjs';");
 assert.ok((await checkApplication(root)).diagnostics.some(d=>d.code==='APP_TEST_IMPORT'));
 await writeFile(join(root,'backend.mjs'),"import '../tests/private-host.mjs';");
 assert.ok((await checkApplication(root)).diagnostics.some(d=>d.code==='APP_TEST_IMPORT'));
 await writeFile(join(root,'backend.mjs'),"import './helper.mjs';");await writeFile(join(root,'helper.mjs'),"export {x} from './tests/helper.mjs';");
 assert.ok((await checkApplication(root)).diagnostics.some(d=>d.code==='APP_TEST_IMPORT'));
});
test('manifest and missing entry checks do not require a frontend toolchain',async t=>{
 const root=await fixture(t);await rm(join(root,'backend.mjs'));
 assert.ok((await checkApplication(root)).diagnostics.some(d=>d.code==='APP_SOURCE_MISSING'));
 await writeFile(join(root,'manifest.json'),'{}');assert.equal((await checkApplication(root)).ok,false);
});

import {fieldValues,inputFields} from '../server/workflow-contract.mjs';
test('forms reject executable or undeclared fields and preserve false/zero',()=>{const fields=inputFields([{key:'flag',label:'确认',type:'boolean',required:true},{key:'count',label:'数量',type:'number',required:true}]);assert.deepEqual(fieldValues(fields,{flag:false,count:0}),{flag:false,count:0});assert.throws(()=>fieldValues(fields,{flag:true,count:1,callbackURL:'http://bad'}));assert.throws(()=>inputFields([{key:'__proto__',label:'bad',type:'text'}]));});
