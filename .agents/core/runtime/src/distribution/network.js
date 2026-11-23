import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fail } from './errors.js';
import { parseJSON, checkedPath, writeAtomic } from './files.js';
import {sha256, isSHA} from '../shared/hash.js';
import { releaseIndexName } from './products.js';

export function resourceURL(source, base) {
  let url;
  try { url = isAbsolute(source) ? pathToFileURL(source) : base ? new URL(source, base) : new URL(source); }
  catch { fail('SOURCE_INVALID', 'Release source must be an absolute file path or URL.'); }
  if (url.username || url.password || !['file:', 'https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    fail('SOURCE_INVALID', 'Release downloads require HTTPS; local files and loopback HTTP are supported for offline use and tests.');
  }
  if (base && new URL(base).protocol !== 'file:' && url.protocol === 'file:') fail('SOURCE_INVALID', 'Network release metadata cannot select local files.');
  return url;
}
export async function download(source, { limit = 256 * 1024 * 1024, timeout = 10000, bodyTimeout = timeout, base, fetcher = fetch } = {}) {
  let url = resourceURL(source, base);
  if (url.protocol === 'file:') {
    let bytes;
    try { bytes = readFileSync(fileURLToPath(url)); }
    catch (error) { fail('DOWNLOAD_FAILED', `Cannot read release file: ${error.code ?? 'IO_ERROR'}.`); }
    if (bytes.length > limit) fail('DOWNLOAD_TOO_LARGE', 'Release file exceeds its size limit.');
    return { bytes, url: url.href };
  }
  for (let redirects = 0; redirects < 6; redirects++) {
    let response;
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), timeout);
    try { response = await fetcher(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'KSF-Core', Accept: 'application/json, application/octet-stream' } }); }
    catch { fail('DOWNLOAD_FAILED', 'Release server could not be reached within the request timeout.'); }
    finally { clearTimeout(timer); }
    timer = setTimeout(() => controller.abort(), bodyTimeout);
    try {
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) fail('DOWNLOAD_FAILED', 'Release redirect has no target.');
      const next = resourceURL(location, url);
      if (next.protocol === 'file:' || (url.protocol === 'https:' && next.protocol !== 'https:')) fail('SOURCE_INVALID', 'Unsafe release redirect.');
      await response.body?.cancel(); url = next; continue;
    }
    if (!response.ok) fail(response.status === 404 ? 'RELEASE_NOT_FOUND' : 'DOWNLOAD_FAILED', `Release server returned HTTP ${response.status}.`);
    if (Number(response.headers.get('content-length') ?? 0) > limit) { await response.body?.cancel(); fail('DOWNLOAD_TOO_LARGE', 'Release response exceeds its size limit.'); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body ?? []) {
      length += chunk.length;
      if (length > limit) fail('DOWNLOAD_TOO_LARGE', 'Release response exceeds its size limit.');
      chunks.push(Buffer.from(chunk));
    }
    return { bytes: Buffer.concat(chunks), url: url.href };
    } catch (error) {
      if (error.code === 'DOWNLOAD_TOO_LARGE' || error.code === 'SOURCE_INVALID' || error.code === 'RELEASE_NOT_FOUND' || error.code === 'DOWNLOAD_FAILED') throw error;
      fail('DOWNLOAD_FAILED', 'Release response could not be read within the download timeout.');
    } finally { clearTimeout(timer); await response.body?.cancel().catch(() => {}); }
  }
  fail('DOWNLOAD_FAILED', 'Too many release redirects.');
}
export async function releaseIndex(source, options = {}) {
  const initial = await download(source, { ...options, limit: 8 * 1024 * 1024 });
  let index = parseJSON(initial.bytes, 'release source'), url = initial.url;
  if (Array.isArray(index.assets)) {
    if (index.draft || index.prerelease) fail('RELEASE_INVALID', 'The automatic release source must select a published stable release.');
    const assets = index.assets.filter(a => a.name === releaseIndexName);
    if (assets.length !== 1 || typeof assets[0].browser_download_url !== 'string') fail('RELEASE_INVALID', `Release must contain exactly one ${releaseIndexName} asset.`);
    const downloaded = await download(assets[0].browser_download_url, { ...options, base: initial.url, limit: 8 * 1024 * 1024 });
    index = parseJSON(downloaded.bytes, 'release index'); url = downloaded.url;
  }
  return { index, url };
}

// One replaceable package, not a validity cache. Callers must obtain and
// validate the current index on every preview/install. Every reuse hashes the
// bytes again; candidates, local edits and save guards are always rechecked.
export async function downloadVerifiedArchive(root,artifact,options={}) {
  if(!isSHA(artifact?.sha256)||!Number.isSafeInteger(artifact.size)||artifact.size<1||artifact.size>256*1024*1024)
    fail('RELEASE_INVALID','Invalid Core archive identity.');
  // Source restrictions also apply to cache hits.
  resourceURL(artifact.url,options.base);
  const path=checkedPath(root,'.agents/runtime-data/system/core-download.tar.gz');
  if(existsSync(path)){
    const stat=lstatSync(path);
    if(!stat.isFile())fail('UNSAFE_PATH','The Core download cache must be a regular file.');
    if(stat.size===artifact.size){const bytes=readFileSync(path);if(sha256(bytes)===artifact.sha256)return bytes;}
  }
  const {bytes}=await download(artifact.url,{...options,limit:256*1024*1024});
  if(bytes.length!==artifact.size||sha256(bytes)!==artifact.sha256)fail('CHECKSUM_MISMATCH','Downloaded Core archive does not match the Release index.');
  writeAtomic(path,bytes,0o600);
  return bytes;
}
