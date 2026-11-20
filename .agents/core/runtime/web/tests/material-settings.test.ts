import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMaterialSettings, desktopAppearance, sideRaysIntensity, barGlassIntensity, cardGlassIntensity, MATERIAL_KEY, parseMaterialSettings, readMaterialSettings } from '../src/material-settings.ts';
test('material preferences tolerate damaged, unavailable and future storage without trusting input', () => {
  assert.deepEqual(readMaterialSettings({ getItem: () => '{bad' }), defaultMaterialSettings());
  assert.deepEqual(readMaterialSettings({ getItem: () => { throw new Error('denied'); } }), defaultMaterialSettings());
  assert.deepEqual(parseMaterialSettings({ version: 99, motion: false }), defaultMaterialSettings());
  const v = parseMaterialSettings({ version: 1, motion: 'false', backdrop: { wash: 4, x: -10 }, profiles: { directory: { tint: 'url(https://invalid)', opacity: -1, refraction: 1e8, blur: '20', ior: NaN }, button: { invert: true, tint: '#aabbcc' } } });
  assert.equal(v.motion, true); assert.equal(v.backdrop.wash, 1); assert.equal(v.backdrop.x, 0);
  assert.equal(v.profiles.directory.tint, '#FFFFFF'); assert.equal(v.profiles.directory.opacity, 0); assert.equal(v.profiles.directory.refraction, 48); assert.equal(v.profiles.directory.blur, 2); assert.equal(v.profiles.directory.ior, 1.5);
  assert.equal(v.profiles.button.invert, true); assert.equal(v.profiles.button.tint, '#AABBCC');
});
test('all material groups round trip independently and defaults remain isolated', () => {
  const value = defaultMaterialSettings(); value.profiles.chat.refraction = 37; value.profiles.button.opacity = .28; value.backdrop.saturation = .6;
  const storage = { getItem: (key: string) => key === MATERIAL_KEY ? JSON.stringify(value) : null };
  assert.deepEqual(readMaterialSettings(storage), value);
  assert.equal(value.profiles.round.refraction, 24); assert.equal(defaultMaterialSettings().profiles.chat.refraction, 24);
  assert.equal(Object.keys(value.profiles).length, 12);
});
test('existing material preferences gain a readable main area without resetting older choices', () => {
  const prior = { version: 1, motion: false, backdrop: { brightness: .8 }, profiles: { directory: { opacity: .43 }, button: { refraction: 32 }, drawer: { radius: 40 } } };
  const migrated = parseMaterialSettings(prior);
  assert.equal(migrated.profiles.reader.opacity, 1);
  assert.equal(migrated.profiles.reader.tint, '#FDFEFF');
  assert.equal(migrated.profiles.directory.opacity, .43); assert.equal(migrated.profiles.button.refraction, 32); assert.equal(migrated.profiles.drawer.radius, 40);
  assert.equal(migrated.motion, false); assert.equal(migrated.backdrop.brightness, .8);
  migrated.profiles.reader.opacity = .55; migrated.profiles.reader.blur = 12;
  assert.deepEqual(parseMaterialSettings(JSON.parse(JSON.stringify(migrated))), migrated);
});

test('theme is optional in v1 and legacy material choices survive mode round trips',()=>{
  const legacy=defaultMaterialSettings();delete legacy.themeMode;
  legacy.profiles.card.opacity=.73;legacy.backdrop.x=38;
  const migrated=parseMaterialSettings(legacy);
  assert.equal(migrated.themeMode,'system');
  assert.equal(migrated.profiles.card.opacity,.73);assert.equal(migrated.backdrop.x,38);
  for(const themeMode of ['system','light','dark'] as const){
    const value={...migrated,themeMode};assert.deepEqual(parseMaterialSettings(JSON.parse(JSON.stringify(value))),value);
  }
  assert.equal(parseMaterialSettings({...legacy,themeMode:'sepia'}).themeMode,'system');
});

test('legacy appearance keeps its choices while desktop controls gain bounded defaults',()=>{
  const legacy=defaultMaterialSettings();delete legacy.desktop;
  legacy.profiles.card.opacity=.73;legacy.themeMode='dark';
  const migrated=parseMaterialSettings(legacy);
  assert.deepEqual(migrated.desktop,{iconSize:72,gap:32});
  assert.equal(migrated.profiles.card.opacity,.73);assert.equal(migrated.themeMode,'dark');
  assert.deepEqual(desktopAppearance({iconSize:200,gap:-4}),{iconSize:96,gap:16});
  assert.deepEqual(desktopAppearance({iconSize:NaN,gap:'48'}),{iconSize:72,gap:32});
  const custom={...migrated,desktop:{iconSize:88,gap:48}};
  assert.deepEqual(parseMaterialSettings(JSON.parse(JSON.stringify(custom))),custom);
});

test('background modes round trip without losing the original mountain preferences',()=>{
  const legacy=defaultMaterialSettings();delete legacy.backgroundMode;
  legacy.backdrop.x=38;legacy.backdrop.brightness=.85;legacy.motion=false;
  assert.equal(parseMaterialSettings(legacy).backgroundMode,'mountain');
  for(const backgroundMode of ['mountain','side-rays','drape','aero-shards'] as const){
    const value={...legacy,backgroundMode};
    assert.deepEqual(parseMaterialSettings(JSON.parse(JSON.stringify(value))),value);
    assert.deepEqual(value.backdrop,legacy.backdrop);
  }
  assert.equal(parseMaterialSettings({...legacy,backgroundMode:'unknown'}).backgroundMode,'mountain');
});

test('side ray intensity defaults to the enhanced appearance and preserves saved choices',()=>{
  const legacy=defaultMaterialSettings();delete legacy.sideRaysIntensity;
  legacy.backgroundMode='side-rays';legacy.backdrop.x=38;legacy.profiles.card.opacity=.63;
  assert.equal(parseMaterialSettings(legacy).sideRaysIntensity,1);
  for(const strength of [0,.35,1,1.75,2]){
    const value={...legacy,sideRaysIntensity:strength};
    assert.deepEqual(readMaterialSettings({getItem:()=>JSON.stringify(value)}),value);
  }
  assert.equal(sideRaysIntensity(-1),0);assert.equal(sideRaysIntensity(3),2);
  for(const value of [undefined,null,'1',NaN,Infinity])assert.equal(sideRaysIntensity(value),1);
});

test('bar glass intensity preserves the current legacy appearance and round trips independently',()=>{
  const legacy=defaultMaterialSettings();delete legacy.barGlassIntensity;
  legacy.profiles.dock.opacity=.61;legacy.profiles.statusbar.blur=10;legacy.sideRaysIntensity=.4;
  assert.deepEqual(parseMaterialSettings(legacy).barGlassIntensity,{statusbar:1,dock:1});
  for(const barGlassIntensity of [{statusbar:0,dock:2},{statusbar:1.75,dock:.35},{statusbar:1,dock:1}]){
    const value={...legacy,barGlassIntensity};
    assert.deepEqual(readMaterialSettings({getItem:()=>JSON.stringify(value)}),value);
    assert.equal(value.profiles.dock.opacity,.61);assert.equal(value.profiles.statusbar.blur,10);assert.equal(value.sideRaysIntensity,.4);
  }
  const first=barGlassIntensity();first.dock=0;
  assert.deepEqual(barGlassIntensity(),{statusbar:1,dock:1});
  assert.deepEqual(barGlassIntensity({statusbar:4,dock:-1}),{statusbar:2,dock:0});
  assert.deepEqual(barGlassIntensity({statusbar:NaN,dock:'2'}),{statusbar:1,dock:1});
  for(const value of [undefined,null,[],1])assert.deepEqual(barGlassIntensity(value),{statusbar:1,dock:1});
});

test('card glass intensity has a bounded legacy default without changing bar or card appearance choices',()=>{
  const legacy=defaultMaterialSettings();delete legacy.cardGlassIntensity;
  legacy.barGlassIntensity={statusbar:1.75,dock:.35};legacy.profiles.card.opacity=.4;legacy.profiles.card.blur=18;
  assert.equal(parseMaterialSettings(legacy).cardGlassIntensity,1);
  for(const cardGlassIntensity of [0,.35,1,1.75,2]){
    const value={...legacy,cardGlassIntensity};
    assert.deepEqual(readMaterialSettings({getItem:()=>JSON.stringify(value)}),value);
    assert.deepEqual(value.barGlassIntensity,{statusbar:1.75,dock:.35});
    assert.equal(value.profiles.card.opacity,.4);assert.equal(value.profiles.card.blur,18);
  }
  assert.equal(cardGlassIntensity(-1),0);assert.equal(cardGlassIntensity(3),2);
  for(const value of [undefined,null,{},'1',NaN,Infinity])assert.equal(cardGlassIntensity(value),1);
});

test('desktop icon optics preserve legacy defaults and independent appearance values',async()=>{
 const {desktopIconGlassIntensity,desktopIconTilt}=await import('../src/material-settings.ts');
 const legacy=defaultMaterialSettings();delete legacy.desktopIconGlassIntensity;delete legacy.desktopIconTilt;
 legacy.desktop={iconSize:64,gap:48};legacy.barGlassIntensity={statusbar:.75,dock:1.5};legacy.cardGlassIntensity=.4;legacy.motion=false;
 const parsed=parseMaterialSettings(legacy);assert.equal(parsed.desktopIconGlassIntensity,1);assert.equal(parsed.desktopIconTilt,4);
 for(const [desktopIconGlassIntensity,desktopIconTilt] of [[0,-30],[2,30],[.45,0],[1,4]]){
  const value={...legacy,desktopIconGlassIntensity,desktopIconTilt};assert.deepEqual(readMaterialSettings({getItem:()=>JSON.stringify(value)}),value);
  assert.deepEqual(value.desktop,{iconSize:64,gap:48});assert.deepEqual(value.barGlassIntensity,{statusbar:.75,dock:1.5});assert.equal(value.cardGlassIntensity,.4);
 }
 assert.equal(desktopIconGlassIntensity(-1),0);assert.equal(desktopIconGlassIntensity(3),2);assert.equal(desktopIconTilt(-40),-30);assert.equal(desktopIconTilt(40),30);
 for(const value of [null,{},'2',NaN,Infinity]){assert.equal(desktopIconGlassIntensity(value),1);assert.equal(desktopIconTilt(value),4);}
});

test('Dock icon optics preserve legacy defaults and independent appearance values',async()=>{
 const {dockIconGlassIntensity,dockIconTilt}=await import('../src/material-settings.ts');
 const legacy=defaultMaterialSettings();delete legacy.dockIconGlassIntensity;delete legacy.dockIconTilt;
 legacy.desktopIconGlassIntensity=.7;legacy.desktopIconTilt=-8;legacy.desktop={iconSize:64,gap:48};legacy.barGlassIntensity={statusbar:.75,dock:1.5};legacy.cardGlassIntensity=.4;legacy.motion=false;
 const parsed=parseMaterialSettings(legacy);assert.equal(parsed.dockIconGlassIntensity,1);assert.equal(parsed.dockIconTilt,0);
 for(const [dockIconGlassIntensity,dockIconTilt] of [[0,-30],[2,30],[.45,0],[1,0]]){
  const value={...legacy,dockIconGlassIntensity,dockIconTilt};assert.deepEqual(readMaterialSettings({getItem:()=>JSON.stringify(value)}),value);
  assert.deepEqual(value.desktop,{iconSize:64,gap:48});assert.deepEqual(value.barGlassIntensity,{statusbar:.75,dock:1.5});assert.equal(value.cardGlassIntensity,.4);
 }
 assert.equal(dockIconGlassIntensity(-1),0);assert.equal(dockIconGlassIntensity(3),2);assert.equal(dockIconTilt(-40),-30);assert.equal(dockIconTilt(40),30);
 for(const value of [null,{},'2',NaN,Infinity]){assert.equal(dockIconGlassIntensity(value),1);assert.equal(dockIconTilt(value),0);}
});

test('application titlebar strength defaults for old preferences and round trips without changing other materials',async()=>{
 const {windowTitlebarGlassIntensity}=await import('../src/material-settings.ts');
 const legacy=defaultMaterialSettings();delete legacy.windowTitlebarGlassIntensity;
 legacy.barGlassIntensity={statusbar:.75,dock:1.5};legacy.profiles.window.blur=9;legacy.profiles.window.opacity=.4;
 assert.equal(parseMaterialSettings(legacy).windowTitlebarGlassIntensity,1);
 for(const windowTitlebarGlassIntensity of [0,.35,1,2]){
  const value={...legacy,windowTitlebarGlassIntensity};
  assert.deepEqual(readMaterialSettings({getItem:()=>JSON.stringify(value)}),value);
  assert.deepEqual(value.barGlassIntensity,{statusbar:.75,dock:1.5});
  assert.equal(value.profiles.window.blur,9);assert.equal(value.profiles.window.opacity,.4);
 }
 assert.equal(windowTitlebarGlassIntensity(-1),0);assert.equal(windowTitlebarGlassIntensity(3),2);
 for(const value of [null,{},'1',NaN,Infinity])assert.equal(windowTitlebarGlassIntensity(value),1);
});
