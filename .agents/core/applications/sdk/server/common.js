import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const problem = (code, message, status = 400, data) => Object.assign(new Error(message), { code, status, data });
export const assert = (condition, code, message, status = 400) => { if (!condition) throw problem(code, message, status); };
// One coordinator is shared by the file and Git services. Independent repositories
// can progress concurrently; a checkout cannot race a save in the same repository.
export function createCoordinator() {
  const tails = new Map();
  const coordinator = {
    async run(key, action) {
      const previous = tails.get(key) ?? Promise.resolve();
      let release;
      const next = new Promise(resolve => { release = resolve; });
      tails.set(key, next);
      await previous;
      try { return await action(); }
      finally { release(); if (tails.get(key) === next) tails.delete(key); }
    },
    async runMany(keys, action) {
      const ordered = [...new Set(keys)].sort();
      const next = index => index === ordered.length ? action() : coordinator.run(ordered[index], () => next(index + 1));
      return next(0);
    },
  };
  return coordinator;
}
