import test from 'node:test';
import assert from 'node:assert/strict';
import {diffLines} from '../src/assistant/diff-model.js';

test('line comparison retains context, removals, additions and exact old/new line positions', () => {
  const lines=diffLines('one\nold\nlast','one\nnew\nlast');
  assert.deepEqual(lines.map(line=>line.kind),['context','remove','add','context']);
  assert.deepEqual(lines.filter(line=>line.kind!=='add').map(line=>line.oldLine),[1,2,3]);
  assert.deepEqual(lines.filter(line=>line.kind!=='remove').map(line=>line.newLine),[1,2,3]);
});

test('normal and bounded fallback diffs reconstruct both texts without confusing repeated lines or empty files', () => {
  const large=Array.from({length:700},(_,i)=>'line '+i).join('\n');
  const pairs=[['',''],['','新增一行'],['删除一行',''],['a\nb\na\nb','a\na\nb\nc'],['a\r\nb\r\n','a\r\nc\r\n'],[large,large.replace('line 350','changed 350')]];
  for(const [before,after] of pairs){const result=diffLines(before,after);assert.equal(result.filter(line=>line.kind!=='add').map(line=>line.text).join('\n'),before.replaceAll('\r\n','\n'));assert.equal(result.filter(line=>line.kind!=='remove').map(line=>line.text).join('\n'),after.replaceAll('\r\n','\n'));}
});
