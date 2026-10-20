import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFrontmatter } from '../src/metadata/frontmatter.js';
import { selectObjectState, planObjectChange } from '../src/objects/plan.js';
import { planProjectWrite } from '../src/projects/plan.js';

test('object creation plans work from supplied state without a filesystem and preview the same bytes', () => {
  const state = selectObjectState({ rows: [], errors: [], scopes: [] }, {
    root: '/not-a-real-ksf-root', type: 'partner', operation: 'write', id: 'partner.test.planned',
  });
  const input = { metadata: { name: '计划对象', description: '测试', version: '0.1.0', status: 'active' }, body: '# 正文\n' };
  const before = structuredClone(input);
  const preview = planObjectChange(state, { input, dryRun: true });
  const actual = planObjectChange(state, { input });
  assert.deepEqual(preview.encoded.bytes, actual.encoded.bytes);
  assert.equal(preview.result.changed, false);
  assert.equal(actual.result.changed, false);
  assert.equal(actual.result.user_revision, 1);
  assert.deepEqual(input, before);
  assert.deepEqual(state.c.rows, []);
});

test('project plans preserve source AST, comments, omitted metadata and body across repeated previews', () => {
  const bytes = Buffer.from('---\n# keep comment\nstatus: active\nrepositories: [existing]\n---\n# Keep body\n');
  const current = { target: '/not-a-real-ksf-root/项目/甲/project.md', snapshot: { bytes }, parsed: parseFrontmatter(bytes, 'project.md') };
  const originalAST = current.parsed.doc.toString();
  const request = { root: '/not-a-real-ksf-root', name: '甲', data: { metadata: { status: 'archived' } } };
  const preview = planProjectWrite(current, { ...request, dryRun: true });
  const actual = planProjectWrite(current, request);
  assert.deepEqual(preview.bytes, actual.bytes);
  assert.equal(current.parsed.doc.toString(), originalAST);
  assert.deepEqual(current.parsed.values.repositories, ['existing']);
  assert.equal(current.parsed.values.status, 'active');
  assert.match(actual.bytes.toString(), /# keep comment/);
  assert.deepEqual(actual.result.project.metadata.repositories, ['existing']);
  assert.equal(actual.result.project.body, '# Keep body\n');
  assert.equal(actual.result.changed, false);
});
