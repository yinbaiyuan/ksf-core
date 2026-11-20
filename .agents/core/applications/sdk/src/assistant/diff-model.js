/** Bounded line comparison: LCS for normal snippets, prefix/suffix fallback for large files. */
export function diffLines(before, after) {
  const a = before === '' ? [] : before.split(/\r?\n/), b = after === '' ? [] : after.split(/\r?\n/);
  const result = []; let i = 0, j = 0;
  const same = () => result.push({kind: 'context', text: a[i++], oldLine: i, newLine: ++j});
  const remove = () => result.push({kind: 'remove', text: a[i++], oldLine: i});
  const add = () => result.push({kind: 'add', text: b[j++], newLine: j});
  if (a.length * b.length > 160000) {
    while (i < a.length && j < b.length && a[i] === b[j]) same();
    let suffix = 0;
    while (suffix < a.length - i && suffix < b.length - j && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
    while (i < a.length - suffix) remove();
    while (j < b.length - suffix) add();
    while (i < a.length) same();
    return result;
  }
  const stride = b.length + 1, table = new Uint32Array((a.length + 1) * stride);
  for (let x = a.length - 1; x >= 0; x--) for (let y = b.length - 1; y >= 0; y--) table[x * stride + y] = a[x] === b[y] ? table[(x + 1) * stride + y + 1] + 1 : Math.max(table[(x + 1) * stride + y], table[x * stride + y + 1]);
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) same();
    else if (j < b.length && (i === a.length || table[i * stride + j + 1] > table[(i + 1) * stride + j])) add();
    else remove();
  }
  return result;
}
