import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { queryAssistant, refreshAssistant } from '../services/assistant.js';
import { parseOptions, optionSpecs } from '../shared/options.js';
import { invalid } from '../routing/schema.js';

export async function runAssistantCommand(args, root) {
  const help = 'KSF Assistant\n\nksf assistant query --from -|file --json\nksf assistant refresh --json\nQueries are read-only. Refresh only supplements already-enabled capture.\n';
  if (!args.length || (args.length === 1 && ['--help','-h'].includes(args[0]))) return { stdout: help, exitCode: 0 };
  const operation = args[0]; let response = { ok: false, command: 'assistant', operation, data: null, errors: [] };
  try {
    if (!['query','refresh'].includes(operation)) invalid('Unknown Assistant operation.');
    const parsed = {};
    parseOptions(args.slice(1), { result: parsed, options: optionSpecs(operation === 'query' ? ['from','json'] : ['json'], { from: {kind:'value', allowDash:true} }), invalid, target() { invalid('Assistant does not accept positional arguments.'); } });
    if (!parsed.json || (operation === 'query' && !parsed.from)) invalid('Supply --json and query --from.');
    if (operation === 'refresh') response.data = await refreshAssistant({ root });
    else if (operation === 'query') {
      let bytes;
      if (parsed.from === '-') {
        const chunks = []; let size = 0;
        for await (const chunk of process.stdin) { size += chunk.length; if (size > 4*1024*1024) throw new Error('Input too large.'); chunks.push(chunk); }
        bytes = Buffer.concat(chunks);
      } else bytes = readFileSync(resolve(root, parsed.from));
      if (bytes.length > 4*1024*1024) throw new Error('Input too large.');
      response.data = queryAssistant({ root, input: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) });
    } else throw Object.assign(new Error('Unknown Assistant operation.'), { code: 'INVALID_ARGUMENTS' });
    response.errors = response.data.errors ?? []; response.ok = !response.errors.length;
  } catch (error) { response.errors = [{ code: error.code ?? 'ASSISTANT_QUERY_FAILED', message: error.message }]; }
  return { stdout: JSON.stringify(response)+'\n', exitCode: response.ok ? 0 : response.errors[0]?.code === 'INVALID_ARGUMENTS' ? 2 : 1 };
}
