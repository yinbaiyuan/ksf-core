import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { createGridRefresh, refreshGridChild } from '../src/desktop/grid-interaction.ts';

test('pixel refresh bypasses the grid memo only for the active card and preserves its content', () => {
  const content = createElement('p', null, 'card content');
  const a = createElement('section', { key: 'a' }, content), b = createElement('section', { key: 'b' });
  const [nextA, nextB] = refreshGridChild([a, b], 'a');
  assert.notEqual(nextA, a);
  assert.equal(nextA.key, a.key);
  assert.equal(nextA.props.children, content);
  assert.equal(nextB, b);
  const unkeyed = createElement('section');
  assert.equal(refreshGridChild([unkeyed], null)[0], unkeyed);
  assert.equal(refreshGridChild([a, b], null)[0], a);
});

function fixture() {
  let serial = 0;
  const frames = new Map<number, FrameRequestCallback>(), rendered: string[] = [];
  const refresh = createGridRefresh(id => rendered.push(id), callback => { frames.set(++serial, callback); return serial; }, id => { frames.delete(id); });
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)); };
  return { frames, rendered, refresh, flush };
}

test('many moves inside one cell produce one active-card refresh per frame', () => {
  const f = fixture();
  f.refresh.start('a');
  for (let i = 0; i < 100; i++) f.refresh.move();
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.deepEqual(f.rendered, ['a']);
  f.refresh.move(); f.flush();
  assert.deepEqual(f.rendered, ['a', 'a']);
});

test('stop, cancel and later gestures cannot render stale queued positions', () => {
  const f = fixture();
  f.refresh.move(); assert.equal(f.frames.size, 0);
  f.refresh.start('a'); f.refresh.move(); f.refresh.stop(); f.flush();
  assert.deepEqual(f.rendered, []);
  f.refresh.start('a'); f.refresh.move(); f.refresh.start('b'); f.refresh.move(); f.flush();
  assert.deepEqual(f.rendered, ['b']);
  f.refresh.stop(); f.refresh.move(); assert.equal(f.frames.size, 0);
});
