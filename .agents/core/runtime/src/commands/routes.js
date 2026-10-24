import { openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { mutateRoute, readRoute, listRoutes } from '../services/routes.js';
import { INPUT_LIMIT, invalid, keys, isKey } from '../routing/schema.js';

const operations = ['start', 'write', 'read', 'list'];
export function routeHelp() {
  return `KSF route\n\nUsage:\n` +
    `  ksf route start --from - --if-match <missing|revision> [--no-save] [--json]\n` +
    `  ksf route write --from - --if-match <revision> [--no-save] [--json]\n` +
    `  ksf route read [--session <sessionKey> | --from -] [--json]\n` +
    `  ksf route list [--limit <1-100>] [--offset <number>] [--json]\n\n` +
    `--from accepts '-' (bounded stdin) or a UTF-8 JSON file relative to this KSF root.\n` +
    `start/write input: {eventId, roundId? (write only), report, identity?}.\n` +
    `report: {summary, status, project:{state,primary?}, references:[], abilities:[]}.\n` +
    `Project targets: {name,scope:"current"|"archived"}; state: bound|none|unresolved.\n` +
    `Abilities: {ref:"type.namespace.name@version", source, stage, definitionDigest?}.\n` +
    `Read/adopted stages require definitionDigest from object read's definition_digest.\n` +
    `Statuses: preparing|working|waiting|blocked|completed|paused|cancelled.\n` +
    `Identity defaults to CODEX_THREAD_ID; other hosts use stdin {identity:{host,sessionId}}.\n` +
    `Raw native session IDs are never accepted in argv or saved to records.\n` +
    `Updates are full snapshots. start returns accepted.roundId; use record.revision for the next write.\n` +
    `--no-save or KSF_ROUTE_NO_SAVE=1 suppresses writes; settings.routing.enabled defaults to true.\n` +
    `read/list never create routing files. The records are Agent reports, not host live status.\n`;
}
async function input(root, from, supplied) {
  if (supplied !== undefined) return supplied;
  if (from === '-') {
    if (process.stdin.isTTY) invalid('Supply UTF-8 JSON on stdin.');
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > INPUT_LIMIT) invalid('Route input exceeds 64 KiB.');
      chunks.push(chunk);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)).replace(/^\uFEFF/, '')); }
    catch { invalid('Input must be UTF-8 JSON.'); }
  }
  let fd, own = false;
  try {
    fd = openSync(resolve(root, from), 'r'); own = true;
    if (own && (!fstatSync(fd).isFile() || fstatSync(fd).size > INPUT_LIMIT)) invalid('Input must be a JSON file no larger than 64 KiB.');
    const value = Buffer.alloc(INPUT_LIMIT + 1); let count = 0;
    while (count < value.length) {
      const read = readSync(fd, value, count, value.length - count, null);
      if (!read) break;
      count += read;
    }
    if (count > INPUT_LIMIT) invalid('Route input exceeds 64 KiB.');
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value.subarray(0, count)).replace(/^\uFEFF/, '')); }
    catch { invalid('Input must be UTF-8 JSON.'); }
  } finally { if (own && fd !== undefined) closeSync(fd); }
}
export async function runRouteCommand(args, root, { stdin, env = process.env, beforePublish } = {}) {
  const json = hasJsonFlag(args), response = { ok: false, command: 'route', operation: operations.includes(args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode = 0;
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { stdout: routeHelp(), exitCode: 0 };
    const [operation, ...rest] = args;
    if (!operations.includes(operation)) invalid('Expected route start, write, read or list.');
    const p = {};
    const names = ['start', 'write'].includes(operation) ? ['from', 'if-match', 'no-save', 'json', 'help'] : operation === 'read' ? ['session', 'from', 'json', 'help'] : ['limit', 'offset', 'json', 'help'];
    const seen = parseOptions(rest, { result: p, options: optionSpecs(names, { 'no-save': { kind: 'flag' }, from: { kind: 'value', allowDash: true } }), invalid,
      target() { invalid('route does not accept positional arguments.'); } });
    if (p.help) {
      if (seen.size !== 1) invalid('Use --help alone.');
      return { stdout: routeHelp(), exitCode: 0 };
    }
    if (['start', 'write'].includes(operation)) {
      if (!p.from || p.ifMatch === undefined || (p.ifMatch !== 'missing' && !/^[1-9][0-9]*$/.test(p.ifMatch))) invalid('Supply --from and --if-match missing or a positive revision.');
      response.data = mutateRoute({ root, operation, input: await input(root, p.from, stdin), ifMatch: p.ifMatch === 'missing' ? 'missing' : Number(p.ifMatch), noSave: p.noSave ?? false, env }, { beforePublish });
    } else if (operation === 'read') {
      if (p.session !== undefined && (p.from !== undefined || !isKey(p.session))) invalid('Use --session <sessionKey> or --from, not both.');
      const value = p.from !== undefined ? await input(root, p.from, stdin) : {};
      keys(value, ['identity'], 'read input');
      response.data = readRoute({ root, key: p.session, identity: value.identity, env });
    } else {
      if ([p.limit, p.offset].some(value => value !== undefined && !/^\d+$/.test(value))) invalid('limit/offset must be integers.');
      response.data = listRoutes({ root, limit: p.limit === undefined ? 50 : Number(p.limit), offset: p.offset === undefined ? 0 : Number(p.offset) });
      response.errors = response.data.errors;
      if (response.errors.length) exitCode = 1;
    }
    response.ok = response.errors.length === 0;
  } catch (error) {
    response.errors = [{ code: error.code ?? 'ROUTE_FAILED', message: error.code ? error.message : 'Routing operation failed; inspect local files and input.', ...(error.details && Object.keys(error.details).length ? { details: error.details } : {}) }];
    exitCode = error.exitCode ?? 1;
  }
  const stdout = json ? JSON.stringify(response) + '\n' : response.errors.length ? response.errors.map(e => `${e.code}: ${e.message}`).join('\n') + '\n' : JSON.stringify(response.data, null, 2) + '\n';
  return { stdout, exitCode };
}
