import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { posix } from 'node:path';
import { managedPath } from './storage.js';
import { targetRegistry } from './target-registry.js';
import { targetKey, physicalTargetKey } from './target-identity.js';
import { encode, validateBindings } from './schema.js';
import { catalog, summary } from '../objects/catalog.js';
import { resolveObject } from '../objects/references.js';
import { parseReference } from '../objects/schema.js';
import { currentObjectId } from '../objects/legacy.js';
import { project } from '../services/projects.js';
import { fail } from './schema.js';
import { ownershipOf, relatedOf, projectProjection, resolveKnowledge } from './targets.js';

export function definitionContext(root) {
  let definitions;
  return { root, catalog() { return definitions ??= catalog(root); } };
}
function projectTarget(context, input) {
  const result = project({ root: context.root, operation: 'read', ...input, part: 'metadata' });
  return { name: input.name, scope: input.scope, path: result.data.project.path };
}
export const registryFor = context => context.registry ??= targetRegistry(context.root);
export function targetLocator(t, current = false) {
  if (t.kind === 'project') return { kind: t.kind, name: t.name, scope: t.scope };
  if (t.kind === 'ability') return { kind: t.kind, ref: current ? currentObjectId(t.id) : t.ref, source: t.source };
  return { kind: t.kind, path: t.path };
}
export function resolveExistingTarget(context, input) {
  if (input.kind === 'knowledge') return { ...resolveKnowledge(context, input), lifecycle: 'existing' };
  if (input.kind === 'project') return { kind: 'project', ...projectTarget(context, input), lifecycle: 'existing' };
  if (input.kind === 'ability') {
    const row = resolveObject(context.catalog(), parseReference(input.ref), input.source), item = summary(row);
    return { kind: 'ability', id: item.id, name: item.name, ref: `${item.id}@${item.version}`, version: item.version,
      source: item.source, userRevision: item.user_revision, path: item.path, definitionDigest: row.digest, lifecycle: 'existing' };
  }
  const path = managedPath(context.root, input.path), entry = lstatSync(path);
  if (!entry.isFile() && !entry.isDirectory()) fail('ROUTE_ARCHIVE_INVALID', 'Archive target must be an ordinary file or directory.');
  return { kind: 'archive', path: input.path, name: posix.basename(input.path), entryType: entry.isDirectory() ? 'directory' : 'file', lifecycle: 'existing' };
}
export function verifyTargetSnapshot(context, target) {
  const actual = resolveExistingTarget(context, targetLocator(target));
  const original = { ...target }; delete original.targetId; delete original.targetVersion;
  if (encode(actual) !== encode(original)) fail('TARGET_SOURCE_CHANGED', 'Target source changed before capture; reconcile and declare a new event.');
}
export function prepareBindings(context, bindings = []) {
  validateBindings(bindings);
  context.targetChanges ??= new Map();
  for (const b of bindings) {
    const registry = registryFor(context), prior = registry.records.get(b.targetId);
    if (!prior || prior.targetVersion !== b.ifMatch) fail('TARGET_CONFLICT', 'Read the stable target and supply its current version.');
    if (prior.lifecycle !== 'planned' || prior.kind !== b.target.kind) fail('TARGET_BINDING_INVALID', 'Only a planned target can bind to an existing target of the same kind.');
    const resolved = resolveExistingTarget(context, b.target), physical = physicalTargetKey(resolved);
    if (registry.aliases.has(physical) && registry.aliases.get(physical) !== b.targetId) fail('TARGET_ALIAS_CONFLICT', 'The exact target is already bound to another identity.');
    context.targetChanges.set(b.targetId, { targetId: b.targetId, ifMatch: b.ifMatch, target: { ...resolved, targetId: b.targetId, targetVersion: b.ifMatch + 1 } });
  }
}
function target(context, input, slot) {
  context.targetChanges ??= new Map();
  if (input.targetId) {
    const prior = context.targetChanges.get(input.targetId)?.target ?? registryFor(context).records.get(input.targetId);
    if (!prior || prior.kind !== input.kind) fail('TARGET_NOT_FOUND', 'Stable target identity is missing or has another kind.');
    if (prior.lifecycle === 'planned') return { ...prior };
    return { ...resolveExistingTarget(context, targetLocator(prior, true)), targetId: prior.targetId, targetVersion: prior.targetVersion };
  }
  if (input.lifecycle === 'planned') {
    if (!context.targetSeed) fail('TARGET_DECLARATION_REQUIRED', 'A new planned target needs an event-scoped declaration.');
    const targetId = createHash('sha256').update(JSON.stringify([context.targetSeed, slot, input.kind])).digest('hex');
    const value = { kind: input.kind, name: input.name, lifecycle: 'planned', targetId, targetVersion: 1 };
    context.targetChanges.set(targetId, { targetId, ifMatch: 'missing', target: value }); return value;
  }
  const resolved = resolveExistingTarget(context, input), registry = registryFor(context), alias = registry.aliases.get(physicalTargetKey(resolved));
  if (registry.aliases.has(physicalTargetKey(resolved)) && !alias) fail('TARGET_ALIAS_CONFLICT', 'Target identity is ambiguous.');
  const bound = alias ? registry.records.get(alias) : null;
  return bound ? { ...resolved, targetId: bound.targetId, targetVersion: bound.targetVersion } : resolved;
}
export function resolveReport(context, report) {
  const ownership = ownershipOf(report), related = relatedOf(report);
  const resolvedOwnership = ownership.state === 'bound' ? { state: 'bound', target: target(context, ownership.target, 'primary') } : ownership;
  const relatedTargets = related.map((p, i) => target(context, p, `related:${i}`));
  const all = [...(resolvedOwnership.target ? [resolvedOwnership.target] : []), ...relatedTargets], keys = all.map(targetKey);
  if (new Set(keys).size !== keys.length) fail('INVALID_ARGUMENTS', 'Primary and related targets resolve to the same identity.');
  for (const id of context.targetChanges.keys()) if (!all.some(t => t.targetId === id)) fail('TARGET_BINDING_UNUSED', 'A target binding must be explicitly present in this arrangement.');
  return {
    summary: report.summary, status: report.status,
    ownership: resolvedOwnership, relatedTargets, ...projectProjection(resolvedOwnership, relatedTargets),
    abilities: report.abilities.map(input => {
      const row = resolveObject(context.catalog(), parseReference(input.ref), input.source);
      if (row.metadata.status === 'archived') fail('ROUTE_ABILITY_ARCHIVED', 'Archived abilities cannot be reported as a current arrangement.');
      if (input.definitionDigest !== undefined && input.definitionDigest !== row.digest) fail('ROUTE_DEFINITION_CHANGED', 'The reported definition changed; read and reconcile it before reporting.', { ref: input.ref });
      const item = summary(row);
      return { id: item.id, ref: input.ref, name: item.name, version: item.version, userRevision: item.user_revision,
        source: item.source, path: item.path, definitionDigest: row.digest, stage: input.stage, fixed: item.protected };
    }),
  };
}
export function decorateRecord(context, document) {
  const checkTarget = value => {
    const registry = registryFor(context), currentBinding = value.targetId ? registry.records.get(value.targetId) : null;
    const binding = currentBinding && currentBinding.targetVersion > value.targetVersion ? { currentBinding: checkTarget(currentBinding) } : {};
    if (value.lifecycle === 'planned') return { ...value, ...binding, freshness: 'planned' };
    try {
      const locator = targetLocator(value, true);
      if (locator.kind === 'ability') locator.ref = currentObjectId(locator.ref);
      const actual = resolveExistingTarget(context, locator);
      return { ...value, ...binding, ...(value.kind === 'ability' && actual.id !== value.id ? { currentIdentity: { id: actual.id, ref: actual.ref, path: actual.path } } : {}), freshness: actual.path === value.path && (value.kind !== 'archive' || actual.entryType === value.entryType) && (value.kind !== 'ability' || actual.definitionDigest === value.definitionDigest && actual.version === value.version) ? 'current' : 'changed' };
    } catch (error) { return { ...value, ...binding, freshness: 'unavailable', error: { code: error.code ?? 'TARGET_READ_FAILED', message: 'Recorded target entry is unavailable.' } }; }
  };
  const current = document.current;
  const ownership = ownershipOf(current), relatedTargets = relatedOf(current).map(checkTarget);
  const checkedOwnership = ownership.state === 'bound' ? { state: 'bound', target: checkTarget(ownership.target) } : ownership;
  return { protocol: document.protocol, sessionKey: document.sessionKey, host: document.host,
    ...(document.archive ? { archive: document.archive, turnId: document.turnId } : {}),
    revision: document.revision, roundId: document.roundId, updatedAt: document.updatedAt, historyDropped: document.historyDropped,
    current: { ...current,
      ownership: checkedOwnership, relatedTargets, ...projectProjection(checkedOwnership, relatedTargets),
      abilities: current.abilities.map(a => {
        try {
          const currentId = currentObjectId(a.id);
          const row = resolveObject(context.catalog(), { id: currentId }, a.source);
          let effectiveChanged = null;
          try {
            const effective = resolveObject(context.catalog(), { id: currentId });
            effectiveChanged = effective.path !== a.path || effective.source !== a.source;
          } catch { /* Pinned source freshness is independent of effective-source ambiguity. */ }
          return { ...a, ...(currentId !== a.id ? { currentIdentity: { id: currentId, ref: `${currentId}@${row.metadata.version}`, path: row.path } } : {}), freshness: row.digest === a.definitionDigest && row.path === a.path && row.metadata.status !== 'archived' ? 'current' : 'changed',
            effectiveChanged };
        } catch (error) { return { ...a, freshness: 'unavailable', error: { code: error.code ?? 'OBJECT_READ_FAILED', message: 'Ability definition is unavailable.' } }; }
      }),
    },
    history: document.history,
  };
}
