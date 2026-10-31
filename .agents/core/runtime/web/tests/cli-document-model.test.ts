import test from 'node:test';
import assert from 'node:assert/strict';
import {cliDocumentLink} from '../src/apps/cli-document-model.ts';
test('CLI links stay within package documentation and schema files',()=>{
 for(const [href,path] of [['child.md','docs/child.md'],['../cli/schemas/input.json','cli/schemas/input.json'],['../docs/notes.txt','docs/notes.txt'],['#使用','docs/cli.md']])assert.equal(cliDocumentLink('docs/cli.md',href)?.path,path);
 assert.deepEqual(cliDocumentLink('docs/nested/guide.md','../cli.md#usage'),{path:'docs/cli.md',hash:'usage'});
 for(const href of ['https://example.invalid/doc.md','//remote/docs/a.md','javascript:alert(1)','data:text/html,x','/docs/cli.md','../../docs/cli.md','../backend/index.mjs','../cli/index.mjs','%2e%2e/%2e%2e/docs/x.md','%252e%252e/docs/a.md','a.md?download=1','..\\docs\\x.md','%00docs/a.md','docs%zz.md'])assert.equal(cliDocumentLink('docs/cli.md',href),null,href);
});
