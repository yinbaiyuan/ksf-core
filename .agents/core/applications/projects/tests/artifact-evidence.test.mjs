import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture} from '../../../runtime/tests/helpers/governance-fixture.js';
import {project} from '../../../runtime/src/services/projects.js';
import {projectGovernance} from '../../../runtime/src/services/project-governance.js';
import {hash} from '../../../runtime/src/projects/governance/model.js';
import {createBackend} from '../backend.mjs';

test('large binary evidence is hashed from the complete file while text preview stays limited',async t=>{
  const f=fixture(t);f.initialize();const path='项目/示例/成果/固件-v1.bin',bytes=Buffer.alloc(3*1024*1024,0xff);
  mkdirSync(join(f.root,'项目/示例/成果'));writeFileSync(join(f.root,path),bytes);
  const app=createBackend({workspace:f.root,dataDirectory:join(f.root,'app-data')},{cli:async()=>project({root:f.root,operation:'read',name:f.name}),governance:(operation,input)=>projectGovernance({...input,root:f.root,operation})});t.after(()=>app.dispose());
  const params={name:f.name,scope:'current',path};
  assert.deepEqual(await app.call('governance.evidence',params),{path,digest:hash(bytes)});
  await assert.rejects(app.call('file',params),/2 MB|过大/);
});
