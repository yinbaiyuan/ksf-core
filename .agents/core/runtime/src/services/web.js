import {readJSON as readServiceJSON} from '../communication/contracts.js';
import {spawn} from 'node:child_process';
import {acquireServiceLock,processIdentity} from './service-lock.js';
import {join} from 'node:path';
import {readServicePolicy,configureAutostart,serviceLogs,serviceDoctor} from './service-manager.js';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { listRoutes, readRoute } from './routes.js';
import { listTasks, readTask, syncTasks, captureStatus, listTaskProjects, listTaskTargets } from './tasks.js';
import { verifyWebBuild } from '../web/assets.js';
import { createWorkbenchHTTP } from './workbench-http.js';
import { WEB_LOCAL_NAME } from './web-hosts.js';
import { readWorkbenchAbout } from './web-about.js';

export const WEB_HOST = '127.0.0.1';
export const WEB_PORT = 1313;

const failure = (code, message) => Object.assign(new Error(message), { code });

// Only these explicit routes are public. Never use the KSF root as a static directory.
async function startHTTPServer({ port = WEB_PORT, listenFD, root = fileURLToPath(new URL('../../../../../', import.meta.url)), capture = true, captureEnv = process.env, applications,ai,reason='foreground',webDirectory } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw failure('INVALID_ARGUMENTS', 'Expected a port between 0 and 65535.');
  }
  if (listenFD !== undefined && (!Number.isSafeInteger(listenFD) || listenFD < 3)) {
    throw failure('INVALID_ARGUMENTS', 'Expected an inherited listener descriptor of at least 3.');
  }
  let assets,frontend={state:'unchecked'};
  const loadAssets=()=>{if(!assets&&frontend.state!=='unavailable')try{assets=verifyWebBuild(webDirectory??fileURLToPath(new URL('../../web/',import.meta.url)));frontend={state:'ready'};}catch(error){frontend={state:'unavailable',code:error.code??'WEB_BUILD_UNAVAILABLE'};}return assets;};
  const identity=processIdentity();
  const startedAt = new Date().toISOString();
  const workbench = createWorkbenchHTTP(root, {applications,ai,service:{logs:()=>serviceLogs(root),doctor:()=>serviceDoctor(root),isStopping:()=>workbench.draining(),async status(){return {state:'running',pid:process.pid,startedAt,reason,frontend,ai:workbench.ai.runtimeStatus(),communication:await workbench.communication.then(service=>service.runtimeStatus(),()=>({error:{code:'COMM_START_FAILED'}})),...await readServicePolicy(root),port:address.port,url:address.url};},autostart:input=>configureAutostart(root,input.enabled,{ifMatch:input.ifMatch,applyOnly:input.applyOnly}),async restart(input={}){await workbench.quiesce(input);const child=spawn(process.execPath,[fileURLToPath(new URL('./service-restart.js',import.meta.url)),root,String(process.pid),identity.processStart,String(address.port)],{detached:true,stdio:'ignore',windowsHide:true});try{await new Promise((r,j)=>{child.once('spawn',r);child.once('error',j);});}catch(error){workbench.resume();throw error;}child.unref();setTimeout(()=>server.emit('ksf-stop'),100);return {state:'restarting'};},async stop(input={}){await workbench.quiesce(input);setTimeout(()=>server.emit('ksf-stop'),100);return {state:'stopping'};}}});
  let address;
  const server = createServer({ headersTimeout: 10_000, requestTimeout: 0 }, async (request, response) => {
    let bodyDeadline=setTimeout(()=>request.destroy(),10000);bodyDeadline.unref();
    const clearBodyDeadline=()=>clearTimeout(bodyDeadline);request.once('end',clearBodyDeadline);request.once('close',clearBodyDeadline);
    response.once('finish',clearBodyDeadline);
    // The deadline protects incoming bodies, never a slow GET or a later request
    // reusing the same keep-alive connection after this response completed.
    if(!request.headers['transfer-encoding']&&Number(request.headers['content-length']??0)===0)clearBodyDeadline();
    request.allowLargeBody=()=>{clearBodyDeadline();bodyDeadline=setTimeout(()=>request.destroy(),15*60*1000);bodyDeadline.unref();request.setTimeout(30000,()=>request.destroy());};
    const send = (status, body, type = 'application/json; charset=utf-8', extra = {}) => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
      response.writeHead(status, {
        'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        // Packaged images, lens maps and bundled library fonts may use data URLs; remote origins stay blocked.
        'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self' 'nonce-${workbench.nonce}'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
        ...extra,
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    };
    const reject = (status, code, message, headers) =>
      send(status, JSON.stringify({ ok: false, error: { code, message } }) + '\n', undefined, headers);
    const hosts = [`${WEB_HOST}:${address.port}`, `localhost:${address.port}`, `${WEB_LOCAL_NAME}:${address.port}`];
    if (address.port === 80) hosts.push(WEB_HOST, 'localhost', WEB_LOCAL_NAME);
    if (!hosts.includes(request.headers.host)) {
      reject(403, 'WEB_HOST_NOT_ALLOWED', 'Host is not allowed.'); return;
    }
    if (request.headers.origin !== undefined && !hosts.some(host => request.headers.origin === `http://${host}`)) {
      reject(403, 'WEB_ORIGIN_NOT_ALLOWED', 'Origin is not allowed.'); return;
    }
    let pathname, url;
    try {
      if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new Error();
      url = new URL(request.url, address.url);
      pathname = url.pathname;
    } catch {
      reject(400, 'WEB_REQUEST_INVALID', 'Invalid request URL.'); return;
    }
    if (await workbench.handle(request, url, send, response)) return;
    if (!['GET', 'HEAD'].includes(request.method)) {
      reject(405, 'WEB_METHOD_NOT_ALLOWED', 'Use GET or HEAD.', { Allow: 'GET, HEAD' }); return;
    }
    if (!pathname.startsWith('/api/') && loadAssets()?.has(pathname)) {
      const asset = assets.get(pathname);
      send(200, asset.bytes, asset.type); return;
    }
    if (pathname === '/api/health') {
      send(200, JSON.stringify({ ok: true, service:'ksf-core',nodeVersion:process.version,startedAt,pid:process.pid,nonce:identity.nonce,reason,frontend }) + '\n'); return;
    }
    if (pathname === '/api/about') {
      try { send(200, JSON.stringify(readWorkbenchAbout()) + '\n'); }
      catch { reject(500, 'WEB_ABOUT_UNAVAILABLE', '版本信息暂不可用。'); }
      return;
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
    if(!pathname.startsWith('/api/')&&frontend.state==='unavailable'){reject(503,'WEB_FRONTEND_UNAVAILABLE','工作台界面资源不可用；后台与 CLI 继续运行。');return;}
    reject(404, 'WEB_NOT_FOUND', 'Route not found.');
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenFD === undefined ? { port, host: WEB_HOST } : { fd: listenFD }, () => { server.off('error', reject); resolve(); });
    });
  } catch (error) {
    await workbench.close();
    if (error.code === 'EADDRINUSE') throw failure('WEB_ADDRESS_IN_USE', `Port ${port} is already in use. Choose another --port.`);
    if (error.code === 'EACCES') throw failure('WEB_PORT_PERMISSION_REQUIRED', `Port ${port} requires system permission. On macOS, install the local launchd service or choose an unprivileged --port.`);
    throw failure('WEB_START_FAILED', 'Cannot start the local Web server.');
  }
  const bound = server.address();
  if (bound.address !== WEB_HOST || (listenFD !== undefined && bound.port !== port)) {
    await new Promise(resolve => server.close(resolve));
    throw failure('WEB_LISTENER_INVALID', 'The inherited listener must match the requested loopback address and port.');
  }
  const actualPort = bound.port;
  address = { host: WEB_HOST, port: actualPort, url: `http://${WEB_HOST}${actualPort === 80 ? '' : `:${actualPort}`}/` };
  try{await workbench.publishControl(address.url,identity);workbench.start();}catch(error){await new Promise(resolve=>server.close(resolve));await workbench.close();throw error;}
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
          workbench.close().then(() => error ? reject(error) : resolve(), reject);
        });
      });
      return closing;
    },
  };
}

export async function startWebServer(options={}){
  const root=options.root??fileURLToPath(new URL('../../../../../',import.meta.url));
  if(await readServiceJSON(join(root,'.agents/runtime-data/service/deployment.json'),null))throw Object.assign(Error('正在配套更新 Core 与应用，尚不能启动。'),{code:'SERVICE_DEPLOYING'});
  const unlock=await acquireServiceLock(join(root,'.agents/runtime-data/service/host.lock'));
  try{if(options.attemptId){const request=await readServiceJSON(join(root,'.agents/runtime-data/service/start-request.json'),null);if(request?.id!==options.attemptId||request.cancelled)throw failure('SERVICE_START_SUPERSEDED','启动请求已被后续启动或手动停止取代。');}const instance=await startHTTPServer({...options,root});const close=instance.close;let closing;const managed={...instance,close(){return closing??=(async()=>{try{await close();}finally{await unlock();}})();}};instance.server.once('ksf-stop',()=>void managed.close().catch(error=>process.stderr.write('SERVICE_CLOSE_FAILED: '+error.message+'\n')));return managed;}
  catch(error){await unlock();throw error;}
}
