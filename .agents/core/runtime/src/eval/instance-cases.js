import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, validateSuite } from './cases.js';
import { fail } from './files.js';

export const instanceCasesPath = '.agents/user-data/eval-routing.json';
export function loadCases(root) {
  let bindings;
  try { bindings = JSON.parse(readFileSync(join(root, instanceCasesPath), 'utf8')); }
  catch (error) { fail(error.code === 'ENOENT' ? 'EVAL_INSTANCE_CASES_MISSING' : error instanceof SyntaxError ? 'EVAL_INSTANCE_CASES_INVALID' : 'EVAL_INSTANCE_CASES_UNREADABLE',
    'Cannot read the two real cases in .agents/user-data/eval-routing.json; preserve the original file, no private examples or defaults are shipped in Core.'); }
  if (bindings.schemaVersion !== 1 || !bindings.cases || Object.keys(bindings.cases).sort().join(',') !== 'K02,P02')
    fail('EVAL_INSTANCE_CASES_INVALID', 'Expected schemaVersion 1 and exactly P02/K02 instance bindings.');
  const cases = suite.cases.map(c => {
    if (c.material !== 'instance') return c;
    const binding = bindings.cases[c.id];
    if (!binding || Object.keys(binding).some(k => !['turns', 'expected', 'reservedExpressions'].includes(k)) ||
      !(binding.expected?.requiredReads?.length || binding.expected?.requiredReadGroups?.length) || !binding.turns?.length || binding.turns.some(t => Object.keys(t).some(k => k !== 'prompt')))
      fail('EVAL_INSTANCE_CASES_INVALID', 'Each instance binding needs natural-language turns, acceptance criteria and existing required reads.');
    for (const p of binding.expected.requiredReads ?? []) if (!existsSync(join(root, p))) fail('EVAL_FIXTURE_MISSING', `Required instance material is unavailable: ${p}`);
    for (const group of binding.expected.requiredReadGroups ?? []) if (!Array.isArray(group) || !group.length || !group.some(p => existsSync(join(root, p)))) fail('EVAL_FIXTURE_MISSING', 'At least one original source in each alternative-read group must exist.');
    return { ...c, turns: binding.turns, expected: { ...c.expected, ...binding.expected }, reservedExpressions: binding.reservedExpressions ?? [] };
  });
  const checked = validateSuite({ ...suite, cases });
  if (!checked.valid) fail('EVAL_INSTANCE_CASES_INVALID', checked.errors.join('\n'));
  return cases;
}
