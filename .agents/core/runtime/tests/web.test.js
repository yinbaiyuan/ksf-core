import{platform}from'../src/platform/index.js';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startWebServer } from '../src/services/web.js';
import { routingFixture } from './helpers/routing-fixture.js';
import { readFileSync, writeFileSync, existsSync,cpSync,mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTE_DIRECTORY } from '../src/routing/schema.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const launcher = fileURLToPath(new URL('../../../ksf', import.meta.url));

function call(instance, path = '/', { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: instance.host, port: instance.port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(3_000, () => req.destroy(new Error('HTTP request timed out.')));
    req.end();
  });
}

async function running(t) {
  let instance;
  t.after(() => instance?.close());
  instance = await startWebServer({ root:routingFixture(t).root,port: 0 });
  return instance;
}

test('Web serves the packaged page and live health over loopback, including HEAD', async t => {
  const instance = await running(t);
  assert.equal(instance.host, '127.0.0.1');
  assert.ok(instance.port > 0);
  const page = await call(instance);
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html; charset=utf-8$/);
  assert.match(page.body, /KSF 工作台/);
  assert.match(page.body, /type="module"[^>]*src="\/assets\//);
  assert.match(page.body, /href="\/api\/health"/);
  assert.equal((await call(instance, '/index.html')).body, page.body);
  const health = await call(instance, '/api/health?check=1');
  assert.equal(health.status, 200);
  const payload = JSON.parse(health.body);
  assert.deepEqual(payload, { ok: true, service: 'ksf-core', pid: process.pid,
    nonce: payload.nonce, reason: 'foreground', frontend: {state: 'ready'},
    nodeVersion: process.version, startedAt: instance.startedAt });
  assert.match(payload.nonce, /^[a-f0-9-]{36}$/);
  assert.equal(health.headers['cache-control'], 'no-store');
  const head = await call(instance, '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], page.headers['content-length']);
});

test('Web reads independent persisted routing records and preserves them across server restart', async t => {
  let server;
  t.after(() => server?.close());

  const f = routingFixture(t);
  server = await startWebServer({ root: f.root, port: 0 });

  let result = await call(server, '/api/routes');
  assert.equal(JSON.parse(result.body).data.total, 0);
  assert.equal(existsSync(join(f.root, ROUTE_DIRECTORY)), false);
  await server.close();
  const record = f.start({ summary: '<img src=x onerror=alert(1)>' }).record;
  server = await startWebServer({ root: f.root, port: 0 });
  result = await call(server, '/api/routes');
  const list = JSON.parse(result.body);
  assert.equal(list.ok, true); assert.equal(list.data.records[0].sessionKey, record.sessionKey);
  assert.equal(list.data.records[0].history, undefined);
  const path = `/api/routes/${record.sessionKey}`, file = join(f.root, ROUTE_DIRECTORY, `${record.sessionKey}.json`), bytes = readFileSync(file);
  const detail = JSON.parse((await call(server, path)).body).data.record;
  assert.equal(detail.current.summary, '<img src=x onerror=alert(1)>');
  assert.equal(detail.events, undefined); assert.equal(detail.history.length, 1);
  assert.equal((await call(server, path, { method: 'HEAD' })).body, '');
  assert.equal((await call(server, `/api/routes/${'0'.repeat(64)}`)).status, 404);
  for (const query of ['limit=0', 'limit=101', 'limit=no', 'limit=1&limit=2', 'offset=-1']) assert.equal((await call(server, `/api/routes?${query}`)).status, 400);
  assert.equal((await call(server, '/api/routes/../../USER.md')).status, 404);
  assert.equal((await call(server, path, { method: 'POST' })).status, 405);
  assert.equal((await call(server, path, { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.deepEqual(readFileSync(file), bytes);
  writeFileSync(file, '{');
  const partial = JSON.parse((await call(server, '/api/routes')).body);
  assert.equal(partial.ok, false); assert.equal(partial.data.errors.length, 1);
  assert.equal((await call(server, path)).status, 500); assert.equal(readFileSync(file, 'utf8'), '{');
});

test('about exposes only current Core product metadata through guarded read-only requests', async t => {
  const instance = await running(t);
  const core = JSON.parse(readFileSync(new URL('../../build.json', import.meta.url), 'utf8'));
  const result = await call(instance, '/api/about');
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true, productName: 'KSF 工作台', coreVersion: core.version });
  const head = await call(instance, '/api/about', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], result.headers['content-length']);
  assert.equal((await call(instance, '/api/about', { method: 'POST' })).status, 405);
  assert.equal((await call(instance, '/api/about', { headers: { Host: 'example.com' } })).status, 403);
  assert.equal((await call(instance, '/api/about', { headers: { Origin: 'https://example.com' } })).status, 403);
});

test('Web serves only verified bundled chunks with a restrictive CSP', async t => {
  const instance = await running(t);
  const page = await call(instance);
  const scriptPath = page.body.match(/src="([^"]+\.js)"/)[1];
  const cssPath = page.body.match(/href="([^"]+\.css)"/)[1];
  const script = await call(instance, scriptPath), css = await call(instance, cssPath);
  assert.equal(script.status, 200); assert.equal(css.status, 200);
  assert.match(script.headers['content-type'], /^text\/javascript/); assert.match(css.headers['content-type'], /^text\/css/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'; style-src 'self' 'nonce-[A-Za-z0-9+/=]+'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'/);
  assert.doesNotMatch(page.headers['content-security-policy'], /img-src[^;]*(?:https:|http:|\*)/);
  assert.doesNotMatch(page.headers['content-security-policy'], /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(script.body, /\beval\(/);
  for (const path of ['/src/main.tsx', '/app.js', '/dist/build.json', '/assets/missing.js', scriptPath + '.map', '/node_modules/react/package.json']) assert.equal((await call(instance, path)).status, 404, path);
  assert.equal((await call(instance, '/DESIGN.md')).status, 404);
});

test('Web exposes only explicit routes, without serving workspace files or arbitrary paths', async t => {
  const instance = await running(t);
  for (const path of ['/USER.md', '/.agents/core/manifest.yaml', encodeURI('/项目/'), '/../../etc/passwd', '/%2e%2e/USER.md', '/missing']) {
    const result = await call(instance, path);
    assert.equal(result.status, 404, path);
    assert.equal(JSON.parse(result.body).error.code, 'WEB_NOT_FOUND');
  }
  assert.equal((await call(instance, '//example.com/')).status, 400);
});

test('Web rejects foreign hosts, origins and unsupported methods', async t => {
  const instance = await running(t);
  assert.equal((await call(instance, '/', { headers: { Host: 'example.com' } })).status, 403);
  assert.equal((await call(instance, '/', { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await call(instance, '/', { headers: { Origin: `http://127.0.0.1:${instance.port}` } })).status, 200);
  assert.equal((await call(instance, '/', { headers: { Host: `localhost:${instance.port}` } })).status, 200);
  assert.equal((await call(instance, '/', { headers: { Host: `ksf.ai:${instance.port}`, Origin: `http://ksf.ai:${instance.port}` } })).status, 200);
  for (const host of ['ksf.ai.evil.test', 'evil.ksf.ai', `ksf.ai:${instance.port + 1}`]) {
    assert.equal((await call(instance, '/', { headers: { Host: host } })).status, 403);
  }
  assert.equal((await call(instance, '/', { headers: { Origin: 'http://ksf.ai.evil.test' } })).status, 403);
  const result = await call(instance, '/api/health', { method: 'POST' });
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'GET, HEAD');
});

test('Web reports occupied and invalid ports, preserving the running server', async t => {
  const instance = await running(t);
  await assert.rejects(startWebServer({ root:routingFixture(t).root,port: instance.port }), { code: 'WEB_ADDRESS_IN_USE' });
  for (const port of [-1, 65536, 1.5, '4173']) {
    await assert.rejects(startWebServer({ root:routingFixture(t).root,port }), { code: 'INVALID_ARGUMENTS' });
  }
  assert.equal((await call(instance, '/api/health')).status, 200);
});

test('Web closes unfinished connections within a bounded shutdown and releases its port', { timeout: 6_000 }, async t => {
  let replacement;
  t.after(() => replacement?.close());

  const instance = await running(t);
  const accepted = once(instance.server, 'connection');
  const socket = connect(instance.port, instance.host);
  socket.on('error', error => assert.equal(error.code, 'ECONNRESET'));
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  const [connection] = await accepted;
  const received = once(connection, 'data');
  socket.write('GET / HTTP/1.1\r\n');
  await received;
  await instance.close();
  await instance.close();
  replacement = await startWebServer({ root:routingFixture(t).root,port: instance.port });

  assert.equal((await call(replacement, '/api/health')).status, 200);
});

test('Web CLI documents its startup and rejects invalid or repeated options', () => {
  const help = spawnSync(process.execPath, [cli, 'web', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /127\.0\.0\.1.*1313/);
  assert.match(help.stdout, /http:\/\/ksf\.ai:1313\//);
  assert.match(help.stdout, /ksf web hosts/);
  for (const args of [['--port'], ['--port', '-1'], ['--port', '65536'], ['--port', '1.5'],
    ['--port', '0', '--port', '0'], ['--json', '--json'], ['--host', '0.0.0.0'], ['start'], ['--help', '--json']]) {
    const options = args.includes('--json') ? args : [...args, '--json'];
    const result = spawnSync(process.execPath, [cli, 'web', ...options], { encoding: 'utf8', env: { ...process.env, PATH: '' } });
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(JSON.parse(result.stdout).errors[0].code, 'INVALID_ARGUMENTS');
    assert.equal(result.stderr, '');
  }
});

test('Web command returns a structured address-in-use error without touching the daily host', async t => {
  const instance = await running(t);
  const root = routingFixture(t).root, handler = new URL('../src/commands/web.js', import.meta.url).href;
  const script = `import {runWebCommand} from ${JSON.stringify(handler)};process.exitCode=await runWebCommand(${JSON.stringify(['--port',String(instance.port),'--json'])},${JSON.stringify(root)});`;
  const result = spawnSync(process.execPath, ['--input-type=module','--eval',script], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'WEB_ADDRESS_IN_USE');
});

test('real launcher starts with bundled Node from another cwd and stops on SIGINT or SIGTERM', { skip:platform.name==='win32'?'POSIX SIGINT/SIGTERM semantics; Windows native launcher, manual supervisor stop and ConPTY Ctrl-C are separately accepted':false }, async t => {
  const f=routingFixture(t),source=fileURLToPath(new URL('../../../../',import.meta.url));
  for(const path of ['.agents/ksf','.agents/ksf.ps1','.agents/core'])cpSync(join(source,path),join(f.root,path),{recursive:true,filter:p=>!p.split(/[\\/]/).includes('node_modules')&&!p.split(/[\\/]/).includes('.git')});
  const isolatedLauncher=join(f.root,'.agents/ksf');
  // Cold fixture copying/extraction is preparation, not the readiness/shutdown
  // latency being asserted below. Keep each real signal round trip bounded.
  const prepared=spawnSync(isolatedLauncher,['hello','--json'],{encoding:'utf8',timeout:30_000,env:{...process.env,PATH:'/usr/bin:/bin'}});assert.equal(prepared.status,0,prepared.stderr||prepared.error?.message);
  for (const signal of ['SIGINT', 'SIGTERM']) await t.test(signal, { timeout: 15_000 }, async t => {
    const child = spawn(isolatedLauncher, ['web', '--port', '0', '--json'], {
      cwd: tmpdir(), env: { ...process.env, PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    const exited = once(child, 'exit');
    const lines = createInterface({ input: child.stdout });
    const [line] = await Promise.race([once(lines, 'line'), exited.then(result => {
      throw new Error(`Server exited before readiness: ${result}; ${stderr}`);
    })]);
    const ready = JSON.parse(line);
    assert.equal(ready.ok, true);
    assert.equal(ready.data.host, '127.0.0.1');
    assert.equal(ready.data.nodeVersion, process.version);
    assert.ok(['configured', 'missing', 'conflict', 'unavailable'].includes(ready.data.hosts));
    assert.equal('mdns' in ready.data, false);
    if (ready.data.localUrl) assert.equal(ready.data.localUrl, `http://ksf.ai:${ready.data.port}/`);
    assert.equal((await call(ready.data, '/api/health')).status, 200);
    child.kill(signal);
    assert.deepEqual(await exited, [0, null], stderr);
    assert.equal(stderr, '');
    const replacement = await startWebServer({ root:f.root,port: ready.data.port });
    await replacement.close();
    lines.close();
  });
});
