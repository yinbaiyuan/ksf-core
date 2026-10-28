import { inflateRawSync } from 'node:zlib';

// Read selected regular ZIP members without unpacking untrusted paths. The outer
// archive must first match its pinned SHA256. ZIP64/encrypted archives fail closed.
export function zipMembers(bytes, requested) {
  const fail = message => { throw Object.assign(new Error(message), { code: 'ARCHIVE_INVALID' }); };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail('Unsupported ZIP directory.');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
  if (count === 65535 || offset + size > end) fail('Invalid ZIP bounds.');
  const found = new Map(), names = new Set(); let at = offset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > offset + size || bytes.readUInt32LE(at) !== 0x02014b50) fail('Invalid ZIP entry.');
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10), packed = bytes.readUInt32LE(at + 20), unpacked = bytes.readUInt32LE(at + 24);
    const length = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), mode = bytes.readUInt32LE(at + 38) >>> 16, local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + length).toString('utf8');
    if (at + 46 + length + extra + comment > offset + size || names.has(name)) fail('Duplicate or truncated ZIP entry.');
    names.add(name); at += 46 + length + extra + comment;
    if (!requested.includes(name)) continue;
    if (flags & 1 || ![0, 8].includes(method) || mode && (mode & 0o170000) && (mode & 0o170000) !== 0o100000 || unpacked > 512 * 1024 * 1024) fail('ZIP member must be a bounded regular file.');
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50) fail('Invalid local ZIP header.');
    const localLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28), start = local + 30 + localLength + localExtra;
    if (bytes.subarray(local + 30, local + 30 + localLength).toString('utf8') !== name || start + packed > offset) fail('Invalid ZIP member bounds.');
    const data = bytes.subarray(start, start + packed), content = method === 8 ? inflateRawSync(data, { maxOutputLength: unpacked + 1 }) : data;
    if (content.length !== unpacked) fail('ZIP member size mismatch.');
    found.set(name, content);
  }
  if (at !== offset + size || requested.some(name => !found.has(name))) fail('Required ZIP members missing.');
  return found;
}
