export interface ToolbarItem { id: string; label: string; priority?: number }
/** Keep command order stable while moving low priority commands to overflow. */
export function toolbarLayout(items: readonly ToolbarItem[], width: number, navigationWidth = 120) {
  const available = Math.max(0, width - Math.min(navigationWidth, Math.max(80, width * .35)) - 12);
  const size = (item: ToolbarItem) => Math.max(48, item.label.length * 12 + 16) + 2;
  const labelled = items.reduce((sum, item) => sum + size(item), 0);
  if (labelled <= available) return { labels: true, visible: items.map(item => item.id), overflow: [] as string[] };
  let remaining = Math.max(0, available - 50);
  const chosen = new Set<string>();
  for (const item of items.map((item, index) => ({ ...item, index })).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.index - b.index)) {
    if (size(item) <= remaining) { chosen.add(item.id); remaining -= size(item); }
  }
  return { labels: true, visible: items.filter(item => chosen.has(item.id)).map(item => item.id), overflow: items.filter(item => !chosen.has(item.id)).map(item => item.id) };
}
