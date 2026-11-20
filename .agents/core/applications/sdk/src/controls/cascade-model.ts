export interface CascadeOption {value: string; label: string; disabled?: boolean; children?: readonly CascadeOption[]}
export interface CascadePath {path: string[]; names: string[]; disabled: boolean}

/** Resolve against current options, including disabled ancestors and dynamically replaced branches. */
export function cascadePath(options: readonly CascadeOption[], path: readonly string[]) {
  const nodes: CascadeOption[] = [];
  let branch = options;
  let disabled = false;
  for (const value of path) {
    const node = branch.find(option => option.value === value);
    if (!node) break;
    nodes.push(node);
    disabled ||= !!node.disabled;
    branch = node.children ?? [];
  }
  return {nodes, disabled, complete: nodes.length === path.length};
}

export function cascadeSearch(options: readonly CascadeOption[], parents = false, path: readonly string[] = [], names: readonly string[] = [], disabled = false): CascadePath[] {
  return options.flatMap(node => {
    const entry = {path: [...path, node.value], names: [...names, node.label], disabled: disabled || !!node.disabled};
    return [...(!node.children?.length || parents ? [entry] : []), ...cascadeSearch(node.children ?? [], parents, entry.path, entry.names, entry.disabled)];
  });
}
