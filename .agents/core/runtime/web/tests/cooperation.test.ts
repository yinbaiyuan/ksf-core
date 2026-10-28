import assert from 'node:assert/strict';
import { test } from 'node:test';
import { abilityType, typeNames } from '../../../applications/conversations/src/model.ts';
import type { Ability } from '../../../applications/conversations/src/types.ts';

test('current and historical cooperation abilities share a visible group without mutating historical IDs', () => {
  const old = { id: 'workflow.demo.test' } as Ability;
  const current = { id: 'cooperation.demo.test' } as Ability;
  assert.equal(abilityType(current), 'cooperation');
  assert.equal(abilityType(old), 'cooperation');
  assert.equal(typeNames[abilityType(old)], '协同');
  assert.equal(old.id, 'workflow.demo.test');
});
