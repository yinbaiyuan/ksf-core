import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname,join} from 'node:path';
import {readFileSync,writeFileSync,cpSync} from 'node:fs';
import {fixture} from './helpers/governance-fixture.js';
import {taskCaptureFixture} from './helpers/task-capture-fixture.js';
import {projectGovernance} from '../src/services/project-governance.js';
import {defaultMetadata,criteriaDigest,encodeDocument} from '../src/projects/governance/model.js';
const caller={source:'surface',humanWindow:true,appId:'com.ksf.projects',instanceId:'fixture'};
function ready(t){
 const f=fixture(t);f.initialize();const ev=dirname(f.tp)+'/10-结果.txt',rp=dirname(f.mp)+'/复盘.md',text='已实际核验';
 const review={...defaultMetadata('review','r1','复盘'),subject:{id:'m1',path:f.mp},basis_digest:criteriaDigest(f.m),criterion_results:f.proof(f.m,ev,text).results};
 assert.deepEqual(f.apply([{path:ev,ifMatch:'missing',body:text},f.change(f.tp,{status:'completed',next_action:null,verification:f.proof(f.task,ev,text)}),f.change(rp,review,'# 预检\n等待用户明确阶段确认。'),f.change(f.mp,{status:'review',review_ref:{id:'r1',path:rp}})]).errors,[]);
 const request=()=>{const state=f.read();return {operationId:'explicit-user-confirm',ifMatch:state.etag,changes:[f.change(f.mp,{status:'completed',next_action:null}),f.change(rp,{status:'completed',outcome:'passed',next_action:null})],confirmMilestone:{subject:{id:'m1',path:f.mp},scope_digest:state.confirmationScopes.m1,source:{kind:'workbench'}}};};
 return {...f,ev,rp,request};
}
test('all public completion paths reject a missing or forged confirmation; preview never persists',t=>{
 const f=ready(t),req=f.request();delete req.confirmMilestone;
 assert.equal(f.call('apply',req).errors[0].code,'PROJECT_CONFIRMATION_REQUIRED');
 const valid=f.request();assert.equal(f.call('check',valid).errors[0].code,'PROJECT_CONFIRMATION_SOURCE');
 const before=readFileSync(join(f.root,f.rp));assert.deepEqual(f.call('apply',valid,true,{caller}).errors,[]);assert.deepEqual(readFileSync(join(f.root,f.rp)),before);
 const fake=f.request();fake.changes[1].metadata.user_confirmation={source:{kind:'workbench'}};assert.equal(f.call('apply',fake,false,{caller}).errors[0].code,'PROJECT_CONFIRMATION_OWNED');
});
test('verified window confirmation commits once, rejects changed scope and cannot be erased or reused after reopen',t=>{
 const f=ready(t),old=f.request();f.apply([f.change(f.rp,{criterion_results:f.read().documents.find(d=>d.path===f.rp).metadata.criterion_results.map(r=>({...r,reviewer:'另一复核者'}))})]);
 old.ifMatch=f.read().etag;old.changes=[f.change(f.mp,{status:'completed',next_action:null}),f.change(f.rp,{status:'completed',outcome:'passed'})];assert.equal(f.call('apply',old,false,{caller}).errors[0].code,'PROJECT_CONFIRMATION_CHANGED');
 const req=f.request(),saved=f.call('apply',req,false,{caller});assert.deepEqual(saved.errors,[]);const review=saved.data.documents.find(d=>d.path===f.rp);assert.equal(review.metadata.user_confirmation.source.kind,'workbench');assert(review.body.includes('用户阶段确认'));assert(f.call('apply',req,false,{caller}).data.replayed);
 assert.equal(f.apply([f.change(f.rp,{user_confirmation:null})]).errors[0].code,'PROJECT_CONFIRMATION_OWNED');
 assert.deepEqual(f.apply([f.change(f.mp,{status:'active',status_reason:'用户明确返工',next_action:'重新核验'})]).errors,[]);
 assert.equal(f.apply([f.change(f.mp,{status:'completed',next_action:null})]).errors[0].code,'PROJECT_CONFIRMATION_REQUIRED');
});
test('legacy completed records remain readable without manufacturing a user confirmation',t=>{
 const f=ready(t);for(const [path,metadata]of [[f.mp,{status:'completed',next_action:null}],[f.rp,{status:'completed',outcome:'passed'}]])writeFileSync(join(f.root,path),encodeDocument(readFileSync(join(f.root,path)),{path,metadata}));
 assert(f.read().valid);assert(!f.read().documents.find(d=>d.path===f.rp).metadata.user_confirmation);assert.deepEqual(f.apply([f.change(f.pp,{next_action:'核对项目整体目标'})]).errors,[]);
});
test('native source accepts an actual user message and rejects assistant, missing or excluded messages',async t=>{
 const f=ready(t),cap=taskCaptureFixture(t);cap.start('confirm-turn');cap.message('user-confirm','user','确认M1交付阶段通过');cap.message('agent-summary','assistant','用户已经确认');cap.finish('confirm-turn');cap.start('excluded-turn','2026-01-03T00:00:00Z');cap.message('excluded-user','user','确认M1通过');cap.finish('excluded-turn');cap.declare('excluded-turn','exclude-confirm','exclude',{inputScope:await cap.scope('excluded-turn')});await cap.sync();cpSync(join(f.root,'项目/示例'),join(cap.root,'项目/示例'),{recursive:true});
 const call=data=>projectGovernance({root:cap.root,name:'示例',operation:'apply',data});const read=()=>projectGovernance({root:cap.root,name:'示例'}).data;
 const request=()=>{const d=read(),req=f.request();req.ifMatch=d.etag;req.changes=req.changes.map(c=>({...c,ifMatch:d.documents.find(x=>x.path===c.path).etag}));req.confirmMilestone.scope_digest=d.confirmationScopes.m1;req.confirmMilestone.source={kind:'chat',chat_id:cap.taskId,turn_id:'confirm-turn',message_id:'agent-summary'};return req;};
 let req=request();assert.equal(call(req).errors[0].code,'PROJECT_CONFIRMATION_SOURCE');req=request();req.confirmMilestone.source.turn_id='excluded-turn';req.confirmMilestone.source.message_id='excluded-user';assert.equal(call(req).errors[0].code,'PROJECT_CONFIRMATION_SOURCE');req=request();req.confirmMilestone.source.message_id='missing';assert.equal(call(req).errors[0].code,'PROJECT_CONFIRMATION_SOURCE');
 req=request();req.confirmMilestone.source.message_id='user-confirm';const saved=call(req);assert.deepEqual(saved.errors,[]);const review=saved.data.documents.find(d=>d.path===f.rp);assert(review.body.includes('确认M1交付阶段通过'));assert.equal(review.metadata.user_confirmation.source.turn_id,'confirm-turn');
});
