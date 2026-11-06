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
  assert.ok(Number.isFinite(forest.world.width) && forest.world.width > 0);
  assert.equal(LEVELS[1].width, forest.world.width);
  assert.equal(role(forest.placements.find(p => p.id === forest.world.spawnPlacementId)), 'spawnpoint');
});

test('live forest interaction metadata follows the authored JSON without inserting old objects', () => {
  const placements = forest.placements;
  assert.deepEqual(LEVELS[1].coins.map(c => c.id), placements.filter(p => role(p) === 'coin').map(p => p.id));
  assert.deepEqual(new Set(LEVELS[1].checkpoints.map(c => c.id)), new Set(placements.filter(p => role(p) === 'checkpoint').map(p => p.id)));
  assert.equal(LEVELS[1].powerChests.length, placements.filter(p => role(p) === 'power-chest').length);
  const exit = placements.find(p => role(p) === 'exit');
  assert.ok(exit);
  assert.equal(LEVELS[1].endX, exit.x);
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
