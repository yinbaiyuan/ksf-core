import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionMessages, sectionTarget } from '../src/conversation-model.ts';
import type { Message } from '../src/types.ts';

const message = (id: string, role: string, phase: string): Message => ({ id, role, phase, at: '2026-10-24T10:00:00Z', content: [{ type: 'text', text: id }], revisions: [] });
test('a round exposes input, all finals and an ordered process without guessing from text', () => {
  const input = message('request', 'user', 'input');
  input.content.push({ type: 'image', path: '附件/原件.png' });
  input.revisions.push({ at: '2026-10-24T09:00:00Z', phase: 'input', content: [{ type: 'text', text: 'original' }] });
  const messages = [input, message('commentary', 'assistant', 'commentary'), message('question', 'assistant', 'question'), message('choice', 'user', 'answer'), message('final-1', 'assistant', 'final'), message('unknown', 'assistant', 'future-phase'), message('final-2', 'assistant', 'final_answer')];
  const original = structuredClone(messages);
  const split = partitionMessages([...messages, messages[2]]);
  assert.deepEqual(split.request.map(m => m.id), ['request']);
  assert.deepEqual(split.result.map(m => m.id), ['final-1', 'final-2']);
  assert.deepEqual(split.process.map(m => m.id), ['commentary', 'question', 'choice', 'unknown']);
  assert.equal(new Set([...split.request, ...split.result, ...split.process].map(m => m.id)).size, messages.length);
  assert.equal(split.request[0], input);
  assert.deepEqual(messages, original, 'presentation must not change originals, attachments or revisions');
});
test('completion does not manufacture a final answer and unknown phases remain visible', () => {
  const split = partitionMessages([message('new-input', 'user', 'unknown'), message('mentions-final-in-text', 'assistant', 'commentary'), message('other-role', 'other', 'final')]);
  assert.equal(split.result.length, 0);
  assert.deepEqual(split.request.map(m => m.id), ['new-input']);
  assert.deepEqual(split.process.map(m => m.id), ['mentions-final-in-text', 'other-role']);
  assert.deepEqual(partitionMessages([]), { request: [], result: [], process: [] });
});
test('section links and legacy tabs resolve to the same page sections', () => {
  assert.equal(sectionTarget(null, 'conversation'), 'request');
  assert.equal(sectionTarget(null, 'route'), 'route');
  assert.equal(sectionTarget(null, 'routes'), 'route');
  assert.equal(sectionTarget('result', 'route'), 'result');
  assert.equal(sectionTarget('request', null), 'request');
  assert.equal(sectionTarget('unknown', 'unknown'), null);
});
