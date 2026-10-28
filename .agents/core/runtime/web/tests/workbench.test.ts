import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDisplay, readPosition, paneLimits, clamp, filterTurns, roundTitle, highlightParts } from '../src/workbench-model.ts';
import { asyncAnswers, questions, structuredMessage, messageText } from '../src/structured-message.ts';
import { partitionMessages } from '../src/conversation-model.ts';
import type { Message, TurnSummary } from '../src/types.ts';
const m = (phase: string, value: unknown, role = phase === 'question' ? 'assistant' : 'user'): Message => ({ id: phase, role, phase, at: '2026-10-25T00:00:00Z', content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], revisions: [] });
test('known synchronous questions and correlated answers preserve originals, attachments and revisions', () => {
  const question = m('question', { questions: [{ id: 'surface', header: '范围', question: '在哪里使用？', options: [{ label: 'PC', description: '桌面浏览器' }] }] });
  const answer = m('answer', { surface: { answers: ['PC', '中文界面'] } });
  answer.content.push({ type: 'image', path: 'attachment.png' }); answer.revisions.push({ phase: 'answer', at: answer.at, content: [{ type: 'text', text: '旧选择' }] });
  const original = structuredClone([question, answer]);
  const known = new Map(questions(question)!.map(q => [q.id, q.question]));
  assert.equal(structuredMessage(question)?.[0].options?.[0].description, '桌面浏览器');
  assert.deepEqual(structuredMessage(answer, known), [{ question: '在哪里使用？', answer: 'PC\n中文界面' }]);
  assert.equal(structuredMessage(answer), null, 'uncorrelated IDs must not invent question text');
  assert.deepEqual([question, answer], original);
});
test('complete async question and answer wrapper render safely and occur once', () => {
  const question = m('question', { questions: [{ title: '需要导出吗？', options: ['需要', '不需要'] }] });
  assert.equal(structuredMessage(question)?.[0].question, '需要导出吗？');
  const value = '<send_user_message_question_reply>\n' + JSON.stringify([{ questionItemId: '["request_user_input_async","call",0]', question: '需要导出吗？', answer: '需要' }]) + '\n</send_user_message_question_reply>';
  const answer = m('input', value), original = structuredClone(answer);
  assert.deepEqual(asyncAnswers(answer), [{ question: '需要导出吗？', answer: '需要' }]);
  const split = partitionMessages([answer, answer]);
  assert.equal(split.request.length, 0); assert.deepEqual(split.process, [answer]);
  assert.equal(messageText(answer), value); assert.deepEqual(answer, original);
});
test('malformed, mixed, unknown and ordinary content never loses its raw representation', () => {
  for (const value of ['<send_user_message_question_reply>{bad}</send_user_message_question_reply>', '<send_user_message_question_reply>[]</send_user_message_question_reply>', '<send_user_message_question_reply>[{"question":"Q","answer":"A"}]</send_user_message_question_reply>', 'prefix <send_user_message_question_reply>[]</send_user_message_question_reply>', '{"questions":[{"question":"missing id"}]}', 'ordinary text', '{"future":true}']) {
    const item = m('input', value); assert.equal(structuredMessage(item), null); assert.equal(partitionMessages([item]).request[0], item); assert.equal(messageText(item), value);
  }
  assert.equal(structuredMessage(m('question', { questions: [{ id: 'x', question: 'Q', extra: 'future' }] })), null);
  assert.equal(structuredMessage(m('question', { questions: [{ title: 'Q', options: [3] }] })), null);
});
test('filter includes older summary pages and preserves order with literal highlights', () => {
  const turns = Array.from({ length: 65 }, (_, index) => ({ turnId: `t${index}`, turnNumber: 65 - index, preview: index === 64 ? '早期关键请求' : '普通请求', policy: 'capture' } as TurnSummary));
  assert.equal(filterTurns(turns, '关键')[0].turnId, 't64');
  assert.equal(filterTurns(turns, '  ').length, 65); assert.deepEqual(filterTurns(turns, '不存在'), []);
  assert.equal(roundTitle({ ...turns[0], route: { summary: '实际路由' } } as TurnSummary), '实际路由');
  assert.equal(roundTitle({ ...turns[0], policy: 'exclude' }), '本轮未记录');
  assert.deepEqual(highlightParts('a+b A+B', 'a+b').filter(p => p.match).map(p => p.text), ['a+b', 'A+B']);
});
test('storage corruption, denied storage, invalid locations and narrow pane limits fall back', () => {
  const storage = (value: string) => ({ getItem: () => value });
  assert.deepEqual(readDisplay({ getItem: () => { throw new Error('denied'); } }), { directory: 264, rounds: 264, focus: false });
  assert.deepEqual(readDisplay(storage('{broken')), { directory: 264, rounds: 264, focus: false });
  assert.deepEqual(readDisplay(storage('{"directory":9999,"rounds":1,"focus":true}')), { directory: 360, rounds: 220, focus: true });
  assert.equal(readPosition(storage('{"target":"x","task":"invalid","turn":"t","scroll":0}')), null);
  const position = { target: 'current:demo', task: 'a'.repeat(64), turn: 'native-turn', scroll: 160 };
  assert.deepEqual(readPosition(storage(JSON.stringify(position))), position);
  assert.equal(readPosition(storage(JSON.stringify({ ...position, scroll: -1 }))), null);
  const limits = paneLimits('rounds', 1280, 360); assert.equal(limits.max, 360);
  assert.equal(clamp(999, limits.min, limits.max), 360);
});

test('reused question IDs bind each answer to its own preceding question', async () => {
  const { questionContexts } = await import('../src/structured-message.ts');
  const q1 = { ...m('question', { questions: [{ id: 'same', question: '第一个问题' }] }), id: 'q1' };
  const a1 = { ...m('answer', { same: { answers: ['第一回答'] } }), id: 'a1' };
  const q2 = { ...m('question', { questions: [{ id: 'same', question: '第二个问题' }] }), id: 'q2' };
  const a2 = { ...m('answer', { same: { answers: ['第二回答'] } }), id: 'a2' };
  const contexts = questionContexts([q1, a1, q2, a2]);
  assert.equal(structuredMessage(a1, contexts.get('a1'))?.[0].question, '第一个问题');
  assert.equal(structuredMessage(a2, contexts.get('a2'))?.[0].question, '第二个问题');
});
