import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LEVELS } from '../public/game/levels.js';
import { LEVEL_CATALOG } from '../public/game/level-catalog.js';
import { createState, startRun, step, getJsonRuntime } from '../public/game/engine.js';
import { gameplayAnchor, resolveGameplay } from '../public/game/json-level/gameplay.js';

const source = new URL('../public/assets/sprites/tide/tileset/TroubleTides.json', import.meta.url);
const document = JSON.parse(readFileSync(source, 'utf8'));
const gameplay = placement => resolveGameplay(document.definitions[placement.definitionId], placement);
const role = placement => gameplay(placement).role;

test('authored Troubled Tides resolves catalog metadata and gameplay roles', () => {
  const level = LEVELS[2];
  assert.equal(level.id, 2);
  assert.equal(level.theme, 'ocean');
  assert.equal(level.authored, true);
  assert.equal(LEVEL_CATALOG.find(entry => entry.id === 2).src, '/assets/sprites/tide/tileset/TroubleTides.json');
  assert.equal(level.jsonDocument.name, document.name);
  assert.equal(level.width, document.world.width);
  assert.equal(level.height, document.world.height);
  assert.equal(level.width, 6000);
  const spawn = document.placements.find(placement => placement.id === document.world.spawnPlacementId);
  assert.ok(spawn);
  assert.equal(role(spawn), 'spawnpoint');
  assert.deepEqual(level.checkpoints.map(checkpoint => checkpoint.id),
    document.placements.filter(placement => role(placement) === 'checkpoint').map(placement => placement.id));
  assert.deepEqual(level.powerChests.map(chest => chest.id),
    document.placements.filter(placement => role(placement) === 'power-chest').map(placement =>
      gameplay(placement).chestId));
  assert.equal(document.placements.filter(placement => role(placement) === 'exit').length, 1);
  const state = startRun(createState(), { worldOrder: [2, 1] });
  const runtime = getJsonRuntime(state);
  const selectedSpawn = runtime.getStates().find(entry => entry.placement.id === spawn.id);
  assert.deepEqual(runtime.spawn, gameplayAnchor(selectedSpawn.state, runtime.player.width, runtime.player.height));
});

test('authored tide exit completes world 2 and advances ordered run', () => {
  const state = startRun(createState(), { worldOrder: [2, 1] });
  assert.equal(state.level, 2);
  const runtime = getJsonRuntime(state);
  const exit = LEVELS[2].jsonDocument.placements.find(placement => role(placement) === 'exit');
  runtime.player.x = exit.x + (exit.width - runtime.player.width) / 2;
  runtime.player.y = exit.y + (exit.height - runtime.player.height) / 2;
  runtime.player.vx = 0;
  runtime.player.vy = 0;
  runtime.player.grounded = true;
  const events = step(state, {}, 1 / 60);
  assert.ok(events.some(event => event.type === 'levelComplete' && event.level === 2));
  assert.deepEqual(state.completedWorlds, [2]);
  assert.equal(state.level, 1);
});
