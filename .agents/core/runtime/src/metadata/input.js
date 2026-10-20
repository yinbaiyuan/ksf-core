import { MetadataError } from './errors.js';
import { validateJSONMapping } from '../shared/json.js';
export { equalValues } from '../shared/json.js';

export function parseInput(text, source) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw new MetadataError('INPUT_INVALID', 'Input must be valid JSON.', { exitCode: 2, ...(source ? { target: source } : {}) }); }
  return validateInput(data, source);
}

export function validateInput(data, source) {
  return validateJSONMapping(data, () => { throw new MetadataError('INPUT_INVALID', 'Input must be a JSON field mapping with finite, safe numbers.', { exitCode: 2, ...(source ? { target: source } : {}) }); });
}
