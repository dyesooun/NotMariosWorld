import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const forest = JSON.parse(readFileSync(new URL('../public/assets/sprites/forest/tileset/WhimsicalForest.json', import.meta.url), 'utf8'));
const role = placement => placement.gameplay?.role || forest.definitions?.[placement.definitionId]?.gameplay?.role;

test('authored forest render placements use world-space transforms', () => {
  for (const placement of forest.placements) {
    assert.ok(Number.isFinite(placement.x) && Number.isFinite(placement.y));
    assert.ok(placement.width > 0 && placement.height > 0);
    assert.ok(Number.isFinite(placement.rotation));
  }
});

test('authored forest preserves visual layering for gameplay markers', () => {
  for (const placement of forest.placements.filter(p => role(p) !== undefined)) {
    assert.equal(typeof placement.definitionId, 'string');
    assert.equal(typeof placement.layer, 'number');
  }
  assert.ok(forest.placements.some(p => role(p) === 'exit'));
  assert.ok(forest.placements.some(p => role(p) === 'spawnpoint'));
});
