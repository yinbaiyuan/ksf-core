import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceClient} from '../../../applications/sdk/src/apps/bridge-client.ts';
import {APIError} from '../src/apps/request-client.ts';
test('packages use the host original CSP session and reconstruct structured conflict errors locally',async()=>{
  const client=createSurfaceClient();const session={instanceId:'workspace',token:'renewed',nonce:'original-document-nonce',sessionId:'new-session'};
  client.bind({getSession:async()=>session,request:async()=>{throw Object.assign(new Error('external conflict'),{code:'WORKSPACE_CONFLICT',data:{disk:{text:'kept'}}});}});
  assert.equal(await client.getSession(),session);
  await assert.rejects(client.request('/api/workspace/save',{text:'mine'}),error=>error instanceof APIError&&error.code==='WORKSPACE_CONFLICT'&&error.data.disk.text==='kept');
});
