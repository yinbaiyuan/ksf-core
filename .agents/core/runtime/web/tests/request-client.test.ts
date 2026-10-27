import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIError, createWorkbenchClient } from '../src/apps/request-client.ts';

const session = (token: string, instanceId = 'instance-a') => ({ instanceId, token, nonce: token, sessionId: token });
const reply = (data: unknown, status = 200, code?: string) => new Response(JSON.stringify(code ? { ok: false, error: { code, message: code }, data } : { ok: true, data }), { status });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test('stale token refreshes once and replays the exact original payload and version', async () => {
  let sessions = 0;
  const writes: RequestInit[] = [], input = { path: '说明.md', text: '未保存内容\r\n', version: 'original-version' };
  const client = createWorkbenchClient(async (url, options) => {
    if (url === '/api/workbench/session') return reply(session(++sessions === 1 ? 'old' : 'new'));
    writes.push(options!);
    if (writes.length === 1) { input.text = 'changed during request'; return reply(null, 403, 'WEB_SESSION_EXPIRED'); }
    return reply({ saved: true });
  });
  assert.deepEqual(await client.request('/api/workspace/save', input), { saved: true });
  assert.equal(sessions, 2); assert.equal(writes.length, 2);
  assert.equal(writes[0].body, writes[1].body);
  assert.match(String(writes[1].body), /original-version/);
  assert.equal((writes[1].headers as Record<string, string>)['X-KSF-Token'], 'new');
  assert.equal((await client.getSession()).token, 'new');
  assert.equal((await client.getSession()).nonce, 'old', 'new editors must keep the current page CSP nonce');
  assert.equal((await client.getSession()).sessionId, 'new');
});

test('concurrent and late stale rejections share one refresh', async () => {
  let sessions = 0, oldWrites = 0, newWrites = 0;
  const late = deferred<Response>();
  const client = createWorkbenchClient(async (url, options) => {
    if (url === '/api/workbench/session') return reply(session(++sessions === 1 ? 'old' : 'new'));
    if ((options!.headers as Record<string, string>)['X-KSF-Token'] === 'old') {
      oldWrites++;
      if (url === '/late') return late.promise;
      return reply(null, 403, 'WEB_WRITE_FORBIDDEN');
    }
    newWrites++; return reply('saved');
  });
  await client.getSession();
  const pending = client.request('/late', {});
  assert.deepEqual(await Promise.all([client.request('/first', {}), client.request('/second', {})]), ['saved', 'saved']);
  late.resolve(reply(null, 403, 'WEB_WRITE_FORBIDDEN'));
  assert.equal(await pending, 'saved');
  assert.equal(sessions, 2); assert.equal(oldWrites, 3); assert.equal(newWrites, 3);
});

test('persistent auth rejection stops after one retry', async () => {
  let sessions = 0, writes = 0;
  const client = createWorkbenchClient(async url => url === '/api/workbench/session' ? reply(session(String(++sessions))) : (++writes, reply(null, 403, 'WEB_SESSION_EXPIRED')));
  await assert.rejects(client.request('/save', {}), (e: APIError) => e.code === 'WEB_SESSION_EXPIRED');
  assert.equal(sessions, 2); assert.equal(writes, 2);
});

test('unchanged token and unrelated failures never replay writes', async () => {
  for (const failure of ['WEB_WRITE_FORBIDDEN', 'WORKSPACE_READONLY', 'WEB_ORIGIN_NOT_ALLOWED', 'NETWORK', 'WORKSPACE_CONFLICT']) {
    let sessions = 0, writes = 0;
    const disk = { text: 'external edit', version: 'external-version' };
    const client = createWorkbenchClient(async url => {
      if (url === '/api/workbench/session') { sessions++; return reply(session('same')); }
      writes++;
      if (failure === 'NETWORK') throw new TypeError('connection lost');
      return reply({ disk }, failure === 'WORKSPACE_CONFLICT' ? 409 : 403, failure);
    });
    await assert.rejects(client.request('/save', {}), (e: APIError) => failure === 'NETWORK' ? e.message === 'connection lost' : e.code === failure && e.data.disk.text === disk.text);
    assert.equal(writes, 1, failure); assert.equal(sessions, failure === 'WEB_WRITE_FORBIDDEN' ? 2 : 1, failure);
  }
});

test('refreshed token preserves conflict response and refuses a different workspace', async () => {
  for (const changedInstance of [false, true]) {
    let sessions = 0, writes = 0;
    const client = createWorkbenchClient(async url => {
      if (url === '/api/workbench/session') return reply(++sessions === 1 ? session('old') : session('new', changedInstance ? 'instance-b' : 'instance-a'));
      return ++writes === 1 ? reply(null, 403, 'WEB_SESSION_EXPIRED') : reply({ disk: { text: 'external edit' } }, 409, 'WORKSPACE_CONFLICT');
    });
    await assert.rejects(client.request('/save', {}), (e: APIError) => changedInstance ? e.code === 'WORKBENCH_INSTANCE_CHANGED' : e.code === 'WORKSPACE_CONFLICT' && e.data.disk.text === 'external edit');
    assert.equal(writes, changedInstance ? 1 : 2);
    if (changedInstance) await assert.rejects(client.getSession(), (e: APIError) => e.code === 'WORKBENCH_INSTANCE_CHANGED');
  }
});

test('failed session lookup can recover and reads do not load auth', async () => {
  let sessions = 0;
  const client = createWorkbenchClient(async url => {
    if (url !== '/api/workbench/session') return reply('read');
    if (++sessions === 1) throw new TypeError('offline');
    return reply(session('recovered'));
  });
  assert.equal(await client.request('/read'), 'read'); assert.equal(sessions, 0);
  await assert.rejects(client.getSession(), /offline/);
  assert.equal((await client.getSession()).token, 'recovered'); assert.equal(sessions, 2);
});

test('aborted requests do not refresh or replay after auth rejection', async () => {
  let sessions = 0, writes = 0;
  const controller = new AbortController();
  const client = createWorkbenchClient(async url => {
    if (url === '/api/workbench/session') { sessions++; return reply(session('old')); }
    writes++; controller.abort(); return reply(null, 403, 'WEB_SESSION_EXPIRED');
  });
  await assert.rejects(client.request('/save', {}, controller.signal), { name: 'AbortError' });
  assert.equal(sessions, 1); assert.equal(writes, 1);
});
