import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameDocument } from '../public/game/json-level/game-export.js';
import { parseDocument } from '../public/game/json-level/document.js';
import { LevelRuntime } from '../public/game/json-level/level-runtime.js';
import { shapePolygons } from '../public/game/json-level/runtime-geometry.js';
import { buildProjectImageIndex, resolveProjectAssetPaths } from '../tools/level-editor/project-images.mjs';

const forestSource = new URL('../tools/level-editor/levels/WhimsicalForest.json', import.meta.url);
const forestOutput = new URL('../public/assets/sprites/forest/tileset/WhimsicalForest.json', import.meta.url);

test('shipped game levels match editable sources and reference existing project images', async () => {
  const index = await buildProjectImageIndex();
  for (const [name, biome] of [['WhimsicalForest', 'forest'], ['TroubleTides', 'tide']]) {
    const sourceText = await readFile(new URL(`../tools/level-editor/levels/${name}.json`, import.meta.url), 'utf8');
    const source = parseDocument(sourceText);
    const outputText = await readFile(new URL(`../public/assets/sprites/${biome}/tileset/${name}.json`, import.meta.url), 'utf8');
    const output = parseDocument(outputText);
    assert.deepEqual(output, createGameDocument(source, resolveProjectAssetPaths(source, index)));
    assert.ok(outputText.length < sourceText.length / 10, `${name} should omit embedded images and unused library data`);
    assert.ok(!outputText.includes('data:image/'));
    assert.deepEqual(output.placements.map(p => p.id), source.placements.map(p => p.id));
    for (const asset of Object.values(output.assets)) assert.ok(index.some(image => image.src === asset.src));
  }
});

test('compact forest preserves local simulation, gameplay and transformed collision geometry', async () => {
  const source = parseDocument(await readFile(forestSource, 'utf8'));
  const output = parseDocument(await readFile(forestOutput, 'utf8'));
  const original = new LevelRuntime(source), compact = new LevelRuntime(output);
  const scene = runtime => runtime.getStates().map(({ placement, state }) => ({
    id: placement.id, x: state.x, y: state.y, frameId: state.frameId,
    beamOn: state.beamOn, damageActive: state.damageActive, vanished: state.vanished,
    gameplay: state.gameplay, vfx: state.vfx,
    solid: shapePolygons(state, 'solid'), hazard: shapePolygons(state, 'hazard'),
    interaction: shapePolygons(state, 'interaction'),
  }));
  assert.deepEqual(original.spawn, compact.spawn);
  assert.deepEqual(scene(original), scene(compact));
  for (let frame = 0; frame < 120; frame++) {
    const input = { right: frame < 90, left: frame >= 90, jump: frame % 40 < 4 };
    assert.deepEqual(original.advance(1 / 60, input), compact.advance(1 / 60, input));
    assert.deepEqual(original.player, compact.player);
  }
  assert.deepEqual(scene(original), scene(compact));
  assert.equal(original.coins, compact.coins);
  assert.equal(original.progress, compact.progress);
  assert.equal(original.deaths, compact.deaths);
});
