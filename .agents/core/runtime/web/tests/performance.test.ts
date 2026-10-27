import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRemoteCache, shareJSON } from '../src/remote-cache.ts';
import { renderLensMap, type GlassOptions } from '../src/vendor/liquid-glass.js';

test('polling shares unchanged messages while retaining changed timestamps and revisions', () => {
  const previous = { at: 1, messages: [{ id: 'a', text: 'original', revisions: [] }, { id: 'b', text: 'old', revisions: [] }] };
  const next = shareJSON(previous, { at: 2, messages: [{ id: 'a', text: 'original', revisions: [] }, { id: 'b', text: 'new', revisions: ['old'] }] });
  assert.equal(next.at, 2);
  assert.equal(next.messages[0], previous.messages[0]);
  assert.notEqual(next.messages[1], previous.messages[1]);
  assert.equal(previous.messages[1].text, 'old');
  assert.deepEqual(next.messages[1].revisions, ['old']);
  const missingKey = { a: undefined };
  assert.notEqual(shareJSON(missingKey, { b: undefined }), missingKey);
  assert.deepEqual(shareJSON([1, 2], [1]), [1]);
});

test('identical polls do not notify; failures and recovery still notify and retain data', async () => {
  let notifications = 0, fail = false;
  const cache = createRemoteCache((async () => {
    if (fail) throw Error('offline');
    return new Response(JSON.stringify({ data: { messages: [{ id: 'a', text: 'original' }] } }));
  }) as typeof fetch);
  const off = cache.subscribe('/stable', () => notifications++);
  try {
    await cache.refresh('/stable');
    const original = cache.read('/stable').data;
    await cache.refresh('/stable', true);
    assert.equal(notifications, 1);
    assert.equal(cache.read('/stable').data, original);
    fail = true; await cache.refresh('/stable', true);
    assert.equal(notifications, 2);
    assert.equal(cache.read('/stable').data, original);
    fail = false; await cache.refresh('/stable', true);
    assert.equal(notifications, 3);
    assert.equal(cache.read('/stable').error, null);
    assert.equal(cache.read('/stable').data, original);
  } finally { off(); }
});

test('flat-centre optimization preserves exact original optical pixels across desktop and control shapes', () => {
  // SHA-256 fixtures captured from the original renderer before the fast path was added.
  const fixtures: [GlassOptions, number, string][] = [
    [{ width: 1180, height: 740, radius: 22, bezel: .32 }, 1, '137e0e8c14276933369e83f785ba665984458da013bfdedf1e2117889e10b3f0'],
    [{ width: 503, height: 317, radius: 31, bezel: .3, invert: true, curvature: 2, ior: 1.8 }, 1.25, '0d89a076e017828612765d40a5a8c6c5df64c883fa21891c4e25e4e7e0319a9c'],
    [{ width: 79, height: 35, radius: 16, bezel: .75, specular: .78 }, 2, '76f69152137d9abadcc5cd9250039f3921c33a3ff94626c5eb3ad3902344c225'],
    [{ width: 1440, height: 32, radius: 0, bezel: .45, specularWidth: 1.4 }, 1, '954661aaf40fc88e4a0417fa763462c63fcf04d94fb446084ba51ca24cab448b'],
    [{ width: 45, height: 45, radius: 90, bezel: 1 }, .77, 'c3ea1aa088b3f12d8acce6f11e550127eaca3bf95cc470c54d232bc9de4956f2'],
    [{ width: 340, height: 217, radius: 24, bezel: .01, specularWidth: 0 }, 1, '0852a58d634c467bac2f70053d373e83bd4855d5377b70e6f4eaeaa29e6f7622'],
  ];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let pixels: Uint8ClampedArray;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement() { return { getContext() { return {
      createImageData(w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData(image: { data: Uint8ClampedArray }) { pixels = image.data; },
    }; } }; },
  } });
  try {
    for (const [options, scale, expected] of fixtures) {
      renderLensMap(options, scale);
      assert.equal(createHash('sha256').update(pixels!).digest('hex'), expected, JSON.stringify(options));
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete (globalThis as any).document;
  }
});
