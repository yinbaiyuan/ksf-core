import { lstatSync } from 'node:fs';
import { posix } from 'node:path';
import { managedPath } from './storage.js';
import { fail } from './schema.js';
import { knowledgeLinks } from '../services/knowledge-organize.js';
import { readFileSnapshot, sameIdentity } from '../shared/files.js';

export { targetKey, targetLabel } from './target-identity.js';
export const ownershipOf = route => route.ownership ?? (route.project.state === 'bound'
  ? { state: 'bound', target: { kind: 'project', ...route.project.primary } } : { state: route.project.state });
export const relatedOf = route => route.relatedTargets ?? (route.references ?? []).map(p => ({ kind: 'project', ...p }));
export function projectProjection(ownership, related) {
  const target = ownership.target, project = t => ({ name: t.name, scope: t.scope, path: t.path, ...(t.freshness ? { freshness: t.freshness } : {}), ...(t.error ? { error: t.error } : {}) });
  return { project: ownership.state === 'bound' && target.kind === 'project' && target.lifecycle !== 'planned'
    ? { state: 'bound', primary: project(target) } : { state: ownership.state === 'bound' ? 'none' : ownership.state },
  references: related.filter(t => t.kind === 'project' && t.lifecycle !== 'planned').map(project) };
}
function readEntry(root, path) {
  const target = managedPath(root, path), entry = lstatSync(target);
  const conflict = () => fail('ROUTE_KNOWLEDGE_CHANGED', 'Knowledge entry changed while reading; retry.');
  if (!entry.isFile() || entry.size > 4 * 1024 * 1024) fail('ROUTE_KNOWLEDGE_INVALID', 'Knowledge entry must be a bounded ordinary Markdown file.');
  const { bytes } = readFileSnapshot(target, { entry,
    validateOpen(a, b) { if (!sameIdentity(a, b) || !b.isFile()) conflict(); },
    validateRead(a, b, bytes) { if (!sameIdentity(a, b) || bytes.length > 4 * 1024 * 1024) conflict(); },
  });
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('ROUTE_KNOWLEDGE_INVALID', 'Knowledge entry must be UTF-8 Markdown.'); }
}
export function knowledgeEntries(root) {
  const entries = new Set();
  for (const link of knowledgeLinks(readEntry(root, '知识/knowledge.md'))) {
    if (!link.target || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(link.target)) continue;
    let value;
    try { value = decodeURIComponent(link.target.split('#')[0].split('?')[0]); } catch { continue; }
    if (/[\\\x00-\x1f]/.test(value)) continue;
    const path = posix.normalize(link.kind === 'wiki' && value.startsWith('知识/') ? value : posix.join('知识', value));
    const parts = path.split('/');
    if (parts[0] !== '知识' || parts.length < 3 || parts.some(p => p.startsWith('.') || ['rules', 'templates', '_cache', '_working', 'node_modules'].includes(p)) || !/\.md$/i.test(path)) continue;
    entries.add(path);
  }
  return entries;
}
export function resolveKnowledge(context, input) {
  const entries = context.knowledgeEntries ??= knowledgeEntries(context.root);
  if (!entries.has(input.path)) fail('ROUTE_KNOWLEDGE_ENTRY_REQUIRED', 'Knowledge target must use a unit entry explicitly linked by 知识/knowledge.md.', { path: input.path });
  readEntry(context.root, input.path);
  return { kind: 'knowledge', name: posix.basename(posix.dirname(input.path)), path: input.path };
}
