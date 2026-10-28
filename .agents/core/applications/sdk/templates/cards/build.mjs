import {buildApplication} from '@ksf/sdk/build';
import {fileURLToPath} from 'node:url';
await buildApplication(fileURLToPath(new URL('.',import.meta.url)));
