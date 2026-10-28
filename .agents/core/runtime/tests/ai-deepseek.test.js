import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorkbenchAI } from '../src/services/ai-tasks.js';

const caller = { appId: 'example.deepseek' };
const schema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false };
const request = (extra = {}) => ({ contractVersion: 'ai-task-v1', idempotencyKey: 'one', profileId: 'deepseek-text', instruction: '整理虚构材料，未知内容保留为空。', inputs: [{ kind: 'text', text: '虚构会议内容' }], outputSpec: { format: 'json', schema }, ...extra });
const complete = { id: 'resp_synthetic', model: 'deepseek-flash-fixture', status: 'completed', usage: { input_tokens: 12, output_tokens: 8 }, output: [{ type: 'reasoning', summary: [{ text: 'private-reasoning-never-save' }] }, { type: 'message', content: [{ type: 'output_text', text: '{"summary":"虚构纪要"}' }] }] };
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(t, fetcher, { profile = {}, key = 'synthetic-never-persist' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ksf-deepseek-'));
  const service = createWorkbenchAI(root, { pollMs: 10, fetcher, env: { DEEPSEEK_API_KEY: key } });
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  await service.config('connections', { revision: 0, items: [{ id: 'deepseek', kind: 'api', protocolId: 'deepseek-responses-v1', enabled: true, baseURL: 'https://api.deepseek.com', credentialRef: 'env:DEEPSEEK_API_KEY', concurrency: 1 }] });
  await service.config('profiles', { revision: 0, items: [{ id: 'deepseek-text', executorId: 'deepseek', model: 'deepseek-flash', enabled: true, timeoutMs: 2000, maxAttempts: 3, retryDelayMs: 10, maxInputBytes: 100000, maxOutputBytes: 4096, ...profile }] });
  return { root, service };
}
async function settled(service, id, expected = 'succeeded') {
  const until = Date.now() + 4000;
  do {
    const task = await service.get(caller, id);
    if (task.status === expected) return task;
    if (['succeeded', 'failed', 'reconciling'].includes(task.status)) assert.fail(JSON.stringify(task));
    await delay(10);
  } while (Date.now() < until);
  assert.fail('DeepSeek fixture timed out');
}
test('DeepSeek assembly uses its documented stateless request and saves only validated final output', async t => {
  let submitted;
  const f = await fixture(t, async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/responses');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-never-persist');
    submitted = JSON.parse(options.body);
    return response(complete);
  });
  assert.equal((await f.service.checkConnection('deepseek')).scope, 'local-configuration');
  const task = await f.service.submit(caller, request());
  const done = await settled(f.service, task.aiTaskId);
  assert.deepEqual(done.output.value, { summary: '虚构纪要' });
  assert.equal(submitted.model, 'deepseek-flash');
  assert.equal(submitted.stream, false);
  assert.deepEqual(submitted.reasoning, { effort: 'none' });
  assert.deepEqual(submitted.tools, []);
  assert.equal(submitted.store, undefined);
  assert.equal(submitted.text.format.strict, undefined);
  assert.deepEqual(submitted.text.format.schema, schema);
  assert.equal(JSON.parse(submitted.input).dataOnly, true);
  assert.equal(done.usage.source, 'deepseek');
  assert.equal(done.execution.attempts[0].providerResponseId, 'resp_synthetic');
  const stored = await readFile(join(f.root, '.agents/user-data/ai/tasks', task.aiTaskId + '.json'), 'utf8');
  assert.ok(!stored.includes('private-reasoning-never-save'));
  assert.ok(!stored.includes('synthetic-never-persist'));
});
test('DeepSeek reasoning options map to its own supported effort values', async t => {
  const f = await fixture(t, async (_url, options) => { assert.equal(JSON.parse(options.body).reasoning.effort, 'high'); return response(complete); }, { profile: { reasoningEffort: 'medium' } });
  const task = await f.service.submit(caller, request());
  await settled(f.service, task.aiTaskId);
});
for (const [name, body, code] of [
  ['refusal', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'raw' }] }] }, 'AI_PROVIDER_REFUSED'],
  ['incomplete', { status: 'incomplete', output: [] }, 'AI_OUTPUT_INCOMPLETE'],
  ['unfulfilled tool', { status: 'completed', output: [{ type: 'function_call', name: 'unexpected' }] }, 'AI_TOOL_UNSUPPORTED'],
]) test('DeepSeek ' + name + ' does not become an empty success', async t => {
  const f = await fixture(t, async () => response(body));
  const task = await f.service.submit(caller, request());
  const done = await settled(f.service, task.aiTaskId, 'failed');
  assert.equal(done.error.code, code);
  assert.equal(done.output, null);
});
test('DeepSeek missing server credential fails before dispatch and reveals no secret', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return response(complete); }, { key: '' });
  await assert.rejects(f.service.checkConnection('deepseek'), { code: 'AI_AUTH_REQUIRED' });
  const task = await f.service.submit(caller, request());
  assert.equal((await settled(f.service, task.aiTaskId, 'failed')).error.code, 'AI_AUTH_REQUIRED');
  assert.equal(calls, 0);
});
test('DeepSeek lost POST response remains unknown without an automatic second charge', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; throw new Error('upstream credential=synthetic-never-persist'); });
  const task = await f.service.submit(caller, request());
  const done = await settled(f.service, task.aiTaskId, 'reconciling');
  assert.equal(done.error.code, 'AI_EXECUTION_UNKNOWN');
  assert.ok(!JSON.stringify(done).includes('synthetic-never-persist'));
  await delay(40);
  assert.equal(calls, 1);
});
test('DeepSeek text profile cannot claim audio transcription capability', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return response(complete); });
  await assert.rejects(f.service.submit(caller, request({ requirements: ['audio-transcription'] })), { code: 'AI_CAPABILITY_UNSUPPORTED' });
  assert.equal(calls, 0);
});
