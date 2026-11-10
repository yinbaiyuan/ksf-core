import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOutline,serializeOutline,changeOutline,visibleOutlineRows} from '../inspiration-outline.js';
const row=(id,depth=0,text=id)=>({id,depth,text,done:false});
const shape=rows=>rows.map(({text,depth,done})=>({text,depth,done}));

test('existing YAML, free text, links and CRLF survive outline additions and later round trips',()=>{
  const old='---\r\ntitle: 原始灵感\r\n---\r\n# 灵感闪现\r\n\r\n自由文字 [原件](../原件.md)\r\n';
  const model=parseOutline(old);assert.equal(model.prefix,old);assert.deepEqual(model.rows,[]);
  model.rows=[row('a',0,'补充观察')];const saved=serializeOutline(model);assert.ok(saved.startsWith(old));assert.match(saved,/- \[ \] 补充观察\r\n/);
  const after=parseOutline(saved);assert.equal(after.prefix,old+'\r\n');assert.equal(serializeOutline(after),saved);
});

test('malformed or unsupported outline blocks are rejected without silently dropping content',()=>{
  for(const text of ['<!-- ksf-inspiration-outline:v1 -->\n- [ ] 草稿','<!-- ksf-inspiration-outline:v2 -->\n保留',
    '<!-- ksf-inspiration-outline:v1 -->\n  - [ ] 缺少父行\n<!-- /ksf-inspiration-outline -->',
    '<!-- ksf-inspiration-outline:v1 -->\n普通段落\n<!-- /ksf-inspiration-outline -->'])assert.throws(()=>parseOutline(text));
});

test('indent moves a complete branch under its previous sibling and never loses descendant text',()=>{
  const original=[row('a'),row('a1',1),row('b'),row('b1',1)];const next=changeOutline(original,{kind:'indent',id:'b'});
  assert.deepEqual(next.rows.map(x=>[x.id,x.depth]),[['a',0],['a1',1],['b',1],['b1',2]]);assert.equal(next.expand,'a');
  assert.deepEqual(original.map(x=>x.depth),[0,1,0,1]);assert.deepEqual(changeOutline(original,{kind:'indent',id:'a'}).rows,original);
});

test('outdenting a middle branch preserves later children of the original parent',()=>{
  const original=[row('a'),row('b',1),row('b1',2),row('c',1),row('d')];
  const {rows}=changeOutline(original,{kind:'outdent',id:'b'});
  assert.deepEqual(rows.map(x=>[x.id,x.depth]),[['a',0],['c',1],['b',0],['b1',1],['d',0]]);
});

test('Enter splits a row after its subtree and multiline paste retains both text halves',()=>{
  const original=[row('a',0,'abcde'),row('child',1),row('b')];let id=0;
  const split=changeOutline(original,{kind:'split',id:'a',start:2,end:2},()=>`new${++id}`);
  assert.deepEqual(split.rows.map(x=>[x.text,x.depth]),[['ab',0],['child',1],['cde',0],['b',0]]);
  const pasted=changeOutline(original,{kind:'paste',id:'a',start:2,end:3,text:'甲\r\n乙\n丙'},()=>`paste${++id}`);
  assert.deepEqual(pasted.rows.map(x=>x.text),['ab甲','child','乙','丙de','b']);assert.equal(pasted.caret,1);
});

test('removing a row promotes its children rather than deleting their content',()=>{
  const original=[row('a'),row('b',1),row('c',2),row('d',1)];
  const {rows}=changeOutline(original,{kind:'remove',id:'a'});assert.deepEqual(rows.map(x=>[x.id,x.depth]),[['b',0],['c',1],['d',0]]);
});

test('deep hierarchy has no arbitrary level cap and completing a parent does not complete descendants',()=>{
  const rows=Array.from({length:256},(_,i)=>row('n'+i,i,'层级 '+i));
  const checked=changeOutline(rows,{kind:'toggle',id:'n100'}).rows;assert.equal(checked.filter(x=>x.done).length,1);assert.equal(checked[101].done,false);
  const model={prefix:'',suffix:'',eol:'\n',managed:false,rows:checked};assert.deepEqual(shape(parseOutline(serializeOutline(model)).rows),shape(checked));
});

test('collapse only affects visible rows and does not change data or completion',()=>{
  const rows=[row('a'),{...row('b',1),done:true},row('c',2),row('d')];
  assert.deepEqual(visibleOutlineRows(rows,new Set(['a'])).map(x=>x.id),['a','d']);assert.equal(rows.length,4);assert.equal(rows[1].done,true);
});

test('checkbox-like text, unicode and literal HTML remain plain text in the saved Markdown',()=>{
  const rows=[row('a',0,'[x] 想法 🐒 <script>只是文字</script>'),row('b',1,'')];
  assert.deepEqual(shape(parseOutline(serializeOutline({prefix:'',suffix:'',eol:'\n',managed:false,rows})).rows),shape(rows));
});
