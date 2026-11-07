import test from 'node:test';
import assert from 'node:assert/strict';
import {followPointer} from '../project-card-motion.js';

function setup(t,{overflow=500,reduced=false,motionOptions}={}){
  const saved=Object.fromEntries(['window','matchMedia','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
  const frames=new Map();let next=0;
  globalThis.window=new EventTarget();
  globalThis.matchMedia=()=>({matches:reduced});
  globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const styles=new Map();
  const list={style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)},getAnimations:()=>[]};
  const board=new EventTarget();
  Object.assign(board,{scrollTop:0,scrollHeight:500+overflow,clientHeight:500,isConnected:true,closest:()=>null,getBoundingClientRect:()=>({top:100,height:500})});
  let menu=null;
  board.querySelector=selector=>selector==='.pg-object-tree-list'?list:selector==='.pg-object-tree-header'?{offsetHeight:44}:selector.includes(':popover-open')?menu:selector.includes('[data-selected]')?{getBoundingClientRect:()=>({top:200-board.scrollTop,height:64})}:null;
  const controller=new AbortController();const motion=followPointer(board,controller.signal,motionOptions);
  t.after(()=>{controller.abort();for(const [k,v] of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
  function send(type,y,{target=board,pointerType='mouse',buttons=0}={}){
    const e=new Event(type);Object.defineProperties(e,{target:{value:target},clientY:{value:y},pointerType:{value:pointerType},buttons:{value:buttons}});board.dispatchEvent(e);
  }
  return {board,motion,send,styles,frames,controller,setMenu:v=>menu=v};
}

test('pointer down the hierarchy moves content up; moving back up exposes earlier rows',t=>{
  const {board,send}=setup(t);
  send('pointermove',100);assert.equal(board.scrollTop,0);
  send('pointermove',350);assert.equal(board.scrollTop,250);
  send('pointermove',600);assert.equal(board.scrollTop,500);
  send('pointermove',200);assert.ok(board.scrollTop<10);
});

test('entering a clickable row and pressing do not move another row underneath the click',t=>{
  const {board,send}=setup(t);board.scrollTop=120;
  const row={closest:s=>s.includes('.pg-card-select')?row:null};
  send('pointerenter',350,{target:row});send('pointermove',353,{target:row});assert.equal(board.scrollTop,120);
  send('pointermove',360,{target:row});const before=board.scrollTop;assert.ok(before>120);
  send('pointerdown',360,{target:row});send('pointermove',500);assert.equal(board.scrollTop,before);
  window.dispatchEvent(new Event('pointerup'));send('pointermove',500);assert.ok(board.scrollTop>before);
});

test('menu, touch and navigation header preserve the current scroll position',t=>{
  const {board,send,setMenu}=setup(t);board.scrollTop=120;setMenu({});send('pointermove',500);assert.equal(board.scrollTop,120);
  setMenu(null);send('pointermove',500,{pointerType:'touch'});assert.equal(board.scrollTop,120);
  send('pointermove',500,{target:{closest:s=>s==='.pg-object-tree-header'?{}:null}});assert.equal(board.scrollTop,120);
});

test('entering another clickable row during browsing keeps that target stable until vertical movement resumes',t=>{
  const {board,send}=setup(t);
  send('pointermove',350);const before=board.scrollTop;
  const row={closest:s=>s.includes('.pg-card-select')?row:null};
  send('pointermove',500,{target:row});assert.equal(board.scrollTop,before);
  send('pointermove',503,{target:row});assert.equal(board.scrollTop,before);
  send('pointermove',505,{target:row});assert.ok(board.scrollTop>before);
  const after=board.scrollTop;
  const other={closest:s=>s.includes('.pg-card-select')?other:null};
  send('pointermove',550,{target:other});assert.equal(board.scrollTop,after);
});

test('short hierarchy leans opposite the pointer and clears on reset and dispose',t=>{
  const {send,styles,motion,controller}=setup(t,{overflow:0});
  send('pointermove',150);assert.ok(parseFloat(styles.get('--card-lean'))>0);
  send('pointermove',550);assert.ok(parseFloat(styles.get('--card-lean'))<0);
  motion.resetBrowsing();assert.equal(styles.size,0);
  send('pointermove',150);controller.abort();assert.equal(styles.size,0);
  send('pointermove',550);assert.equal(styles.size,0);
});

test('reduced motion suppresses decorative panning',t=>{
  const {send,styles}=setup(t,{overflow:0,reduced:true});send('pointermove',150);assert.equal(styles.size,0);
});

test('leaving a long hierarchy returns to selection; wheel and reset cancel that return',t=>{
  const {board,send,frames,motion}=setup(t);send('pointermove',600);send('pointerleave',650);assert.equal(frames.size,1);
  board.dispatchEvent(new Event('wheel'));assert.equal(frames.size,0);
  send('pointermove',500);send('pointerleave',650);assert.equal(frames.size,1);motion.resetBrowsing();assert.equal(frames.size,0);
});

test('file list reuses pointer panning while protecting file clicks, toolbar, forms and portal menus',t=>{
  let editing=false,menu=null;
  const {board,send}=setup(t,{motionOptions:{controlSelector:'.pg-project-context-row,.pg-file-scope-heading',headerSelector:'.pg-file-controls',blocked:()=>editing,openMenu:()=>menu,onScroll:()=>{}}});
  const row={closest:selector=>selector.includes('.pg-project-context-row')?row:null};
  send('pointermove',450,{target:row});assert.equal(board.scrollTop,0);
  send('pointermove',455,{target:row});assert.ok(board.scrollTop>250);
  const position=board.scrollTop;
  send('pointermove',200,{target:{closest:selector=>selector==='.pg-file-controls'?{}:null}});assert.equal(board.scrollTop,position);
  editing=true;send('pointermove',200);assert.equal(board.scrollTop,position);
  editing=false;menu={};send('pointermove',200);assert.equal(board.scrollTop,position);
  board.dispatchEvent(new Event('scroll'));
  menu=null;send('pointermove',200);assert.ok(board.scrollTop<10);
});
