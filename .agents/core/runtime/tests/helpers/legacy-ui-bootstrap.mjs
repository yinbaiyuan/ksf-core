// Historical snapshot fixture only. Not a production builder.
import {createHash} from 'node:crypto';
import {UI_RUNTIME_MODULES,UI_RUNTIME_EXPORT_FEATURES,UI_SUPPORTED_BEHAVIOR_VERSIONS} from '../../src/web/legacy-frontend-contract.js';
export const FRONTEND_HOST_COMPATIBILITY=Object.freeze({workbenchContract:'ksf-workbench-v1',minimumCoreVersion:'0.6.0',maximumCoreVersionExclusive:'0.7.0'});

/** One import map per workbench document. Values always point at this build's assets. */
export function createUIBootstrap(manifest, {sourceDigest, contractVersion, rendererFamily, files,hostCompatibility=FRONTEND_HOST_COMPATIBILITY,behaviorVersions=UI_SUPPORTED_BEHAVIOR_VERSIONS,features=['ui.provider','ui.policy','ui.compatibility','ui.save','ui.save-reset','ui.run','ui.session','ui.overlay','ui.commands','ui.loader','ui.primitives','ui.composites','ui.resources','ui.ai','ui.domain','ui.settings','ui.project-workspace','ui.run-workspace','ui.desktop','ui.files','ui.legacy','ui.document-boot']}) {
  if(!Array.isArray(behaviorVersions)||!behaviorVersions.length||new Set(behaviorVersions).size!==behaviorVersions.length||behaviorVersions.some(version=>!UI_SUPPORTED_BEHAVIOR_VERSIONS.includes(version)))throw Error('Unsupported shared UI behavior target.');
  if (!/^[a-f0-9]{64}$/.test(files['index.html'] ?? '')) throw Error('Missing base workbench HTML digest.');
  const imports = {}, styles = new Set(), visited = new Set();
  const resources=Object.fromEntries(Object.keys(files).filter(name=>name.startsWith('assets/')).sort().map(name=>[name,[]]));
  for(const item of Object.values(manifest)){
    if(!files[item.file])throw Error(`Missing frontend resource ${item.file}`);
    const dependencies=[...(item.imports??[]),...(item.dynamicImports??[])].map(key=>{if(!manifest[key])throw Error(`Missing UI runtime dependency ${key}`);return manifest[key].file;});
    const targets=[...dependencies,...(item.css??[]),...(item.assets??[])];
    for(const target of targets)if(!files[target])throw Error(`Missing frontend resource ${target}`);
    resources[item.file]=[...new Set(targets)].sort();
  }
  function collectStyles(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const item = manifest[key];
    if (!item) throw Error(`Missing UI runtime dependency ${key}`);
    for (const css of item.css ?? []) { if (!files[css]) throw Error(`Missing UI stylesheet ${css}`); styles.add('/' + css); }
    for (const dependency of item.imports ?? []) collectStyles(dependency);
  }
  for (const {specifier,entry:name,feature} of UI_RUNTIME_MODULES) {
    const entry = Object.entries(manifest).find(([, item]) => item.isEntry && item.name === name);
    const used=feature&&features.includes(feature)||Object.values(UI_RUNTIME_EXPORT_FEATURES[specifier]??{}).some(item=>features.includes(item));
    if(!entry&&feature&&!used)continue;
    if (!entry || !files[entry[1].file]) throw Error(`Missing shared runtime entry ${name}`);
    imports[specifier] = '/' + entry[1].file;
    collectStyles(entry[0]);
  }
  const importMap = JSON.stringify({imports}).replaceAll('<', '\\u003c');
  const importMapHash = createHash('sha256').update(importMap).digest('base64');
  const orderedFiles = Object.fromEntries(Object.keys(files).sort().map(key => [key, files[key]]));
  const frontendReleaseId = createHash('sha256').update(JSON.stringify({sourceDigest, contractVersion, rendererFamily,features,behaviorVersions,hostCompatibility,resources,files: orderedFiles})).digest('hex');
  return {
    protocol: 'ksf-ui-runtime-v1', contractVersion, rendererFamily, frontendReleaseId,hostCompatibility,
    features,behaviorVersions:[...behaviorVersions],
    imports, styles: [...styles].sort(), importMap, importMapHash,resources,baseHtmlDigest: files['index.html'],
  };
}

export function injectUIBootstrap(html, runtime) {
  if (html.includes('id="ksf-ui-import-map"')) throw Error('UI import map is already present.');
  const links = runtime.styles.map(url => `<link rel="stylesheet" data-ksf-ui-runtime href="${url}">`).join('\n');
  const descriptor = JSON.stringify({contractVersion: runtime.contractVersion, rendererFamily: runtime.rendererFamily, frontendReleaseId: runtime.frontendReleaseId, features: runtime.features,...(runtime.behaviorVersions?{behaviorVersions:runtime.behaviorVersions}:{})}).replaceAll('<', '\\u003c');
  const bootstrap = `<script type="application/json" id="ksf-ui-runtime-descriptor">${descriptor}</script>\n<script type="importmap" id="ksf-ui-import-map">${runtime.importMap}</script>\n${links}\n`;
  // Must precede the host module too, so every consumer starts with one fixed map.
  const at = html.search(/<script\b[^>]*\btype="module"/);
  if (at < 0) throw Error('Workbench module entry is missing.');
  return html.slice(0, at) + bootstrap + html.slice(at);
}
