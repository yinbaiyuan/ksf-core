import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { readSnapshot } from '../metadata/files.js';
import { parseFrontmatter } from '../metadata/frontmatter.js';
import { snapshot } from '../user-data/storage.js';
import { declarationFile, validateDeclaration, sourceFailure } from './schema.js';

export const within = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep); };
export function ordinaryDirectory(path) {
  const selected = resolve(path), entry = lstatSync(selected);
  if (!entry.isDirectory() || entry.isSymbolicLink()) sourceFailure('SOURCE_PATH_INVALID', 'Source paths must use ordinary directories.', { target: selected });
  // Canonicalize explicitly selected ancestors (including macOS /var and /tmp).
  // The selected directory itself and all subsequently scanned components may
  // not be links.
  const absolute = realpathSync(selected);
  let current = absolute;
  while (true) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) sourceFailure('SOURCE_PATH_INVALID', 'Source paths must use ordinary directories.', { target: current });
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return realpathSync(absolute);
}
export function readDeclaration(path, expectedId) {
  const root = ordinaryDirectory(path), file = join(root, declarationFile);
  if (!existsSync(file)) sourceFailure('SOURCE_NOT_DECLARED', 'Repository is missing ksf-source.yaml.', { target: file });
  const record = readSnapshot(file);
  // Reuse the strict YAML parser, including duplicate-key and tag checks.
  const parsed = parseFrontmatter(Buffer.concat([Buffer.from('---\n'), record.bytes, Buffer.from('\n---\n')]), file);
  if (parsed.body.length) sourceFailure('SOURCE_DECLARATION_INVALID', 'Expected one YAML declaration, without additional documents or body.', { target: file });
  const declaration = validateDeclaration(parsed.values);
  if (expectedId !== undefined && declaration.id !== expectedId) sourceFailure('SOURCE_ID_CHANGED', 'Source identity changed; explicitly relink the repository.', { expected: expectedId, actual: declaration.id, target: file });
  const abilities = join(root, '能力');
  ordinaryDirectory(abilities);
  return { ...declaration, root, declarationSnapshot: record };
}
export function readSourceRegistry(root) {
  const record = snapshot(root, 'sources');
  return { ...record, entries: record.document?.values.entries ?? [] };
}
export function configuredSources(root) {
  return readSourceRegistry(root).entries.map(entry => ({ ...entry, root: resolve(root, entry.path) }));
}
