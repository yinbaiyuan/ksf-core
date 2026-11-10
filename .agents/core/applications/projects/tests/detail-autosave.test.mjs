import test from 'node:test';
import assert from 'node:assert/strict';
import {adoptSavedDocument,documentValue} from '../governance-model.js';

test('editing a mounted criterion or verification result again after autosave still updates the current draft',()=>{
  const doc={path:'task.md',etag:'before',metadata:{kind:'task',owner:'A',updated:'before',criteria:[{id:'c1',text:'第一次条件'}],verification:{basis_digest:'basis',results:[{criterion_id:'c1',reviewer:'A'}]}},body:'正文'};
  const draft={base:structuredClone(doc),value:documentValue(doc),verificationChanged:true};
  const criterion=draft.value.metadata.criteria[0],result=draft.value.metadata.verification.results[0];
  const sent=structuredClone(draft.value),latest={...structuredClone(doc),etag:'saved',metadata:{...structuredClone(doc.metadata),updated:'saved'}};
  assert.equal(adoptSavedDocument(draft,sent,latest),true);
  criterion.text='第二次条件';result.reviewer='B';
  assert.equal(draft.value.metadata.criteria[0].text,'第二次条件');
  assert.equal(draft.value.metadata.verification.results[0].reviewer,'B');
  assert.equal(draft.base.metadata.criteria[0].text,'第一次条件');
  assert.notDeepEqual(draft.value,documentValue(draft.base));
});

test('a save reply advances the baseline without overwriting edits made while the request was running',()=>{
  const doc={path:'milestone.md',etag:'old',metadata:{kind:'milestone',owner:'A',updated:'old'},body:'原文'};
  const draft={base:structuredClone(doc),value:documentValue(doc)};
  const sent=structuredClone(draft.value);
  draft.value.metadata.owner='保存期间继续输入';draft.value.body='保存期间的新正文';
  const latest={...structuredClone(doc),etag:'new',metadata:{...doc.metadata,updated:'new'}};
  assert.equal(adoptSavedDocument(draft,sent,latest),false);
  assert.equal(draft.value.metadata.owner,'保存期间继续输入');
  assert.equal(draft.value.body,'保存期间的新正文');
  assert.equal(draft.base.etag,'new');assert.equal(draft.value.metadata.updated,'new');
  assert.equal(sent.metadata.owner,'A');assert.equal(sent.body,'原文');
  latest.metadata.owner='外部对象变化';assert.equal(draft.base.metadata.owner,'A');
});
