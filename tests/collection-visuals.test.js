import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionVisuals } from '../public/game/collection-visuals.js';
import { drawPlacementVfx } from '../public/game/json-level/vfx.js';

test('collection bursts start once and claims stay hidden through death and snapshots', () => {
  const state = { level: 2, elapsed: 1, collected: ['coin'] };
  const first = collectionVisuals(state, ['chest'], 100);
  state.elapsed = 5;
  const afterDeath = collectionVisuals(state, [], 5000);
  assert.equal(afterDeath.coins.get('coin'), 100);
  assert.equal(afterDeath.chests.get('chest'), 100);
  assert.equal(first, afterDeath);
  state.level = 3;
  assert.equal(collectionVisuals(state, [], 6000).chests.size, 0);
  state.elapsed = 0; state.collected = [];
  assert.equal(collectionVisuals(state, [], 7000).coins.size, 0);
});

test('claimed treasure emits a bounded gold/cyan burst while decoys do not', () => {
  const draw = (role, timeMs) => {
    const pixels = [], ctx = { globalAlpha: 1, save() {}, restore() {}, fillRect() { pixels.push(this.fillStyle); } };
    drawPlacementVfx(ctx, { id: 'reward', width: 40, height: 34, collected: true, vanished: true, collectedAtMs: 100, gameplay: { role } }, { timeMs });
    return pixels;
  };
  const pixels = draw('power-chest', 300);
  assert.ok(pixels.includes('#ffd166'));
  assert.ok(pixels.includes('#b7f5ff'));
  assert.equal(draw('power-chest', 1000).length, 0);
  assert.equal(draw('decoy-chest', 300).length, 0);
});
