import { fail } from './errors.js';

export function versionParts(value) {
  if (typeof value !== 'string') fail('VERSION_INVALID', 'Version must be a string.');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/.exec(value);
  if (!match || match.slice(1, 4).some(p => !Number.isSafeInteger(Number(p))) ||
      match[4]?.split('.').some(p => /^\d+$/.test(p) && p.length > 1 && p[0] === '0')) fail('VERSION_INVALID', `Invalid version: ${value}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? ''];
}
export function compareVersions(a, b) {
  const ap = versionParts(a), bp = versionParts(b);
  for (let i = 0; i < 3; i++) if (ap[i] !== bp[i]) return ap[i] > bp[i] ? 1 : -1;
  if (ap[3] === bp[3]) return 0;
  if (!ap[3]) return 1; if (!bp[3]) return -1;
  const aa = ap[3].split('.'), bb = bp[3].split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === undefined) return -1; if (bb[i] === undefined) return 1;
    if (aa[i] === bb[i]) continue;
    const an = /^\d+$/.test(aa[i]), bn = /^\d+$/.test(bb[i]);
    if (an && bn) return BigInt(aa[i]) > BigInt(bb[i]) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return aa[i] > bb[i] ? 1 : -1;
  }
  return 0;
}
