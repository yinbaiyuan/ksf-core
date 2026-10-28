export function rawOffset(text: string, offset: number) { let normalized = 0, raw = 0; while (raw < text.length && normalized < offset) { if (text[raw] === '\r' && text[raw + 1] === '\n') raw++; raw++; normalized++; } return raw; }
export function applyRawChanges(text: string, changes: { from: number; to: number; insert: string }[]) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'; let next = text;
  for (const change of [...changes].reverse()) next = next.slice(0, rawOffset(text, change.from)) + change.insert.replace(/\r\n?|\n/g, '\n').replace(/\n/g, newline) + next.slice(rawOffset(text, change.to));
  return next;
}

export function resolveLocalPath(documentPath: string, href: string): { path: string; hash: string } | null {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href) || href.startsWith('/')) return null;
  try {
    const [name, hash = ''] = href.split('#'), parts = documentPath.split('/'); if (name) parts.pop();
    if (name) for (const part of decodeURIComponent(name).split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(part); }
    return { path: parts.join('/'), hash: decodeURIComponent(hash) };
  } catch { return null; }
}

export const headingId = (text: string) => text.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s+/g, '-');
