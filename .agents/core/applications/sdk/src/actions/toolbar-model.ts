export interface ToolbarFitItem {id: string; group?: string; priority?: number}
/** Keep display order while removing lower-priority actions first. */
export function fitToolbar(items: readonly ToolbarFitItem[], widths: ReadonlyMap<string, number>, available: number, moreWidth: number, gap = 6, separatorWidth = 9) {
  const cost = (values: readonly ToolbarFitItem[]) => values.reduce((sum, item, i) => sum + (widths.get(item.id) ?? 0) + (i ? gap : 0) + (i && values[i - 1].group !== item.group ? separatorWidth + gap : 0), 0);
  if (cost(items) <= available) return [] as string[];
  const hidden = new Set<string>(), order = items.map((item, index) => ({item, index})).sort((a, b) => (a.item.priority ?? 0) - (b.item.priority ?? 0) || b.index - a.index);
  for (const {item} of order) {
    hidden.add(item.id);
    const visible = items.filter(value => !hidden.has(value.id));
    if (cost(visible) + (visible.length ? gap : 0) + moreWidth <= available) break;
  }
  return items.filter(item => hidden.has(item.id)).map(item => item.id);
}
