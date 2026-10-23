import { isDeepStrictEqual } from 'node:util';

export function equalValues(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return isDeepStrictEqual(a, b);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equalValues(v, b[i]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equalValues(a[k], b[k]));
}

export function validateJSONMapping(data, invalid) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) invalid();
  const ancestors = new Set();
  function check(value) {
    if (!['string', 'number', 'boolean', 'object'].includes(typeof value)) invalid();
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) invalid();
    if (value && typeof value === 'object') {
      if (ancestors.has(value)) invalid();
      if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
      ancestors.add(value);
      for (const child of Object.values(value)) check(child);
      ancestors.delete(value);
    }
  }
  check(data);
  return data;
}

