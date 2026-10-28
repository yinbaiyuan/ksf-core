export * from '../../../applications/sdk/server/pack.mjs';
import {runPackCLI} from '../../../applications/sdk/server/pack.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runPackCLI(...process.argv.slice(2));
