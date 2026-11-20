import {fileURLToPath} from 'node:url';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {json, registryFiles, digest, validateData, publicEntry, bytes, fail} from '../server/components/registry.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const [groups, contracts, proposals, pkg] = await Promise.all(['components/catalog.json', 'components/contracts.json', 'components/proposals.json', 'package.json'].map(file => json(root, file)));
validateData(groups, contracts, proposals);
for (const contract of contracts) {
  for (const binding of contract.bindings) {
    const file = publicEntry(pkg, binding.module);
    if (!file) throw fail('SDK_EXPORT_MISSING', binding.module + ' 尚非公共入口。');
    await bytes(root, file);
  }
  const source = (await Promise.all(contract.sourceFiles.filter(file => file.endsWith('.tsx')).map(file => bytes(root, file)))).join('\n');
  for (const [name, value] of Object.entries(contract.defaults ?? {})) {
    if (!new RegExp('\\b' + name + '\\s*=\\s*[\'\"]' + value + '[\'\"]').test(source)) throw fail('COMPONENT_DEFAULT_MISMATCH', contract.id + ' 默认值缺少源码依据：' + name);
  }
}
const files = await registryFiles(root, contracts), integrity = {schemaVersion: 1, fingerprint: digest(JSON.stringify(files)), files};
const output = JSON.stringify(integrity, null, 2) + '\n', file = join(root, 'components/integrity.json');
if (process.argv.includes('--check')) {
  if (await readFile(file, 'utf8').catch(() => '') !== output) throw fail('COMPONENT_INTEGRITY_MISMATCH', '组件资料已变化，请核对后运行 components:generate。');
} else await writeFile(file, output);
console.log(JSON.stringify({ok: true, items: groups.reduce((sum, group) => sum + group.items.length, 0), contracts: contracts.length, files: Object.keys(files).length, fingerprint: integrity.fingerprint}));
