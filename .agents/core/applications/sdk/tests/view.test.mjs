import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {scopeApplicationCSS} from '../server/styles.mjs';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';

const sdk = fileURLToPath(new URL('../', import.meta.url));
const webRequire = createRequire(new URL('../../../runtime/web/package.json', import.meta.url));

test('View renders native attributes, layout and nested theme boundaries through its public entry', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-view-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const entry = join(root, 'render.tsx');
  await writeFile(entry, `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {View} from '@ksf/sdk/view';
    import {MaterialContext} from '@ksf/sdk/components/material-provider';
    export function render(mode) {
      return renderToStaticMarkup(<MaterialContext.Provider value={{settings:{themeMode:mode}}}>
        <View id="root" aria-label="layout" tabIndex={0} className="native" style={{gap:16}}>
          <View direction="row"><View theme="light"><View/></View></View>
        </View>
      </MaterialContext.Provider>);
    }
  `);
  const {build} = await import(pathToFileURL(webRequire.resolve('vite')).href);
  await build({root, configFile: false, logLevel: 'silent',
    resolve: {alias: [{find: '@ksf/sdk', replacement: join(sdk, 'src')},
      ...['react', 'react-dom'].map(name => ({find: name, replacement: dirname(webRequire.resolve(name + '/package.json'))}))]},
    ssr: {noExternal: true},
    build: {ssr: entry, outDir: join(root, 'out'), rolldownOptions: {output: {entryFileNames: 'render.mjs'}}},
  });
  const {render} = await import(pathToFileURL(join(root, 'out/render.mjs')).href);
  const dark = render('dark');
  assert.match(dark, /id="root"/);
  assert.match(dark, /aria-label="layout"/);
  assert.match(dark, /tabindex="0"/);
  assert.match(dark, /class="ksf-view native"/);
  assert.match(dark, /style="gap:16px"/);
  assert.deepEqual([...dark.matchAll(/data-ksf-view-theme="(.*?)"/g)].map(x => x[1]), ['dark', 'dark', 'light', 'light']);
  assert.deepEqual([...dark.matchAll(/data-ksf-view-direction="(.*?)"/g)].map(x => x[1]), ['column', 'row', 'column', 'column']);
  assert.deepEqual([...dark.matchAll(/data-ksf-theme="(.*?)"/g)].map(x => x[1]), ['dark', 'light']);
  assert.deepEqual([...render('light').matchAll(/data-ksf-view-theme="(.*?)"/g)].map(x => x[1]), ['light', 'light', 'light', 'light']);
  assert.match(render(undefined), /data-ksf-view-theme="system"/);
});

test('View theme CSS stays inside each application scope, including the system-theme media rule', async () => {
  const css = await readFile(join(sdk, 'src/view.css'), 'utf8') + await readFile(join(sdk, 'src/theme.css'), 'utf8');
  const scoped = scopeApplicationCSS(css, {id: 'com.example.view', version: '1.0.0'});
  assert.match(scoped, /ksf-app-com_example_view--1_0_0/);
  assert.match(scoped, /prefers-color-scheme: dark/);
  assert.doesNotMatch(css, /:root|\bbody\s*\{|\bhtml\s*\{/);
});

test('a native DOM application bundles the public theme without React or View', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-native-theme-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, 'package.json'), '{"name":"native-theme","type":"module"}');
  await writeFile(join(root, 'manifest.json'), JSON.stringify({schemaVersion: 1, sdkVersion: 1,
    id: 'com.example.theme', name: 'Native theme', description: 'Public theme integration', version: '1.0.0',
    minCoreVersion: '0.5.7', permissions: [], dataStores: [], cards: [], window: {entry: 'frontend/index.js'}}));
  await writeFile(join(root, 'frontend.tsx'), `import {bindTheme,themeVars} from '@ksf/sdk/theme';
    import '@ksf/sdk/theme.css';
    export function mount(root,sdk){const dispose=bindTheme(root,sdk);root.style.color=themeVars.foreground;return {dispose}}`);
  const built = await buildApplication(root, {local: true, quiet: true});
  const decoded = decodePackage(await readFile(built.packagePath));
  const js = decoded.files.get('frontend/index.js').data.toString();
  assert.match(js, /data-ksf-theme/);
  assert.doesNotMatch(js, /react\.transitional\.element|createRoot|@ksf\/runtime/);
  const css = [...decoded.files].filter(([name]) => name.endsWith('.css')).map(([, file]) => file.data.toString()).join('\n');
  assert.match(css, /--ksf-color-primary/);
  assert.match(css, /ksf-app-com_example_theme--1_0_0/);
});

test('an ordinary SDK app does not implicitly bundle View or require a UI runtime', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-without-view-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, 'package.json'), '{"name":"ordinary","type":"module"}');
  await writeFile(join(root, 'manifest.json'), JSON.stringify({schemaVersion: 1, sdkVersion: 1,
    id: 'com.example.ordinary', name: 'Ordinary', description: 'Optional component check', version: '1.0.0',
    minCoreVersion: '0.5.7', permissions: [], dataStores: [], cards: [], window: {entry: 'frontend/index.js'}}));
  await writeFile(join(root, 'frontend.tsx'), `import {mountReact} from '@ksf/sdk/react';
    function App(){return <div>Ordinary app</div>} export function mount(c,s){return mountReact(App,c,s)}`);
  const built = await buildApplication(root, {local: true, quiet: true});
  const decoded = decodePackage(await readFile(built.packagePath));
  assert.equal(built.manifest.uiRuntime, undefined);
  assert.equal(built.manifest.sdkApiVersion, '1.2.0');
  assert.equal(built.manifest.builtWithSdkVersion, '1.2.0');
  for (const [name, file] of decoded.files) if (/\.(css|js)$/.test(name)) {
    assert.doesNotMatch(file.data.toString(), /ksf-view/);
    assert.doesNotMatch(file.data.toString(), /@ksf\/runtime/);
  }
});
