import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const stableJSON = value => JSON.stringify(value, null, 2) + '\n';
export const digestObject = value => sha256(stableJSON(value));
export const isSHA = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
