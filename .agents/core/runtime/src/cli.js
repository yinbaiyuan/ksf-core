import { fileURLToPath } from 'node:url';
import { hello } from './services/hello.js';
import { spawnSync } from 'node:child_process';
import { types } from './objects/schema.js';
const args = process.argv.slice(2);
const [command, ...options] = args;
const runtimeInfo = () => ({
  nodeVersion: process.version,
  nodePath: process.execPath,
  ksfRoot: fileURLToPath(new URL('../../../../', import.meta.url)),
});

if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(command))) {
  const objectCommands = Object.keys(types).map(type =>
    `  ${`ksf ${type} --help`.padEnd(27)}Manage ${type} objects\n`).join('');
  process.stdout.write('KSF CLI\n\nUsage:\n  ksf hello                   Print a greeting\n  ksf hello --json            Return a greeting and runtime details as JSON\n  ksf runtime verify          Fully verify the bundled and installed runtime\n  ksf runtime verify --json   Return verification details as JSON\n  ksf build                   Generate manifest from build inputs and artifacts\n  ksf build --json            Return generated manifest details as JSON\n  ksf test                    Run JavaScript tests with the bundled Node.js\n  ksf context --help          Get capability context for the Agent\n  ksf project --help          Manage project root cards and directories\n  ksf metadata --help         Manage Markdown YAML frontmatter\n' + objectCommands + '  ksf --help                  Show this help\n');
  process.stdout.write('  ksf repository --help       Manage independent local project repositories\n');
  process.stdout.write('  ksf commit-message --help   Check commit messages or print the template\n');
  process.stdout.write('  ksf pr-description --help   Check PR descriptions or print the template\n');
  process.stdout.write('  ksf source --help           Associate and share Git ability sources\n');
  process.stdout.write('  ksf user-data --help        Manage portable KSF system-user settings\n');
  process.stdout.write('  ksf eval --help             Explicit natural-language Agent evaluations\n');
  process.stdout.write('  ksf launcher recover       Recover an interrupted update without Core or Node\n  ksf release --help          Build ksf-core and ksf-workspace releases\n  ksf system --help           Check, upgrade and roll back installed Core\n  ksf contribute --help       Review system changes and submit a Core PR\n');
} else if (['release', 'system', 'contribute'].includes(command)) {
  const { runDistributionCommand } = await import('./commands/distribution.js');
  const result = await runDistributionCommand(command, options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
} else if (command === 'eval') {
  const { runEvalCommand } = await import('./commands/eval.js');
  const result = await runEvalCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'commit-message') {
  const { runCommitMessageCommand } = await import('./commands/commit-message.js');
  const result = runCommitMessageCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'pr-description') {
  const { runPRDescriptionCommand } = await import('./commands/pr-description.js');
  const result = runPRDescriptionCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'source') {
  const { runSourceCommand } = await import('./commands/sources.js');
  const result = runSourceCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'user-data') {
  const { runUserDataCommand } = await import('./commands/user-data.js');
  const result = runUserDataCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'repository') {
  const { runRepositoryCommand } = await import('./commands/repositories.js');
  const result = runRepositoryCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'project') {
  const { runProjectCommand } = await import('./commands/projects.js');
  const result = runProjectCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'context') {
  const { runContextCommand } = await import('./commands/context.js');
  const result = runContextCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (Object.hasOwn(types, command)) {
  const { runObjectCommand } = await import('./commands/objects.js');
  const result = runObjectCommand(command, options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'metadata') {
  const { runMetadataCommand } = await import('./commands/metadata.js');
  const result = runMetadataCommand(options, fileURLToPath(new URL('../../../../', import.meta.url)));
  process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
} else if (command === 'build' && (options.length === 0 || (options.length === 1 && options[0] === '--json'))) {
  try {
    const { buildManifest } = await import('./services/build-manifest.js');
    const result = await buildManifest(fileURLToPath(new URL('../../../../', import.meta.url)));
    process.stdout.write(options.includes('--json') ? `${JSON.stringify(result)}\n` : `KSF manifest generated: ${result.manifestPath}\n`);
  } catch (failure) {
    const error = { ok: false, error: { code: failure.code ?? 'BUILD_FAILED', message: failure.message } };
    process.stderr.write(options.includes('--json') ? `${JSON.stringify(error)}\n` : `${error.error.code}: ${error.error.message}\n`);
    process.exitCode = 1;
  }
} else if (command === 'test' && options.length === 0) {
  const testEnv = { ...process.env };
  // This child is an independent runner, including when ksf is called from a test.
  delete testEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', env: testEnv,
  });
  if (result.error) process.stderr.write(`Cannot start JavaScript tests: ${result.error.message}\n`);
  process.exitCode = result.status ?? 1;
} else if (command === 'hello' && options.length <= 1 && options.every(option => option === '--json')) {
  const result = {
    ok: true,
    command: 'hello',
    message: hello(),
    runtime: runtimeInfo(),
  };
  process.stdout.write(options.includes('--json') ? `${JSON.stringify(result)}\n` : `${result.message}\n`);
} else if (command === 'runtime' && options[0] === 'verify' &&
           (options.length === 1 || (options.length === 2 && options[1] === '--json'))) {
  if (process.env.KSF_BOOTSTRAP_VERIFIED !== '1') {
    const error = { ok: false, error: { code: 'BOOTSTRAP_REQUIRED', message: 'Run runtime verification through the ksf launcher.' } };
    process.stderr.write(options.includes('--json') ? `${JSON.stringify(error)}\n` : `${error.error.message}\n`);
    process.exitCode = 1;
  } else {
    const result = { ok: true, command: 'runtime verify', runtime: runtimeInfo() };
    process.stdout.write(options.includes('--json') ? `${JSON.stringify(result)}\n` : 'KSF runtime verified.\n');
  }
} else {
  const error = { ok: false, error: { code: 'INVALID_ARGUMENTS', message: "Unsupported command or option. Run 'ksf --help'." } };
  process.stderr.write(options.includes('--json') ? `${JSON.stringify(error)}\n` : `${error.error.message}\n`);
  process.exitCode = 2;
}
