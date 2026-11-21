import test from 'node:test';
import assert from 'node:assert/strict';
import {detailReading,scopeOverview,externalRecordChanged,createExternalRecordProbe} from '../detail-reading-model.js';
const project={path:'项目/样例/project.md',metadata:{id:'p'}};
const doc={path:'项目/样例/M1/B18/task.md',metadata:{id:'t',kind:'task',status:'review',criteria:[{id:'ui',text:'用户评价'},{id:'flow',text:'保存可靠'}],verification:{results:[{criterion_id:'ui',result:'pending',evidence:[]},{criterion_id:'flow',result:'passed',evidence:[{path:'proof',digest:'f'.repeat(64)}]},{criterion_id:'old',result:'passed'}]}},body:'## 目标\n\n完成详情。\n\n## 当前结果\n\n已交付代码，待体验。\n\n## 未决与缺口\n\n用户视觉待核对。'};
test('B18 reading keeps review gaps separate from recorded passes and preserves orphan history',()=>{const record={project,documents:[doc],stale:[]},before=JSON.stringify(record),r=detailReading(doc,record);assert.equal(r.hasSummary,true);assert.equal(r.passed,1);assert.equal(r.conditions.length,2);assert.equal(r.unresolved[0].id,'ui');assert.equal(r.unmatched.length,1);assert.equal(r.ended,false);assert.equal(JSON.stringify(record),before);});
test('legacy prose is available without inventing three summaries or changing source',()=>{const old={...doc,body:'# 历史任务\n\n已经保全目录，旧文件字节未变。'};const r=detailReading(old,{project,documents:[old]});assert.equal(r.hasSummary,false);assert.match(r.original,/已经保全目录/);assert.equal(r.sections['当前结果'],'');});
test('literal milestone goal headings are readable without interpreting fenced headings or rewriting text',()=>{const body='# 阶段\n\n## 目标与范围\n\n原阶段目标。\n\n## 当前结果\n\n```md\n## 阶段目标\n示例代码\n```\n当前结果。',m={...doc,metadata:{...doc.metadata,kind:'milestone'},body};const r=detailReading(m,{documents:[]});assert.equal(r.sections['目标'],'原阶段目标。');assert.match(r.sections['当前结果'],/## 阶段目标/);assert.equal(m.body,body);assert.equal(r.original,'');});
test('milestone review requires matching stable identity and both subject paths',()=>{const m={path:'项目/样例/M1/milestone.md',metadata:{id:'m',kind:'milestone',status:'active',criteria:[{id:'m1',text:'本阶段成果'}],review_ref:{id:'r',path:'项目/样例/M1/复盘.md'}},body:''};const review={path:m.metadata.review_ref.path,metadata:{id:'r',kind:'review',subject:{id:'other',path:m.path},criterion_results:[{criterion_id:'m1',result:'passed',evidence:[{}]}]}};assert.equal(detailReading(m,{documents:[review]}).passed,0);review.metadata.subject.id='m';assert.equal(detailReading(m,{documents:[review],stale:['r']}).stale,true);assert.equal(detailReading(m,{documents:[review]}).passed,1);});
test('external update detection ignores a late response after local saving or selection changes',()=>{const base={etag:'a',project},latest={etag:'b',project};assert.equal(externalRecordChanged(base,latest,base),true);assert.equal(externalRecordChanged(base,latest,{etag:'c',project}),false);assert.equal(externalRecordChanged(base,{etag:'b',project:{metadata:{id:'other'}}},base),false);});
test('external probe is read-only, avoids overlap, and discards disposed or late results',async()=>{let resolve,calls=0,current={etag:'a',project};const states=[],probe=createExternalRecordProbe({read:()=>{calls++;return new Promise(r=>resolve=r);},getCurrent:()=>current,onState:s=>states.push(s)});const first=probe.probe();await probe.probe();assert.equal(calls,1);current={etag:'saved',project};resolve({etag:'b',project});await first;assert.equal(states.length,0);const second=probe.probe();probe.dispose();resolve({etag:'external',project});await second;assert.equal(states.length,0);});


test('project and milestone overviews prefer exact recorded prose and never persist a summary',()=>{
 for(const kind of ['project','milestone']){
 const d={...doc,metadata:{...doc.metadata,kind,next_action:'核对使用反馈。'},body:doc.body};
 const record={project:d,documents:[],stale:[]},before=structuredClone(record),r=scopeOverview(d,record);
 assert.equal(r.result,'已交付代码，待体验。');assert.equal(r.gaps,'用户视觉待核对。');assert.equal(r.next,'核对使用反馈。');assert.deepEqual(record,before);
 }
});

test('missing scope summaries expose recorded references or completed children without inferring acceptance',()=>{
 const d={path:'项目/样例/project.md',metadata:{kind:'project',id:'p',status:'active',criteria:[{id:'a',text:'用户验收'}]},body:'# 项目旧说明\n\n保留测试与安装记录。'},children=[{metadata:{name:'基础阶段',status:'completed'}},{metadata:{name:'待验阶段',status:'review'}}];
 const r=scopeOverview(d,{documents:[]},children);assert.match(r.result,/基础阶段/);assert.doesNotMatch(r.result,/待验阶段/);assert.match(r.gaps,/尚缺完整验收记录/);assert.equal(r.openCount,1);assert.equal(r.reading.original,d.body);
 const ref={...d,metadata:{...d.metadata,result_refs:[{path:'代码入口'}]}};assert.equal(scopeOverview(ref,{documents:[]},children).result,'已有 1 个本层结果入口。');
 assert.equal(scopeOverview(d,{documents:[],stale:['p']},children).gaps,'验收依据已变化，需要复核原条件与证据。');
});
