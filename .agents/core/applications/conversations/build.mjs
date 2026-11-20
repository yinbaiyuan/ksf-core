import { buildApplication } from '../sdk/build.mjs';
import { fileURLToPath } from 'node:url';
await buildApplication(fileURLToPath(new URL('.',import.meta.url)),{storeDirectory:process.env.KSF_ASSET_BUILD_STORE??fileURLToPath(new URL('../builtin',import.meta.url))});
