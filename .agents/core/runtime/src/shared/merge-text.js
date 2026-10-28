import { diff3Merge } from '../vendor/node-diff3/index.mjs';

// Preserve line endings and the absence of a final newline in clean merges.
const lines = bytes => bytes.toString('utf8').match(/[^\n]*\n|[^\n]+$/g) ?? [];
export function mergeText(base, local, incoming) {
  const blocks = diff3Merge(lines(local), lines(base), lines(incoming), { excludeFalseConflicts: true });
  const result = []; let conflict = false;
  function section(marker, content) {
    result.push(marker + '\n', ...content);
    if (content.length && !content.at(-1).endsWith('\n')) result.push('\n');
  }
  for (const block of blocks) {
    if (block.ok) result.push(...block.ok);
    else {
      conflict = true;
      section('<<<<<<< local', block.conflict.a);
      section('||||||| base', block.conflict.o);
      section('=======', block.conflict.b);
      result.push('>>>>>>> release\n');
    }
  }
  return { bytes: Buffer.from(result.join('')), conflict };
}
