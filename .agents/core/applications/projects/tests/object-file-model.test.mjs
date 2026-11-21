import test from 'node:test';
import assert from 'node:assert/strict';
import {objectMetadata,objectMetadataEdit} from '../object-file-model.js';

test('all original metadata fields appear once, including null, custom fields and nested evidence',()=>{
 const metadata={governance_schema:2,kind:'task',id:'t',name:'原件',owner:null,status:'review',next_action:'手动填写',custom:{active:false},verification:{basis_digest:'a'.repeat(64),results:[]}},before=structuredClone(metadata);
 const sections=objectMetadata(metadata),all=[...sections.primary,...sections.other];assert.equal(all.length,Object.keys(metadata).length);assert.deepEqual(Object.fromEntries(all.map(x=>[x.key,x.value])),metadata);assert.deepEqual(metadata,before);assert.equal(sections.primary.find(x=>x.key==='owner').value,null);
});

test('manual metadata edits preserve every unrelated field and leave the original body outside the edit',()=>{
 const metadata={name:'旧名称',owner:'甲',id:'t',custom:{nested:['原始值']},verification:{basis_digest:'a'.repeat(64),results:[]}},original=structuredClone(metadata),body='## 原始正文\n\n完整的过程、验收和结果。\n';
 const first=objectMetadataEdit(metadata,{owner:'乙'});assert.equal(first.metadata.owner,'乙');assert.equal(first.metadata.custom,metadata.custom);assert.equal(first.verification,false);assert.deepEqual(metadata,original);
 const changed=objectMetadataEdit(metadata,{verification:{...metadata.verification,results:[{criterion_id:'c',result:'pending'}]}});assert.equal(changed.verification,true);assert.equal(body,'## 原始正文\n\n完整的过程、验收和结果。\n');
});
