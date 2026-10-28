import test from 'node:test';
import assert from 'node:assert/strict';
import { DESKTOP_KEY, LEGACY_DESKTOP_KEY, SQUARE_GRID, squareGridMetrics, fitWidgetLayout, appendWidget, currentGroup, groupNameError, moveGroup, removeGroup, sameLayout, moveWidgetPositions, withGroupLayout, adjustWidgetLayout, defaultDesktop, defaultLayout, fitBounds, isDeepLink, parseDesktop, patchSearch, readDesktop, saveDesktop, tiledBounds } from '../src/desktop-model.ts';
import { parseMaterialSettings } from '../src/material-settings.ts';
import { createRemoteCache } from '../src/remote-cache.ts';
import { createOverlayCoordinator } from '../src/overlay-coordinator.ts';

test('window bounds and half screens fit all four desktop sizes', () => {
  for (const [width, height] of [[1024,768],[1280,800],[1440,900],[1920,1080]]) {
    const area = { width, height: height - 32 - 70 - 4 };
    const fitted = fitBounds({ x: 10000, y: -10, width: 1180, height: 740 }, area);
    assert.ok(fitted.x >= 0 && fitted.y >= 0 && fitted.x + fitted.width <= area.width && fitted.y + fitted.height <= area.height);
    const left = tiledBounds('left', area), right = tiledBounds('right', area);
    assert.ok(left.width >= 480); assert.equal(right.x + right.width, area.width); assert.equal(right.x - left.width, 12);
  }
});
test('corrupt, unknown and denied desktop storage fall back without writes', () => {
  assert.deepEqual(readDesktop({ getItem() { throw Error('denied'); } }), defaultDesktop());
  assert.deepEqual(readDesktop({ getItem: () => '{' }), defaultDesktop());
  const data = parseDesktop({ version: 1, layout: [{ i: 'unknown',x:0,y:0,w:4,h:3 }, { i:'work-stats',x:99,y:-5,w:1,h:1 }, { i:'work-stats',x:0,y:0,w:4,h:4 }] });
  assert.equal(currentGroup(data).layout.length, 1); assert.equal(currentGroup(data).layout[0].x, 7); assert.equal(currentGroup(data).layout[0].h, 1);
  assert.equal(saveDesktop(data, { setItem() { throw Error('quota'); } }), false);
  assert.deepEqual(currentGroup(parseDesktop({ version: 1, layout: [] })).layout, []);
});
test('edit draft can be cancelled without mutating saved layout', () => {
  const saved = defaultLayout(), draft = saved.map(w => ({ ...w })); draft[0].x = 8; draft.splice(0, 1);
  assert.equal(saved.length, 1); assert.equal(saved[0].x, 0);
  const roundtrip = parseDesktop(withGroupLayout(defaultDesktop(), draft)); assert.equal(currentGroup(roundtrip).layout.length, 0);
});
test('retired capture card is filtered while legacy units convert and window preferences survive', () => {
  const bounds = { x: 71, y: 39, width: 920, height: 640 };
  const layout = [{ ...defaultLayout()[0], x: 2, y: 7, w: 4, h: 5 }, { i: 'capture', x: 0, y: 5, w: 6, h: 2 }];
  const original = JSON.stringify({ version: 1, bounds, layout });
  const parsed = readDesktop({ getItem: () => original });
  assert.deepEqual(parsed.bounds, bounds);
  assert.deepEqual(currentGroup(parsed).layout, [{...layout[0], x:1, y:3, w:3, h:3}]);
  assert.equal(defaultLayout().some(item => item.i === 'capture'), false);
  assert.deepEqual(currentGroup(readDesktop({ getItem: () => JSON.stringify({ version: 1, bounds, layout: [layout[1]] }) })).layout, []);
});
test('window navigation preserves old route parameters and isolates independent contexts', () => {
  const original = 'project=current%3Aksf-develop&task=abc&turn=one&tab=route';
  const copied = patchSearch(original, { turn:'two', tab:null, section:'result' });
  assert.equal(new URLSearchParams(original).get('turn'), 'one'); assert.equal(new URLSearchParams(copied).get('project'),'current:ksf-develop');
  assert.equal(new URLSearchParams(copied).get('turn'),'two'); assert.ok(isDeepLink('?view=routes&session=old')); assert.equal(isDeepLink(''),false);
});
test('old v1 material values survive addition of four desktop profiles', () => {
  const parsed = parseMaterialSettings({ version:1, profiles:{ reader:{ opacity:.84 }, drawer:{ blur:24 } },backdrop:{wash:.12} });
  assert.equal(parsed.profiles.reader.opacity,.84); assert.equal(parsed.profiles.drawer.blur,24); assert.equal(parsed.backdrop.wash,.12);
  for (const key of ['window','dock','statusbar','card'] as const) assert.ok(parsed.profiles[key].refraction > 0);
});
test('shared URL deduplicates concurrent subscribers and preserves data after failure', async () => {
  let calls = 0, fail = false;
  const cache = createRemoteCache((async () => { calls++; await new Promise(r => setTimeout(r, 5)); if (fail) throw Error('offline'); return new Response(JSON.stringify({data:{records:['original']}})); }) as typeof fetch);
  const offA = cache.subscribe('/one', () => {}), offB = cache.subscribe('/one', () => {});
  await Promise.all([cache.refresh('/one'),cache.refresh('/one')]); assert.equal(calls,1);
  fail=true; await cache.refresh('/one',true); assert.equal(cache.read('/one').error,'offline'); assert.deepEqual(cache.read('/one').data.records,['original']);
  offA(); offB(); assert.equal(cache.read('/one').listeners.size,0); assert.equal(cache.read('/one').timer,undefined);
});
test('modal sheets are exclusive within their window and independent across windows', () => {
  const coordinator = createOverlayCoordinator(), a = Symbol(), b = Symbol(), replacement = Symbol(); let closedA = 0, closedB = 0;
  coordinator.claim(a,'window-a',()=>closedA++); coordinator.claim(b,'window-b',()=>closedB++);
  assert.equal(closedA,0); assert.equal(closedB,0);
  coordinator.claim(replacement,'window-a',()=>{}); assert.equal(closedA,1); assert.equal(closedB,0);
  coordinator.release(a); assert.equal(coordinator.owner(),'window-a');
  coordinator.release(replacement); assert.equal(coordinator.owner(),'window-b'); coordinator.release(b); assert.equal(coordinator.owner(),null);
});

test('a hidden document starts no remote request', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{ configurable:true, value:{ hidden:true } });
  try { let calls=0; const cache=createRemoteCache((async()=>{ calls++; return new Response('{}'); }) as typeof fetch); const off=cache.subscribe('/hidden',()=>{}); assert.equal(calls,0); off(); } finally { if (previous) Object.defineProperty(globalThis,'document',previous); else delete (globalThis as any).document; }
});


test('keyboard movement and resize push adjacent cards without overlap or mutating the saved layout', () => {
  const saved = [...defaultLayout(), { i: 'example', x: 4, y: 0, w: 3, h: 2 }], copy = structuredClone(saved);
  for (const moved of [adjustWidgetLayout(saved,'work-stats',1,0),adjustWidgetLayout(saved,'work-stats',1,1,true)]) {
    assert.equal(moved[0].x + moved[0].w <= 12,true);
    for (let a=0;a<moved.length;a++) for (let b=a+1;b<moved.length;b++) { const x=moved[a],y=moved[b]; assert.equal(x.x < y.x+y.w && x.x+x.w > y.x && x.y < y.y+y.h && x.y+x.h > y.y,false); }
  }
  assert.deepEqual(saved,copy);
});

test('v1 migration converts grid units once, preserves bounds and leaves the legacy storage intact', () => {
  const layout = [{ ...defaultLayout()[0], x: 2, y: 9, w: 5, h: 6 }];
  const legacy = JSON.stringify({ version: 1, layout, bounds: { x: 43, y: 37, width: 860, height: 620 } });
  const entries = new Map([[LEGACY_DESKTOP_KEY, legacy]]);
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  const migrated = readDesktop(storage);
  assert.equal(migrated.version, 3); assert.equal(migrated.groups[0].name, '主页');
  assert.deepEqual(currentGroup(migrated).layout, [{...layout[0],x:1,y:4,w:3,h:3}]); assert.equal(migrated.bounds.x,43);
  assert.equal(saveDesktop(migrated, storage), true); assert.equal(entries.get(LEGACY_DESKTOP_KEY), legacy);
  entries.set(LEGACY_DESKTOP_KEY,'{}');
  assert.deepEqual(readDesktop(storage),migrated);
  assert.ok(entries.has(DESKTOP_KEY));
});
test('each group keeps an independent layout and intentional emptiness across serialization', () => {
  const original = defaultDesktop();
  const groups = [...original.groups, { id: 'work', name: '工作', icon: 'briefcase' as const, layout: [] }];
  const selected = { ...original, groups, activeGroupId:'work' };
  const edited = withGroupLayout(selected, [defaultLayout()[0]]);
  assert.deepEqual(original.groups[0].layout,defaultLayout());
  assert.deepEqual(edited.groups[0].layout,defaultLayout()); assert.deepEqual(selected.groups[1].layout,[]);
  const emptied = withGroupLayout(edited,[]);
  assert.deepEqual(parseDesktop(JSON.parse(JSON.stringify(emptied))),emptied);
});
test('group names, order and deletion retain a valid active group and the last group', () => {
  const original = defaultDesktop();
  const value = { ...original, groups:[...original.groups,{id:'work',name:'工作',icon:'grid' as const,layout:[]}],activeGroupId:'work' };
  assert.ok(groupNameError('   ',value.groups)); assert.ok(groupNameError('字'.repeat(21),value.groups));
  assert.ok(groupNameError(' 主页 ',value.groups)); assert.equal(groupNameError(' 工作 ',value.groups,'work'),'');
  const moved=moveGroup(value,'work',-1); assert.equal(moved.groups[0].id,'work'); assert.equal(value.groups[0].id,'home');
  assert.equal(moveGroup(moved,'work',-1),moved);
  const removed=removeGroup(value,'work'); assert.equal(removed.activeGroupId,'home'); assert.equal(removed.groups.length,1);
  assert.equal(removeGroup(removed,'home'),removed); assert.deepEqual(currentGroup(removed).layout,defaultLayout());
});
test('malformed v2 entries, duplicate group IDs and retired cards are filtered safely', () => {
  const parsed = parseDesktop({version:2,grid:SQUARE_GRID.version,activeGroupId:'missing',groups:[
    {id:'work',name:'工作',icon:'invalid',layout:[...defaultLayout(),{i:'capture',x:0,y:0,w:3,h:2}]},
    {id:'work',name:'重复ID',icon:'home',layout:[]},
    {id:'other',name:'工作',icon:'home',layout:[]},
    {id:'empty',name:'空白',icon:'star',layout:[]},
    {id:'bad',name:'',layout:[]}
  ]});
  assert.equal(parsed.groups.length,2); assert.equal(parsed.activeGroupId,'work');
  assert.equal(parsed.groups[0].icon,'grid'); assert.deepEqual(parsed.groups[0].layout,defaultLayout()); assert.deepEqual(parsed.groups[1].layout,[]);
  assert.deepEqual(parseDesktop({version:2,groups:[]}),defaultDesktop());
});
test('broken v2 storage recovers legacy data and edit comparison ignores grid metadata', () => {
  const storage = {getItem:(key:string) => key === DESKTOP_KEY ? '{' : JSON.stringify({version:1,layout:[]})};
  assert.deepEqual(currentGroup(readDesktop(storage)).layout,[]);
  assert.deepEqual(currentGroup(readDesktop({getItem:key => key === DESKTOP_KEY ? JSON.stringify({version:2,groups:[]}) : storage.getItem(key)})).layout,[]);
  const layout=defaultLayout(), annotated=layout.map(item=>({...item,static:false}));
  assert.equal(sameLayout(layout,annotated),true); assert.equal(sameLayout(layout,[...layout].reverse()),true);
  assert.equal(sameLayout(layout,adjustWidgetLayout(layout,'work-stats',0,1)),false);
});


test('square cells divide the entire available width with equal gutters and no unused remainder', () => {
  for (const [available, cols] of [[224,2],[733,6],[1136,9],[1776,12],[2416,12],[3696,12]]) {
    const metrics=squareGridMetrics(available);
    assert.equal(metrics.cols,cols); assert.equal(metrics.gap,24);
    assert.equal(metrics.width,available); assert.ok(metrics.cell>=96);
    assert.ok(Math.abs(cols*metrics.cell+(cols-1)*metrics.gap-available)<1e-8);
    assert.equal((metrics.width-(cols-1)*metrics.gap)/cols,metrics.cell);
    const lastCellRight=(cols-1)*(metrics.cell+metrics.gap)+metrics.cell;
    assert.ok(Math.abs(lastCellRight-available)<1e-8);
  }
});
test('narrow projection packs overflowing cards without overlap or changing the stored spans', () => {
  const original=[{i:'example-a',x:0,y:0,w:2,h:2,minW:1,minH:1},{i:'example-b',x:2,y:0,w:4,h:3,minW:1,minH:1},{i:'example-c',x:6,y:0,w:2,h:2,minW:1,minH:1}], copy=structuredClone(original);
  for (const cols of [1,2,6,12]) {
    const fitted=fitWidgetLayout(original,cols);
    for (const item of fitted) {
      assert.ok([item.x,item.y,item.w,item.h].every(Number.isInteger));
      assert.ok(item.w>0 && item.h>0 && item.x+item.w<=cols);
    }
    for (let a=0;a<fitted.length;a++) for (let b=a+1;b<fitted.length;b++) { const x=fitted[a],y=fitted[b]; assert.equal(x.x<y.x+y.w && x.x+x.w>y.x && x.y<y.y+y.h && x.y+x.h>y.y,false); }
  }
  assert.deepEqual(original,copy);
  assert.deepEqual(fitWidgetLayout(original,12),original);
  assert.deepEqual(fitWidgetLayout(original,6).map(({i,x,y,w,h})=>({i,x,y,w,h})),[
    {i:'example-a',x:0,y:0,w:2,h:2},{i:'example-b',x:2,y:0,w:4,h:3},{i:'example-c',x:0,y:2,w:2,h:2}
  ]);
});
test('old rectangular grid migrates to square units only once across all groups', () => {
  const legacy=[{i:'continue',x:0,y:0,w:3,h:4},{i:'recent',x:3,y:0,w:6,h:5},{i:'ownership',x:9,y:0,w:3,h:3},{i:'capture',x:0,y:5,w:6,h:2},{i:'work-stats',x:0,y:7,w:6,h:3}];
  const bounds={x:41,y:29,width:960,height:670};
  const migrated=parseDesktop({version:2,activeGroupId:'empty',bounds,groups:[{id:'home',name:'主页',icon:'home',layout:legacy},{id:'empty',name:'空白',icon:'star',layout:[]}]});
  assert.deepEqual(migrated.groups[0].layout,[{...defaultLayout()[0],y:3}]);
  assert.deepEqual(migrated.groups[1].layout,[]); assert.equal(migrated.activeGroupId,'empty'); assert.deepEqual(migrated.bounds,bounds);
  assert.equal(migrated.grid,SQUARE_GRID.version);
  assert.deepEqual(parseDesktop(JSON.parse(JSON.stringify(migrated))),migrated);
});
test('integer sizing includes 1x1 and adding cards fills the first free cells', () => {
  const layout=defaultLayout();
  let resized=adjustWidgetLayout(layout,'work-stats',-20,-20,true,6);
  const item=resized.find(item=>item.i==='work-stats')!;
  assert.equal(item.w,1); assert.equal(item.h,1);
  resized=adjustWidgetLayout(resized,'work-stats',.6,.6,true,6);
  assert.ok(resized.every(item=>[item.x,item.y,item.w,item.h].every(Number.isInteger)));
  const added=appendWidget([{i:'continue',x:0,y:0,w:2,h:2}],{i:'ownership',x:0,y:0,w:1,h:1},6);
  assert.equal(added[1].x,2); assert.equal(added[1].y,0);
  const saved=withGroupLayout(defaultDesktop(),[{...item,w:1.2,h:1.4}]);
  assert.equal(saved.groups[0].layout[0].w,1); assert.equal(saved.groups[0].layout[0].h,1);
  assert.deepEqual(parseDesktop(JSON.parse(JSON.stringify(saved))),saved);
});


test('normal dragging saves only moved positions and preserves configured sizes in narrow projections', () => {
  const stored = [{ i: 'work-stats', x: 4, y: 2, w: 4, h: 2 }, { i: 'future', x: 8, y: 0, w: 2, h: 3 }];
  const projected = fitWidgetLayout(stored, 2);
  assert.deepEqual(moveWidgetPositions(stored, projected, projected), stored);
  const after = projected.map(item => item.i === 'work-stats' ? { ...item, y: item.y + 4 } : item);
  const result = moveWidgetPositions(stored, projected, after);
  assert.equal(result[0].w, 4); assert.equal(result[0].h, 2); assert.equal(result[0].y, after[0].y);
  assert.deepEqual(result[1], stored[1]); assert.equal(stored[0].x, 4); assert.equal(stored[0].y, 2);
  const saved = withGroupLayout(defaultDesktop(), result); assert.equal(saved.groups[0].layout[0].w, 4);
});

test('v3 card instances retain ownership and independent configurations without installed definitions',()=>{
  const first={i:'card-a',appId:'example.cards',cardId:'summary',config:{project:'alpha'},name:'Summary',x:0,y:0,w:2,h:2};
  const second={...first,i:'card-b',x:2,config:{project:'beta'}};
  const state={version:3,grid:SQUARE_GRID.version,groups:[{id:'home',name:'主页',icon:'home',layout:[first,second]}],activeGroupId:'home'};
  const parsed=parseDesktop(state,[]),layout=parsed.groups[0].layout;
  assert.equal(layout.length,2);assert.equal(layout[0].appId,'example.cards');assert.deepEqual(layout.map(item=>item.config),[{project:'alpha'},{project:'beta'}]);
  assert.deepEqual(parseDesktop(JSON.parse(JSON.stringify(parsed)),[]),parsed);
  const moved=moveWidgetPositions(layout,layout,[{...layout[0],y:4},layout[1]]);assert.deepEqual(moved[0].config,first.config);assert.deepEqual(moved[1],layout[1]);
});
