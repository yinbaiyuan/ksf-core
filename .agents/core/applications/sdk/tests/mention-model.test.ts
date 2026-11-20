import test from 'node:test';
import assert from 'node:assert/strict';
import {mentionToken,insertMention} from '../src/controls/mention-model.ts';
test('mention detection follows the most recent configured prefix and stops at whitespace',()=>{
 assert.deepEqual(mentionToken('Hi @old #new',12,['@','#']),{start:8,end:12,prefix:'#',query:'new'});
 assert.deepEqual(mentionToken('email@ab',8,'@'),{start:5,end:8,prefix:'@',query:'ab'});
 assert.equal(mentionToken('@a b',4,'@'),null);
 assert.equal(mentionToken('abc',3,['','@']),null);
 assert.deepEqual(mentionToken('😀 @设计',6,'@'),{start:3,end:6,prefix:'@',query:'设计'});
});
test('a mention selected in the middle of a word consumes its existing suffix and retains later text',()=>{
 const text='Hello @Alpha team',token=mentionToken(text,9,'@')!;
 assert.deepEqual(insertMention(text,token,'Alpha'),{text:'Hello @Alpha team',caret:13});
});
test('mention insertion separates adjacent text and avoids duplicate separator spaces',()=>{
 const text='email@a rest',token=mentionToken(text,7,'@')!;
 assert.deepEqual(insertMention(text,token,'Alpha'),{text:'email @Alpha rest',caret:13});
 assert.deepEqual(insertMention('@b',mentionToken('@b',2,'@')!,'Beta'),{text:'@Beta ',caret:6});
});
