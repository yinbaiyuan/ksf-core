import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMaterialSettings, MATERIAL_KEY, parseMaterialSettings, readMaterialSettings } from '../src/material-settings.ts';
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
