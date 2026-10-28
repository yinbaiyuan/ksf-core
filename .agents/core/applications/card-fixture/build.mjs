import { buildApplication } from '../sdk/build.mjs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
await buildApplication(root,{storeDirectory:join(root,'.build/distribution')});
