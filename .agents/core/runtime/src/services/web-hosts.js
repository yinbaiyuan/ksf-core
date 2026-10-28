import { constants, openSync, closeSync, fstatSync, readFileSync, writeSync, fsyncSync, lstatSync } from 'node:fs';
import {platformServices} from '../platform/index.js';

export const WEB_LOCAL_NAME = 'ksf.ai';
const addresses = ['127.0.0.1', '::ffff:127.0.0.1'];
const entry = addresses.map(address => `${address} ${WEB_LOCAL_NAME}`).join('\n');
const failure = (code, message) => Object.assign(new Error(message), { code });

export function webHostsPath({ platform = process.platform, env = process.env } = {}) {
  return platformServices(platform).hostsPath(env);
}

function inspect(bytes) {
  if (bytes.includes(0)) throw failure('WEB_HOSTS_INVALID', 'The hosts file must use an ASCII-compatible encoding.');
  const found = bytes.toString('utf8').split(/\r?\n/).flatMap(line => {
    const [address, ...names] = line.replace(/#.*/, '').trim().split(/\s+/);
    return names.some(name => name.toLowerCase().replace(/\.$/, '') === WEB_LOCAL_NAME) ? [address] : [];
  });
  const missing = addresses.filter(address => !found.some(value => value.toLowerCase() === address));
  return { state: found.some(address => !addresses.includes(address.toLowerCase())) ? 'conflict' : missing.length ? 'missing' : 'configured', missing };
}

export function readWebHosts({ path = webHostsPath() } = {}) {
  try { return { ...inspect(readFileSync(path)), path, entry }; }
  catch (error) { return { state: 'unavailable', path, entry, code: error.code ?? 'WEB_HOSTS_READ_FAILED' }; }
}

// Only append our mapping. Existing aliases, comments, line endings and file
// permissions stay in place; conflicting mappings require explicit correction.
export function configureWebHosts({ path = webHostsPath(), apply = false } = {}) {
  let fd;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw failure('WEB_HOSTS_INVALID', 'Expected a regular hosts file, without a file symlink.');
    const bytes = readFileSync(path), { state, missing } = inspect(bytes);
    if (state === 'conflict') throw failure('WEB_HOSTS_CONFLICT', 'ksf.ai has a conflicting hosts mapping; existing entries were preserved.');
    const result = { state, path, entry, changed: false, apply };
    if (!apply || state === 'configured') return result;
    fd = openSync(path, constants.O_RDWR | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0));
    const current = fstatSync(fd);
    if (current.dev !== stat.dev || current.ino !== stat.ino || !readFileSync(fd).equals(bytes)) {
      throw failure('WEB_HOSTS_CHANGED', 'The hosts file changed during preparation; nothing was appended.');
    }
    const newline = bytes.includes(Buffer.from('\r\n')) ? '\r\n' : '\n';
    const lines = missing.map(address => `${address} ${WEB_LOCAL_NAME}`).join(newline);
    const addition = Buffer.from(`${bytes.length && bytes.at(-1) !== 10 ? newline : ''}${lines}${newline}`);
    let written = 0;
    while (written < addition.length) written += writeSync(fd, addition, written, addition.length - written);
    fsyncSync(fd);
    if (inspect(readFileSync(path)).state !== 'configured') throw failure('WEB_HOSTS_VERIFY_FAILED', 'Cannot verify the hosts mapping after writing.');
    return { ...result, state: 'configured', changed: true };
  } catch (error) {
    if (['EACCES', 'EPERM'].includes(error.code)) throw failure('WEB_HOSTS_PERMISSION_REQUIRED', 'Updating the system hosts file requires administrator permission.');
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
