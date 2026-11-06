import test from 'node:test';
import assert from 'node:assert/strict';
import { remapRuntimeSequenceReferences } from '../sequence-editor.js';

test('sequence rename/delete keeps runtime mappings valid', () => {
  const behavior = { states: { idle: 'idle', moving: 'run', dead: 'death' }, flightAnimation: 'run', impactAnimation: 'death' };
  remapRuntimeSequenceReferences(behavior, 'run', 'moving');
  assert.deepEqual(behavior, { states: { idle: 'idle', moving: 'moving', dead: 'death' }, flightAnimation: 'moving', impactAnimation: 'death' });
  remapRuntimeSequenceReferences(behavior, 'death', null);
  assert.equal(behavior.states.dead, null);
  assert.equal(behavior.impactAnimation, null);
});
