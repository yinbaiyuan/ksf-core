import { hasJsonFlag, parseOptions, optionSpecs } from '../shared/options.js';
import { validSourceId } from '../sources/schema.js';
import { invalid, MetadataError } from '../metadata/errors.js';
import { contextCapabilities } from '../services/context.js';
import { contextEntry } from '../services/entry-context.js';
import { orphanCompetencies } from '../services/orphan-competencies.js';
import { entryWorkDelivery } from '../services/work-context.js';
import { runWorkContextCommand, workContextOperations, workContextHelp } from './work-context.js';

export function contextHelp(operation) {
  return `KSF context${operation ? ` ${operation}` : ''}\n\nUsage:\n` +
    '  ksf context capabilities [--json] [--source <source-id>]\n' +
    '  ksf context entry [--json]\n\n' +
    '  ksf context orphan-competencies [--source <source-id>] [--json]\n\n' +
    'entry returns the complete selected Core entry and its marked reference expansions.\n' +
    'It follows declared ability/file references without executing competency business steps.\n' +
    'It never initializes state, starts the backend or opens a browser.\n' +
    'Return all effective cooperation and partner discovery descriptions, cooperations first.\n' +
    'Descriptions are preserved; bodies and related resources are not included.\n' +
    'Fixed entries remain marked. ability-route owns matching and fallback decisions.\n' +
    'Partial results remain available with exit 1; invalid arguments return exit 2.\n' +
    'Use --help or -h alone at either level to show help.\n\n' + workContextHelp();
}

function parseArgs(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...options] = args;
  if (!['capabilities','entry','orphan-competencies'].includes(operation)) invalid('Expected context capabilities, entry or orphan-competencies.');
  if (options.length === 1 && ['--help', '-h'].includes(options[0])) return { operation, help: true };
  const parsed = { operation };
  parseOptions(options, { result: parsed, options: optionSpecs(operation === 'entry' ? ['json'] : ['json', 'source']), invalid, target() { invalid('Context does not accept targets.'); } });
  if (parsed.source !== undefined && !validSourceId(parsed.source)) invalid('Expected a linked source ID.');
  return parsed;
}

function render(result) {
  if (result.operation === 'entry') {
    const d=result.data;
    const fixed=d?.context ? d.context.items.map(i=>`## ${i.key}\nSource: ${i.path}\nState: ${i.state}\nSHA256: ${i.sha256}\n\n${i.contentRef ? d.entry.content : i.content ?? ''}`).join('\n\n') : d?.entry.content ?? '';
    const expansions=(d?.context?.expanded ?? []).map(item=>{
      if(item.kind==='file'){const f=item.file;return `## File ${f.path}\nReference: ${item.reference}\nSource: ${f.source}\nState: ${f.state}\nSHA256: ${f.sha256}\n\n${f.content ?? ''}`;}
      const {reference,object:o}=item;return `## Expanded ${o.id}\nReference: ${reference}\nSource: ${o.source}\nPath: ${o.path}\nSHA256: ${o.definition_digest}\nMetadata: ${JSON.stringify(o.metadata)}\n\n${o.body}`;
    }).join('\n\n');
    const content=fixed+(expansions ? '\n\n'+expansions : '');
    return `# KSF ${d?.mode ?? 'unavailable'}\n\n${content}\n${result.errors.map(e=>`${e.code}: ${e.message}`).join('\n')}\n`;
  }
  if (result.operation === 'orphan-competencies') return `# Orphan competencies\nComplete: ${result.data?.complete ?? false}\n` + (result.data?.objects ?? []).map(o=>`\n${o.id}@${o.version} (${o.source})\n${o.path}\n${o.description}\n`).join('') + result.errors.map(e=>`${e.code}: ${e.message}\n`).join('');
  const lines = ['# KSF Capabilities'];
  if (result.data) {
    lines.push(`Complete: ${result.data.complete ? 'yes' : 'no'}`);
    for (const [key, title] of [['cooperations', 'Cooperations'], ['partners', 'Partners']]) {
      const group = result.data[key];
      lines.push(`\n## ${title} (${group.complete ? 'complete' : 'incomplete'})`);
      if (!group.objects.length) lines.push('(empty)');
      for (const object of group.objects) {
        lines.push(`\n- ${object.name}${object.protected ? ' [fixed entry]' : ''}`,
          `  ID: ${object.id}`, `  Source: ${object.source}`, `  Definition: ${object.path}`,
          `  Fixed entry: ${object.protected ? 'yes' : 'no'}`, `Description:\n${object.description}`);
      }
    }
  }
  if (result.errors.length) {
    lines.push('\n## Errors');
    for (const error of result.errors) {
      lines.push(`${error.type ? `[${error.type}] ` : ''}${error.code}: ${error.message}` +
        (error.target ? ` (${error.target})` : ''));
    }
  }
  return lines.join('\n') + '\n';
}

export function runContextCommand(args, root, options = {}) {
  if (workContextOperations.includes(args[0])) return runWorkContextCommand(args, root, options);
  const result = { ok: false, command: 'context', operation: ['capabilities','entry','orphan-competencies'].includes(args[0]) ? args[0] : null,
    data: null, errors: [] };
  let exitCode;
  try {
    const parsed = parseArgs(args);
    if (parsed.help) return { stdout: contextHelp(parsed.operation), exitCode: 0 };
    let response;
    if (parsed.operation === 'entry') {
      const data=contextEntry(root);
      if (data.mode === 'runtime' && data.complete) {
        try { const delivery=entryWorkDelivery({root,env:options.env},data); if(delivery)data.delivery=delivery; }
        catch { /* Entry remains usable without native identity or optional work state. */ }
      }
      response={data,errors:data.context?.errors ?? []};
    }
    else response = parsed.operation === 'orphan-competencies' ? orphanCompetencies(root,{source:parsed.source}) : contextCapabilities(root, { source: parsed.source });
    result.data = response.data;
    result.errors = response.errors;
    result.ok = result.data.complete && result.errors.length === 0;
    exitCode = result.ok ? 0 : 1;
  } catch (failure) {
    const error = failure instanceof MetadataError || typeof failure.code === 'string' ? failure
      : new MetadataError('CONTEXT_OPERATION_FAILED', 'Cannot obtain capability context.');
    result.errors = [{ code: error.code, message: error.message, ...error.details }];
    exitCode = error.exitCode ?? 1;
  }
  const json = hasJsonFlag(args);
  return { stdout: json ? JSON.stringify(result) + '\n' : render(result), exitCode };
}
