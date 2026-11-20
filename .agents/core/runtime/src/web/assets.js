import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {validateUIRuntime,UI_RUNTIME_MODULES,UI_RUNTIME_SPECIFIERS,UI_RUNTIME_EXPORT_FEATURES} from './legacy-frontend-contract.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Object.assign(new Error(message), { code: 'WEB_BUILD_INVALID' }); };
const sourceEntries = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'src', 'scripts'];
export function webSourceDigest(directory) {
  const sum = createHash('sha256');
  function walk(relative) {
    const path = join(directory, relative), stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail('Frontend source cannot contain symlinks.');
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(`${relative}/${name}`);
    else if (stat.isFile()) sum.update(JSON.stringify([relative, hash(readFileSync(path))]));
    else fail('Unsupported frontend source entry.');
  }
  for (const name of sourceEntries) walk(name);
  for (const name of ['route-evolution.js', 'view-targets.js']) {
    const path = join(directory, '../src/routing', name);
    if (lstatSync(path).isSymbolicLink()) fail('Shared frontend source cannot contain symlinks.');
    sum.update(JSON.stringify([`shared/${name}`, hash(readFileSync(path))]));
  }
  for(const name of ['keys.js','keys.d.ts']){const path=join(directory,'../src/applications/icon-layers',name);if(existsSync(path))sum.update(JSON.stringify([`shared/icon-layers/${name}`,hash(readFileSync(path))]));}
  const sdk=join(directory,'../../applications/sdk/src');
  function shared(path,label){const stat=lstatSync(path);if(stat.isSymbolicLink())fail('Shared SDK source cannot contain symlinks.');if(stat.isDirectory())for(const name of readdirSync(path).sort())shared(join(path,name),`${label}/${name}`);else if(stat.isFile())sum.update(JSON.stringify([label,hash(readFileSync(path))]));}
  if(existsSync(sdk)){shared(sdk,'application-sdk');const metadata=join(sdk,'../package.json');if(existsSync(metadata))shared(metadata,'application-sdk/package.json');}
  const diagramAdapter=join(sdk,'../server/mermaid-csp.mjs');
  if(existsSync(diagramAdapter))shared(diagramAdapter,'application-sdk/server/mermaid-csp.mjs');
  return sum.digest('hex');
}
const safeAsset = name => typeof name === 'string' && /^(?:index\.html|THIRD_PARTY_NOTICES\.txt|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|jpg|woff2?|ttf))$/.test(name);
export function verifyWebBuild(directory, { optional = false } = {}) {
  if (optional && !['package.json', 'index.html', 'src', 'dist'].some(name => existsSync(join(directory, name)))) return null;
  try{return verifyFrontendSnapshot(join(directory,'dist'),{expectedSourceDigest:webSourceDigest(directory)});}
  catch(error){if(error.code==='WEB_BUILD_INVALID')throw error;fail('Cannot verify the packaged frontend. Run npm run build in runtime/web before building Core.');}
}

/** Historical bytes require a previously recorded build-manifest digest. Current source builds still require source equality. */
export function verifyFrontendSnapshot(dist, {expectedSourceDigest, expectedBuildDigest} = {}) {
  try {
    if(!expectedSourceDigest&&!expectedBuildDigest)fail('Frontend snapshot provenance is required.');
    if (lstatSync(dist).isSymbolicLink()) fail('Frontend output cannot be a symlink.');
    const infoPath = join(dist, 'build.json');
    if (!lstatSync(infoPath).isFile() || lstatSync(infoPath).isSymbolicLink()) fail('Invalid frontend build metadata.');
    const buildBytes=readFileSync(infoPath),buildDigest=hash(buildBytes);
    if(expectedBuildDigest!==undefined&&(!/^[a-f0-9]{64}$/.test(expectedBuildDigest)||expectedBuildDigest!==buildDigest))fail('Frontend snapshot manifest digest mismatch.');
    const info = JSON.parse(buildBytes.toString('utf8'));
    if (info.protocol !== 'ksf-web-build-v1' || !info.files || typeof info.files !== 'object' || Array.isArray(info.files) ||
        !info.files['index.html'] || !info.files['THIRD_PARTY_NOTICES.txt'] || !Object.keys(info.files).some(p => p.endsWith('.js')) ||
        !/^[a-f0-9]{64}$/.test(info.sourceDigest??'') || expectedSourceDigest!==undefined&&info.sourceDigest !== expectedSourceDigest) fail('Frontend build is missing or stale. Run npm ci and npm run build in runtime/web with the bundled Node.');
    const assets = new Map();
    for (const [name, digest] of Object.entries(info.files)) {
      if (!safeAsset(name) || !/^[a-f0-9]{64}$/.test(digest)) fail('Invalid frontend asset manifest.');
      let current = dist;
      for (const part of name.split('/')) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink()) fail('Frontend assets cannot contain symlinks.');
      }
      if (!lstatSync(current).isFile()) fail('Invalid frontend asset.');
      const bytes = readFileSync(current);
      if (hash(bytes) !== digest) fail('Frontend asset checksum mismatch. Rebuild the frontend.');
      if (name === 'THIRD_PARTY_NOTICES.txt') continue;
      const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.ttf') ? 'font/ttf' : name.endsWith('.woff') ? 'font/woff' : 'font/woff2';
      assets.set(`/${name}`, { bytes, type: /\.(?:jpg|ttf|woff2?)$/.test(name) ? type : `${type}; charset=utf-8` });
    }
    assets.set('/', assets.get('/index.html'));
    if (info.frontendRuntime !== undefined) {
      if (info.uiRuntime !== undefined) fail('Ambiguous frontend metadata.');
      const runtime=info.frontendRuntime, graph=runtime?.resources;
      if(runtime?.protocol!=='ksf-frontend-runtime-v1'||!/^[a-f0-9]{64}$/.test(runtime.frontendReleaseId??'')||
          !/^[a-f0-9]{64}$/.test(runtime.baseHtmlDigest??'')||!runtime.hostCompatibility||
          runtime.hostCompatibility.workbenchContract!=='ksf-workbench-v1'||
          !/^\d+\.\d+\.\d+$/.test(runtime.hostCompatibility.minimumCoreVersion??'')||
          !/^\d+\.\d+\.\d+$/.test(runtime.hostCompatibility.maximumCoreVersionExclusive??'')||
          JSON.stringify(runtime.features)!==JSON.stringify(['document-boot'])) fail('Invalid frontend snapshot metadata.');
      if(!graph||typeof graph!=='object'||Array.isArray(graph)||Object.keys(graph).length>20000||
          Object.keys(info.files).some(path=>path.startsWith('assets/')&&!Object.hasOwn(graph,path)))fail('Frontend resource closure is incomplete.');
      for(const [path,targets]of Object.entries(graph))if(!assets.has('/'+path)||!path.startsWith('assets/')||!Array.isArray(targets)||targets.length>20000||targets.some(target=>typeof target!=='string'||!assets.has('/'+target)))fail('Frontend resource reference is missing.');
      const html=assets.get('/').bytes.toString('utf8');
      for(const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g))if(!assets.has(match[1].replace(/^\.\//,'/')))fail('Workbench HTML refers to an unverified resource.');
      const bootstrap=`<script type="application/json" id="ksf-frontend-runtime">${JSON.stringify({frontendReleaseId:runtime.frontendReleaseId})}</script>\n`;
      if((html.match(/id="ksf-frontend-runtime"/g)??[]).length!==1||html.includes('type="importmap"')||!html.includes(bootstrap)||html.indexOf(bootstrap)>html.search(/<script\b[^>]*\btype="module"/)||hash(Buffer.from(html.replace(bootstrap,'')))!==runtime.baseHtmlDigest)fail('Frontend descriptor and base HTML mismatch.');
      const releaseFiles={...info.files,'index.html':runtime.baseHtmlDigest};
      const orderedFiles=Object.fromEntries(Object.keys(releaseFiles).sort().map(key=>[key,releaseFiles[key]]));
      if(hash(Buffer.from(JSON.stringify({sourceDigest:info.sourceDigest,hostCompatibility:runtime.hostCompatibility,resources:graph,files:orderedFiles})))!==runtime.frontendReleaseId)fail('Frontend release identity mismatch.');
      Object.defineProperty(assets,'frontendRuntime',{value:deepFreeze(runtime)});
      // Legacy store/API name preserves existing snapshot selection records, not a shared UI contract.
      Object.defineProperty(assets,'uiRuntime',{value:runtime});
    }
    if (info.uiRuntime !== undefined) {
      const runtime = info.uiRuntime;
      try{validateUIRuntime(runtime);}catch{fail('Invalid shared UI runtime contract.');}
      if (!runtime || runtime.protocol !== 'ksf-ui-runtime-v1' || !/^\d+\.\d+\.\d+$/.test(runtime.contractVersion ?? '') ||
          runtime.rendererFamily !== 'ksf-react-v1' || !/^[a-f0-9]{64}$/.test(runtime.frontendReleaseId ?? '') ||
          !/^[a-f0-9]{64}$/.test(runtime.baseHtmlDigest ?? '') ||
          !runtime.hostCompatibility || runtime.hostCompatibility.workbenchContract!=='ksf-workbench-v1' ||
          !/^\d+\.\d+\.\d+$/.test(runtime.hostCompatibility.minimumCoreVersion??'') || !/^\d+\.\d+\.\d+$/.test(runtime.hostCompatibility.maximumCoreVersionExclusive??'') ||
          !Array.isArray(runtime.features) || runtime.features.some(value => typeof value !== 'string' || !/^[a-z][a-z0-9._-]{0,95}$/.test(value)) ||
          !runtime.imports || typeof runtime.imports !== 'object' || Array.isArray(runtime.imports) || !Array.isArray(runtime.styles)) fail('Invalid shared UI runtime metadata.');
      const specifiers = UI_RUNTIME_MODULES.filter(item=>!item.feature||runtime.features.includes(item.feature)||Object.values(UI_RUNTIME_EXPORT_FEATURES[item.specifier]??{}).some(feature=>runtime.features.includes(feature))).map(item=>item.specifier);
      const graph=runtime.resources;
      if(!graph||typeof graph!=='object'||Array.isArray(graph)||Object.keys(graph).length>20000||Object.keys(info.files).some(path=>path.startsWith('assets/')&&!Object.hasOwn(graph,path)))fail('Shared frontend resource closure is incomplete.');
      for(const [path,targets]of Object.entries(graph))if(!assets.has('/'+path)||!path.startsWith('assets/')||!Array.isArray(targets)||targets.length>20000||targets.some(target=>typeof target!=='string'||!assets.has('/'+target)))fail('Shared frontend resource reference is missing.');
      if (Object.keys(runtime.imports).some(key=>!UI_RUNTIME_SPECIFIERS.includes(key)) || specifiers.some(key => !Object.hasOwn(runtime.imports, key))) fail('Shared UI module map is incomplete.');
      if (Object.values(runtime.imports).some(path => typeof path !== 'string' || !/^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(path) || !assets.has(path)) ||
          runtime.styles.some(path => typeof path !== 'string' || !/^\/assets\/[A-Za-z0-9_.-]+\.css$/.test(path) || !assets.has(path))) fail('Shared UI resources are not in the verified build.');
      const importMap = JSON.stringify({imports: runtime.imports}).replaceAll('<', '\\u003c');
      if (runtime.importMap !== importMap || runtime.importMapHash !== createHash('sha256').update(importMap).digest('base64')) fail('Shared UI import map integrity mismatch.');
      const html = assets.get('/').bytes.toString('utf8');
      for(const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g))if(!assets.has(match[1].replace(/^\.\//,'/')))fail('Workbench HTML refers to an unverified resource.');
      const marker = `<script type="importmap" id="ksf-ui-import-map">${importMap}</script>`;
      if ((html.match(/id="ksf-ui-import-map"/g)??[]).length !== 1 || !html.includes(marker) || html.indexOf(marker) > html.search(/<script\b[^>]*\btype="module"/)) fail('Shared UI import map must precede the workbench entry.');
      const descriptor = JSON.stringify({contractVersion: runtime.contractVersion, rendererFamily: runtime.rendererFamily, frontendReleaseId: runtime.frontendReleaseId, features: runtime.features,...(runtime.behaviorVersions?{behaviorVersions:runtime.behaviorVersions}:{})}).replaceAll('<', '\\u003c');
      const links = runtime.styles.map(url => `<link rel="stylesheet" data-ksf-ui-runtime href="${url}">`).join('\n');
      const bootstrap = `<script type="application/json" id="ksf-ui-runtime-descriptor">${descriptor}</script>\n${marker}\n${links}\n`;
      if (!html.includes(bootstrap) || hash(Buffer.from(html.replace(bootstrap, ''))) !== runtime.baseHtmlDigest) fail('Shared UI bootstrap and base HTML mismatch.');
      const releaseFiles = {...info.files, 'index.html': runtime.baseHtmlDigest};
      const orderedFiles = Object.fromEntries(Object.keys(releaseFiles).sort().map(key => [key, releaseFiles[key]]));
      if (hash(Buffer.from(JSON.stringify({sourceDigest: info.sourceDigest, contractVersion: runtime.contractVersion, rendererFamily: runtime.rendererFamily,features:runtime.features,...(runtime.behaviorVersions?{behaviorVersions:runtime.behaviorVersions}:{}),hostCompatibility:runtime.hostCompatibility,resources:graph,files: orderedFiles}))) !== runtime.frontendReleaseId) fail('Shared UI release identity mismatch.');
      Object.defineProperty(assets, 'uiRuntime', {value: deepFreeze(runtime)});
    }
    Object.defineProperty(assets,'snapshotInfo',{value:deepFreeze({buildDigest,sourceDigest:info.sourceDigest,files:info.files})});
    return assets;
  } catch (error) {
    if (error.code === 'WEB_BUILD_INVALID') throw error;
    fail('Cannot verify the packaged frontend. Run npm run build in runtime/web before building Core.');
  }
}
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))deepFreeze(item);Object.freeze(value);}return value;}
