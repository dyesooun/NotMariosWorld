import test from 'node:test';
import assert from 'node:assert/strict';
import { detectionRangeGeometry } from '../range-overlay.js';
import { projectileSpawnPoint } from '../../../public/game/json-level/projectile-origin.js';

test('detection range uses creature/shooter defaults and authored foot pivot', () => {
  const creature = { x: 100, y: 40, width: 32, height: 32, rotation: 0, flipX: false, visual: { pivot: [.5, 1] }, behavior: { type: 'enemy', actorType: 'creature' } };
  assert.deepEqual(detectionRangeGeometry(creature), { centerX: 116, footY: 72, range: 400, verticalRange: 140, creature: true });
  const shooter = { ...creature, rotation: 90, behavior: { type: 'enemy', actorType: 'shooter', detectRange: 725 }, visual: { pivot: [0, 1] } };
  const geometry = detectionRangeGeometry(shooter);
  assert.equal(geometry.range, 725);
  assert.equal(geometry.creature, false);
  assert.equal(geometry.footY, 40);
});

test('projectile spawn visualization follows default offsets, explicit offsets, flipping and rotation', () => {
  const state = { x: 100, y: 200, width: 100, height: 80, rotation: 0, flipX: false, visual: { pivot: [.5, 1] }, behavior: {} };
  assert.deepEqual(projectileSpawnPoint(state), { x: 200, y: 240 });
  assert.deepEqual(projectileSpawnPoint({ ...state, flipX: true }), { x: 100, y: 240 });
  assert.deepEqual(projectileSpawnPoint({ ...state, rotation: 90 }), { x: 150, y: 290 });
  assert.deepEqual(projectileSpawnPoint({ ...state, rotation: 90, flipX: true }), { x: 150, y: 190 });
  assert.deepEqual(projectileSpawnPoint({ ...state, behavior: { spawnOffset: [0, 0] } }), { x: 150, y: 280 });
  assert.deepEqual(projectileSpawnPoint({ ...state, behavior: { spawnOffset: [.25, -.75] } }), { x: 175, y: 220 });
});
