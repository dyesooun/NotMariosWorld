import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCharacterCatalog } from '../characters.js';

const image = '/assets/sprites/forest/creatures/creatures.png';
test('imports one character sequence and creates an idle preview state', () => {
  const result = createCharacterCatalog({ name: 'Walker', imageSrc: image, width: 32, height: 16, cuts: [{ x: 0, y: 0, w: 16, h: 16 }, { x: 16, y: 0, w: 16, h: 16 }] });
  const definition = Object.values(result.definitions)[0];
  assert.equal(definition.kind, 'character');
  assert.deepEqual(definition.visual.animations.idle.frames, ['frame-0001', 'frame-0002']);
  assert.equal(definition.visual.animations.idle.fps, 8);
  assert.equal(definition.physics.calibration, 'estimated');
  assert.equal(definition.physics.gravity, false);
  assert.deepEqual(definition.physics.collider, [0.1, 0.1, 0.8, 0.9]);
});

test('imports named states from the forest creature manifest', () => {
  const manifest = JSON.parse(fs.readFileSync('public/assets/sprites/forest/creatures/manifest.json', 'utf8'));
  const result = createCharacterCatalog({ name: 'Forest creatures', imageSrc: image, width: manifest.atlas.width, height: manifest.atlas.height, manifest, levels: ['forest'] });
  assert.equal(Object.keys(result.definitions).length, manifest.enemies.length);
  const boar = Object.values(result.definitions).find(definition => definition.source.characterId === 'brambleback_boar');
  assert.ok(boar.visual.animations.idle);
  assert.ok(boar.visual.animations.run);
  assert.equal(boar.levels[0], 'forest');
  assert.equal(boar.physics.calibration, 'manifest');
});

test('accepts the simple editor-owned character mapping', () => {
  const manifest = { frames: { idle: { x: 0, y: 0, w: 10, h: 20 } }, characters: [{ id: 'hero', name: 'Hero', animations: { idle: { frames: ['idle'], fps: 6, loop: true } }, defaultAnimation: 'idle' }] };
  const result = createCharacterCatalog({ name: 'Hero', imageSrc: image, width: 10, height: 20, manifest });
  const definition = Object.values(result.definitions)[0];
  assert.equal(definition.name, 'Hero');
  assert.equal(definition.visual.defaultAnimation, 'idle');
});

test('uses each character default state frame as its visual frame', () => {
  const manifest = {
    frames: { short: { x: 0, y: 0, w: 10, h: 10 }, tall: { x: 10, y: 0, w: 10, h: 30 } },
    characters: [
      { id: 'short', animations: { idle: { frames: ['short'], fps: 8, loop: true } } },
      { id: 'tall', animations: { idle: { frames: ['tall'], fps: 8, loop: true } } },
    ],
  };
  const result = createCharacterCatalog({ name: 'Different poses', imageSrc: image, width: 20, height: 30, manifest });
  const definitions = Object.values(result.definitions);
  assert.equal(definitions.find(d => d.source.characterId === 'short').visual.frameId, 'short');
  assert.equal(definitions.find(d => d.source.characterId === 'tall').visual.frameId, 'tall');
  assert.equal(definitions.find(d => d.source.characterId === 'tall').size.height, 192);
});

test('retains normalized custom collider and rejects declared dimension mismatch', () => {
  const manifest = { atlas: { width: 10, height: 20 }, frames: { idle: { x: 0, y: 0, w: 10, h: 20 } }, characters: [{ id: 'hero', collider: [0.2, 0.3, 0.4, 0.5], animations: { idle: { frames: ['idle'], fps: 8, loop: true } } }] };
  const result = createCharacterCatalog({ name: 'Hero', imageSrc: image, width: 10, height: 20, manifest });
  assert.deepEqual(Object.values(result.definitions)[0].physics.collider, [0.2, 0.3, 0.4, 0.5]);
  assert.throws(() => createCharacterCatalog({ name: 'Hero', imageSrc: image, width: 12, height: 20, manifest }), /dimensions do not match/);
});

test('rejects invalid animation event indices', () => {
  const manifest = { frames: { idle: { x: 0, y: 0, w: 10, h: 10 } }, characters: [{ id: 'hero', animations: { attack: { frames: ['idle'], fps: 8, loop: false, damage_active_indices: [1], spawn_projectile_at_index: 2 } } }] };
  assert.throws(() => createCharacterCatalog({ name: 'Hero', imageSrc: image, width: 10, height: 10, manifest }), /event index/);
});

for (const biome of ['tide', 'hell']) test(`imports bundled ${biome} creature states`, () => {
  const manifest = JSON.parse(fs.readFileSync(`public/assets/sprites/${biome}/creatures/manifest.json`, 'utf8'));
  const result = createCharacterCatalog({ name: `${biome} creatures`, imageSrc: `/assets/sprites/${biome}/creatures/creatures.png`, width: manifest.atlas.width, height: manifest.atlas.height, manifest, levels: [biome] });
  assert.equal(Object.keys(result.definitions).length, manifest.enemies.length);
  assert.ok(Object.values(result.definitions).every(definition => Object.keys(definition.visual.animations).length > 0));
});

test('namespaces imported atlases and rejects malformed sequences', () => {
  const options = { name: 'Walker', imageSrc: image, width: 16, height: 16, cuts: [{ x: 0, y: 0, w: 16, h: 16 }], existingIds: ['walker-atlas'] };
  const result = createCharacterCatalog(options);
  assert.equal(Object.keys(result.assets)[0], 'walker-atlas-2');
  assert.throws(() => createCharacterCatalog({ ...options, cuts: [{ x: 0, y: 0, w: 16, h: 16 }], manifest: { frames: { a: { x: 0, y: 0, w: 16, h: 16 } }, characters: [{ id: 'bad', animations: { idle: { frames: ['missing'], fps: 8, loop: true } } }] } }), /unknown frame/);
  assert.throws(() => createCharacterCatalog({ ...options, cuts: [{ x: 0, y: 0, w: 16, h: 16 }], manifest: { frames: { a: { x: 0, y: 0, w: 16, h: 16 } }, characters: [{ id: 'bad', animations: { idle: { frames: ['a'], fps: 0, loop: true } } }] } }), /fps/);
});
