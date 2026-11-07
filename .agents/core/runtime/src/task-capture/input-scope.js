import { sha256 } from '../shared/hash.js';
import { encode, fail } from '../routing/schema.js';

const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const inputKey = message => sha256(encode({ id: message.id, role: message.role, content: message.content }));
export const inputScope = inputs => ({ version: 1, count: inputs.length, digest: sha256(encode(inputs.map(input => input.key))) });
export function validateInputScope(scope) {
  if (!scope || Object.keys(scope).some(key => !['version', 'count', 'digest'].includes(key)) || scope.version !== 1 || !Number.isSafeInteger(scope.count) || scope.count < 0 || !hex(scope.digest))
    fail('TASK_INPUT_SCOPE_INVALID', 'Use the verified inputScope supplied by the Hook or task input; do not invent an input boundary.');
}
export function scopeMatches(scope, inputs) {
  try { validateInputScope(scope); } catch { return false; }
  return scope.count <= inputs.length && inputScope(inputs.slice(0, scope.count)).digest === scope.digest;
}
export function validatePolicyEvidence(value) {
  if (value === undefined) return;
  if (!value || value.version !== 1 || !Array.isArray(value.inputs) || !Array.isArray(value.coverage) ||
      value.inputs.some(input => !input || !hex(input.key) || typeof input.restricted !== 'boolean') ||
      value.coverage.some(item => !item || typeof item.eventId !== 'string' || !Array.isArray(item.keys) || item.keys.some(key => !hex(key))))
    fail('TASK_DATA_INVALID', 'Invalid policy input evidence; preserve the original.');
}
