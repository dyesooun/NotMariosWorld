import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../public/game/levels.js';

const source = new URL('../public/assets/sprites/forest/tileset/WhimsicalForest.json', import.meta.url);
const forest = JSON.parse(readFileSync(source, 'utf8'));
const role = placement => placement.gameplay?.role
  || forest.definitions?.[placement.definitionId]?.gameplay?.role;

test('authored forest JSON is the live forest course', () => {
  assert.equal(LEVELS[1].authored, true);
  assert.equal(LEVELS[1].jsonDocument.id, forest.id);
  assert.deepEqual(LEVELS[1].jsonDocument.placements, forest.placements);
  assert.equal(forest.format, 'not-marios-world-level');
  assert.equal(forest.version, 2);
  assert.equal(forest.world.width, 14200);
  assert.equal(forest.world.spawnPlacementId, forest.placements.find(p => role(p) === 'spawnpoint')?.id);
});

test('authored forest contains the agreed gameplay roles and counts', () => {
  const placements = forest.placements;
  assert.equal(placements.filter(p => role(p) === 'coin').length, 89);
  assert.equal(placements.filter(p => role(p) === 'checkpoint').length, 2);
  assert.equal(placements.filter(p => role(p) === 'power-chest').length, 0);
  assert.equal(placements.filter(p => role(p) === 'decoy-chest').length, 0);
  assert.equal(placements.filter(p => role(p) === 'creature').length, 0);
  assert.deepEqual(placements.filter(p => role(p) === 'checkpoint').map(p => p.x), [2605, 5075]);
  const exit = placements.find(p => role(p) === 'exit');
  assert.ok(exit);
  assert.equal(exit.x, 5740);
});

test('authored forest placements retain stable ids and valid transforms', () => {
  assert.equal(new Set(forest.placements.map(p => p.id)).size, forest.placements.length);
  for (const placement of forest.placements) {
    assert.equal(typeof placement.id, 'string');
    assert.ok(Number.isFinite(placement.x) && Number.isFinite(placement.y));
    assert.ok(placement.width > 0 && placement.height > 0);
    assert.ok(placement.x + placement.width >= 0 && placement.x <= forest.world.width);
  }
});
