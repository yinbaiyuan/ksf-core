import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer } from '../src/services/web.js';
import { createWorkbenchClient, APIError } from '../web/src/apps/request-client.ts';
import {encodePackage,checksum} from '../src/applications/protocol.js';

test('open client saves after real server restart; conflicts still protect external changes', async t => {
  let server;
  t.after(() => server?.close());

  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-session-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, '说明.md'), 'original\r\n');
  server = await startWebServer({ root, port: 0, capture: false });

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

test('public app sessions survive actual HTTP host restart and app release; caller identity and AI lookup pass through the production host',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ksf-durable-session-http-')));let server;
 t.after(async()=>{await server?.close();await rm(root,{recursive:true,force:true});});
 const manifest={schemaVersion:1,sdkVersion:1,id:'com.example.session',name:'Session fixture',description:'Isolated durable session HTTP fixture',version:'1.0.0',minCoreVersion:'0.5.7',dataStores:[],permissions:[],window:{entry:'frontend/index.js'},backend:{runtime:'node',entry:'backend/index.mjs',lifecycle:'on-demand'}};
 const file=text=>{const bytes=Buffer.from(text);return {content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
 const bytes=encodePackage(manifest,{'frontend/index.js':file('export function mount(){}'),'backend/index.mjs':file(`export function activate(ctx){return {call(method,input){if(method==='lookup')return ctx.services.call('ai','lookup',[input.key]);throw Error('unsupported fixture call');}}}`)});
 server=await startWebServer({root,port:0,capture:false,applications:{defaultSource:null}});const origin=server.url.slice(0,-1);
 const client=createWorkbenchClient((url,options)=>fetch(new URL(url,origin),{...options,headers:{...options.headers,Origin:origin,'Sec-Fetch-Site':'same-origin',Connection:'close'}}));
 const auth=await client.getSession();assert.ok(auth.capabilities.includes('app-sessions-v1'));
 const preview=await fetch(origin+'/api/apps/import/preview?name=session.ksfapp',{method:'POST',headers:{Origin:origin,'Content-Type':'application/octet-stream','X-KSF-Token':auth.token},body:bytes});assert.equal(preview.status,200);const imported=(await preview.json()).data;
 await client.request('/api/apps/import/install',{trusted:true,importId:imported.importId,digest:checksum(bytes)});
 const first=await client.request('/api/apps/launch',{appId:manifest.id,digest:checksum(bytes)});
 const missing=await client.request('/api/apps/session/read',{instanceId:first.id,key:'main',recordVersion:1});assert.equal(missing.exists,false);
 const saved=await client.request('/api/apps/session/write',{instanceId:first.id,key:'main',recordVersion:1,ifMatch:null,value:{draft:'刷新保留',selected:'task-one',operationId:'original'},appId:'com.example.foreign'});assert.equal(saved.record.appId,manifest.id);assert.equal(saved.record.instanceId,auth.instanceId);
 assert.equal(await client.request('/api/apps/call',{instanceId:first.id,method:'lookup',params:{key:'never-submitted'}}),null);
 await client.request('/api/apps/release',{instanceId:first.id});await assert.rejects(client.request('/api/apps/session/read',{instanceId:first.id,key:'main',recordVersion:1}),e=>e.code==='APP_PROCESS_EXITED');
 await server.close();server=await startWebServer({root,port:Number(new URL(origin).port),capture:false,applications:{defaultSource:null}});
 const reopened=await client.request('/api/apps/launch',{appId:manifest.id,digest:checksum(bytes)}),restored=await client.request('/api/apps/session/read',{instanceId:reopened.id,key:'main',recordVersion:1});assert.deepEqual(restored.record.value,saved.record.value);assert.equal(restored.etag,saved.etag);
 await assert.rejects(client.request('/api/apps/session/write',{instanceId:reopened.id,key:'main',recordVersion:1,ifMatch:null,value:{draft:'overwrite'}}),e=>e.code==='APP_DATA_CONFLICT');
 await assert.rejects(client.request('/api/apps/session/read',{instanceId:reopened.id,key:'main',recordVersion:2}),e=>e.code==='APP_SESSION_VERSION');
 await client.request('/api/apps/release',{instanceId:reopened.id});
});
