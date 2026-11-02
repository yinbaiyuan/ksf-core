import {writeFileSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {createFixtureBase,embedReceiptBaseline,repository} from './distribution-fixture.js';

// Build/archive/Git once. Both immutable receipt variants refer to that same
// source and artifact; consumers independently copy all mutable scenario trees.
const {originals, ...compact} = await createFixtureBase({after() {}}, {compact:true});
const workspace = join(compact.directory,'legacy-workspace');
cpSync(compact.workspace,workspace,{recursive:true});
embedReceiptBaseline(workspace,compact.first);
const seeds = {'true':compact,'false':{...compact,workspace}};
writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,platform:process.platform,node:process.execPath,repository,seeds}));
