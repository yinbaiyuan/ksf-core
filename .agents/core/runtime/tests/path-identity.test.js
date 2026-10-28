import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {committedSource} from '../src/distribution/committed-source.js';
import {repository} from '../src/services/repositories.js';
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

test('KSF_PLATFORM_SMOKE: shared Git storage is rejected through native directory aliases', t=>{
  const directory=mkdtempSync(join(tmpdir(),'ksf Git 共享身份 ')),root=join(directory,'repo');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));mkdirSync(root);
  writeFileSync(join(root,'.gitignore'),'/repositories/\n');
  git(root,['init','--template=','--initial-branch=main']);
  git(root,['-c','user.name=KSF Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--allow-empty','-m','Fictional identity fixture']);
  const shared=join(root,'repositories','shared'),external=join(directory,'external');
  for(const path of [shared,external])git(root,['worktree','add','--detach',path]);
  const independent=join(root,'repositories','independent');mkdirSync(independent);
  git(independent,['init','--template=','--initial-branch=main']);
  for(const selected of new Set([root,realpathSync.native(root)])){
    for(const target of [root,shared,external,realpathSync.native(shared)]){
      const result=repository({root:selected,operation:'check',target});
      assert.equal(result.data.valid,false);
      assert.equal(result.errors[0].code,'REPOSITORY_SHARED_GIT');
    }
    assert.equal(repository({root:selected,operation:'check',target:independent}).data.valid,true);
  }
});
