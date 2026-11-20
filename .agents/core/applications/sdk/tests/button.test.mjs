import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';

const sdk = fileURLToPath(new URL('../', import.meta.url));
const webRequire = createRequire(new URL('../../../runtime/web/package.json', import.meta.url));

test('public Button preserves native button and form semantics without implicit submission', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-button-render-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const entry = join(root, 'render.tsx');
  await writeFile(entry, `import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {Button} from '@ksf/sdk/button';
    export const markup = renderToStaticMarkup(<form id="form">
      <Button name="action" value="inspect" aria-describedby="help" className="local" style={{marginTop:4}}>查看</Button>
      <Button type="submit" variant="solid" tone="primary" form="form" name="action" value="save">保存</Button>
      <Button type="reset" variant="text">还原</Button>
      <Button disabled aria-label="不能执行">禁用</Button><Button loading icon={<span>＋</span>}>执行中</Button>
    </form>);`);
  const {build} = await import(pathToFileURL(webRequire.resolve('vite')).href);
  await build({root, configFile: false, logLevel: 'silent',
    resolve: {alias: [{find: '@ksf/sdk', replacement: join(sdk, 'src')},
      ...['react', 'react-dom'].map(name => ({find: name, replacement: dirname(webRequire.resolve(name + '/package.json'))}))]},
    ssr: {noExternal: true},
    build: {ssr: entry, outDir: join(root, 'out'), rolldownOptions: {output: {entryFileNames: 'render.mjs'}}},
  });
  const {markup} = await import(pathToFileURL(join(root, 'out/render.mjs')).href);
  const buttons = [...markup.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)];
  assert.equal(buttons.length, 5);
  assert.match(buttons[4][1], /disabled=""/); assert.match(buttons[4][1], /aria-busy="true"/); assert.match(buttons[4][2], /ksf-button-spinner/);
  assert.match(buttons[0][1], /type="button"/);
  assert.match(buttons[0][1], /name="action"/);
  assert.match(buttons[0][1], /value="inspect"/);
  assert.match(buttons[0][1], /aria-describedby="help"/);
  assert.match(buttons[0][1], /class="ksf-button local"/);
  assert.match(buttons[0][1], /style="[^"]*margin-top:4px/);
  assert.match(buttons[1][1], /type="submit"/);
  assert.match(buttons[1][1], /form="form"/);
  assert.match(buttons[2][1], /type="reset"/);
  assert.match(buttons[3][1], /disabled=""/);
  assert.match(buttons[3][1], /aria-label="不能执行"/);
  assert.doesNotMatch(markup, /role="button"|tabindex|data-ksf-theme=/);
});

test('a Button app bundles its own scoped styles and uses public theme tokens with no shared runtime', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-button-build-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, 'package.json'), '{"name":"button-app","type":"module"}');
  await writeFile(join(root, 'manifest.json'), JSON.stringify({schemaVersion: 1, sdkVersion: 1,
    id: 'com.example.button', name: 'Button app', description: 'Public button integration', version: '1.0.0',
    minCoreVersion: '0.5.7', permissions: [], dataStores: [], cards: [], window: {entry: 'frontend/index.js'}}));
  await writeFile(join(root, 'frontend.tsx'), `import {mountReact} from '@ksf/sdk/react';
    import {View} from '@ksf/sdk/view';import {Button} from '@ksf/sdk/button';
    function App(){return <View><Button variant="solid" tone="primary">运行</Button></View>}
    export function mount(c,s){return mountReact(App,c,s)}`);
  const result = await buildApplication(root, {local: true, quiet: true});
  const decoded = decodePackage(await readFile(result.packagePath));
  assert.equal(result.manifest.uiRuntime, undefined);
  const css = [...decoded.files].filter(([name]) => name.endsWith('.css')).map(([, file]) => file.data.toString()).join('\n');
  assert.match(css, /ksf-app-com_example_button--1_0_0/);
  assert.match(css, /ksf-button/);
  assert.match(css, /var\(--ksf-button-on-accent\)/);
  assert.match(css, /var\(--ksf-color-focus-ring\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /forced-colors/);
  const js = decoded.files.get('frontend/index.js').data.toString();
  assert.doesNotMatch(js, /@ksf\/runtime|@ksf\/sdk\/ui/);
});
