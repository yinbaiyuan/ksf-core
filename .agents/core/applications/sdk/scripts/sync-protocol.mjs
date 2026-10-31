import {readFile,writeFile} from 'node:fs/promises';
const source=new URL('../server/protocol.js',import.meta.url),target=new URL('../../../runtime/src/applications/protocol.js',import.meta.url);
const expected='// Generated from applications/sdk/server/protocol.js. Run sdk/scripts/sync-protocol.mjs.\n'+(await readFile(source,'utf8')).replace("'./common.js'","'../services/workbench-common.js'");
if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==expected)throw Error('Application protocol is out of sync.');}else await writeFile(target,expected);
const identitiesSource=new URL('../src/shared/application-identities.js',import.meta.url),identitiesTarget=new URL('../../../runtime/src/applications/identities.js',import.meta.url);
const identities='// Generated from applications/sdk/src/shared/application-identities.js.\n'+await readFile(identitiesSource,'utf8');
if(process.argv.includes('--check')){if(await readFile(identitiesTarget,'utf8')!==identities)throw Error('Application identities are out of sync.');}else await writeFile(identitiesTarget,identities);
