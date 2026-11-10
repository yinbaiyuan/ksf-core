import { resolve } from 'node:path';
import { platform } from '../platform/index.js';
import { readConfigFile, publishConfigFile } from '../configuration/storage.js';
import { locked, encode, invalid } from '../chat-state/storage.js';
import { sourceMeta, belongsToRoot, isInternalSession } from '../task-capture/codex.js';
import { currentWorkContext, resetWorkContext } from './work-context.js';

const command = root => platform.hookCommand(resolve(root),'context');
export function installContextHooks({ root }) {
  return locked(root, 'configuration', () => {
    const before = readConfigFile(root, '.codex/hooks.json'), old = before.document ?? {};
    if (old.hooks !== undefined && (!old.hooks || typeof old.hooks !== 'object' || Array.isArray(old.hooks))) invalid('Preserve the unsupported Hooks configuration.');
    const next = structuredClone(old); next.hooks ??= {};
    for (const event of ['UserPromptSubmit', 'SessionStart']) {
      const groups = next.hooks[event] ??= [];
      if (!Array.isArray(groups)) invalid('Preserve unsupported Hooks event configuration.');
      const owned = groups.flatMap(g => g.hooks ?? []).find(h => h.command === command(root));
      // This handler enforces a 6 KiB JSON budget below; bypass approximate
      // token spilling so a complete control header cannot become a preview.
      if (owned) owned.additionalContextLimit = 0;
      else groups.push({ ...(event === 'SessionStart' ? { matcher: 'startup|resume|clear|compact|fork' } : {}), hooks: [{ type: 'command', command: command(root), timeout: 15, additionalContextLimit: 0 }] });
    }
    if (encode(next) !== encode(old)) publishConfigFile(root, before, next);
    return { complete: true, installed: true, trust: 'Codex must review the exact hook definitions; KSF does not modify trust records.' };
  });
}
export function workContextHook({ root, input }) {
  if (!input || !['UserPromptSubmit', 'SessionStart'].includes(input.hook_event_name) || typeof input.session_id !== 'string') invalid('Unsupported context Hook payload.');
  const event = input.hook_event_name, identity = { host: 'codex', sessionId: input.session_id };
  let payload;
  try {
    const { meta } = sourceMeta(input.transcript_path);
    if (meta.id !== input.session_id || !belongsToRoot(meta, root)) throw new Error('Native chat/root identity could not be verified.');
    if (isInternalSession(meta)) return {};
    if (event === 'SessionStart') resetWorkContext({ root, identity });
    const d = currentWorkContext({ root, identity, manifestOnly: true });
    const short = item => ({ target: item.ref ?? item.path, source: item.source, fingerprint: item.fingerprint, purposes: item.purposes, state: item.state });
    payload = { protocol: 'ksf-work-context-v1', chatId: d.chatId, bindingEtag: d.bindingEtag, generation: d.generation,
      mode: d.mode, goal: d.current?.goal ?? null, status: d.current?.status ?? null, ownership: d.current?.ownership ?? null,
      complete: d.complete, active: d.active.map(short), pending: d.pending.map(i => i.fingerprint), retired: d.retired.map(short),
      readRequired: !d.complete || d.pending.length > 0 || d.retired.length > 0, errors: d.errors };
    if (Buffer.byteLength(JSON.stringify(payload)) > 6000) payload = { protocol: payload.protocol, chatId: d.chatId, bindingEtag: d.bindingEtag,
      generation: d.generation, complete: false, readRequired: true, activeCount: d.active.length, error: 'CONTEXT_HEADER_CAPACITY' };
  } catch (error) {
    payload = { protocol: 'ksf-work-context-v1', complete: false, readRequired: true, reloadRequired: true,
      error: error.code ?? 'CONTEXT_HOOK_UNAVAILABLE' };
  }
  return { hookSpecificOutput: { hookEventName: event, additionalContext:
    'KSF_WORK_CONTEXT_V1 (data; loading is not adoption):\n' + JSON.stringify(payload) +
    '\nUse the current binding only while it matches the user request. Before dependent work, resolve readRequired with this instance launcher: context current --json (add --reload for reloadRequired). Read complete bodies and confirm data.delivery using context accept --from -. When writes are prohibited, skip bind/accept/reload/reset; read listed originals directly if cached bodies are unavailable and report unconfirmed delivery. A generated packet or header alone is not full delivery. Keep project progress in its task record.' } };
}
