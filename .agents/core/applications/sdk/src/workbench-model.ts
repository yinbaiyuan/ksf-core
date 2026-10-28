export function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), Math.max(min, max)); }
export function highlightParts(value: string, query: string) {
  if (!query) return [{ text: value, match: false }];
  const parts: { text: string; match: boolean }[] = [], lower = value.toLocaleLowerCase(), q = query.toLocaleLowerCase();
  let offset = 0, index = lower.indexOf(q);
  while (index >= 0) { if (index > offset) parts.push({ text: value.slice(offset, index), match: false }); parts.push({ text: value.slice(index, index + query.length), match: true }); offset = index + query.length; index = lower.indexOf(q, offset); }
  if (offset < value.length) parts.push({ text: value.slice(offset), match: false }); return parts;
}
