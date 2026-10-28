import {platform} from '../src/platform/index.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { metadata, equalValues, parseInput } from '../src/services/metadata.js';
import { parseFrontmatter } from '../src/metadata/frontmatter.js';
import { withWriteLock, publishFile } from '../src/metadata/files.js';

function fixture(t, contents = '# 正文\n') {
  const root = mkdtempSync(join(tmpdir(), 'ksf metadata 测试 '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, '笔记.md');
  writeFileSync(target, contents);
  return { root, target, call: (operation, extra = {}, dependencies) => metadata({ root, target: '笔记.md', operation, ...extra }, dependencies) };
}

test('absent metadata is a successful read/check/remove and empty write is byte-identical', t => {
  const f = fixture(t); const before = readFileSync(f.target); const stat = statSync(f.target);
  assert.deepEqual(f.call('read', { fields: ['title'] }), { target: f.target, state: 'absent', values: {}, missingFields: ['title'] });
  assert.equal(f.call('check').valid, null);
  assert.equal(f.call('remove', { all: true }).changed, false);
  assert.equal(f.call('write', { data: {} }).changed, false);
  assert.deepEqual(readFileSync(f.target), before);
  assert.equal(statSync(f.target).mtimeMs, stat.mtimeMs);
  assert.equal(statSync(f.target).ino, stat.ino);
  assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});

test('write/read roundtrip JSON-compatible types, ordinary aliases field and date strings', t => {
  const f = fixture(t);
  const data = { title: '设计笔记', aliases: ['时间管理'], created: '2026-05-18', project: null, count: 2, yes: true, tags: ['a', 'b'], nested: { value: [1, null, false] } };
  const result = f.call('write', { data });
  assert.equal(result.changed, true); assert.equal(result.beforeState, 'absent'); assert.equal(result.afterState, 'present');
  assert.deepEqual(f.call('read').values, data);
  assert.equal(f.call('check').valid, true);
  assert.deepEqual(parseFrontmatter(readFileSync(f.target), f.target).body, Buffer.from('# 正文\n'));
  const stat = statSync(f.target);
  assert.equal(f.call('write', { data }).changed, false);
  assert.equal(statSync(f.target).mtimeMs, stat.mtimeMs);
});

test('raw YAML dates stay strings, blank values become null, quoted scalars retain types', t => {
  const f = fixture(t, '---\ncreated: 2026-05-18\nproject:\nversion: "1.0"\nyes: yes\n---\nBODY');
  assert.deepEqual(f.call('read').values, { created: '2026-05-18', project: null, version: '1.0', yes: 'yes' });
});

test('read missing fields is distinct from null and special field names are safe', t => {
  const f = fixture(t);
  const data = JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"display name":"名称","a.b":2,"a,b":3,"nil":null,"":4}');
  f.call('write', { data });
  const result = f.call('read', { fields: ['__proto__', 'nil', 'missing', 'a.b', 'a,b', ''] });
  assert.deepEqual(result.missingFields, ['missing']);
  assert.equal(Object.hasOwn(result.values, '__proto__'), true);
  assert.equal(result.values.nil, null); assert.equal(result.values[''], 4);
  assert.equal({}.polluted, undefined);
  f.call('remove', { fields: ['__proto__', 'constructor'] });
  assert.equal(Object.hasOwn(f.call('read').values, '__proto__'), false);
});

test('top-level merge replaces nested values, preserves other fields and ignores map order in no-ops', t => {
  const f = fixture(t);
  f.call('write', { data: { keep: 'yes', nested: { a: 1, b: 2 }, tags: ['a', 'b'] } });
  assert.equal(f.call('write', { data: { nested: { b: 2, a: 1 } } }).changed, false);
  f.call('write', { data: { nested: { a: 3 }, tags: ['b', 'a'] } });
  assert.deepEqual(f.call('read').values, { keep: 'yes', nested: { a: 3 }, tags: ['b', 'a'] });
  assert.equal(equalValues([1, 2], [2, 1]), false);
});

test('preview calculates changes and creates no lock or temporary files', t => {
  const f = fixture(t); const before = readFileSync(f.target);
  const result = f.call('write', { data: { title: 'a' }, dryRun: true });
  assert.equal(result.dryRun, true); assert.equal(result.changed, false); assert.equal(result.afterState, 'present');
  assert.deepEqual(result.changes, [{ type: 'added', field: 'title', before: { exists: false }, after: { exists: true, value: 'a' } }]);
  assert.deepEqual(readFileSync(f.target), before); assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});

test('single/multiple removal, missing fields, last field and entire block', t => {
  const f = fixture(t); f.call('write', { data: { a: null, b: 2, c: 3 } });
  const result = f.call('remove', { fields: ['a', 'b', 'missing'] });
  assert.deepEqual(result.missingFields, ['missing']); assert.equal(result.changes.length, 2);
  assert.deepEqual(result.changes[0].before, { exists: true, value: null });
  assert.deepEqual(f.call('read').values, { c: 3 });
  f.call('remove', { fields: ['c'] });
  assert.equal(f.call('read').state, 'present'); assert.deepEqual(f.call('read').values, {});
  const dry = f.call('remove', { all: true, dryRun: true });
  assert.equal(dry.changed, false); assert.equal(dry.afterState, 'absent'); assert.deepEqual(dry.changes, []);
  assert.equal(f.call('remove', { all: true }).changed, true);
  assert.deepEqual(readFileSync(f.target), Buffer.from('# 正文\n'));
});

test('comment-only and blank blocks are empty maps; update retains comments', t => {
  const f = fixture(t, '---\n# header\n\n---\nBODY');
  assert.deepEqual(f.call('read').values, {});
  f.call('write', { data: { title: 'new' } });
  assert.match(readFileSync(f.target, 'utf8'), /# header/);
  assert.equal(f.call('read').values.title, 'new');
});

test('BOM, CRLF and body bytes survive updates and remove-all', t => {
  const body = Buffer.from('\r\n# 正文\r\n---\r\n[[附件]]\r\n');
  const f = fixture(t, Buffer.concat([Buffer.from('\uFEFF---\r\n# 元数据\r\ntitle: "old" # keep\r\nother: 1\r\n...\r\n'), body]));
  f.call('write', { data: { title: 'new' } });
  const bytes = readFileSync(f.target);
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  assert.deepEqual(parseFrontmatter(bytes, f.target).body, body);
  assert.match(bytes.toString(), /title: "new" # keep\r\nother: 1/);
  assert.equal(bytes.toString().replace(/\r\n/g, '').includes('\n'), false);
  f.call('remove', { all: true });
  assert.deepEqual(readFileSync(f.target), Buffer.concat([Buffer.from('\uFEFF'), body]));
});

test('new blocks use the first body newline, keep BOM, and preserve body exactly', t => {
  const original = Buffer.from('\uFEFF正文\r\n第二行\n'); const f = fixture(t, original);
  f.call('write', { data: { a: true } });
  const bytes = readFileSync(f.target);
  assert.match(bytes.toString(), /^\uFEFF---\r\n/);
  assert.deepEqual(parseFrontmatter(bytes, f.target).body, original.subarray(3));
});

test('body separators and code snippets are not metadata', t => {
  const text = '# header\n---\n```yaml\na: 1\n```\n';const f = fixture(t, text);
  assert.equal(f.call('read').state, 'absent');
  f.call('write', { data: { a: 2 } });
  assert.deepEqual(parseFrontmatter(readFileSync(f.target), f.target).body, Buffer.from(text));
});

for (const [label, source, code] of [
  ['unclosed', '---\na: 1\n', 'FRONTMATTER_UNCLOSED'],
  ['duplicate', '---\na: 1\na: 2\n---\nbody', 'YAML_DUPLICATE_KEY'],
  ['syntax', '---\na: [\n---\nbody', 'YAML_INVALID'],
  ['null', '---\nnull\n---\nbody', 'METADATA_STRUCTURE_INVALID'],
  ['sequence', '---\n- a\n---\nbody', 'METADATA_STRUCTURE_INVALID'],
  ['scalar', '---\ntext\n---\nbody', 'METADATA_STRUCTURE_INVALID'],
  ['numeric key', '---\n1: text\n---\nbody', 'METADATA_STRUCTURE_INVALID'],
  ['anchor', '---\na: &shared [1]\nb: *shared\n---\nbody', 'YAML_UNSUPPORTED'],
  ['custom tag', '---\na: !custom text\n---\nbody', 'YAML_UNSUPPORTED'],
  ['unsafe integer', '---\na: 9007199254740993\n---\nbody', 'YAML_UNSUPPORTED'],
  ['infinity', '---\na: .inf\n---\nbody', 'YAML_UNSUPPORTED'],
  ['bad UTF8', Buffer.from([0xff, 0x00]), 'ENCODING_INVALID'],
]) {
  test(`${label}: all operations reject without changing original`, t => {
    const f = fixture(t, source);const original = readFileSync(f.target);
    for (const operation of ['read', 'write', 'remove', 'check']) {
      assert.throws(() => f.call(operation, { data: { a: 2 }, all: true }), { code });
      assert.deepEqual(readFileSync(f.target), original);
      assert.deepEqual(readdirSync(f.root), ['笔记.md']);
    }
  });
}

test('YAML error locations refer to one-based full Markdown lines and columns', t => {
  const f = fixture(t, '\uFEFF---\r\na: 1\r\na: 2\r\n---\r\n');
  assert.throws(() => f.call('check'), e => e.code === 'YAML_DUPLICATE_KEY' && e.details.line === 3 && e.details.column === 1);
});

test('missing targets and target symlinks fail without changing linked files', t => {
  const f = fixture(t);
  assert.throws(() => metadata({ root: f.root, target: 'missing.md', operation: 'write', data: { a: 1 } }), { code: 'FILE_NOT_FOUND' });
  const link = join(f.root, 'link.md'); symlinkSync(f.target, link);
  for (const operation of ['read', 'write', 'remove', 'check']) assert.throws(() => metadata({ root: f.root, target: link, operation, data: { a: 1 }, all: true }), { code: 'FILE_UNSUPPORTED' });
  assert.equal(readFileSync(f.target, 'utf8'), '# 正文\n');
});

test('write preserves permission bits and cleans lock/temp files', t => {
  const f = fixture(t);chmodSync(f.target, 0o640);
  f.call('write', { data: { a: 1 } });
  if(platform.supportsPosixModes)assert.equal(statSync(f.target).mode & 0o777, 0o640);
  assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});

test('exclusive metadata lock rejects concurrent writers without taking or removing their lock', t => {
  const f = fixture(t);
  withWriteLock(f.target, () => {
    const names = readdirSync(f.root);
    assert.throws(() => f.call('write', { data: { a: 1 } }), { code: 'FILE_LOCKED' });
    assert.deepEqual(readdirSync(f.root), names);
    assert.equal(f.call('write', { data: { a: 1 }, dryRun: true }).changed, false);
  });
  assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});

test('publication detects external edits, preserves them, and cleans staging files', t => {
  const f = fixture(t);
  assert.throws(() => f.call('write', { data: { a: 1 } }, {
    publish: (snapshot, bytes) => publishFile(snapshot, bytes, { beforeCheck: () => writeFileSync(f.target, '# external edit\n') }),
  }), { code: 'FILE_CONFLICT' });
  assert.equal(readFileSync(f.target, 'utf8'), '# external edit\n');
  assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});

test('failed publication before rename retains original and cleans staging files', t => {
  const f = fixture(t);const original = readFileSync(f.target);
  assert.throws(() => f.call('write', { data: { a: 1 } }, {
    publish: (snapshot, bytes) => publishFile(snapshot, bytes, { beforeCheck: () => { throw new Error('simulated failure'); } }),
  }), { code: 'FILE_WRITE_FAILED' });
  assert.deepEqual(readFileSync(f.target), original);
  assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});

test('JSON input rejects scalars and unsafe numbers without exposing input text', () => {
  for (const input of ['[1]', 'null', 'true', '{"a":Infinity}', '{"a":1e999}', '{"a":9007199254740993}', '{secret']) {
    assert.throws(() => parseInput(input), e => e.code === 'INPUT_INVALID' && e.exitCode === 2 && !e.message.includes(input));
  }
});

test('scalar updates can change types without retaining old quote semantics', t => {
  const f = fixture(t, '---\na: "text" # keep\nb: 2\nc: false\n---\nBODY');
  for (const value of [null, true, 3.5, 'line one\nline two\n', { x: 1 }, [1, 2], 'text again']) {
    f.call('write', { data: { a: value } });
    assert.deepEqual(f.call('read').values.a, value);
    assert.match(readFileSync(f.target, 'utf8'), /# keep/);
  }
});

test('remove-all preserves body even when it begins with another delimiter', t => {
  const body = '---\nThis is the body, not the managed frontmatter.\n';
  const f = fixture(t, '---\na: 1\n---\n' + body);
  assert.equal(f.call('remove', { all: true }).changed, true);
  assert.equal(readFileSync(f.target, 'utf8'), body);
});

test('services validate direct reusable API calls before touching the file', t => {
  const f = fixture(t);
  for (const data of [undefined, { a: undefined }, { a: new Date() }, { a: () => {} }]) {
    assert.throws(() => f.call('write', { data }), { code: 'INPUT_INVALID' });
  }
  assert.throws(() => f.call('remove'), { code: 'INVALID_ARGUMENTS' });
  assert.throws(() => f.call('invalid'), { code: 'INVALID_ARGUMENTS' });
  assert.deepEqual(readFileSync(f.target), Buffer.from('# 正文\n'));
});

test('finite scalar numbers including negative zero survive serialization', t => {
  const f = fixture(t);
  for (const n of [0, -0, 1.25, -2, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
    f.call('write', { data: { n } });
    assert.ok(Object.is(f.call('read').values.n, n));
  }
});

test('read-only target is not rewritten via directory permission', { skip: process.getuid?.() === 0 }, t => {
  const f = fixture(t); chmodSync(f.target, 0o444);
  assert.throws(() => f.call('write', { data: { a: 1 } }), { code: 'FILE_WRITE_FAILED' });
  assert.equal(readFileSync(f.target, 'utf8'), '# 正文\n');
  assert.deepEqual(readdirSync(f.root), ['笔记.md']);
});
