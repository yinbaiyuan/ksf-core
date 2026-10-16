import YAML from '../vendor/yaml/dist/index.js';
import { MetadataError, decodeUtf8 } from './errors.js';

const options = { version: '1.2', schema: 'core', uniqueKeys: true, keepSourceTokens: true, intAsBigInt: true };
const standardTags = new Set(['str', 'int', 'float', 'bool', 'null', 'map', 'seq'].map(t => `tag:yaml.org,2002:${t}`));

function at(text, offset) {
  const preceding = text.slice(0, offset);
  const lines = preceding.split('\n');
  return { line: lines.length, column: [...lines.at(-1)].length + 1 };
}

export function parseFrontmatter(bytes, target) {
  const text = decodeUtf8(bytes, target);
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const content = text.slice(bom.length);
  const eol = text.match(/\r\n|\n/)?.[0] ?? '\n';
  const open = /^(---)(\r?\n|$)/.exec(content);
  if (!open) return { state: 'absent', values: {}, bytes, bom, eol, body: bytes.subarray(Buffer.byteLength(bom)) };

  const close = /^(---|\.\.\.)(\r?\n|$)/mg;
  close.lastIndex = open[0].length;
  const end = close.exec(content);
  const yamlStart = bom.length + open[0].length;
  const fail = (code, message, offset = 0) => {
    throw new MetadataError(code, message, { target, state: 'invalid', ...at(text, yamlStart + offset) });
  };
  if (!end) fail('FRONTMATTER_UNCLOSED', 'Frontmatter has no closing delimiter.');
  const source = content.slice(open[0].length, end.index);
  const doc = YAML.parseDocument(source, options);
  const problem = doc.errors[0];
  if (problem) fail(problem.code === 'DUPLICATE_KEY' ? 'YAML_DUPLICATE_KEY' : 'YAML_INVALID', 'Invalid YAML frontmatter.', problem.pos?.[0]);
  if (doc.warnings.length) fail('YAML_UNSUPPORTED', 'Unsupported YAML tag or directive.', doc.warnings[0].pos?.[0]);
  if (doc.directives.yaml.explicit && doc.directives.yaml.version !== '1.2') fail('YAML_UNSUPPORTED', 'Only YAML 1.2 is supported.');
  YAML.visit(doc, (_key, node) => {
    if (YAML.isAlias(node) || node?.anchor || (node?.tag && !standardTags.has(node.tag))) {
      fail('YAML_UNSUPPORTED', 'YAML anchors, aliases and custom tags are not supported.', node.range?.[0]);
    }
    if (YAML.isMap(node)) {
      for (const pair of node.items) {
        if (!YAML.isScalar(pair.key) || typeof pair.key.value !== 'string') fail('METADATA_STRUCTURE_INVALID', 'Mapping keys must be strings.', pair.key?.range?.[0]);
      }
    }
    if (YAML.isScalar(node)) {
      if (typeof node.value === 'bigint') {
        const number = node.value === 0n && node.source?.startsWith('-') ? -0 : Number(node.value);
        if (!Number.isSafeInteger(number)) fail('YAML_UNSUPPORTED', 'Integer is outside the safe JSON range.', node.range?.[0]);
        node.value = number;
      } else if (typeof node.value === 'number' && (!Number.isFinite(node.value) || (Number.isInteger(node.value) && !Number.isSafeInteger(node.value)))) {
        fail('YAML_UNSUPPORTED', 'Number is outside the finite safe JSON range.', node.range?.[0]);
      }
    }
  });
  // A blank/comment-only document is an empty mapping, distinct from explicit null.
  if (doc.contents === null) doc.contents = doc.createNode({});
  if (!YAML.isMap(doc.contents)) fail('METADATA_STRUCTURE_INVALID', 'Frontmatter must be a field mapping.', doc.contents?.range?.[0]);
  const values = doc.toJS({ mapAsMap: false });
  const bodyOffset = Buffer.byteLength(bom + content.slice(0, end.index + end[0].length));
  return {
    state: 'present', values, bytes, bom, eol, doc,
    opening: open[0], closing: end[0], body: bytes.subarray(bodyOffset),
  };
}

export function encodeFrontmatter(parsed, { removeAll = false } = {}) {
  if (removeAll) return Buffer.concat([Buffer.from(parsed.bom), parsed.body]);
  const yaml = parsed.doc.toString({ lineWidth: 0 }).replace(/\r?\n/g, parsed.eol);
  const opening = parsed.opening ?? `---${parsed.eol}`;
  const closing = parsed.closing ?? `---${parsed.eol}`;
  return Buffer.concat([Buffer.from(parsed.bom + opening + yaml + closing), parsed.body]);
}

export function createFrontmatter(parsed) {
  return { ...parsed, doc: new YAML.Document({}, options) };
}

export function setField(doc, field, value) {
  const old = doc.get(field, true);
  if (YAML.isScalar(old) && (value === null || typeof value !== 'object')) {
    // Keep scalar style, comments and key position when replacing scalar values.
    old.value = value;
    delete old.source;
  } else {
    const node = doc.createNode(value);
    if (old) {
      node.comment = old.comment;
      node.commentBefore = old.commentBefore;
      node.spaceBefore = old.spaceBefore;
    }
    doc.set(field, node);
  }
}
