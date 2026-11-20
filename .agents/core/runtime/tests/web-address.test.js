import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workbenchURL,workbenchHosts} from '../src/services/web-address.js';
import {configureServicePort,readServicePolicy,serviceStatus} from '../src/services/service-manager.js';
import {runServiceCommand} from '../src/commands/service.js';
import {macSocketJob} from '../src/platform/service.js';

test('canonical address omits default port and allows only explicit loopback aliases',()=>{
  assert.equal(workbenchURL(80),'http://ksf.localhost/');
  assert.equal(workbenchURL(1313),'http://ksf.localhost:1313/');
  assert.ok(workbenchHosts(80).includes('ksf.localhost'));
  assert.ok(workbenchHosts(80).includes('ksf.localhost:80'));
  assert.ok(!workbenchHosts(1313).includes('ksf.localhost'));
});
test('service port persists across reads without changing autostart; CLI validates before writing',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-port-policy-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'.agents/runtime-data/service'),{recursive:true});
  await writeFile(join(root,'.agents/runtime-data/service/policy.json'),JSON.stringify({schemaVersion:1,port:1313,autostart:false}));
  assert.equal((await configureServicePort(root,80)).restartRequired,true);
  assert.deepEqual(await readServicePolicy(root),{schemaVersion:1,port:80,autostart:false});
  assert.equal((await serviceStatus(root)).url,'http://ksf.localhost/');
  for(const value of ['0','65536','1.5','no'])assert.equal((await runServiceCommand(['port',value,'--json'],root)).exitCode,2);
  assert.deepEqual(await readServicePolicy(root),{schemaVersion:1,port:80,autostart:false});
});
test('macOS port job binds IPv4 loopback and runs the listener as the login user',()=>{
  const job=macSocketJob('/Users/test/中文 & core',80,'/private/listener');
  assert.match(job,/<key>SockNodeName<\/key><string>127\.0\.0\.1<\/string>/);
  assert.match(job,/<key>SockServiceName<\/key><string>80<\/string>/);
  assert.match(job,/<string>\/private\/listener<\/string><string>\/bin\/sh<\/string>/);
  assert.doesNotMatch(job,/<key>UserName<\/key>/);
  assert.match(job,/中文 &amp; core/);
});
