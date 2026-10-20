import { join, dirname, relative, isAbsolute } from 'node:path';
import { portable } from '../shared/paths.js';
import { fail } from './schema.js';

// Rebase only actual Markdown destinations, not prose examples or fenced code.
// Directory-internal links remain relative to the copied object; external links
// keep pointing at their original assets through the new relative location.
export function rebaseMarkdown(bytes, oldFile, newFile, objectDirectory, { mapExternal } = {}) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) fail('ENCODING_INVALID', 'Markdown resource must be UTF-8.', { target: oldFile });
  const rebase = destination => {
    const raw = destination.startsWith('<') && destination.endsWith('>') ? destination.slice(1, -1) : destination;
    if (mapExternal && /^(?:file:|\/(?!\/)|[a-z]:[\\/])/i.test(raw)) fail('SOURCE_RESOURCE_EXTERNAL', 'Absolute local resource links must be packaged explicitly before sharing.', { target: oldFile });
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(raw)) return destination;
    const split = raw.search(/[?#]/);
    const pathPart = split === -1 ? raw : raw.slice(0, split);
    const suffix = split === -1 ? '' : raw.slice(split);
    let decoded;
    try { decoded = decodeURIComponent(pathPart.replace(/\\([\\`*{}\[\]()#+.!<> _-])/g, '$1')); } catch { return destination; }
    const target = join(dirname(oldFile), decoded);
    const relObject = relative(objectDirectory, target);
    if (!relObject.startsWith('..' + '/') && relObject !== '..' && !isAbsolute(relObject)) return destination;
    const next = portable(relative(dirname(newFile), mapExternal ? mapExternal(target) : target)) + suffix;
    return destination.startsWith('<') ? `<${next}>` : next.replace(/ /g, '%20');
  };
  // Locate a Markdown destination, including balanced/escaped parentheses.
  function destinationAt(line, start) {
    if (line[start] === '<') {
      for (let i = start + 1; i < line.length; i++) {
        if (line[i] === '\\') { i++; continue; }
        if (line[i] === '>') return i + 1;
        if (line[i] === '\n') return null;
      }
      return null;
    }
    let depth = 0;
    for (let i = start; i < line.length; i++) {
      const char = line[i];
      if (char === '\\') { i++; continue; }
      if (char === '(') depth++;
      else if (char === ')') { if (!depth) return i; depth--; }
      else if (/\s/.test(char)) return depth ? null : i;
    }
    return depth ? null : line.length;
  }
  function inlineLinks(line) {
    let output = '', cursor = 0, brackets = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '`') {
        const run = /^`+/.exec(line.slice(i))[0];
        const end = line.indexOf(run, i + run.length);
        if (end !== -1) { i = end + run.length - 1; continue; }
      }
      if (line[i] === '[') brackets++;
      if (line[i] !== ']' || !brackets) continue;
      brackets--;
      if (line[i + 1] !== '(') continue;
      let start = i + 2;
      while (/[ \t]/.test(line[start] ?? '') && start < line.length) start++;
      const end = destinationAt(line, start);
      if (end === null || end <= start || !/^\s*(?:["'][^\n]*?["']\s*|\([^\n]*?\)\s*)?\)/.test(line.slice(end))) continue;
      output += line.slice(cursor, start) + rebase(line.slice(start, end));
      cursor = end; i = end - 1;
    }
    return output + line.slice(cursor);
  }
  let fenced = null;
  const lines = text.split(/(?<=\n)/);
  return Buffer.from(lines.map(line => {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenced) fenced = { char: fence[1][0], length: fence[1].length };
      else if (fence[1][0] === fenced.char && fence[1].length >= fenced.length) fenced = null;
      return line;
    }
    if (fenced || /^(?: {4}|\t)/.test(line)) return line;
    const definition = /^(\s{0,3}\[[^\]]+\]:[ \t]*)/.exec(line);
    if (definition) {
      const start = definition[0].length, end = destinationAt(line, start);
      if (end !== null && end > start) return line.slice(0, start) + rebase(line.slice(start, end)) + line.slice(end);
    }
    return inlineLinks(line);
  }).join(''));
}

