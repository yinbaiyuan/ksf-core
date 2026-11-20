import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {packageDirectory} from './target.mjs';
import {publicEntry, bytes} from './registry.mjs';
const exec = promisify(execFile);
const toolsRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Compile data in a disposable directory. No application/module code is imported or run. */
export async function checkTypes(registry, contract, resolution, selected) {
  const {target, app} = resolution, sdkRoot = registry.root;
  const compilerRoot = await packageDirectory('typescript', [toolsRoot, resolve(toolsRoot, '../../runtime/web')]);
  if (!compilerRoot) return {status: 'unknown', reason: 'TYPECHECK_TOOL_UNAVAILABLE'};
  const compilerPkg = JSON.parse(await readFile(join(compilerRoot, 'package.json'), 'utf8'));
  const compiler = join(compilerRoot, typeof compilerPkg.bin === 'string' ? compilerPkg.bin : compilerPkg.bin.tsc);
  const run = args => exec(process.execPath, [compiler, ...args], {timeout: 30000, maxBuffer: 2 * 1024 * 1024, windowsHide: true});
  let inherited = {};
  try {
    await readFile(join(target.appDir, 'tsconfig.json'));
    const shown = await run(['--showConfig', '--project', join(target.appDir, 'tsconfig.json')]);
    inherited = JSON.parse(shown.stdout).compilerOptions ?? {};
  } catch (error) {
    if (error.code !== 'ENOENT') return {status: 'unknown', reason: 'TYPE_ENV_UNAVAILABLE', message: String(error.stdout ?? error.message).slice(0, 1800)};
  }
  const paths = {};
  const base = resolve(target.appDir, inherited.baseUrl ?? '.');
  for (const [name, entries] of Object.entries(inherited.paths ?? {})) {
    paths[name] = entries.map(file => resolve(base, file));
    if (name === '@ksf/sdk' || name.startsWith('@ksf/sdk/')) {
      const expected = name === '@ksf/sdk/*' ? join(sdkRoot, 'src/*') : publicEntry(registry.pkg, name) ? resolve(sdkRoot, publicEntry(registry.pkg, name)) : null;
      if (!expected || paths[name].some(file => file !== expected)) return {status: 'unknown', reason: 'SDK_TYPE_SOURCE_MISMATCH', message: 'tsconfig 的 SDK 路径与构建来源不一致。'};
    }
  }
  const roots = [target.appDir, sdkRoot, resolve(sdkRoot, '../../runtime/web')];
  const names = new Set([...Object.keys(registry.pkg.peerDependencies ?? {}), ...Object.keys(registry.pkg.dependencies ?? {}), ...Object.keys(app.dependencies ?? {}), ...Object.keys(app.devDependencies ?? {})]);
  if ((contract.binding?.framework ?? 'react') === 'react' && !app.dependencies?.react && !app.devDependencies?.react && !app.peerDependencies?.react) return {status: 'unknown', reason: 'APP_REQUIREMENT_MISSING', message: '目标应用尚未声明 React 依赖。'};
  for (const name of names) {
    if (name === '@ksf/sdk') continue;
    const typeName = name === 'react' || name === 'react-dom' ? '@types/' + name : name;
    const directory = (!name.startsWith('@') ? await packageDirectory('@types/' + name, roots) : null) ?? await packageDirectory(typeName, roots);
    if (directory && !paths[name]) {paths[name] = [directory]; paths[name + '/*'] ??= [join(directory, '*')];}
  }
  for (const key of Object.keys(registry.pkg.exports ?? {})) {
    if (!key.startsWith('./')) continue;
    const module = '@ksf/sdk/' + key.slice(2), entry = publicEntry(registry.pkg, module);
    if (entry) paths[module] = [resolve(sdkRoot, entry)];
  }
  const directory = await mkdtemp(join(tmpdir(), 'ksf-component-query-'));
  try {
    const files = [];
    const examples = selected ? [selected] : contract.examples;
    for (const [index, example] of examples.entries()) {
      const file = join(directory, 'example-' + index + (example.file.endsWith('.tsx') ? '.tsx' : '.ts'));
      await writeFile(file, await bytes(sdkRoot, example.file)); files.push(file);
    }
    const probe = join(directory, 'exports.ts');
    const probes = contract.bindings.filter(binding => binding.exports.length).map(binding => `import type {${binding.exports.join(',')}} from ${JSON.stringify(binding.module)};`);
    let count = 0;
    for (const binding of contract.bindings) {
      const runtime = publicEntry(registry.pkg, binding.module, {runtime: true});
      if (!/\.tsx?$/.test(runtime ?? '')) continue;
      for (const name of binding.runtimeExports) {
        probes.push(`import {${name} as Runtime${count}} from ${JSON.stringify(resolve(sdkRoot, runtime).replaceAll('\\', '/'))}; export const value${count} = Runtime${count};`); count++;
      }
    }
    await writeFile(probe, probes.join('\n') + '\nexport {};'); files.push(probe);
    const globals = join(directory, 'styles.d.ts'); await writeFile(globals, "declare module '*.css';\n"); files.push(globals);
    const options = {...inherited, target: inherited.target ?? 'ES2022', module: inherited.module ?? 'ESNext', moduleResolution: inherited.moduleResolution ?? 'Bundler', jsx: inherited.jsx ?? 'react-jsx', lib: inherited.lib ?? ['ES2022', 'DOM', 'DOM.Iterable'], strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true, esModuleInterop: true, paths, types: [], noUnusedLocals: false, noUnusedParameters: false, incremental: false, composite: false};
    for (const name of ['baseUrl', 'rootDir', 'rootDirs', 'outDir', 'outFile', 'declarationDir', 'tsBuildInfoFile', 'plugins', 'typeRoots']) delete options[name];
    const config = join(directory, 'tsconfig.json'); await writeFile(config, JSON.stringify({compilerOptions: options, files}));
    try {await run(['--project', config, '--pretty', 'false']);}
    catch (error) {
      const message = String(error.stdout ?? error.message).split(directory).join('<query>').slice(0, 3200);
      return {status: /TS2307|Cannot find type definition|Cannot find module/.test(message) ? 'unknown' : 'unsupported', reason: /TS2307|Cannot find type definition|Cannot find module/.test(message) ? 'TYPE_ENV_UNAVAILABLE' : 'EXAMPLE_TYPECHECK_FAILED', message};
    }
    return {status: 'supported', reason: 'SDK_CONTRACT_AND_TYPES_VERIFIED', proof: {compilerVersion: compilerPkg.version, exampleIds: examples.map(example => example.id), sdkFingerprint: registry.identity.fingerprint}};
  } finally {await rm(directory, {recursive: true, force: true});}
}
