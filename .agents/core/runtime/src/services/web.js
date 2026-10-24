import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { listRoutes, readRoute } from './routes.js';
import { listTasks, readTask, syncTasks, captureStatus, listTaskProjects, listTaskTargets } from './tasks.js';
import { verifyWebBuild } from '../web/assets.js';

export const WEB_HOST = '127.0.0.1';
export const WEB_PORT = 4173;

const failure = (code, message) => Object.assign(new Error(message), { code });

// Only these explicit routes are public. Never use the KSF root as a static directory.
export async function startWebServer({ port = WEB_PORT, root = fileURLToPath(new URL('../../../../../', import.meta.url)), capture = true, captureEnv = process.env } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw failure('INVALID_ARGUMENTS', 'Expected a port between 0 and 65535.');
  }
  const assets = verifyWebBuild(fileURLToPath(new URL('../../web/', import.meta.url)));
  const startedAt = new Date().toISOString();
  let address;
  const server = createServer({ headersTimeout: 10_000, requestTimeout: 10_000 }, (request, response) => {
    const send = (status, body, type = 'application/json; charset=utf-8', extra = {}) => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      response.writeHead(status, {
        'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        ...extra,
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    const reject = (status, code, message, headers) =>
      send(status, JSON.stringify({ ok: false, error: { code, message } }) + '\n', undefined, headers);
    const hosts = [`${WEB_HOST}:${address.port}`, `localhost:${address.port}`];
    if (address.port === 80) hosts.push(WEB_HOST, 'localhost');
    if (!hosts.includes(request.headers.host)) {
      reject(403, 'WEB_HOST_NOT_ALLOWED', 'Host is not allowed.'); return;
    }
    if (request.headers.origin !== undefined && !hosts.some(host => request.headers.origin === `http://${host}`)) {
      reject(403, 'WEB_ORIGIN_NOT_ALLOWED', 'Origin is not allowed.'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      reject(405, 'WEB_METHOD_NOT_ALLOWED', 'Use GET or HEAD.', { Allow: 'GET, HEAD' }); return;
    }
    let pathname, url;
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new Error();
      url = new URL(request.url, address.url);
      pathname = url.pathname;
    } catch {
      reject(400, 'WEB_REQUEST_INVALID', 'Invalid request URL.'); return;
    }
    if (assets.has(pathname)) {
      const asset = assets.get(pathname);
      send(200, asset.bytes, asset.type); return;
    }
    if (pathname === '/api/health') {
      send(200, JSON.stringify({ ok: true, service: 'ksf-web', nodeVersion: process.version, startedAt }) + '\n'); return;
    }
    if (pathname === '/api/task-targets' || pathname === '/api/task-projects' || pathname === '/api/tasks' || /^\/api\/tasks\/[a-f0-9]{64}(?:\/turns\/[a-zA-Z0-9._:-]{1,128})?$/.test(pathname)) {
      const parts = pathname.split('/'), operation = parts.length === 3 ? 'list' : 'read';
      try {
        const integer = (name, fallback) => {
          const values = url.searchParams.getAll(name);
          if (values.length > 1 || (values.length && !/^\d+$/.test(values[0]))) throw Object.assign(new Error(`Invalid ${name}.`), { code: 'INVALID_ARGUMENTS' });
          return values.length ? Number(values[0]) : fallback;
        };
        const text = name => {
          const values = url.searchParams.getAll(name);
          if (values.length > 1) throw Object.assign(new Error(`Duplicate ${name}.`), { code: 'INVALID_ARGUMENTS' });
          return values[0] ?? '';
        };
        const messages = text('messages');
        if (!['', '0', '1'].includes(messages)) throw Object.assign(new Error('messages must be 0 or 1.'), { code: 'INVALID_ARGUMENTS' });
        const data = pathname === '/api/task-targets' ? { ...listTaskTargets({ root }), capture: captureStatus({ root }) }
          : pathname === '/api/task-projects' ? { ...listTaskProjects({ root }), capture: captureStatus({ root }) }
          : operation === 'list' ? { ...listTasks({ root, limit: integer('limit', 50), offset: integer('offset', 0), q: text('q'), project: text('project'), projectMatch: text('projectMatch') || 'latest', target: text('target') }), capture: captureStatus({ root }) }
          : readTask({ root, taskId: parts[3], turnId: parts[5], limit: integer('limit', 20), offset: integer('offset', 0), includeMessages: messages !== '0', project: text('project'), target: text('target') });
        send(data.state === 'missing' ? 404 : 200, JSON.stringify({ ok: !data.errors?.length, command: 'task', operation, data, errors: data.errors ?? [] }) + '\n');
      } catch (error) {
        send(error.code === 'INVALID_ARGUMENTS' ? 400 : 500, JSON.stringify({ ok: false, command: 'task', operation, data: null,
          errors: [{ code: error.code ?? 'TASK_READ_FAILED', message: error.code ? error.message : 'Cannot read task archive.' }] }) + '\n');
      }
      return;
    }
    if (pathname === '/api/routes' || /^\/api\/routes\/[a-f0-9]{64}$/.test(pathname)) {
      const operation = pathname === '/api/routes' ? 'list' : 'read';
      try {
        const integer = (name, fallback) => {
          const values = url.searchParams.getAll(name);
          if (values.length > 1 || (values.length && !/^\d+$/.test(values[0]))) throw Object.assign(new Error(`Invalid ${name}.`), { code: 'INVALID_ARGUMENTS' });
          return values.length ? Number(values[0]) : fallback;
        };
        const data = operation === 'list' ? listRoutes({ root, limit: integer('limit', 50), offset: integer('offset', 0) }) : readRoute({ root, key: pathname.slice('/api/routes/'.length) });
        const errors = data.errors ?? [];
        send(operation === 'read' && data.state === 'missing' ? 404 : 200,
          JSON.stringify({ ok: errors.length === 0, command: 'route', operation, data, errors }) + '\n');
      } catch (error) {
        send(error.code === 'INVALID_ARGUMENTS' ? 400 : 500, JSON.stringify({ ok: false, command: 'route', operation, data: null,
          errors: [{ code: error.code ?? 'ROUTE_READ_FAILED', message: error.code ? error.message : 'Cannot read routing data.' }] }) + '\n');
      }
      return;
    }
    reject(404, 'WEB_NOT_FOUND', 'Route not found.');
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, WEB_HOST, () => { server.off('error', reject); resolve(); });
    });
  } catch (error) {
    if (error.code === 'EADDRINUSE') throw failure('WEB_ADDRESS_IN_USE', `Port ${port} is already in use. Choose another --port.`);
    throw failure('WEB_START_FAILED', 'Cannot start the local Web server.');
  }
  const actualPort = server.address().port;
  address = { host: WEB_HOST, port: actualPort, url: `http://${WEB_HOST}:${actualPort}/` };
  let syncing = false, stopped = false;
  const catchUp = async () => {
    if (syncing || stopped || !capture) return;
    syncing = true;
    try { await syncTasks({ root, env: captureEnv }); } catch { /* Status/CLI exposes durable capture failures; never stop the Web server. */ }
    finally { syncing = false; }
  };
  const captureTimer = capture ? setInterval(catchUp, 3000) : null;
  captureTimer?.unref();
  void catchUp();
  let closing;
  return {
    ...address, startedAt, nodeVersion: process.version, server,
    close() {
      stopped = true; clearInterval(captureTimer);
      closing ??= new Promise((resolve, reject) => {
        const timer = setTimeout(() => server.closeAllConnections(), 2_000);
        timer.unref();
        server.close(error => {
          clearTimeout(timer);
          if (error) reject(error); else resolve();
        });
      });
      return closing;
    },
  };
}
