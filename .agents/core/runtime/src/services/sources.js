import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import YAML from '../vendor/yaml/dist/index.js';
import { repository } from './repositories.js';
import { writeUserData } from './user-data.js';
import { catalog, summary } from '../objects/catalog.js';
import { problems, referenceResults } from '../objects/references.js';
import { types } from '../objects/schema.js';
import { readTree, writeDurably } from '../objects/storage.js';
import { ordinaryDirectory, readDeclaration, readSourceRegistry, within } from '../sources/storage.js';
import { declarationFile, validateDeclaration, sourceFailure } from '../sources/schema.js';
import { exportObjects } from '../sources/export.js';

export function sourceCatalog(root, declaration) {
  return catalog(root, { linked: false, extraSources: [{ id: declaration.id, root: declaration.root }] });
}
export function inspectSource(root, path, expectedId) {
  const target = ordinaryDirectory(path);
  if (within(root, target) && dirname(target) !== join(root, 'repositories')) sourceFailure('SOURCE_PATH_INVALID', 'Inside a KSF instance, sources must be direct children of the ignored repositories container.', { target });
  const checked = repository({ root, operation: 'check', target });
  if (checked.errors.length) sourceFailure('SOURCE_REPOSITORY_INVALID', 'Source must be an independent Git working-tree root.', { target, errors: checked.errors });
  const declaration = readDeclaration(target, expectedId);
  const c = sourceCatalog(root, declaration), errors = problems(c, { source: declaration.id });
  const rows = c.rows.filter(row => row.source === declaration.id);
  for (const row of rows.filter(row => !row.errors.length)) {
    try {
      const tree = readTree(row.directory);
      if ([...tree.directories, ...tree.files].some(item => item.path.split('/').some(part => ['.git', '.upstream'].includes(part)))) sourceFailure('SOURCE_RESOURCE_INVALID', 'Published objects cannot include Git history or personal baselines.', { id: row.id });
    } catch (error) { errors.push({ code: error.code ?? 'SOURCE_RESOURCE_INVALID', message: error.message, target: row.path }); }
    if (row.metadata.status !== 'archived') errors.push(...referenceResults(c, row).filter(ref => ref.error).map(ref => ref.error));
  }
  return { declaration, catalog: c, errors, data: { id: declaration.id, name: declaration.name,
    ...(declaration.description !== undefined ? { description: declaration.description } : {}),
    path: target, branch: checked.data.repositories[0].branch, schemaVersion: 1, valid: errors.length === 0,
    objects: rows.filter(row => !row.errors.length).map(summary) } };
}

export function abilitySource({ root, operation, target, reference, id, name, description, versions, dryRun = false }, hooks = {}) {
  if (!['init', 'link', 'unlink', 'list', 'read', 'check', 'export'].includes(operation) || typeof dryRun !== 'boolean') sourceFailure('INVALID_ARGUMENTS', 'Invalid ability-source operation.', { exitCode: 2 });
  root = realpathSync(root);
  if (operation === 'init') {
    const path = ordinaryDirectory(resolve(root, target));
    const checked = repository({ root, operation: 'check', target: path });
    if (checked.errors.length) sourceFailure('SOURCE_REPOSITORY_INVALID', 'Initialize or clone an independent Git repository first.', { errors: checked.errors });
    const declaration = validateDeclaration({ kind: 'ksf-ability-source', schema_version: 1, id, name, ...(description !== undefined ? { description } : {}) });
    const file = join(path, declarationFile);
    if (existsSync(file)) {
      const current = readDeclaration(path);
      if (current.id !== id || current.name !== name) sourceFailure('SOURCE_EXISTS', 'Existing source declaration was preserved.', { target: file });
      return { data: { id, path, dryRun, changed: false, wouldChange: false }, errors: [] };
    }
    const files = [declarationFile, 'AGENTS.md', 'README.md', ...Object.values(types).map(type => type.user + '/.gitkeep')].filter(file => !existsSync(join(path, file)));
    if (existsSync(join(path, '能力'))) ordinaryDirectory(join(path, '能力'));
    for (const type of Object.values(types)) if (existsSync(join(path, type.user))) ordinaryDirectory(join(path, type.user));
    if (!dryRun) {
      // Exclusive writes preserve existing files even when another editor wins.
      for (const type of Object.values(types)) mkdirSync(join(path, type.user), { recursive: true });
      for (const file of files) {
        const text = file === declarationFile ? YAML.stringify(declaration) : file === 'AGENTS.md'
          ? '# KSF 能力源协作规则\n\n本仓库遵循 ksf-source.yaml 声明的 KSF 能力源协议。能力保存在 能力/ 下，一个对象一个完整 ID 目录；维护对象版本和精确引用。\n\n本仓库不是 KSF 工作区，校验使用调用方已确认的 KSF 根下的 `.agents/ksf source check --path <本仓库>`。根 AGENTS.md 仅为仓库协作说明，不作为工作流。\n\n编辑前读取现有对象与 Git 差异，保留已有修改。贡献仅提交选定对象及依赖；推送、PR 和合并按用户请求及仓库权限执行。源内依赖只由本源和 Core 满足，公开内容不携带个人修订字段、个人派生基线或其他仓库历史。\n'
          : file === 'README.md' ? `# ${name}\n\nKSF 能力源。先克隆本仓库，再使用已确认的 KSF 入口执行 source link <本仓库路径>。直接读取当前工作树；更新、贡献和回退使用普通 Git 流程。访问权限由仓库管理。\n` : '';
        writeDurably(join(path, file), text, { exclusive: true });
      }
    }
    return { data: { id, path, dryRun, changed: !dryRun, wouldChange: true, files }, errors: [] };
  }
  if (operation === 'check' && reference) {
    const checked = inspectSource(root, resolve(root, reference));
    return { data: checked.data, errors: checked.errors };
  }
  const registry = readSourceRegistry(root);
  if (operation === 'unlink') {
    const entries = registry.entries.filter(entry => entry.id !== target);
    if (entries.length === registry.entries.length) return { data: { id: target, dryRun, changed: false, wouldChange: false, repositoryPreserved: true }, errors: [] };
    const updated = writeUserData({ root, namespace: 'sources', values: { entries }, ifMatch: registry.etag, dryRun, beforePublish: hooks.beforePublish });
    return { data: { id: target, dryRun, changed: updated.changed, wouldChange: updated.wouldChange, repositoryPreserved: true }, errors: [] };
  }
  if (operation === 'link') {
    const checked = inspectSource(root, resolve(root, target));
    if (checked.errors.length) sourceFailure('SOURCE_INVALID', 'Source validation failed; association was not changed.', { errors: checked.errors });
    const { declaration } = checked;
    const existing = registry.entries.find(entry => entry.id === declaration.id || resolve(root, entry.path) === declaration.root);
    if (existing && (existing.id !== declaration.id || resolve(root, existing.path) !== declaration.root)) sourceFailure('SOURCE_ID_CONFLICT', 'Source identity or directory is already associated; explicitly unlink before replacing.', { id: declaration.id });
    const entries = existing ? registry.entries : [...registry.entries, { id: declaration.id, path: within(root, declaration.root) ? relative(root, declaration.root).split('\\').join('/') : declaration.root }];
    const updated = writeUserData({ root, namespace: 'sources', values: { entries }, ifMatch: registry.etag, dryRun, beforePublish: hooks.beforePublish });
    return { data: { ...checked.data, dryRun, changed: updated.changed, wouldChange: updated.wouldChange }, errors: [] };
  }
  if (operation === 'export') return exportObjects({ root, sourceId: target, reference, versions, dryRun }, hooks);
  const selected = target === undefined ? registry.entries : registry.entries.filter(entry => entry.id === target);
  if (target !== undefined && !selected.length) sourceFailure('SOURCE_NOT_FOUND', 'Ability source is not linked.', { id: target });
  const sources = [], errors = [];
  for (const entry of selected) {
    try {
      const checked = inspectSource(root, resolve(root, entry.path), entry.id);
      sources.push(checked.data); errors.push(...checked.errors.map(error => ({ ...error, source: entry.id })));
    } catch (error) { sources.push({ id: entry.id, path: resolve(root, entry.path), valid: false }); errors.push({ code: error.code ?? 'SOURCE_UNREADABLE', message: error.message, ...error.details, source: entry.id }); }
  }
  return { data: operation === 'read' ? sources[0] : { complete: errors.length === 0, valid: errors.length === 0, sources }, errors };
}
