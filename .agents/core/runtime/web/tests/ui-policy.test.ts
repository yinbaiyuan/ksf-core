import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_UI_CONFIGURATION as defaults, DEFAULT_SYSTEM_PREFERENCES as system, mergeUIConfiguration, resolveUIConfiguration } from '../src/internal-ui/policy.ts';

const capabilities = { frost: true, glass: false };

test('theme and density vary independently without changing requested material or motion', () => {
  for (const theme of ['light', 'dark'] as const) for (const density of ['compact', 'comfortable'] as const) {
    const config = mergeUIConfiguration(defaults, { theme, density });
    const resolved = resolveUIConfiguration(config, system, capabilities);
    assert.equal(resolved.theme, theme); assert.equal(resolved.density, density);
    assert.equal(resolved.material, 'solid'); assert.equal(resolved.motion, 'full');
    assert.deepEqual(resolved.requested, config);
  }
  assert.equal(defaults.theme, 'system');
});

test('content is solid, shell can frost, and transparency/forced-colors fallback preserves intent', () => {
  const config = mergeUIConfiguration(defaults, { material: 'frost', theme: 'dark' });
  assert.equal(resolveUIConfiguration(config, system, capabilities, 'content').material, 'solid');
  assert.equal(resolveUIConfiguration(config, system, capabilities, 'shell').material, 'frost');
  for (const preference of ['reducedTransparency', 'forcedColors'] as const) {
    const value = resolveUIConfiguration(config, { ...system, [preference]: true }, capabilities, 'shell');
    assert.equal(value.material, 'solid'); assert.equal(value.requested.material, 'frost');
    assert.equal(value.theme, 'dark'); assert.ok(value.reasons.length);
  }
});

test('unsupported glass falls back through actual capabilities without a second effect engine', () => {
  const config = mergeUIConfiguration(defaults, { material: 'glass' });
  assert.equal(resolveUIConfiguration(config, system, capabilities, 'summary').material, 'frost');
  assert.equal(resolveUIConfiguration(config, system, { frost: false, glass: false }, 'summary').material, 'solid');
  assert.equal(resolveUIConfiguration(config, system, { frost: true, glass: true }, 'summary').material, 'glass');
});

test('OS reduced motion wins over full; hidden surfaces stop decoration without changing user intent', () => {
  const config = mergeUIConfiguration(defaults, { motion: 'full' });
  const accessible = resolveUIConfiguration(config, { ...system, reducedMotion: true }, capabilities);
  assert.equal(accessible.motion, 'reduced'); assert.equal(accessible.animate, false); assert.equal(accessible.requested.motion, 'full');
  const hidden = resolveUIConfiguration(config, system, capabilities, 'shell', false);
  assert.equal(hidden.motion, 'full'); assert.equal(hidden.animate, false); assert.ok(hidden.reasons.includes('not-visible'));
});

test('malformed values fail at the public configuration boundary', () => {
  assert.throws(() => mergeUIConfiguration(defaults, { density: 'tiny' as never }), /density/);
  const parent = mergeUIConfiguration(defaults, { density: 'comfortable', theme: 'dark' });
  const child = mergeUIConfiguration(parent, { theme: 'light' });
  assert.equal(child.density, 'comfortable'); assert.equal(parent.theme, 'dark');
});

