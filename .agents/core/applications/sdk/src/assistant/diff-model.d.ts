export interface DiffLine {kind: 'context' | 'add' | 'remove'; text: string; oldLine?: number; newLine?: number}
export function diffLines(before: string, after: string): DiffLine[];
