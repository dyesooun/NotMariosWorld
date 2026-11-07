import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameDocument, serializeGameDocument } from '../../../public/game/json-level/game-export.js';
import { parseDocument, serializeDocument, validateDocument } from '../document.js';
import { getPreviewState } from '../preview.js';
import { embeddedAssetHash, resolveProjectAssetPaths } from '../project-images.mjs';

function fixture() {
  const definition = (id, kind, frameId) => ({
    id, name: id, kind, size: { width: 16, height: 16, notes: 'editor size' },
    levels: ['forest'], tags: ['mushroom'], source: { notes: 'import source' },
    visual: { assetId: 'atlas', frameId, notes: 'visual', animations: {
      idle: { frames: [frameId], fps: 8, loop: true, damage_active_indices: [], notes: 'sequence', events: { notes: 'unused' } },
    }, defaultAnimation: 'idle' },
    physics: { mode: 'none', collider: null, hitbox: null, lethal: false, gravity: false,
      calibration: 'authored', solidShapes: [{ kind: 'rect', rect: [0, 0, 1, 1], notes: 'shape' }],
      walkSurfaces: [{ kind: 'horizontal', x1: 0, y1: 0, x2: 1, y2: 0, notes: 'surface' }] },
    behavior: kind === 'projectile' ? { type: 'projectile', flightAnimation: 'idle' } : { type: 'static' },
    gameplay: { role: 'none', tags: ['spore'], notes: 'gameplay' },
  });
  const shooter = definition('shooter', 'enemy', 'a');
  shooter.behavior = { type: 'enemy', actorType: 'shooter', projectileDefinitionId: 'bolt', notes: 'actor' };
  return {
    format: 'not-marios-world-level', version: 2, id: 'test', name: 'Test', biome: 'forest', notes: 'project',
    world: { width: 1000, height: 600, backgroundColor: '#183c38', spawn: { x: 20, y: 20, notes: 'spawn' }, atmosphere: { enabled: true, cards: [], notes: 'fog' } },
    assets: { atlas: { id: 'atlas', src: 'data:image/png;base64,YQ==', width: 64, height: 16,
      manifest: { notes: 'atlas import' }, frames: Object.fromEntries(['a', 'b', 'c', 'unused'].map((id, i) => [id, { x: i * 16, y: 0, w: 16, h: 16, notes: 'cut' }])) },
      unused: { id: 'unused', src: 'data:image/png;base64,Yg==', width: 1, height: 1, frames: {} } },
    definitions: { shooter, bolt: definition('bolt', 'projectile', 'b'), otherBolt: definition('otherBolt', 'projectile', 'c'), unused: definition('unused', 'prop', 'unused') },
    placements: [{ id: 'actor', definitionId: 'shooter', x: 100, y: 100, width: 16, height: 16, layer: 0, rotation: 0, flipX: false,
      settings: { projectileDefinitionId: 'otherBolt', motion: null, supportIds: [], notes: 'placement settings' }, notes: 'placement' }],
  };
}

test('game export strips nested editor data, prunes unused assets and retains projectile frame dependencies', () => {
  const source = fixture(), before = serializeDocument(source);
  const game = createGameDocument(source, { atlas: '/assets/sprites/shared.png' });
  assert.deepEqual(Object.keys(game.definitions), ['shooter', 'bolt', 'otherBolt']);
  assert.deepEqual(Object.keys(game.assets), ['atlas']);
  assert.deepEqual(Object.keys(game.assets.atlas.frames), ['a', 'b', 'c']);
  const text = serializeGameDocument(source, { atlas: '/assets/sprites/shared.png' });
  assert.ok(!/"(?:notes|source|manifest|calibration|levels|events)"|data:image/.test(text));
  assert.deepEqual(parseDocument(text), game);
  assert.equal(serializeDocument(source), before);
  assert.deepEqual(game.placements[0].settings.supportIds, []);
  assert.equal(game.placements[0].settings.motion, null);
  assert.deepEqual(game.world.atmosphere.cards, []);
  assert.deepEqual(game.definitions.shooter.visual.animations.idle.damage_active_indices, []);
  assert.deepEqual(game.definitions.shooter.gameplay.tags, ['spore']);
  assert.deepEqual(game.definitions.shooter.tags, ['mushroom']);
});

test('legacy motion, beam artwork and vanish deadlines retain their evaluated runtime behavior', () => {
  const source = fixture(), actor = source.definitions.shooter;
  actor.behavior = { type: 'moving', axis: 'y', distance: 80, periodMs: 1000, phaseMs: 10,
    vanish: { triggerVolume: [0, 0, 1, 1], countdownMs: 300, restoreMode: 'timed', restoreMs: 700, notes: 'vanish' } };
  actor.visual.onFrameId = 'a'; actor.visual.offFrameId = 'b';
  actor.visual.beamAlignment = { notes: 'alignment', onOffsetPx: { x: 2, y: 3, notes: 'offset' }, offOffsetPx: { x: 4, y: 5 } };
  source.placements[0].settings = {};
  const game = createGameDocument(source, { atlas: '/assets/sprites/shared.png' });
  assert.deepEqual(game.definitions.shooter.visual.beamAlignment, { onOffsetPx: { x: 2, y: 3 }, offOffsetPx: { x: 4, y: 5 } });
  for (const time of [0, 250, 300, 999, 1000, 1500]) {
    const a = getPreviewState(source, source.placements[0], time, { triggeredAtMs: 0 });
    const b = getPreviewState(game, game.placements[0], time, { triggeredAtMs: 0 });
    for (const key of ['x', 'y', 'frameId', 'vanished', 'vanishRemainingMs', 'restoreRemainingMs']) assert.deepEqual(b[key], a[key]);
  }
});

test('asset resolution uses exact content and fails for missing used images while ignoring unused ones', () => {
  const source = fixture(), hash = embeddedAssetHash(source.assets.atlas.src);
  const index = [{ src: '/assets/sprites/first.png', sha256: hash }, { src: '/assets/sprites/duplicate.png', sha256: hash }];
  const paths = resolveProjectAssetPaths(source, index);
  assert.equal(paths.atlas, index[0].src);
  assert.doesNotThrow(() => createGameDocument(source, paths));
  assert.throws(() => createGameDocument(source), /atlas.*project path/);
  source.assets.atlas.src = '/assets/sprites/missing.png';
  assert.throws(() => createGameDocument(source, resolveProjectAssetPaths(source, index)), /atlas.*missing/);
  assert.throws(() => createGameDocument(source, { atlas: '/assets/sprites/../outside.png' }), /project path/);
});

test('calibration is optional for game documents and invalid supplied values still fail validation', () => {
  const source = fixture(); delete source.definitions.shooter.physics.calibration;
  assert.deepEqual(validateDocument(source), []);
  source.definitions.shooter.physics.calibration = 'invalid';
  assert.ok(validateDocument(source).some(error => error.includes('calibration')));
});
