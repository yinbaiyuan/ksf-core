import {readFile, writeFile, mkdir, mkdtemp, copyFile, rm, symlink, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {queryComponents} from '../../server/components/query.mjs';
import {loadRegistry, registryFiles, digest} from '../../server/components/registry.mjs';
const sdk = fileURLToPath(new URL('../../', import.meta.url));
const web = resolve(sdk, '../../runtime/web');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

async function seal(root) {
  const contracts = await read(join(root, 'components/contracts.json'));
  const files = await registryFiles(root, contracts);
  await save(join(root, 'components/integrity.json'), {schemaVersion: 1, fingerprint: digest(JSON.stringify(files)), files});
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-components SDK fixture-')));
  t.after(() => rm(root, {recursive: true, force: true}));
  const target = join(root, 'sdk'), app = join(root, 'app');
  const source = await loadRegistry(sdk);
  const files = [...new Set([...Object.keys(source.integrity.files), 'components/integrity.json', 'build.mjs'])];
  await Promise.all([...new Set(files.map(file => dirname(join(target, file))))].map(directory => mkdir(directory, {recursive: true})));
  let nextFile = 0;
  await Promise.all(Array.from({length: 8}, async () => {
    while (nextFile < files.length) {
      const file = files[nextFile++];
      await copyFile(join(sdk, file), join(target, file));
    }
  }));
  await symlink(join(sdk,'node_modules'),join(target,'node_modules'),process.platform==='win32'?'junction':'dir');
  await mkdir(join(app, 'node_modules/@types'), {recursive: true});
  for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom']) {
    await symlink(join(web, 'node_modules', name), join(app, 'node_modules', name), process.platform === 'win32' ? 'junction' : 'dir');
  }
  await save(join(app, 'package.json'), {name: 'component-test', type: 'module', dependencies: {'@ksf/sdk': 'file:../sdk', react: '19.3.1', 'react-dom': '19.3.1'}, scripts: {build: 'node build.mjs'}});
  await writeFile(join(app, 'build.mjs'), "import {buildApplication} from '../sdk/build.mjs';\nexport const build = () => buildApplication(import.meta.dirname);\n");
  return {root, target, app, query: request => queryComponents({appDir: app, ...request})};
}


export {fixture, seal};
