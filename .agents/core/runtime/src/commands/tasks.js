import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { fail, invalid } from '../routing/schema.js';
import { targetRegistry } from '../routing/target-registry.js';
import { listTasks, listTaskTargets, readTask, readTaskInput, captureStatus, installTaskHooks, syncTasks, declareTask, taskHook } from '../services/tasks.js';
import { createTaskActivitySource } from '../services/task-activity.js';
import { readCurrentWork } from '../services/work-context.js';

export function taskHelp() {
  return `KSF task\n\nUsage:\n` +
    `  ksf task targets [--json]          Read recorded primary targets and their lifecycle\n` +
    `  ksf task list [--q text] [--target key | --project key] [--project-match latest|history] [--limit 1-100] [--offset N] [--json]\n` +
    `  ksf task read --task <taskId> [--turn <nativeTurnId>] [--target key] [--limit 1-100] [--offset N] [--json]\n` +
    `  ksf task stats [--project name | --current-project] [--ability id] [--time-zone IANA] [--json]\n` +
    `  ksf task turns [--project name | --current-project] [--ability id] [--with-messages] [--limit 1-100] [--offset N] [--json]\n` +
    `  ksf task sync [--from -|file] [--json]\n` +
    `  ksf task status [--json]\n` +
    `  ksf task hooks [--json]\n` +
    `  ksf task declare --from -|file [--json]\n` +
    `  ksf task input --turn <nativeTurnId> [--json]  Read verified inputScope without saving\n` +
    `  ksf task hook                  Codex lifecycle stdin; always returns non-blocking JSON\n\n` +
    `hooks merges project .codex/hooks.json and activates a future-turn baseline.\n` +
    `Review exact definitions in Codex /hooks; KSF never modifies hook trust.\n` +
    `sync input: {transcriptPath}; without --from, discovers this workspace's Codex transcripts.\n` +
    `declare is read-only: {turnId,eventId,policy:capture|exclude|pause|resume,reason,inputScope?,report?,targetBindings?,identity?}.\n` +
    `report uses the existing route report schema; exact sources and digests are verified.\n` +
    `ownership/relatedTargets support project, knowledge, ability, archive, inbox and persona entries; do not mix with legacy project/references.\n` +
    `Planned target: {kind,lifecycle:"planned",name}; reuse {kind,targetId}. Bind with targetBindings:[{targetId,ifMatch,target}].\n` +
    `--target filters historical primary ownership only; related targets never create chat membership.\n` +
    `stats and turns use recorded project activity and actual ability use. Filters combine with AND.\n` +
    `Project accepts name, current:name, or archived:name. With no selector, use this chat's bound work project.\n` +
    `Enabled capture archives ordinary post-activation dialogue without requiring a route report.\n` +
    `Explicit exclusions/pauses take precedence; possible recording restrictions await a signed policy.\n`;
}
function archiveFilter({ project, ability, currentProject }, root, env) {
  if (project !== undefined) {
    if (currentProject) invalid('Use either --project or --current-project.');
    const match = /^(current|archived):(.*)$/u.exec(project);
    return { project: match ? { scope: match[1], name: match[2] } : { scope: 'current', name: project }, ability };
  }
  if (ability !== undefined && !currentProject) return { ability };
  const unavailable = () => fail('TASK_CURRENT_PROJECT_REQUIRED', '当前聊天没有可查询的工作项目，请用 --project 明确指定项目。', {}, 2);
  if (!env.CODEX_THREAD_ID) unavailable();
  const ownership = readCurrentWork({ root, env }).current?.ownership;
  if (ownership?.state !== 'bound' || ownership.target.kind !== 'project') unavailable();
  const raw = ownership.target;
  const target = raw.targetId ? targetRegistry(root).records.get(raw.targetId) : raw;
  if (!target || target.lifecycle === 'planned' || !target.name || !target.scope) unavailable();
  return { project: { name: target.name, scope: target.scope }, ability };
}
async function input(root, from, supplied) {
  if (supplied !== undefined) return supplied;
  let bytes;
  if (from === '-') {
    if (process.stdin.isTTY) invalid('Supply JSON on stdin.');
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) invalid('Task input exceeds 4 MiB.');
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  } else bytes = readFileSync(resolve(root, from));
  if (bytes.length > 4 * 1024 * 1024) invalid('Task input exceeds 4 MiB.');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { invalid('Task input must be UTF-8 JSON.'); }
}
export async function runTaskCommand(args, root, { stdin, env = process.env } = {}) {
  const operation = args[0], json = hasJsonFlag(args);
  const response = { ok: false, command: 'task', operation, data: null, errors: [] };
  let exitCode = 0;
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(operation))) return { stdout: taskHelp(), exitCode: 0 };
    const selectors = ['project', 'current-project', 'ability'];
    const names = { list: ['limit', 'offset', 'q', 'project', 'project-match', 'target'], read: ['task', 'turn', 'limit', 'offset', 'target'],
      stats: [...selectors, 'time-zone'], turns: [...selectors, 'with-messages', 'limit', 'offset'],
      input: ['turn'], targets: [], sync: ['from'], status: [], hooks: [], declare: ['from'], hook: [] }[operation];
    if (!names) invalid('Unknown task operation.');
    const p = {};
    const seen = parseOptions(args.slice(1), { result: p, options: optionSpecs([...names, 'json', 'help'], {
      from: { kind: 'value', allowDash: true }, 'current-project': { kind: 'flag' }, 'with-messages': { kind: 'flag' },
    }), invalid,
      target() { invalid('task does not accept positional arguments.'); } });
    if (p.help) { if (seen.size !== 1) invalid('Use --help alone.'); return { stdout: taskHelp(), exitCode: 0 }; }
    const integer = (name, fallback) => {
      if (p[name] !== undefined && !/^\d+$/.test(p[name])) invalid(`Invalid ${name}.`);
      return p[name] === undefined ? fallback : Number(p[name]);
    };
    if (operation === 'input') response.data = await readTaskInput({ root, turnId: p.turn, env });
    else if (operation === 'targets') response.data = listTaskTargets({ root });
    else if (operation === 'list') response.data = listTasks({ root, limit: integer('limit', 50), offset: integer('offset', 0), q: p.q, project: p.project, projectMatch: p.projectMatch, target: p.target });
    else if (operation === 'stats' || operation === 'turns') {
      const filter = archiveFilter(p, root, env);
      const archive = createTaskActivitySource(root);
      response.data = operation === 'stats' ? await archive.readStats({ ...filter, timeZone: p.timeZone })
        : await archive.listTurns({ ...filter, limit: integer('limit', 20), offset: integer('offset', 0), withMessages: p.withMessages });
    } else if (operation === 'read') {
      if (!p.task) invalid('Supply --task.');
      response.data = readTask({ root, taskId: p.task, turnId: p.turn, limit: integer('limit', 20), offset: integer('offset', 0), target: p.target });
    } else if (operation === 'status') response.data = captureStatus({ root });
    else if (operation === 'hooks') response.data = installTaskHooks({ root });
    else if (operation === 'declare') {
      if (!p.from) invalid('Supply --from.');
      response.data = declareTask({ root, env, input: await input(root, p.from, stdin) });
    } else if (operation === 'sync') {
      const value = p.from ? await input(root, p.from, stdin) : {};
      if (Object.keys(value).some(k => k !== 'transcriptPath') || (p.from && typeof value.transcriptPath !== 'string')) invalid('sync input needs transcriptPath.');
      response.data = await syncTasks({ root, env, transcriptPath: value.transcriptPath, force: true });
    } else return { stdout: JSON.stringify(await taskHook({ root, env, input: await input(root, '-', stdin) })) + '\n', exitCode: 0 };
    response.errors = response.data?.errors ?? [];
    response.ok = !response.errors.length;
    if (!response.ok) exitCode = 1;
  } catch (error) {
    if (operation === 'hook') return { stdout: JSON.stringify({ systemMessage: `KSF 对话采集失败，任务继续：${error.code ?? 'TASK_CAPTURE_FAILED'}` }) + '\n', exitCode: 0 };
    response.errors = [{ code: error.code ?? 'TASK_FAILED', message: error.code ? error.message : 'Task operation failed; inspect local data.' }];
    exitCode = error.exitCode ?? 1;
  }
  return { stdout: JSON.stringify(json ? response : (response.ok ? response.data : response), null, json ? undefined : 2) + '\n', exitCode };
}
