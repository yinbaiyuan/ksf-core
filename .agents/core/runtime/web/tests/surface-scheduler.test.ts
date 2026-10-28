import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurfaceScheduler } from '../src/vendor/surface-scheduler.js';

function fixture() {
  const frames: FrameRequestCallback[] = [], log: string[] = [], maps: Map<Element, DOMRect>[] = [];
  const surface = (name: string) => ({
    host: {} as Element,
    measure(sources: Map<Element, DOMRect>) { maps.push(sources); log.push('read ' + name); return name; },
    apply(value: unknown) { log.push('write ' + value); },
  });
  const a = surface('a'), b = surface('b'), surfaces = new Set([a, b]);
  const scheduler = createSurfaceScheduler(surfaces, callback => { frames.push(callback); return frames.length; });
  const scope = (...hosts: Element[]) => ({ contains: (host: Element) => hosts.includes(host) }) as Element;
  const flush = () => { while (frames.length) frames.shift()!(0); };
  return { a, b, surfaces, scheduler, scope, flush, frames, log, maps };
}

test('optical updates coalesce per frame and read every box before writing with a shared backdrop cache', () => {
  const f = fixture();
  for (let i = 0; i < 50; i++) f.scheduler.sync(null);
  assert.equal(f.frames.length, 1);
  f.flush();
  assert.deepEqual(f.log, ['read a', 'read b', 'write a', 'write b']);
  assert.equal(f.maps[0], f.maps[1]);
});

test('a gesture discards queued work and suppresses resize and scroll updates only in its scope', () => {
  const f = fixture(), card = f.scope(f.a.host);
  f.scheduler.sync(null);
  f.scheduler.suspend(card, true);
  for (let i = 0; i < 100; i++) { f.scheduler.enqueue(f.a); f.scheduler.sync(card); }
  f.flush();
  assert.deepEqual(f.log, ['read b', 'write b']);
  f.log.length = 0;
  f.scheduler.suspend(card, false);
  f.scheduler.suspend(card, false);
  assert.equal(f.frames.length, 1);
  f.flush();
  assert.deepEqual(f.log, ['read a', 'write a']);
});

test('nested gestures resume independently and a detached surface cannot run stale queued work', () => {
  const f = fixture(), grid = f.scope(f.a.host, f.b.host), card = f.scope(f.a.host);
  f.scheduler.suspend(grid, true); f.scheduler.suspend(card, true);
  f.scheduler.sync(null); assert.equal(f.frames.length, 0);
  f.scheduler.suspend(grid, false); f.flush();
  assert.deepEqual(f.log, ['read b', 'write b']);
  f.log.length = 0;
  f.scheduler.suspend(card, false);
  f.surfaces.delete(f.a); f.scheduler.cancel(f.a); f.flush();
  assert.deepEqual(f.log, []);
});

test('ending a gesture before its queued frame resumes once and later gestures stay usable', () => {
  const f = fixture(), grid = f.scope(f.a.host, f.b.host);
  f.scheduler.sync(grid); f.scheduler.suspend(grid, true); f.scheduler.suspend(grid, false);
  f.flush(); assert.equal(f.log.length, 4);
  f.log.length = 0;
  assert.equal(f.scheduler.suspend(grid, true), true);
  assert.equal(f.scheduler.suspend(grid, true), false);
  f.scheduler.sync(null); assert.equal(f.frames.length, 0);
  f.scheduler.suspend(grid, false); f.flush();
  assert.deepEqual(f.log, ['read a', 'read b', 'write a', 'write b']);
});
