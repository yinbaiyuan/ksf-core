import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {defaultMetadata} from '../src/projects/governance/model.js';
import {objectMetadata,objectMetadataEdit} from '../../applications/projects/object-file-model.js';

const properties=metadata=>Object.fromEntries(Object.values(objectMetadata(metadata)).flat().map(({key,value})=>[key,value]));

test('current service metadata survives property display and explicit edits at all three object levels',()=>{
 for(const kind of ['project','task','milestone']){
  const metadata=defaultMetadata(kind,kind+'-original','现有'+kind);
  Object.assign(metadata,{status:'active',owner:'原负责人',next_action:'核对原件'});
  const document={path:'项目/样例/'+kind+'.md',etag:'original-version',metadata,body:'## 原样正文\n'},before=structuredClone(document);
  assert.deepEqual(properties(metadata),metadata);
  const edited=objectMetadataEdit(metadata,{owner:'新负责人'});
  assert.equal(edited.metadata.owner,'新负责人');
  for(const key of Object.keys(metadata).filter(key=>key!=='owner'))assert.deepEqual(edited.metadata[key],metadata[key]);
  assert.deepEqual(document,before);
 }
});

test('blockers, dependencies, readiness spellings and main state remain separate literal properties',()=>{
 for(const status of ['planned','active','paused','review','completed','cancelled','in_progress','blocked','ready','backlog','archived']){
  const metadata={kind:'task',id:'original',name:'任务',status,blocker:'缺少原材料',resume_condition:'材料可读',depends_on:[{id:'dep',path:'项目/样例/依赖/task.md'}]};
  const view=properties(metadata);
  assert.deepEqual(view,metadata);assert.equal(view.status,status);assert.equal(view.blocker,'缺少原材料');
  assert.equal(view.resume_condition,'材料可读');assert.deepEqual(view.depends_on,metadata.depends_on);assert.equal(Object.hasOwn(view,'ready'),false);
 }
});

test('unknown, missing and null states retain their actual values without inferred labels',()=>{
 for(const status of ['future-state','constructor','__proto__',null]){
  const metadata={name:'旧项目',status};assert.deepEqual(properties(metadata),metadata);assert.equal(properties(metadata).status,status);
 }
 const missing=properties({name:'旧项目'});
 assert.equal(Object.hasOwn(missing,'status'),false);assert.equal(Object.hasOwn(missing,'id'),false);assert.equal(Object.hasOwn(missing,'owner'),false);
});

test('task completion, evidence and milestone confirmation are not inferred from one another',()=>{
 const metadata={kind:'milestone',id:'m',name:'阶段',status:'completed',tasks:[{id:'t',path:'t.md'}],verification:{results:[{result:'passed'}]},review_ref:{id:'r',path:'复盘.md'}};
 const view=properties(metadata),edited=objectMetadataEdit(metadata,{owner:'复核人'});
 assert.deepEqual(view,metadata);assert.deepEqual(edited.metadata.verification,metadata.verification);assert.deepEqual(edited.metadata.review_ref,metadata.review_ref);
 for(const key of ['progress','percentage','confirmation','completedTasks'])assert.equal(Object.hasOwn(view,key),false);
 assert.equal(edited.verification,false);
});

test('goals, criteria, references and malformed optional entries remain visible without silent data loss',()=>{
 const metadata={kind:'project',name:'项目',goals:[{id:'g',title:'原目标'},null],goal_ids:['g',null],criteria:[{id:'c',text:'原条件'},null,{}],depends_on:[null,{id:'up',path:'up.md'},{}],custom:{enabled:false}};
 const before=structuredClone(metadata),sections=objectMetadata(metadata);
 assert.deepEqual(properties(metadata),before);assert.equal(Object.values(sections).flat().length,Object.keys(metadata).length);
 assert.deepEqual(objectMetadataEdit(metadata,{name:'手动改名'}).metadata,{...before,name:'手动改名'});assert.deepEqual(metadata,before);
});

test('editing one object preserves its file identity, original body and separate parent records',()=>{
 const parent={status:'completed',verification:{result:'passed'}},document={path:'项目/样例/task.md',etag:'v1',metadata:{kind:'task',id:'t',name:'原任务',status:'completed'},body:'## 原始正文\n\n过程材料保持原文。\n'};
 const before=structuredClone({parent,document}),edited=objectMetadataEdit(document.metadata,{name:'反馈补充'});
 assert.deepEqual({parent,document},before);assert.equal(edited.metadata.id,'t');assert.equal(edited.metadata.status,'completed');
 assert.equal(Object.hasOwn(edited,'actionId'),false);assert.equal(Object.hasOwn(edited,'target'),false);assert.equal(Object.hasOwn(edited,'task'),false);
});

test('project property views cannot retain the removed private UI implementation',()=>{
 assert.equal(existsSync(new URL('../../applications/projects/private-ui',import.meta.url)),false);
});
