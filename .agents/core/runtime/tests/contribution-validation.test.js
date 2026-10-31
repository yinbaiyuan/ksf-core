import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareContribution} from '../src/distribution/contribute.js';
import {contributionDescription} from './helpers/distribution-fixture.js';

test('contribution parameter and private-path rejection runs before any Git or baseline access',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ksf-validation-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const path of ['知识/private.md','.git/config','../outside','.agents/core/release.json','.agents/core/manifest.yaml','USER.md','BOT.md','MEMORY.md'])await assert.rejects(prepareContribution({...contributionDescription,root,paths:[path]}),{code:'CONTRIBUTION_PATH_INVALID'});
 for(const input of [{paths:[]},{paths:['.agents/core/a'],all:true}])await assert.rejects(prepareContribution({...contributionDescription,root,...input}),{code:'CONTRIBUTION_SELECTION_REQUIRED'});
 for(const title of ['', 'two\nlines', 'x'.repeat(201)])await assert.rejects(prepareContribution({...contributionDescription,root,title,paths:['.agents/core/a']}),{code:'CONTRIBUTION_INVALID'});
});
