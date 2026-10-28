import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer } from '../src/services/web.js';
import { createWorkbenchClient, APIError } from '../web/src/apps/request-client.ts';

test('open client saves after real server restart; conflicts still protect external changes', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-session-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, '说明.md'), 'original\r\n');
  let server = await startWebServer({ root, port: 0, capture: false });
  t.after(() => server.close());
  const origin = server.url.slice(0, -1), writes = [];
  const client = createWorkbenchClient((url, options) => {
    if (options.method === 'POST') writes.push(JSON.parse(options.body));
    // Do not reuse a Node fetch keepalive socket from the stopped test server.
    return fetch(new URL(url, origin), { ...options, headers: { ...options.headers, Origin: origin, 'Sec-Fetch-Site': 'same-origin', Connection: 'close' } });
  });
  const originalSession = await client.getSession();
  const file = await client.request('/api/workspace/file?path=' + encodeURIComponent('说明.md'));
  await server.close();
  server = await startWebServer({ root, port: Number(new URL(origin).port), capture: false });
  const saved = await client.request('/api/workspace/save', { path: file.path, text: 'unsaved 中文\r\n', version: file.version });
  assert.equal(await readFile(join(root, file.path), 'utf8'), 'unsaved 中文\r\n');
  assert.notEqual((await client.getSession()).token, originalSession.token);
  assert.equal((await client.getSession()).instanceId, originalSession.instanceId);
  assert.equal((await client.getSession()).nonce, originalSession.nonce);
  assert.notEqual((await client.getSession()).sessionId, originalSession.sessionId);
  assert.equal(writes.length, 2); assert.deepEqual(writes[0], writes[1]);

  await writeFile(join(root, file.path), 'external edit\n');
  await server.close();
  server = await startWebServer({ root, port: Number(new URL(origin).port), capture: false });
  await assert.rejects(client.request('/api/workspace/save', { path: file.path, text: 'must not overwrite', version: saved.version }), e => e instanceof APIError && e.code === 'WORKSPACE_CONFLICT');
  assert.equal(await readFile(join(root, file.path), 'utf8'), 'external edit\n');
  assert.equal(writes.length, 4);
});
