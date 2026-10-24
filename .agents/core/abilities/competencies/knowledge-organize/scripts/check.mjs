import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  const args = process.argv.slice(2), options = {};
  if (args.includes('--help')) {
    process.stdout.write('Internal read-only knowledge audit. --root ROOT [--target PATH] [--json]\n');
  } else {
    for (let i = 0; i < args.length; i++) {
      const key = args[i].replace(/^--/, '');
      if (args[i] === '--json' && !options.json) { options.json = true; continue; }
      if (!args[i].startsWith('--') || !['root', 'target'].includes(key) || Object.hasOwn(options, key) || !args[i + 1] || args[i + 1].startsWith('--'))
        throw Object.assign(new Error('Unknown, duplicate or missing option.'), { code: 'KNOWLEDGE_ARGUMENT_INVALID' });
      options[key] = args[++i];
    }
    if (!options.root) throw Object.assign(new Error('--root is required.'), { code: 'KNOWLEDGE_ARGUMENT_INVALID' });
    const { checkKnowledge } = await import(pathToFileURL(resolve(options.root, '.agents/core/runtime/src/services/knowledge-organize.js')).href);
    const data = checkKnowledge(options);
    process.stdout.write(JSON.stringify({ ok: data.valid, command: 'knowledge-organize-check', data, errors: data.errors }) + '\n');
    if (!data.valid) process.exitCode = 1;
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, command: 'knowledge-organize-check', data: null, errors: [{ code: error.code ?? 'KNOWLEDGE_CHECK_FAILED', message: error.message }] }) + '\n');
  process.exitCode = error.code === 'KNOWLEDGE_ARGUMENT_INVALID' ? 2 : 1;
}
