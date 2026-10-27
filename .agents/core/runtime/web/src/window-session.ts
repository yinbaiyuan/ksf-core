// Ephemeral per-instance state. Only explicit browser history keeps a reading anchor.
export const windowSessions = new Map<string, Map<string, unknown>>();
export const readingPositions = new Map<string, number>();
export function cloneWindowSession(from: string, to: string) { windowSessions.set(to, new Map(windowSessions.get(from))); for (const [key, value] of readingPositions) if (key.startsWith(from + ':')) readingPositions.set(to + key.slice(from.length), value); }
export function releaseWindowSession(id: string) { windowSessions.delete(id); for (const key of readingPositions.keys()) if (key.startsWith(id + ':')) readingPositions.delete(key); }
