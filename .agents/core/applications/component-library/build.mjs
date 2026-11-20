import {fileURLToPath} from 'node:url';
import {buildApplication} from '../sdk/build.mjs';
import {checkExampleSources} from './check-example-sources.mjs';

await checkExampleSources();

// A content-addressed local candidate; building never installs or publishes it.
const result = await buildApplication(fileURLToPath(new URL('.', import.meta.url)), {
  local: true, quiet: true, entries: {window: 'frontend.tsx'},
});
console.log(JSON.stringify(result));
