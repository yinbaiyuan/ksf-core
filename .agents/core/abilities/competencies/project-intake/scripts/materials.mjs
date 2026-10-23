import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [operation, ...args] = process.argv.slice(2), options = {};
try {
  if (operation === '--help' || operation === '-h') {
    process.stdout.write('Internal project-intake support (not a public ksf command).\nplan --root ROOT --project NAME --source PATH [--destination PROJECT_RELATIVE_PATH] [--json]\napply --root ROOT --project NAME --plan FILE [--json]\nplan never writes. apply requires current user authorization.\n');
  } else {
    if (!['plan', 'apply'].includes(operation)) throw Object.assign(new Error('Expected plan or apply.'), { code: 'INTAKE_ARGUMENT_INVALID' });
    const allowed = new Set(operation === 'plan' ? ['root', 'project', 'source', 'destination'] : ['root', 'project', 'plan']);
    for (let i = 0; i < args.length; i++) {
      const key = args[i].replace(/^--/, '');
      if (args[i] === '--json' && !options.json) { options.json = true; continue; }
      if (!args[i].startsWith('--') || !allowed.has(key) || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith('--'))
        throw Object.assign(new Error('Unknown, duplicate or missing option.'), { code: 'INTAKE_ARGUMENT_INVALID' });
      options[key] = args[++i];
    }
    if (!options.root || !options.project || !(operation === 'plan' ? options.source : options.plan))
      throw Object.assign(new Error('Missing required options.'), { code: 'INTAKE_ARGUMENT_INVALID' });
    // A normal system competency may be derived into the user's ability tree.
    // Its support must use the explicitly selected instance, not its old depth.
    const { planMaterials, applyMaterials } = await import(pathToFileURL(resolve(options.root, '.agents/core/runtime/src/services/project-intake.js')).href);
    const saved = operation === 'apply' ? JSON.parse(readFileSync(options.plan, 'utf8')) : null;
    const plan = saved?.command === 'project-intake-materials' && saved.operation === 'plan' ? saved.data : saved;
    const data = operation === 'plan' ? planMaterials(options) : applyMaterials({ ...options, plan });
    const ok = operation === 'plan' ? data.mode !== 'engineering' && data.entries.every(e => !['error', 'conflict'].includes(e.action)) : data.ok;
    process.stdout.write(JSON.stringify({ ok, command: 'project-intake-materials', operation, data, errors: data.errors ?? [] }) + '\n');
    if (!ok) process.exitCode = 1;
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, command: 'project-intake-materials', operation, data: null,
    errors: [{ code: error.code ?? 'INTAKE_INPUT_INVALID', message: error.message }] }) + '\n');
  process.exitCode = error.code === 'INTAKE_ARGUMENT_INVALID' ? 2 : 1;
}
