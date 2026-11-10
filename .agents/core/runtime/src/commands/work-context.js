import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOptions, optionSpecs } from '../shared/options.js';
import { invalid } from '../chat-state/storage.js';
import { readCurrentWork, bindCurrentWork, currentWorkContext, acceptWorkContext, resetWorkContext } from '../services/work-context.js';
import { installContextHooks, workContextHook } from '../services/context-hook.js';

export const workContextOperations = ['work', 'bind', 'current', 'accept', 'hook', 'hooks'];
export const workContextHelp = () => `KSF work context\n\n` +
  `  ksf context work --json\n` +
  `  ksf context bind (--data <JSON|null> | --from -|file) --if-match <etag|missing> [--turn <nativeTurnId>] --json\n` +
  `  ksf context current [--manifest] [--reload] [--extras <JSON array>] --json\n` +
  `  ksf context accept (--data <delivery JSON> | --from -|file) --json\n` +
  `  ksf context hooks --json\n\n` +
  `Identity comes from CODEX_THREAD_ID. Binding and cache do not create native turns.\n` +
  `Read all returned bodies before accepting data.delivery. Missing confirmation causes safe rereads.\n` +
  `Extras are turn-local exact {ref,source} locators; they never update the binding.\n` +
  `For read-only work, omit bind/accept/reload/hooks; read listed originals directly if cached bodies are unavailable.\n`;
async function input(root, p, supplied) {
  if (supplied !== undefined) return supplied;
  let bytes;
  if (p.data !== undefined) bytes = Buffer.from(p.data);
  else if (p.from && p.from !== '-') bytes = readFileSync(resolve(root, p.from));
  else { if (process.stdin.isTTY) invalid('Supply JSON on stdin.'); const chunks = []; let length = 0; for await (const chunk of process.stdin) { length += chunk.length; if (length > 1024 * 1024) invalid('Context input exceeds 1 MiB.'); chunks.push(chunk); } bytes = Buffer.concat(chunks); }
  if (bytes.length > 1024 * 1024) invalid('Context input exceeds 1 MiB.');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { invalid('Context input must be UTF-8 JSON.'); }
}
export async function runWorkContextCommand(args, root, { env = process.env, stdin } = {}) {
  const operation = args[0], result = { ok: false, command: 'context', operation, data: null, errors: [] };
  try {
    const p = {}, names = { work: [], bind: ['data', 'from', 'if-match', 'turn'], current: ['manifest', 'reload', 'extras'], accept: ['data', 'from'], hook: [], hooks: [] }[operation];
    const seen = parseOptions(args.slice(1), { result: p, options: optionSpecs([...names, 'json', 'help'], {
      from: { kind: 'value', allowDash: true }, manifest: { kind: 'flag' }, reload: { kind: 'flag' },
    }), invalid, target() { invalid('Context does not accept positional targets.'); } });
    if (p.help) { if (seen.size !== 1) invalid('Use --help alone.'); return { stdout: workContextHelp(), exitCode: 0 }; }
    if (['bind', 'accept'].includes(operation) && Number(p.data !== undefined) + Number(p.from !== undefined) !== 1) invalid('Choose exactly one of --data or --from.');
    const options = { root, env };
    if (operation === 'hook') return { stdout: JSON.stringify(workContextHook({ root, input: await input(root, p, stdin) })) + '\n', exitCode: 0 };
    if (operation === 'hooks') result.data = installContextHooks(options);
    if (operation === 'work') result.data = readCurrentWork(options);
    if (operation === 'bind') result.data = bindCurrentWork({ ...options, current: await input(root, p, stdin), ifMatch: p.ifMatch, turnId: p.turn });
    if (operation === 'current') {
      const extras = p.extras === undefined ? undefined : await input(root, { data: p.extras });
      if (p.reload) resetWorkContext(options);
      result.data = currentWorkContext({ ...options, manifestOnly: p.manifest, extras });
    }
    if (operation === 'accept') result.data = acceptWorkContext({ ...options, delivery: await input(root, p, stdin) });
    result.errors = result.data.errors ?? []; result.ok = result.data.complete && !result.errors.length;
    return { stdout: JSON.stringify(result, null, p.json ? undefined : 2) + '\n', exitCode: result.ok ? 0 : 1 };
  } catch (error) {
    result.errors = [{ code: error.code ?? 'CONTEXT_OPERATION_FAILED', message: error.code ? error.message : 'Context operation failed.', ...error.details }];
    return { stdout: JSON.stringify(result) + '\n', exitCode: error.exitCode ?? 1 };
  }
}
