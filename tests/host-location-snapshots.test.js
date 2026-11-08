import test from 'node:test';
import assert from 'node:assert/strict';
import { hostLocationSnapshotKey, hostLocationState, normalizeHostLocation, shouldDrawHostLocation } from '../public/game/host-location-snapshots.js';

test('host location snapshots normalize pose and keep renderer state inert', () => {
  const player = { id: 'p1', name: 'Runner', avatar: 'cat', color: '#ffb4df', runId: 'run-1', connected: true, location: { level: 2, x: 812.4, y: 471.8, at: 1234 } };
  assert.deepEqual(normalizeHostLocation(player.location), { level: 2, x: 812, y: 472, at: 1234 });
  assert.deepEqual(hostLocationState(player), {
    level: 2, x: 812, y: 472, vx: 0, vy: 0, grounded: true, avatar: 'cat', color: '#ffb4df', name: 'Runner',
    worldOrder: undefined, coins: 0, collected: [], enemies: [], projectiles: [], powerChests: [], checkpoint: null,
    respawnRemaining: 0, reveal: null, progress: 0, deaths: 0, _levelTime: 0,
  });
});

test('host location snapshot keys skip timestamp/status-only changes but include pose and run identity', () => {
  const base = { avatar: 'explorer', color: '#b7ef51', runId: 'r1', connected: true, summary: {}, location: { level: 1, x: 10, y: 20, at: 100 } };
  assert.equal(hostLocationSnapshotKey(base), hostLocationSnapshotKey({ ...base }));
  assert.equal(hostLocationSnapshotKey(base), hostLocationSnapshotKey({ ...base, location: { ...base.location, at: 200 } }));
  assert.notEqual(hostLocationSnapshotKey(base), hostLocationSnapshotKey({ ...base, location: { ...base.location, x: 11 } }));
  assert.notEqual(hostLocationSnapshotKey(base), hostLocationSnapshotKey({ ...base, avatar: 'wizard' }));
  assert.notEqual(hostLocationSnapshotKey(base), hostLocationSnapshotKey({ ...base, runId: 'r2' }));
  assert.equal(hostLocationSnapshotKey(base), hostLocationSnapshotKey({ ...base, connected: false, summary: {finished:true} }));
  assert.equal(hostLocationState({ location: { level: 999, x: 1, y: 2 } }), null);
  assert.equal(hostLocationState({ location: { level: 3, x: 1, y: 2 } }), null);
  assert.equal(hostLocationState({ location: { level: 1, x: null, y: 2 } }), null);
});

test('host snapshot scheduling defers collapsed updates and redraws when reopened', () => {
  // Keep the last drawn key while hidden: reopening redraws changed poses,
  // while a player whose pose stayed the same incurs no terrain draw.
  assert.equal(shouldDrawHostLocation({ open: false, previousKey: 'old', nextKey: 'new' }), false);
  assert.equal(shouldDrawHostLocation({ open: true, previousKey: 'old', nextKey: 'new' }), true);
  assert.equal(shouldDrawHostLocation({ open: true, previousKey: 'new', nextKey: 'new' }), false);
});
