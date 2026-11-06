import test from 'node:test';
import assert from 'node:assert/strict';
import { supportIdsFor, toggleSupportId, writeSupportIds, cleanupSupportIds, remapSupportIds, pickPlatformAtPoint } from '../support-picker.js';

test('support picker normalizes legacy singleton and toggles unique ids', () => {
  const placement = { settings: { supportId: 'a' } };
  assert.deepEqual(supportIdsFor(placement), ['a']);
  assert.deepEqual(toggleSupportId(placement, 'b'), ['a', 'b']);
  assert.deepEqual(toggleSupportId({ settings: { supportIds: ['a', 'b'] } }, 'a'), ['b']);
  writeSupportIds(placement.settings, ['a', 'a', 'b']);
  assert.deepEqual(placement.settings, { supportIds: ['a', 'b'] });
});

test('support links clean up on deletion and remap across duplication', () => {
  const placements = [{ id: 'actor', settings: { supportIds: ['p1', 'p2'] } }, { id: 'other', settings: { supportId: 'p1' } }];
  cleanupSupportIds(placements, new Set(['p1']));
  assert.deepEqual(placements.map(p => p.settings), [{ supportIds: ['p2'] }, { supportIds: [] }]);
  remapSupportIds(placements[0].settings, new Map([['p2', 'p3']]));
  assert.deepEqual(placements[0].settings, { supportIds: ['p3'] });
});

test('platform picker uses reverse z-order and ignores non-solid candidates', () => {
  const candidates=[{id:'bottom',solid:true},{id:'hidden',solid:false},{id:'top',solid:true}];
  assert.equal(pickPlatformAtPoint(candidates,{x:5,y:5},candidate=>candidate.id!=='bottom'),candidates[2]);
  assert.equal(pickPlatformAtPoint(candidates,{x:5,y:5},()=>false),null);
});
