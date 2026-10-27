import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneWindowSession, readingPositions, releaseWindowSession, windowSessions } from '../src/window-session.ts';
test('comparison copies reading, filter and pane context then diverges and releases only its own state', () => {
  windowSessions.set('one',new Map<string,unknown>([['roundQuery','glass'],['display',{directory:264,rounds:272,focus:false}]]));
  readingPositions.set('one:task:turn',327); cloneWindowSession('one','two');
  assert.equal(windowSessions.get('two')?.get('roundQuery'),'glass'); assert.equal(readingPositions.get('two:task:turn'),327);
  windowSessions.get('two')!.set('roundQuery','another'); readingPositions.set('two:task:turn',550);
  assert.equal(windowSessions.get('one')!.get('roundQuery'),'glass'); assert.equal(readingPositions.get('one:task:turn'),327);
  releaseWindowSession('two'); assert.equal(windowSessions.has('two'),false); assert.equal(readingPositions.has('two:task:turn'),false); assert.equal(readingPositions.get('one:task:turn'),327); releaseWindowSession('one');
});
