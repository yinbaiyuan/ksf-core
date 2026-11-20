import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {themeColors, themeColorNames, themeColorDefinitions, themeColorProperties, themeVars, bindTheme} from '../src/theme.ts';
import {generateThemeCSS, generateThemeDocumentation} from '../scripts/generate-theme.mjs';
import {scopeApplicationCSS} from '../server/styles.mjs';

test('both immutable palettes expose the same semantic roles and matching public CSS references', () => {
  assert.deepEqual(Object.keys(themeColors), ['light', 'dark']);
  for (const theme of Object.values(themeColors)) {
    assert.deepEqual(Object.keys(theme).sort(), [...themeColorNames].sort());
    assert.ok(Object.isFrozen(theme));
    for (const name of themeColorNames) {
      assert.match(theme[name], /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/);
      assert.ok(themeColorDefinitions[name].label && themeColorDefinitions[name].usage);
      assert.equal(themeVars[name], `var(${themeColorProperties[name]})`);
    }
  }
  assert.ok(Object.isFrozen(themeColors));
  assert.throws(() => { themeColors.light.primary = '#000000'; });
});

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).slice(0, 3).map(x => parseInt(x, 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('intended text pairs meet 4.5:1 and focus/control outlines meet 3:1 in both themes', () => {
  for (const [name, colors] of Object.entries(themeColors)) {
    for (const background of ['background', 'surface', 'surfaceRaised']) {
      for (const text of ['foreground', 'mutedForeground', 'primary']) {
        assert.ok(contrast(colors[text], colors[background]) >= 4.5, `${name}: ${text}/${background}`);
      }
      for (const outline of ['borderStrong', 'focusRing']) {
        assert.ok(contrast(colors[outline], colors[background]) >= 3, `${name}: ${outline}/${background}`);
      }
    }
    for (const [text, background] of [['onPrimary', 'primary'], ['primary', 'primarySurface'],
      ['selectionForeground', 'selection'], ...['success', 'warning', 'danger', 'info'].map(key => [key, key + 'Surface'])]) {
      assert.ok(contrast(colors[text], colors[background]) >= 4.5, `${name}: ${text}/${background}`);
    }
  }
});

test('generated CSS stays synchronized, opt-in and scoped by the normal application builder', async () => {
  const css = await readFile(new URL('../src/theme.css', import.meta.url), 'utf8');
  assert.equal(css, generateThemeCSS());
  assert.equal(await readFile(new URL('../THEME-COLORS.md', import.meta.url), 'utf8'), generateThemeDocumentation());
  assert.doesNotMatch(css, /:root|\bbody\s*\{|\bhtml\s*\{/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /data-ksf-theme="system"/);
  const scoped = scopeApplicationCSS(css, {id: 'com.example.theme', version: '1.0.0'});
  assert.match(scoped, /ksf-app-com_example_theme--1_0_0/);
});

function fixture(previous = null) {
  const values = new Map(previous === null ? [] : [['data-ksf-theme', previous]]), listeners = new Set();
  let mode = 'light';
  const element = {getAttribute: key => values.get(key) ?? null, setAttribute: (key, value) => values.set(key, value), removeAttribute: key => values.delete(key)};
  const sdk = {getSnapshot: () => ({material: {themeMode: mode}}), subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }};
  return {element, sdk, listeners, change(value) { mode = value; for (const listener of listeners) listener(); }};
}

test('native theme bindings follow only their host and restore attributes without leaking subscriptions', () => {
  const a = fixture('system'), b = fixture();
  const offA = bindTheme(a.element, a.sdk), offB = bindTheme(b.element, b.sdk);
  a.change('dark');
  assert.equal(a.element.getAttribute('data-ksf-theme'), 'dark');
  assert.equal(b.element.getAttribute('data-ksf-theme'), 'light');
  a.change(undefined);
  assert.equal(a.element.getAttribute('data-ksf-theme'), 'system');
  assert.throws(() => bindTheme(a.element, a.sdk), /已绑定/);
  offA(); offA(); offB();
  assert.equal(a.element.getAttribute('data-ksf-theme'), 'system');
  assert.equal(b.element.getAttribute('data-ksf-theme'), null);
  assert.equal(a.listeners.size + b.listeners.size, 0);
  a.change('dark');
  assert.equal(a.element.getAttribute('data-ksf-theme'), 'system');
});

test('fixed local overrides do not subscribe or change host settings; cleanup preserves later caller edits', () => {
  const f = fixture();
  const off = bindTheme(f.element, f.sdk, {theme: 'dark'});
  assert.equal(f.listeners.size, 0);
  f.change('light');
  assert.equal(f.element.getAttribute('data-ksf-theme'), 'dark');
  f.element.setAttribute('data-ksf-theme', 'light');
  off();
  assert.equal(f.element.getAttribute('data-ksf-theme'), 'light');
  assert.throws(() => bindTheme(f.element, f.sdk, {theme: 'system'}), /只支持/);
});

test('a failed host subscription leaves the application root in its original theme', () => {
  const f = fixture('dark');
  f.sdk.subscribe = () => { throw Error('surface closed'); };
  assert.throws(() => bindTheme(f.element, f.sdk), /surface closed/);
  assert.equal(f.element.getAttribute('data-ksf-theme'), 'dark');
  f.sdk.subscribe = () => () => {};
  bindTheme(f.element, f.sdk)();
});


test('delivered component CSS references only declared KSF semantic colors', async () => {
  const contracts=JSON.parse(await readFile(new URL('../components/contracts.json',import.meta.url),'utf8'));
  const defined=new Set(Object.values(themeColorProperties));
  const files=new Set(contracts.flatMap(contract=>contract.sourceFiles).filter(file=>file.endsWith('.css')));
  for(const file of files){const css=await readFile(new URL('../'+file,import.meta.url),'utf8');for(const match of css.matchAll(/var\((--ksf-color-[\w-]+)/g))assert.ok(defined.has(match[1]),`${file}: unknown semantic color ${match[1]}`);}
});
