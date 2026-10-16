import { resolve } from 'node:path';
import { DistributionError, invalid } from '../distribution/common.js';

const specs = {
  release: {
    build: { options: ['output', 'platform', 'allow-dirty', 'dry-run'], usage: 'build [--output <directory>] [--platform <platform>] [--allow-dirty] [--dry-run]' },
    publish: { target: true, options: ['dry-run', 'release-only'], usage: 'publish <release-directory> [--release-only] [--dry-run]' },
    template: { target: true, options: ['dry-run'], usage: 'template <release-directory> [--dry-run]' },
    mirror: { options: ['source', 'dry-run'], usage: 'mirror [--source <Release URL or index file>] [--dry-run]' },
  },
  system: {
    read: { options: [], usage: 'read' },
    check: { options: ['source'], usage: 'check [--source <Release URL or index file>]' },
    update: { options: ['source', 'from', 'dry-run'], usage: 'update [--source <URL or index file> | --from <Core archive>] [--dry-run]' },
    sync: { options: ['quiet'], usage: 'sync [--quiet]' },
    rollback: { options: ['dry-run'], usage: 'rollback [--dry-run]' },
  },
  contribute: {
    prepare: { options: ['paths', 'all', 'title', 'body', 'dry-run'], usage: 'prepare (--paths <system-file...> | --all) [--title <title>] [--body <description>] [--dry-run]' },
    read: { target: true, options: [], usage: 'read <contribution-id>' },
    submit: { target: true, options: ['reviewed', 'dry-run'], usage: 'submit <contribution-id> --reviewed <preview-digest> [--dry-run]' },
  },
};
const booleans = new Set(['json', 'help', 'allow-dirty', 'dry-run', 'release-only', 'all', 'quiet']);
const camel = value => value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
export function distributionHelp(command, operation) {
  const selected = operation ? [specs[command][operation]] : Object.values(specs[command]);
  const notes = {
    release: 'Build the ksf-core system and ksf-workspace user template from Core sources.\nOutput contains ksf-workspace/, both product archives and the ksf-core release index.\nCopy the template to an instance named ksf or any user-chosen name.\nOfficial publishing rejects dirty/development packages.\nPublishing requires GitHub authorization; building and --dry-run do not.\n',
    system: 'Read, check, update and roll back copied or template-created workspaces.\nUpdates use explicit release baselines and never merge personal Git history.\n--source accepts HTTPS, absolute/local index files and loopback HTTP.\n--from installs a newer verified Core archive offline.\nUser directories and .gitignore are never update targets.\nConflicts preserve the current system. Use .agents/bin/ksf for recovery.\n',
    contribute: 'Select system changes, review the diff, then submit its exact digest.\nNo Git repository is required. Personal files and Git history are excluded.\n--paths takes root-relative literal system paths, not globs.\nSubmission creates a draft Core PR; it requires GitHub authorization.\n',
  };
  return `KSF ${command}${operation ? ` ${operation}` : ''}\n\nUsage:\n` + selected.map(s => `  ksf ${command} ${s.usage} [--json]`).join('\n') + '\n\n' + notes[command] +
    'Paths are relative to the KSF root; -- ends option parsing.\n--dry-run previews without publishing or changing live system files.\nUse --help or -h alone at command or operation level.\n';
}
export function parseDistributionArgs(command, args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...rest] = args, spec = specs[command]?.[operation];
  if (!spec) invalid(`Unsupported ${command} operation.`);
  const parsed = { operation }, seen = new Set(); let ended = false;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!ended && token === '--') { ended = true; continue; }
    if (ended || !token.startsWith('-')) {
      if (parsed.target !== undefined) invalid('Only one target is allowed.');
      parsed.target = token; continue;
    }
    const match = /^(?:--([a-z][a-z-]*)(?:=(.*))?|-([h]))$/s.exec(token);
    if (!match) invalid('Unknown option.');
    const name = match[1] ?? 'help', inline = match[2];
    if (!['json', 'help', ...spec.options].includes(name)) invalid(`Option --${name} is not supported here.`);
    if (seen.has(name)) invalid(`Option --${name} cannot be repeated.`);
    seen.add(name);
    if (booleans.has(name)) {
      if (inline !== undefined) invalid(`Option --${name} does not accept a value.`);
      parsed[camel(name)] = true;
    } else if (name === 'paths') {
      const values = [];
      if (inline !== undefined) values.push(inline);
      else while (i + 1 < rest.length && !rest[i + 1].startsWith('-')) values.push(rest[++i]);
      if (!values.length || values.some(p => !p)) invalid('--paths requires one or more literal system paths.');
      parsed.paths = values;
    } else {
      const value = inline ?? rest[++i];
      if (value === undefined || (inline === undefined && value.startsWith('-'))) invalid(`Option --${name} requires a value.`);
      parsed[camel(name)] = value;
    }
  }
  if (parsed.help) {
    if (seen.size !== 1 || parsed.target !== undefined) invalid('Use --help without other arguments.');
    return parsed;
  }
  if (spec.target !== (parsed.target !== undefined) && (spec.target || parsed.target !== undefined)) invalid(spec.target ? 'A target is required.' : 'This operation does not accept a target.');
  if (parsed.source !== undefined && parsed.from !== undefined) invalid('--source and --from are mutually exclusive.');
  if (parsed.quiet && parsed.json) invalid('--quiet and --json are mutually exclusive.');
  if (command === 'contribute' && operation === 'prepare' && (!!parsed.paths === !!parsed.all)) invalid('Choose exactly one of --paths or --all.');
  if (command === 'contribute' && operation === 'submit' && !parsed.reviewed) invalid('--reviewed requires the digest of a prepared contribution.');
  return parsed;
}
function publicData(data) {
  return data?.changes ? { ...data, changes: data.changes.map(({ content, ...change }) => change) } : data;
}
export async function runDistributionCommand(command, args, root) {
  const response = { ok: false, command, operation: Object.hasOwn(specs[command], args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode = 0, quiet = false;
  try {
    const parsed = parseDistributionArgs(command, args); quiet = parsed.quiet === true;
    if (parsed.help) return { stdout: distributionHelp(command, parsed.operation), stderr: '', exitCode: 0 };
    let data;
    if (command === 'system') {
      const system = await import('../distribution/system.js');
      const methods = { read: system.systemRead, check: system.systemCheck, update: system.systemUpdate, rollback: system.systemRollback, sync: system.systemSync };
      data = await methods[parsed.operation]({ root, ...parsed });
    } else if (command === 'contribute') {
      const contribution = await import('../distribution/contribute.js');
      const methods = { prepare: contribution.prepareContribution, read: contribution.readContribution, submit: contribution.submitContribution };
      data = await methods[parsed.operation]({ root, ...parsed, id: parsed.target });
    } else if (parsed.operation === 'build') {
      const { buildRelease } = await import('../distribution/release.js');
      data = await buildRelease({ root, ...parsed });
    } else {
      const { publishRelease, publishTemplate, mirrorTemplate } = await import('../distribution/publish.js');
      data = parsed.operation === 'mirror' ? await mirrorTemplate({ root, ...parsed }) :
        await (parsed.operation === 'publish' ? publishRelease : publishTemplate)({ root, directory: resolve(root, parsed.target), dryRun: parsed.dryRun, releaseOnly: parsed.releaseOnly });
    }
    response.ok = true; response.data = publicData(data);
  } catch (error) {
    response.errors = [{ code: error.code ?? 'DISTRIBUTION_FAILED', message: error.message }];
    if (error.data) response.data = publicData(error.data);
    exitCode = error instanceof DistributionError ? error.exitCode : 1;
  }
  if (quiet) return { stdout: '', stderr: response.ok ? response.data?.changed ? `KSF: updated Core to ${response.data.to ?? response.data.latest}.\n` : '' :
    `KSF: automatic update skipped (${response.errors[0].code}); the installed version remains usable.\n`, exitCode };
  const end = args.indexOf('--'), json = (end < 0 ? args : args.slice(0, end)).includes('--json');
  return { stdout: json ? JSON.stringify(response) + '\n' :
    [response.data ? JSON.stringify(response.data, null, 2) : '', ...response.errors.map(e => `${e.code}: ${e.message}`)].filter(Boolean).join('\n') + '\n', stderr: '', exitCode };
}
