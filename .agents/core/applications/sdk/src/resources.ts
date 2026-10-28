/** Public, page-local resource preparation protocol. All installed applications participate. */
export async function flushDocuments(path: string) {
  const pending: Promise<unknown>[] = [];
  window.dispatchEvent(new CustomEvent('ksf:prepare-resources', { detail: { path, waitUntil: (value: Promise<unknown>) => pending.push(Promise.resolve(value)) } }));
  await Promise.all(pending);
}
export function registerResourcePreparation(prepare: (path: string) => Promise<unknown>) {
  const listener = (event: Event) => { const { path, waitUntil } = (event as CustomEvent).detail; waitUntil(prepare(path)); };
  window.addEventListener('ksf:prepare-resources', listener);
  return () => window.removeEventListener('ksf:prepare-resources', listener);
}
