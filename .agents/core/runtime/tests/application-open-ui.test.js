import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildOpenUIApps} from './helpers/open-ui-apps.js';
import {buildApplication} from '../../applications/sdk/build.mjs';
import {validateManifest,assertCompatible} from '../src/applications/protocol.js';
test('different component libraries and their renderers are bundled as independent ordinary SDK apps',async t=>{
 const apps=await buildOpenUIApps(t);
 for(const {root,decoded}of apps){
  assert.equal(decoded.manifest.uiRuntime,undefined);assert.equal(decoded.manifest.builtWithSdkVersion,'1.2.0');assert.equal(decoded.manifest.sdkApiVersion,'1.2.0');assert.equal(decoded.manifest.minCoreVersion,'0.5.7');
  assertCompatible(decoded.manifest,{coreVersion:'0.5.7'});
  const source=[...decoded.files.values()].filter(x=>x.type==='text/javascript'||x.path?.endsWith('.js')).map(x=>x.data.toString()).join('');
  const entry=decoded.files.get('frontend/index.js').data.toString();assert.ok(entry.length>100000);assert.doesNotMatch(entry,/@ksf\/runtime\//);assert.doesNotMatch(source,/from\s*["'](?:react|@ksf\/sdk|@radix-ui|react-grid-layout)/);
  const css=decoded.manifest.window.styles.map(path=>decoded.files.get(path).data.toString()).join('');assert.match(css,new RegExp('ksf-app-'+decoded.manifest.id.replaceAll('.','_')));
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));assert.throws(()=>validateManifest({...manifest,uiRuntime:{mode:'host-shared'}}),{code:'APP_UI_RETIRED'});
 }
 const root=apps[0].root;await writeFile(join(root,'frontend.tsx'),"import {Button} from '@ksf/sdk/ui';export const mount=Button;");await assert.rejects(buildApplication(root,{local:true,quiet:true}),/Could not load|Could not resolve|ENOENT|not resolve|Failed to resolve/);
});
