import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNumberDraft,stepNumber} from '../src/internal-ui/controls-model.ts';
import {placeOverlay} from '../src/internal-ui/position-model.ts';
import {menuIds,menuMatch} from '../src/internal-ui/menu-model.ts';
test('numeric editing retains incomplete text and only valid commits produce finite numbers',()=>{
  for(const draft of ['-','+','.','1e','1e-','中文','1,200','1e999'])assert.equal(parseNumberDraft(draft).ok,false,draft);
  assert.deepEqual(parseNumberDraft(''),{ok:true,value:null});assert.equal(parseNumberDraft('',{required:true}).ok,false);
  assert.deepEqual(parseNumberDraft('  -.25e2  '),{ok:true,value:-25});assert.deepEqual(parseNumberDraft('1.'),{ok:true,value:1});
});
test('commit bounds report an error without clamping or replacing the original draft',()=>{
  const draft='100.25';assert.deepEqual(parseNumberDraft(draft,{max:100}),{ok:false,message:'不能大于 100'});assert.equal(draft,'100.25');
  assert.deepEqual(parseNumberDraft('-1',{min:0}),{ok:false,message:'不能小于 0'});
  for(const constraints of [{min:2,max:1},{step:0},{step:NaN},{min:Infinity}])assert.equal(parseNumberDraft('2',constraints).ok,false);
});
test('decimal stepping does not accumulate ordinary binary noise or round large integers to twelve digits',()=>{
  assert.equal(stepNumber(.1,.2,1),.3);assert.equal(stepNumber(.3,.1,-1),.2);assert.equal(stepNumber(10000000000000,1,1),10000000000001);
  assert.equal(stepNumber(1e-16,1e-16,1),2e-16);assert.equal(Number.isFinite(stepNumber(Number.MAX_VALUE,Number.MAX_VALUE,1)),false);
});
test('anchored layers flip toward available room and remain inside an offset owner viewport',()=>{
 const boundary={left:20,top:10,width:300,height:200},panel={width:120,height:80};
 const nearBottom=placeOverlay({left:280,top:180,width:30,height:20},panel,boundary,'bottom-start');
 assert.equal(nearBottom.side,'top');assert.equal(nearBottom.left,200);assert.equal(nearBottom.top,94);
 const submenu=placeOverlay({left:280,top:150,width:30,height:32},panel,boundary,'right-start');
 assert.equal(submenu.side,'left');assert.equal(submenu.left,154);assert.equal(submenu.top,130);
 for(const placement of ['top','top-start','top-end','bottom','bottom-start','bottom-end','left','right'] as const){
  const result=placeOverlay({left:-100,top:500,width:20,height:20},panel,boundary,placement);
  assert.ok(result.left>=boundary.left&&result.left+panel.width<=boundary.left+boundary.width);
  assert.ok(result.top>=boundary.top&&result.top+panel.height<=boundary.top+boundary.height);
 }
});
test('menu opening identities include descendants, reject duplicates and preserve Unicode typeahead',()=>{
 const ids=menuIds([{id:'one',label:'项目',children:[{id:'two',label:'设置'}]}]);assert.deepEqual([...ids],['one','two']);
 assert.throws(()=>menuIds([{id:'one',label:'项目',children:[{id:'one',label:'重复'}]}]),/重复/);
 assert.throws(()=>menuIds([{id:'',label:'项目'}]),/稳定ID/);
 assert.equal(menuMatch(['Alpha','Beta','Ａrchive','中文项目'],'a',0),2);assert.equal(menuMatch(['Alpha','Beta'],'a',1),0);
 assert.equal(menuMatch(['Alpha','中文项目'],'中',0),1);assert.equal(menuMatch(['Alpha'],'z',0),-1);
});
