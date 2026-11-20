import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {adaptMermaidCSP} from '../server/mermaid-csp.mjs';
import {validateDiagramInput} from '../src/apps/diagram-input.ts';
const dependency=path=>new URL('../../../runtime/web/node_modules/'+path,import.meta.url);
const locked=['mermaid/dist/mermaid.core.mjs','mermaid/dist/chunks/mermaid.core/chunk-4EMNKR2T.mjs','mermaid/dist/chunks/mermaid.core/chunk-HAGFOTED.mjs','d3-selection/src/selection/attr.js'];
test('locked diagram adaptations leave installed sources intact and reject source drift',async()=>{
 for(const path of locked){const url=dependency(path),code=await readFile(url,'utf8');assert.equal(typeof adaptMermaidCSP(code,fileURLToPath(url)),'string');assert.equal(await readFile(url,'utf8'),code);assert.throws(()=>adaptMermaidCSP(code+'\n',fileURLToPath(url)),/source changed/);}
 assert.equal(adaptMermaidCSP('export const x=1','/app/frontend.tsx'),null);
});
test('D3 style attributes use CSSOM while values, callbacks, removal and ordinary attributes retain semantics',async()=>{
 const url=dependency('d3-selection/src/selection/attr.js'),source=adaptMermaidCSP(await readFile(url,'utf8'),fileURLToPath(url));
 const attr=new Function('namespace','ksfDeclarations',source.replace(/^import .*;\n/gm,'').replace('export default function','return function'))(name=>name,value=>value);
 const attributes=new Map(),node={style:{cssText:''},setAttribute(name,value){assert.notEqual(name,'style');attributes.set(name,String(value));},getAttribute:name=>name==='style'?node.style.cssText:attributes.get(name),removeAttribute(name){if(name==='style')node.style.cssText='';else attributes.delete(name);}},selection={each(fn){fn.call(node,{fill:'blue'},0,[node]);return this},node:()=>node};
 attr.call(selection,'style','fill:red');assert.equal(node.style.cssText,'fill:red');assert.equal(attr.call(selection,'style'),'fill:red');
 attr.call(selection,'style',datum=>'fill:'+datum.fill);assert.equal(node.style.cssText,'fill:blue');
 attr.call(selection,'style',()=>null);assert.equal(node.style.cssText,'');
 attr.call(selection,'aria-label','图表');assert.equal(attributes.get('aria-label'),'图表');attr.call(selection,'aria-label',()=>42);assert.equal(attributes.get('aria-label'),'42');attr.call(selection,'aria-label',null);assert.equal(attributes.has('aria-label'),false);
});
test('static diagram input permits graph arrows and basic formatting but rejects active markup and resource tricks',()=>{
 for(const code of ['flowchart LR\nA[<b>应用</b><br/>意图]-->B[结果]','sequenceDiagram\nA->>B: 请求\nB-->>A: 结果','classDiagram\nclass Box~T~'])assert.doesNotThrow(()=>validateDiagramInput(code));
 for(const code of ['flowchart LR\nA["<span style=\'color:red\'>说明</span>"]','flowchart LR\nA["&lt;img src=x onerror=alert(1)&gt;"]','flowchart LR\nA["&#60;script&#62;x&#60;/script&#62;"]'])assert.throws(()=>validateDiagramInput(code),{code:'UI_DIAGRAM_UNSAFE_MARKUP'});
 for(const code of ['style A fill:url(/api/private)','style A fill:u\\72l(/api/private)','A@{ img: "/api/private" }','A["![图片](/api/private)"]'])assert.throws(()=>validateDiagramInput(code),{code:'UI_DIAGRAM_REMOTE_RESOURCE'});
 assert.throws(()=>validateDiagramInput('x'.repeat(50001)),{code:'UI_DIAGRAM_TOO_LARGE'});
});
