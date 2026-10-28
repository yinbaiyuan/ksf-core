import {writeNodeExecutable,testEndpoint} from './helpers/platform.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STATE_PROFILE, stateProfileBlock, workbenchPermissions } from '../src/codex-conversations/permissions.js';
import { createDraft } from '../src/codex-conversations/app-server.js';

test('state permissions are explicit, root-bound and do not change the default profile', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-permissions-')); t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(workbenchPermissions(root), null);
  await mkdir(join(root, '.codex')); const path = join(root, '.codex/config.toml');
  await writeFile(path, 'model_reasoning_effort = "low"\n'); assert.equal(workbenchPermissions(root), null);
  const block = stateProfileBlock(root); assert.ok(!block.includes('default_permissions'));
  for (const name of ['.agents', '.git', '.codex', '.aws']) assert.ok(block.includes(`"${name}" = "read"`));
  await writeFile(path, block); assert.throws(() => workbenchPermissions(root), { code: 'CODEX_PERMISSIONS_CONFIG' });
  await writeFile(path, 'default_permissions = ":workspace"\n# Preserve unrelated settings\n' + block);
  assert.equal(workbenchPermissions(root).id, STATE_PROFILE);
  await writeFile(path, block.replace('".agents" = "read"', '".agents" = "write"'));
  assert.throws(() => workbenchPermissions(root), { code: 'CODEX_PERMISSIONS_CONFIG' });
});

test('draft selects an allowed named profile and verifies native acknowledgement before handoff', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-permissions-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.codex')); await writeFile(join(root, '.codex/config.toml'), 'default_permissions = ":workspace"\n' + stateProfileBlock(root));
  const executable = join(root, 'mock-codex'), log = join(root, 'requests.jsonl');
  const mock = active => `#!${process.execPath}\nconst fs=require('fs');require('readline').createInterface({input:process.stdin}).on('line',s=>{const m=JSON.parse(s);fs.appendFileSync(${JSON.stringify(log)},s+'\\n');if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:m.method==='permissionProfile/list'?{data:[{id:'${STATE_PROFILE}',allowed:true}]}:m.method==='thread/start'?{thread:{id:'thread-permissions-1'},activePermissionProfile:{id:'${active}'}}:{}})+'\\n')});`;
  writeNodeExecutable(executable, mock(STATE_PROFILE));
  assert.equal(await createDraft({ root, name: '虚构测试', executable }), 'thread-permissions-1');
  const requests = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  const start = requests.find(r => r.method === 'thread/start');
  assert.equal(requests.find(r => r.method === 'permissionProfile/list').params.cwd, root);
  assert.equal(start.params.permissions, STATE_PROFILE); assert.equal(start.params.sandbox, undefined); assert.equal(start.params.approvalPolicy, undefined);
  writeNodeExecutable(executable, mock(':workspace'));
  await assert.rejects(createDraft({ root, name: '虚构测试', executable }), { code: 'CODEX_PERMISSIONS_MISMATCH' });
});
