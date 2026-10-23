import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
function sources(path = root) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.name === 'vendor' ? []
    : entry.isDirectory() ? sources(join(path, entry.name)) : entry.name.endsWith('.js') ? [join(path, entry.name)] : []);
}
const graph = new Map(sources().map(file => {
  const text = readFileSync(file, 'utf8');
  const dependencies = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
  return [file, dependencies];
}));
function closure(file, visited = new Set()) {
  if (visited.has(file) || !graph.has(file)) return visited;
  visited.add(file);
  for (const dep of graph.get(file)) if (dep.startsWith('.')) closure(resolve(dirname(file), dep), visited);
  return visited;
}

test('shared mechanics have no upward dependencies and storage does not load the object catalog', () => {
  for (const [file, deps] of graph) {
    if (relative(root, file).startsWith('shared/')) {
      for (const dep of deps.filter(dep => dep.startsWith('.'))) assert.ok(resolve(dirname(file), dep).startsWith(join(root, 'shared/')), `${file} -> ${dep}`);
    }
    if (!file.endsWith('/distribution/common.js')) assert.ok(!deps.some(dep => dep.endsWith('/common.js')), file);
  }
  assert.ok(!closure(join(root, 'objects/storage.js')).has(join(root, 'objects/catalog.js')));
});

test('mutation planners and reference resolution cannot import filesystem or business services', () => {
  for (const entry of ['objects/plan.js', 'projects/plan.js', 'objects/references.js', 'objects/markdown.js']) {
    for (const file of closure(join(root, entry))) {
      const name = relative(root, file);
      assert.ok(!name.startsWith('services/') && !name.startsWith('commands/'), `${entry} -> ${name}`);
      for (const dep of graph.get(file)) assert.ok(!/^node:(?:fs|child_process|http|https|net|tls)(?:\/|$)/.test(dep), `${entry} -> ${file} -> ${dep}`);
    }
  }
  for (const file of closure(join(root, 'distribution/archive.js'))) assert.ok(!relative(root, file).startsWith('services/'), file);
});

test('runtime static imports, re-exports and literal dynamic imports have no dependency cycles', () => {
  const complete = new Set(), pending = [];
  function visit(file) {
    if (complete.has(file) || !graph.has(file)) return;
    assert.ok(!pending.includes(file), pending.concat(file).map(file => relative(root, file)).join(' -> '));
    pending.push(file);
    for (const dep of graph.get(file)) if (dep.startsWith('.')) visit(resolve(dirname(file), dep));
    pending.pop(); complete.add(file);
  }
  for (const file of graph.keys()) visit(file);
});
