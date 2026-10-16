import { gzipSync, gunzipSync } from 'node:zlib';
import { fail, validRelative } from './common.js';

const block = 512, limit = 512 * 1024 * 1024;
function octal(value, length) { return value.toString(8).padStart(length - 1, '0') + '\0'; }
function splitName(path) {
  if (Buffer.byteLength(path) <= 100) return [path, ''];
  for (let slash = path.lastIndexOf('/'); slash > 0; slash = path.lastIndexOf('/', slash - 1)) {
    const prefix = path.slice(0, slash), name = path.slice(slash + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) return [name, prefix];
  }
  fail('ARCHIVE_PATH_INVALID', `Path exceeds USTAR limits: ${path}.`);
}
export function createArchive(entries) {
  const parts = [], names = new Set();
  for (const entry of entries) {
    if (!validRelative(entry.path) || names.has(entry.path)) fail('ARCHIVE_INVALID', `Invalid or duplicate path: ${entry.path}.`);
    names.add(entry.path);
    const bytes = Buffer.from(entry.bytes), header = Buffer.alloc(block), [name, prefix] = splitName(entry.path);
    header.write(name, 0, 100); header.write(octal(entry.mode ?? 0o644, 8), 100, 8);
    header.write(octal(0, 8), 108, 8); header.write(octal(0, 8), 116, 8);
    header.write(octal(bytes.length, 12), 124, 12); header.write(octal(0, 12), 136, 12);
    header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257, 6);
    header.write('00', 263, 2); header.write(prefix, 345, 155);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    parts.push(header, bytes, Buffer.alloc((block - bytes.length % block) % block));
  }
  parts.push(Buffer.alloc(block * 2));
  if (parts.reduce((sum, p) => sum + p.length, 0) > limit) fail('ARCHIVE_TOO_LARGE', 'Release exceeds the unpacked size limit.');
  return gzipSync(Buffer.concat(parts), { level: 6 });
}
export function readArchive(compressed) {
  let bytes;
  try { bytes = gunzipSync(compressed, { maxOutputLength: limit }); }
  catch { fail('ARCHIVE_INVALID', 'Invalid or oversized gzip archive.'); }
  const entries = new Map();
  const string = (header, start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
  function number(header, start, length) {
    const value = string(header, start, length).trim();
    if (!/^[0-7]+$/.test(value)) fail('ARCHIVE_INVALID', 'Invalid USTAR numeric field.');
    const result = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(result)) fail('ARCHIVE_INVALID', 'Oversized USTAR numeric field.');
    return result;
  }
  let offset = 0, terminated = false;
  while (offset + block <= bytes.length) {
    const header = bytes.subarray(offset, offset + block); offset += block;
    if (header.every(b => b === 0)) { terminated = offset + block <= bytes.length; break; }
    const checksum = number(header, 148, 8);
    const actual = header.reduce((sum, value, i) => sum + (i >= 148 && i < 156 ? 32 : value), 0);
    if (checksum !== actual || string(header, 257, 6) !== 'ustar' || ![0, 48].includes(header[156])) fail('ARCHIVE_INVALID', 'Only checksum-valid USTAR regular files are accepted.');
    const name = string(header, 0, 100), prefix = string(header, 345, 155), path = prefix ? `${prefix}/${name}` : name;
    const size = number(header, 124, 12), mode = number(header, 100, 8);
    if (!validRelative(path) || entries.has(path) || ![0o644, 0o755].includes(mode) || entries.size >= 20000 || offset + size > bytes.length) fail('ARCHIVE_INVALID', `Unsafe or duplicate archive member: ${path}.`);
    entries.set(path, { path, bytes: Buffer.from(bytes.subarray(offset, offset + size)), mode });
    offset += Math.ceil(size / block) * block;
  }
  if (!terminated || entries.size === 0 || bytes.subarray(offset).some(b => b !== 0)) fail('ARCHIVE_INVALID', 'Incomplete archive or unexpected trailing data.');
  return entries;
}
