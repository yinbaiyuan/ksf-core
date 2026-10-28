import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {committedSource} from '../src/distribution/committed-source.js';
import {git} from './helpers/distribution-fixture.js';

test('KSF_PLATFORM_SMOKE: Git root identity accepts native aliases and rejects inherited repositories', t=>{
  // On Windows, tmpdir commonly contains RUNNER~1 while Git expands it to the
  // long account name. Exercise both spellings without copying a whole Core.
  const directory=mkdtempSync(join(tmpdir(),'ksf Git 身份 ')),root=join(directory,'repo');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));mkdirSync(root);
  git(root,['init','--template=','--initial-branch=main']);
  git(root,['-c','user.name=KSF Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--allow-empty','-m','Fictional identity fixture']);
  const physical=realpathSync.native(root),head=git(root,['rev-parse','HEAD']);
  assert.equal(committedSource(root).sourceCommit,head);
  assert.equal(committedSource(physical).sourceCommit,head);
  const nested=join(root,'nested');mkdirSync(nested);
  assert.throws(()=>committedSource(nested),{code:'CONTRIBUTION_GIT_ROOT_MISMATCH'});
});
