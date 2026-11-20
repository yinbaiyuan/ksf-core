import {readFileSync} from 'node:fs';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as catalog from '@ksf/sdk/component-catalog';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sdkRoot = resolve(root, '../sdk');

/** Evaluate the real documentation and preview registries without mounting UI or application services. */
export async function checkExampleSources() {
  const sdkRequire = createRequire(resolve(sdkRoot, 'package.json'));
  const {rolldown} = await import(pathToFileURL(sdkRequire.resolve('rolldown')).href);
  const bundle = await rolldown({
    input: resolve(root, 'component-contracts.ts'),
    platform: 'node',
    plugins: [{
      name: 'showcase-source-check',
      resolveId(specifier) {
        if (specifier.endsWith('?raw')) return `${require.resolve(specifier.slice(0, -4))}?showcase-raw`;
        if (specifier === 'react' || specifier === '@ksf/sdk/component-catalog') {
          return {id: require.resolve(specifier), external: true};
        }
        if (specifier.startsWith('@ksf/sdk/')) return {id: specifier, external: true};
      },
      load(id) {
        if (id.endsWith('?showcase-raw')) return `export default ${JSON.stringify(readFileSync(id.slice(0, -13), 'utf8'))};`;
      },
    }],
  });
  const directory = await mkdtemp(resolve(tmpdir(), 'ksf-showcase-sources-'));
  let componentContracts, hasLiveExample;
  try {
    const generated = await bundle.generate({format: 'esm', codeSplitting: false});
    const file = resolve(directory, 'adapter.mjs');
    await writeFile(file, generated.output.find(output => output.type === 'chunk').code);
    ({componentContracts} = await import(pathToFileURL(file).href));
    const liveEntry=resolve(directory,'live.ts');
    await writeFile(liveEntry,`export {hasLiveExample} from ${JSON.stringify(resolve(root,'component-live-preview.tsx'))};`);
    const {build}=await import(pathToFileURL(sdkRequire.resolve('vite')).href);
    await build({root:directory,configFile:false,logLevel:'silent',resolve:{alias:[{find:'@ksf/sdk',replacement:resolve(sdkRoot,'src')},{find:'qrcode',replacement:resolve(sdkRoot,'node_modules/qrcode/lib/browser.js')},...['react','react-dom'].map(name=>({find:name,replacement:dirname(require.resolve(name+'/package.json'))}))]},ssr:{noExternal:true},build:{ssr:liveEntry,outDir:resolve(directory,'live-out'),rolldownOptions:{output:{entryFileNames:'live.mjs'}}}});
    ({hasLiveExample}=await import(pathToFileURL(resolve(directory,'live-out/live.mjs')).href));
  } finally {
    await bundle.close();
    await rm(directory, {recursive: true, force: true});
  }
  const failures = [], missingPreviews = [];
  let examples = 0;
  for (const contract of componentContracts) for (const example of contract.examples) {
    examples++;
    if(!hasLiveExample(example.id))missingPreviews.push(example.id);
    const expected = readFileSync(resolve(sdkRoot, example.file), 'utf8');
    if (!example.source || example.source !== expected) failures.push(example.id);
  }
  if(missingPreviews.length)throw new Error(`Showcase previews are not registered: ${missingPreviews.join(', ')}`);
  if (failures.length) throw new Error(`Showcase usage sources are missing or differ from SDK examples: ${failures.join(', ')}`);
  return {ok: true, entries: componentContracts.length, contracts: catalog.componentContracts.length, examples, previews:examples-missingPreviews.length, fingerprint: catalog.catalogIdentity.fingerprint};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await checkExampleSources()));
}
