import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {buildApplication} from '../build.mjs';
import {decodePackage} from '../server/protocol.js';
import {queryComponents} from '../server/components/query.mjs';

const sdk = fileURLToPath(new URL('../', import.meta.url));
const app = fileURLToPath(new URL('../../component-library', import.meta.url));
const webRequire = createRequire(new URL('../../../runtime/web/package.json', import.meta.url));

test('foundation public entries preserve document semantics and one accessible name per icon', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-foundation-render-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const entry = join(root, 'render.tsx');
  await writeFile(entry, `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
    import {Text,Heading,InlineCode} from '@ksf/sdk/typography';import {Icon} from '@ksf/sdk/icon';import {Kbd} from '@ksf/sdk/kbd';
    const Glyph=props=><svg {...props}><path d="M0 0h1"/></svg>;
    export const markup=renderToStaticMarkup(<>
      <Heading level={1} id="title">标题</Heading><Heading level={6}>六级标题</Heading>
      <Text as="p" size="small" tone="muted" aria-describedby="hint" className="local">正文 &amp; <InlineCode>value &lt; 3</InlineCode></Text>
      <Text>行内文字</Text><Icon icon={Glyph}/><Icon icon={Glyph} label="  搜索  " size={24} data-local="named"/>
      <Icon icon={Glyph} label="  "/><Kbd aria-label="Command K" data-local="key">⌘ K</Kbd>
    </>);`);
  const {build} = await import(pathToFileURL(webRequire.resolve('vite')).href);
  await build({root, configFile: false, logLevel: 'silent',
    resolve: {alias: [{find: '@ksf/sdk', replacement: join(sdk, 'src')}, ...['react','react-dom'].map(name => ({find:name,replacement:dirname(webRequire.resolve(name+'/package.json'))}))]},
    ssr: {noExternal:true}, build: {ssr:entry,outDir:join(root,'out'),rolldownOptions:{output:{entryFileNames:'render.mjs'}}}});
  const {markup} = await import(pathToFileURL(join(root,'out/render.mjs')).href);
  assert.match(markup, /<h1[^>]*id="title"/); assert.match(markup, /<h6/);
  assert.match(markup, /<p[^>]*aria-describedby="hint"[^>]*class="ksf-text local"/);
  assert.match(markup, /data-ksf-text-size="small"/); assert.match(markup, /data-ksf-text-tone="muted"/);
  assert.match(markup, /<code[^>]*>value &lt; 3<\/code>/); assert.match(markup, /<span[^>]*data-ksf-text-size="body"/);
  assert.equal([...markup.matchAll(/role="img"/g)].length,1); assert.match(markup,/aria-label="搜索"/);
  assert.equal([...markup.matchAll(/<span[^>]*class="ksf-icon"[^>]*aria-hidden="true"/g)].length,2);
  assert.equal([...markup.matchAll(/<svg[^>]*aria-hidden="true"[^>]*focusable="false"/g)].length,3);
  assert.match(markup,/style="width:24px;height:24px"/);
  assert.match(markup,/<kbd[^>]*aria-label="Command K"[^>]*>⌘ K<\/kbd>/);
  assert.doesNotMatch(markup,/role="button"|tabindex|data-ksf-theme=/);
});

test('foundation app packages scoped styles and has no required shared runtime or icon collection', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ksf-foundation-build-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  await writeFile(join(root,'package.json'),'{"name":"foundation-app","type":"module"}');
  await writeFile(join(root,'manifest.json'),JSON.stringify({schemaVersion:1,sdkVersion:1,id:'com.example.foundation',name:'Foundation',description:'Public entry integration',version:'1.0.0',minCoreVersion:'0.5.7',permissions:[],dataStores:[],cards:[],window:{entry:'frontend/index.js'}}));
  await writeFile(join(root,'frontend.tsx'),`import {mountReact} from '@ksf/sdk/react';import {View} from '@ksf/sdk/view';import {Heading,Text,InlineCode} from '@ksf/sdk/typography';import {Icon} from '@ksf/sdk/icon';import {Kbd} from '@ksf/sdk/kbd';
    const Glyph=p=><svg {...p}><path d="M0 0h1"/></svg>;function App(){return <View><Heading>标题</Heading><Text>正文<InlineCode>code</InlineCode></Text><Icon icon={Glyph} label="标记"/><Kbd>Enter</Kbd></View>}export function mount(c,s){return mountReact(App,c,s)}`);
  const built=await buildApplication(root,{local:true,quiet:true});const decoded=decodePackage(await readFile(built.packagePath));
  assert.equal(built.manifest.uiRuntime,undefined);
  const css=[...decoded.files].filter(([n])=>n.endsWith('.css')).map(([,f])=>f.data.toString()).join('\n');
  assert.match(css,/ksf-app-com_example_foundation--1_0_0/);
  for(const name of ['ksf-heading','ksf-text','ksf-inline-code','ksf-icon','ksf-kbd'])assert.ok(css.includes(name),name);
  assert.match(css,/var\(--ksf-color-muted-foreground\)/);assert.match(css,/var\(--ksf-color-surface-raised\)/);
  const js=decoded.files.get('frontend/index.js').data.toString();assert.doesNotMatch(js,/@ksf\/sdk\/ui|@ksf\/runtime|lucide-react/);
});

test('Agent verifies the three new public contracts and exact source examples against a real target', async () => {
  for(const [id,example] of [['FND-02','typography.basic'],['FND-03','icon.basic'],['FND-04','kbd.basic']]) {
    const read=await queryComponents({operation:'read',selector:id,appDir:app});
    assert.equal(read.targetSupport.status,'supported',JSON.stringify(read));assert.equal(read.component.delivery,'available');
    const result=await queryComponents({operation:'example',selector:example,appDir:app});assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.example.source,await readFile(join(sdk,result.example.file),'utf8'));
  }
  const field=await queryComponents({operation:'read',selector:'EXT-01',appDir:app});assert.equal(field.component.delivery,'planned');assert.equal(field.binding,null);
});
