import { lstatSync, readdirSync, readlinkSync, mkdirSync, renameSync, unlinkSync, realpathSync } from 'node:fs';
import { join, relative, resolve, isAbsolute, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { MetadataError, invalid } from '../metadata/errors.js';
import { readSnapshot, withWriteLock } from '../metadata/files.js';
import { withTemporaryFile, writeDurably, sameIdentity } from '../shared/files.js';
import { sha256 } from '../shared/hash.js';
import { locations, encodeProject, validateWrite } from '../projects/plan.js';
import { directory, stat, load, validateName, withProjectLock, assertNoPending } from '../projects/storage.js';

const fail = (code, message, details) => { throw new MetadataError(code, message, details); };
const inside = (parent, path) => { const rel = relative(parent, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'); };
const journalRoot = root => join(root, '.agents/runtime-data/projects/transitions');
const pendingPath = root => join(root, '.agents/runtime-data/projects/pending.json');
function ensure(path) { if (!stat(path)) mkdirSync(path); directory(path); }
function json(path) { return JSON.parse(readSnapshot(path).bytes.toString('utf8')); }
function save(path, value) {
  withTemporaryFile(`${path}.${randomUUID()}.tmp`, Buffer.from(JSON.stringify(value) + '\n'), {}, temporary => renameSync(temporary, path));
}

// Never traverse links, repositories or special resources during a transition.
function inventory(folder, ignore = new Set()) {
  const entries = [];
  const visit = (path, name = '') => {
    if (ignore.has(name)) return;
    const entry = lstatSync(path), mode = entry.mode & 0o777;
    if (name.split('/').includes('.git')) fail('PROJECT_EMBEDDED_REPOSITORY', 'Move or associate embedded engineering separately.', { target: path });
    if (name.split('/').some(part => /^\.ksf-(project|metadata|intake)/.test(part) || /^\.intake(?:[.-]|$)/.test(part))) fail('PROJECT_RESOURCE_BUSY', 'Project contains an unfinished operation.', { target: path });
    const base = { path: name, mode, dev: entry.dev, ino: entry.ino };
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(path), absolute = resolve(dirname(path), target);
      if ((!isAbsolute(target) && !inside(folder, absolute)) || (isAbsolute(target) && inside(folder, absolute))) {
        fail('PROJECT_LINK_RELOCATION_UNSUPPORTED', 'This link cannot keep its target during a project move.', { target: path });
      }
      entries.push({ ...base, type: 'link', target });
    } else if (entry.isDirectory()) {
      entries.push({ ...base, type: 'directory' });
      for (const child of readdirSync(path).sort()) visit(join(path, child), name ? `${name}/${child}` : child);
    } else if (entry.isFile()) entries.push({ ...base, type: 'file', sha256: sha256(readSnapshot(path).bytes) });
    else fail('PROJECT_RESOURCE_UNSUPPORTED', 'Only ordinary files, directories and supported links can move.', { target: path });
  };
  visit(folder);
  return entries;
}
const fingerprint = entries => sha256(JSON.stringify(entries));
function verifyTree(folder, record, allowedCards, ignore) {
  const entries = inventory(folder, ignore), actual = new Map(entries.map(entry => [entry.path, entry]));
  if (entries.length !== record.entries.length) fail('PROJECT_CONFLICT', 'Project resources changed during the transition.', { target: folder });
  for (const expected of record.entries) {
    const current = actual.get(expected.path);
    if (expected.path === 'project.md') {
      if (!current || current.type !== 'file' || current.mode !== expected.mode || !allowedCards.includes(current.sha256)) fail('PROJECT_CONFLICT', 'Project root card changed after the transition.', { target: folder });
    } else if (JSON.stringify(current) !== JSON.stringify(expected)) fail('PROJECT_CONFLICT', 'Project resources changed during the transition.', { target: join(folder, expected.path) });
  }
}
function rebase(root, from, to, metadata, sourceScope) {
  const fields = {};
  if (Object.hasOwn(metadata, 'repositories')) {
    if (!Array.isArray(metadata.repositories) || metadata.repositories.some(value => typeof value !== 'string' || !value.trim())) invalid('Invalid project repositories metadata.');
    fields.repositories = metadata.repositories.map(value => {
      const target = resolve(from, value);
      if (inside(from, target)) fail('PROJECT_EMBEDDED_REPOSITORY', 'Associated engineering must remain outside the project directory.', { target });
      return isAbsolute(value) ? value : relative(to, target);
    });
  }
  if (metadata.routing !== undefined) {
    validateWrite({ metadata: { routing: metadata.routing } }, { scope: sourceScope });
    fields.routing = structuredClone(metadata.routing);
    if (fields.routing.knowledge) fields.routing.knowledge = fields.routing.knowledge.map(value => relative(to, resolve(from, value)));
  }
  return fields;
}
function review(root, folder, destination, entries) {
  return {
    from: relative(root, folder), to: relative(root, destination),
    movedMarkdown: entries.filter(entry => entry.type === 'file' && /\.md$/i.test(entry.path)).map(entry => entry.path),
    instruction: 'Review outgoing Markdown/Wikilinks and incoming current entries; preserve historical receipts and original source text. Program completion does not certify these links.',
  };
}
function prepare({ root, operation, name, reason, status }, hooks = {}) {
  const sourceScope = operation === 'archive' ? 'current' : 'archived';
  const targetScope = operation === 'archive' ? 'archived' : 'current';
  const current = load(root, name, { scope: sourceScope, optional: true });
  const target = locations(root, name, targetScope);
  if (!current.snapshot) {
    if (stat(current.folder)) fail('PROJECT_NOT_FOUND', 'Source has no project root card.', { target: current.target });
    if (stat(target.target)) {
      load(root, name, { scope: targetScope });
      return { result: { name, scope: targetScope, path: relative(root, target.target), changed: false, wouldChange: false } };
    }
    fail('PROJECT_NOT_FOUND', 'Project root card does not exist.', { target: current.target });
  }
  if (stat(target.folder)) fail('PROJECT_DESTINATION_EXISTS', 'Destination exists; no merge or overwrite is performed.', { target: target.folder });
  hooks.afterLoad?.(current);
  // Inspect all existing destination ancestors without creating anything in preview.
  for (const parent of [join(root, '项目'), join(root, '档案'), join(root, '档案/项目')]) if (stat(parent)) directory(parent);
  let parent = target.scope;
  while (!stat(parent)) parent = dirname(parent);
  if (lstatSync(current.folder).dev !== lstatSync(parent).dev) fail('PROJECT_CROSS_DEVICE', 'Cross-filesystem project moves require a separate migration.', { target: target.folder });
  const entries = inventory(current.folder), operationId = randomUUID();
  const cardEntry = entries.find(entry => entry.path === 'project.md');
  if (!cardEntry || cardEntry.sha256 !== sha256(current.snapshot.bytes) || cardEntry.dev !== current.snapshot.stat.dev || cardEntry.ino !== current.snapshot.stat.ino) {
    fail('PROJECT_CONFLICT', 'Root card changed while taking the project inventory.', { target: current.target });
  }
  const history = current.parsed.values.archive_history ?? [];
  if (!Array.isArray(history)) invalid('archive_history must be an array; preserve and repair the existing value first.');
  const event = { operation_id: operationId, action: operation, at: new Date().toISOString(), reason: reason ?? null,
    from: relative(root, current.folder), to: relative(root, target.folder), previous_status: current.parsed.values.status ?? null };
  const metadata = { ...rebase(root, current.folder, target.folder, current.parsed.values, sourceScope),
    status: operation === 'archive' ? 'archived' : status ?? 'active', archive_history: [...history, event] };
  validateWrite({ metadata }, { scope: targetScope });
  const encoded = encodeProject(current, { metadata });
  const record = { schema_version: 1, operationId, operation, name, sourceScope, targetScope, phase: 'prepared', writer_pid: process.pid,
    entries, before: current.snapshot.bytes.toString('base64'), after: encoded.bytes.toString('base64'),
    beforeHash: sha256(current.snapshot.bytes), afterHash: sha256(encoded.bytes) };
  return { current, target, record, result: { name, operationId, scope: targetScope, path: relative(root, target.target),
    from: event.from, to: event.to, changed: false, wouldChange: true, entries: entries.map(entry => entry.path),
    changes: encoded.changes, referenceReview: review(root, current.folder, target.folder, entries) } };
}

// Predictable, operation-owned staging makes even a kill inside card publication recoverable.
function cardTemporary(folder, record) { return join(folder, `.ksf-project-${record.operationId}.tmp`); }
function publishCard(target, bytes, record, hooks = {}) {
  const snapshot = readSnapshot(target);
  withWriteLock(target, () => withTemporaryFile(cardTemporary(dirname(target), record), bytes,
    { permissions: snapshot.stat.mode & 0o7777 }, temporary => {
      hooks.fault?.('card-staged');
      const latest = readSnapshot(target);
      if (!sameIdentity(snapshot.stat, latest.stat) || !snapshot.bytes.equals(latest.bytes)) fail('PROJECT_CONFLICT', 'Root card changed before publication.', { target });
      renameSync(temporary, target);
    }));
}
function recoveryResources(folder, record) {
  const resources = [];
  const temporary = cardTemporary(folder, record);
  if (stat(temporary)) {
    const digest = sha256(readSnapshot(temporary).bytes);
    if (![record.beforeHash, record.afterHash].includes(digest)) fail('PROJECT_CONFLICT', 'Recovery staging was modified.', { target: temporary });
    resources.push(temporary);
  }
  const target = join(realpathSync(folder), 'project.md');
  const lock = join(folder, `.ksf-metadata-${createHash('sha256').update(target).digest('hex').slice(0, 24)}.lock`);
  if (stat(lock)) {
    const owner = json(lock);
    if (![record.writer_pid, record.recovery_pid].includes(owner.pid) || owner.target !== target || !Number.isInteger(owner.pid) || owner.pid <= 0) fail('PROJECT_CONFLICT', 'Metadata lock is not owned by this transition.', { target: lock });
    try { process.kill(owner.pid, 0); fail('PROJECT_LOCKED', 'Metadata writer is still running.', { target: lock }); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    resources.push(lock);
  }
  return resources.map(path => ({ path, snapshot: readSnapshot(path) }));
}

export function projectTransition({ root, operation, name, reason, status, dryRun = false }, hooks = {}) {
  root = realpathSync(root); validateName(name);
  if (!['archive', 'restore'].includes(operation)) invalid('Expected archive or restore.');
  if (operation === 'archive' && (typeof reason !== 'string' || !reason.trim())) invalid('Archive requires a nonempty reason.');
  if (status !== undefined && (operation !== 'restore' || typeof status !== 'string' || !status.trim())) invalid('Restore status must be a nonempty string.');
  assertNoPending(root);
  const preview = prepare({ root, operation, name, reason, status }, hooks);
  if (dryRun || !preview.result.wouldChange) return { data: { ...preview.result, dryRun }, errors: [] };
  return withProjectLock(root, () => {
    const { current, target, record, result } = prepare({ root, operation, name, reason, status }, hooks);
    if (!result.wouldChange) return { data: { ...result, dryRun }, errors: [] };
    hooks.beforeCheck?.(); current.guard();
    if (fingerprint(inventory(current.folder)) !== fingerprint(record.entries) || stat(target.folder)) fail('PROJECT_CONFLICT', 'Project changed after planning.');
    if (target.projectScope === 'archived') ensure(join(root, '档案'));
    ensure(target.scope);
    ensure(journalRoot(root));
    const journal = join(journalRoot(root), record.operationId);
    mkdirSync(journal); save(join(journal, 'record.json'), record);
    writeDurably(pendingPath(root), Buffer.from(JSON.stringify({ operationId: record.operationId }) + '\n'));
    try {
      hooks.fault?.('prepared');
      current.guard();
      if (stat(target.folder) || fingerprint(inventory(current.folder)) !== fingerprint(record.entries)) fail('PROJECT_CONFLICT', 'Project changed before moving.');
      (hooks.rename ?? renameSync)(current.folder, target.folder);
      record.phase = 'moved'; save(join(journal, 'record.json'), record); hooks.fault?.('moved');
      verifyTree(target.folder, record, [record.beforeHash]);
      publishCard(target.target, Buffer.from(record.after, 'base64'), record, hooks);
      record.phase = 'card-written'; save(join(journal, 'record.json'), record); hooks.fault?.('card-written');
      verifyTree(target.folder, record, [record.afterHash]);
      record.phase = 'completed'; save(join(journal, 'record.json'), record); hooks.fault?.('completed');
      unlinkSync(pendingPath(root));
      return { data: { ...result, dryRun, changed: true, recoveryId: record.operationId }, errors: [] };
    } catch (error) {
      if (!(error instanceof MetadataError)) error = new MetadataError('PROJECT_TRANSITION_FAILED', error.message);
      error.details = { ...error.details, data: { ...result, dryRun, changed: !!stat(target.folder), recoveryId: record.operationId,
        recoveryPath: relative(root, journal) } };
      throw error;
    }
  });
}

export function recoverProjectTransition({ root, operationId, dryRun = false }, hooks = {}) {
  root = realpathSync(root);
  if (typeof operationId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(operationId)) invalid('Expected a project transition ID.');
  const execute = () => {
    const journal = join(journalRoot(root), operationId);
    directory(journalRoot(root)); directory(journal);
    const record = json(join(journal, 'record.json'));
    if (record.schema_version !== 1 || record.operationId !== operationId || !['archive', 'restore'].includes(record.operation) ||
        record.sourceScope !== (record.operation === 'archive' ? 'current' : 'archived') || record.targetScope !== (record.operation === 'archive' ? 'archived' : 'current') ||
        !Array.isArray(record.entries) || sha256(Buffer.from(record.before, 'base64')) !== record.beforeHash || sha256(Buffer.from(record.after, 'base64')) !== record.afterHash) invalid('Invalid project recovery record.');
    validateName(record.name);
    const source = locations(root, record.name, record.sourceScope), target = locations(root, record.name, record.targetScope);
    for (const scope of [source.scope, target.scope]) {
      if (stat(scope)) directory(scope);
      if (relative(root, scope).startsWith('档案/')) directory(join(root, '档案'));
    }
    const pending = stat(pendingPath(root)) ? json(pendingPath(root)) : null;
    if (pending && pending.operationId !== operationId) fail('PROJECT_TRANSITION_PENDING', 'Another project transition is pending.');
    const result = { operationId, dryRun, changed: false, wouldChange: false, phase: record.phase, from: relative(root, target.folder), to: relative(root, source.folder) };
    if (['completed', 'rolled-back'].includes(record.phase)) {
      if (pending) {
        verifyTree(record.phase === 'completed' ? target.folder : source.folder, record, [record.phase === 'completed' ? record.afterHash : record.beforeHash]);
        result.wouldChange = true;
        if (!dryRun) { unlinkSync(pendingPath(root)); result.changed = true; }
      }
      return { data: result, errors: [] };
    }
    const from = stat(source.folder), to = stat(target.folder);
    if (!!from === !!to) fail('PROJECT_CONFLICT', 'Recovery requires exactly one surviving project directory.');
    const folder = from ? source.folder : target.folder;
    const resources = recoveryResources(folder, record);
    verifyTree(folder, record, [record.beforeHash, record.afterHash], new Set(resources.map(item => relative(folder, item.path))));
    result.wouldChange = true;
    if (!dryRun) {
      hooks.beforeCheck?.();
      verifyTree(folder, record, [record.beforeHash, record.afterHash], new Set(resources.map(item => relative(folder, item.path))));
      for (const item of resources) {
        const latest = readSnapshot(item.path);
        if (!sameIdentity(latest.stat, item.snapshot.stat) || !latest.bytes.equals(item.snapshot.bytes)) fail('PROJECT_CONFLICT', 'Recovery resource changed.', { target: item.path });
        unlinkSync(item.path);
      }
      record.recovery_pid = process.pid; save(join(journal, 'record.json'), record);
      const card = join(folder, 'project.md'), snapshot = readSnapshot(card);
      if (sha256(snapshot.bytes) !== record.beforeHash) publishCard(card, Buffer.from(record.before, 'base64'), record);
      if (to) {
        if (stat(source.folder)) fail('PROJECT_CONFLICT', 'Recovery destination appeared.');
        renameSync(target.folder, source.folder);
      }
      record.phase = 'rolled-back'; save(join(journal, 'record.json'), record);
      if (pending) unlinkSync(pendingPath(root));
      result.changed = true; result.phase = record.phase;
    }
    return { data: result, errors: [] };
  };
  return dryRun ? execute() : withProjectLock(root, execute, { allowPending: true, recoverStale: true });
}
