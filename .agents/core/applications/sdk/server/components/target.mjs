import {readFile, realpath, stat} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fail} from './registry.mjs';

export async function packageDirectory(name, roots) {
  for (const root of roots) {
    const request = createRequire(join(root, 'package.json'));
    for (const directory of request.resolve.paths(name) ?? []) {
      const path = join(directory, name);
      try {await readFile(join(path, 'package.json')); return await realpath(path);} catch {}
    }
  }
  return null;
}
async function sdkDirectory(path) {
  path = await realpath(path);
  const pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  if (pkg.name !== '@ksf/sdk') throw fail('TARGET_SDK_INVALID', '目标目录不是 @ksf/sdk。');
  return path;
}
async function fileText(file) {
  if ((await stat(file)).size > 512 * 1024) throw fail('TARGET_BUILD_UNRESOLVED', '构建脚本过大，不能静态确认 SDK。');
  return readFile(file, 'utf8');
}

/** Recognize supported SDK build routes without executing application scripts. */
async function buildSource(appDir, app, dependency) {
  const script = app.scripts?.build;
  if (typeof script !== 'string' || /[;&|`\n]/.test(script)) return null;
  if (/^ksf-app\s+(?:build|local)(?:\s|$)/.test(script)) {
    try {const binary = await realpath(join(appDir, 'node_modules/.bin/ksf-app')); return await sdkDirectory(resolve(dirname(binary), '..'));} catch {}
    // npm on Windows and pnpm may use regular launch shims instead of symlinks.
    if (!dependency) return null;
    for (const suffix of ['', '.cmd', '.ps1']) try {
      const text = (await fileText(join(appDir, 'node_modules/.bin/ksf-app' + suffix))).replaceAll('\\', '/');
      if (!text.includes('../@ksf/sdk/scripts/ksf-app.mjs')) continue;
      const entry = await realpath(join(appDir, 'node_modules/@ksf/sdk/scripts/ksf-app.mjs'));
      if (entry === await realpath(join(dependency, 'scripts/ksf-app.mjs'))) return dependency;
    } catch {}
    return null;
  }
  const node = /^node\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))(?:\s|$)/.exec(script);
  if (!node) return null;
  const file = resolve(appDir, node[1] ?? node[2] ?? node[3]);
  if (file.endsWith('/scripts/ksf-app.mjs') || file.endsWith('\\scripts\\ksf-app.mjs')) try {return await sdkDirectory(resolve(dirname(file), '..'));} catch {return null;}
  const source = await fileText(file);
  const sources = new Set();
  for (const match of source.matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec === '@ksf/sdk/build') {if (dependency) sources.add(dependency);}
    else if (spec.startsWith('.') && spec.endsWith('/build.mjs')) {
      try {const entry = await realpath(resolve(dirname(file), spec)); sources.add(await sdkDirectory(dirname(entry)));} catch {}
    }
  }
  return sources.size === 1 ? [...sources][0] : null;
}

export async function resolveTarget({appDir, sdkRoot} = {}) {
  if (!appDir) return {target: null, issue: 'TARGET_REQUIRED'};
  const target = {appDir: resolve(appDir), sdkRoot: null, sdkVersion: null, resolution: null};
  try {
    appDir = target.appDir = await realpath(appDir);
    const app = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf8'));
    const specs = [...new Set(['dependencies', 'devDependencies', 'peerDependencies'].map(key => app[key]?.['@ksf/sdk']).filter(Boolean))];
    target.dependencySpec = specs[0] ?? null;
    if (specs.length > 1) return {target, issue: 'SDK_SOURCE_MISMATCH', message: '应用声明了不同的 SDK 来源。'};
    let declared = null;
    if (specs[0]?.startsWith('file:')) declared = await sdkDirectory(resolve(appDir, specs[0].slice(5)));
    const installed = await packageDirectory('@ksf/sdk', [appDir]);
    if (installed && declared && installed !== declared) return {target: {...target, declared, installed}, issue: 'SDK_SOURCE_MISMATCH', message: '安装的 SDK 与 file 依赖来源不同。'};
    const dependency = installed ? await sdkDirectory(installed) : declared;
    const build = await buildSource(appDir, app, dependency);
    const explicit = sdkRoot ? await sdkDirectory(resolve(sdkRoot)) : null;
    const candidates = [...new Set([dependency, build, explicit].filter(Boolean))];
    target.sources = {dependency, build, explicit};
    if (candidates.length > 1) return {target, issue: 'SDK_SOURCE_MISMATCH', message: '应用依赖、构建来源或显式 SDK 路径不一致。'};
    if (!dependency) return {target, issue: 'SDK_DEPENDENCY_UNRESOLVED', message: '未解析目标应用的 SDK 依赖。'};
    if (!build && !explicit) return {target, issue: 'BUILD_SDK_UNRESOLVED', message: '无法静态确认构建 SDK；核对构建脚本或用 --sdk-root 显式指定。'};
    target.sdkRoot = dependency;
    target.sdkVersion = JSON.parse(await readFile(join(dependency, 'package.json'), 'utf8')).version;
    if (/^\d+\.\d+\.\d+$/.test(specs[0] ?? '') && specs[0] !== target.sdkVersion) return {target, issue: 'SDK_VERSION_MISMATCH', message: '安装 SDK 的版本与精确依赖声明不同。'};
    target.resolution = build ? 'dependency-and-build' : 'explicit-and-dependency';
    return {target, app};
  } catch (error) {
    return {target, issue: error.code === 'ENOENT' ? 'TARGET_UNRESOLVED' : error.code ?? 'TARGET_INVALID', message: error.message};
  }
}
