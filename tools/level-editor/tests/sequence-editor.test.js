import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { remapRuntimeSequenceReferences, remapAnimationEventIndices, setDamageFrameActive } from '../sequence-editor.js';
import { validateDocument } from '../document.js';
import { setDefinitionGeometry } from '../metadata.js';
import { LevelRuntime } from '../level-runtime.js';

test('sequence rename/delete keeps runtime mappings valid', () => {
  const behavior = { states: { idle: 'idle', moving: 'run', dead: 'death' }, flightAnimation: 'run', impactAnimation: 'death' };
  remapRuntimeSequenceReferences(behavior, 'run', 'moving');
  assert.deepEqual(behavior, { states: { idle: 'idle', moving: 'moving', dead: 'death' }, flightAnimation: 'moving', impactAnimation: 'death' });
  remapRuntimeSequenceReferences(behavior, 'death', null);
  assert.equal(behavior.states.dead, null);
  assert.equal(behavior.impactAnimation, null);
});

test('damage frame toggles write sorted zero-based windows and preserve an explicit empty list', () => {
  const animation = { frames: ['idle', 'attack', 'recover'] };
  setDamageFrameActive(animation, 1, true);
  setDamageFrameActive(animation, 0, true);
  assert.deepEqual(animation.damage_active_indices, [0, 1]);
  setDamageFrameActive(animation, 0, false);
  assert.deepEqual(animation.damage_active_indices, [1]);
  setDamageFrameActive(animation, 1, false);
  assert.deepEqual(animation.damage_active_indices, []);
});

test('damage windows follow ordered-frame reorder and removal', () => {
  const animation = { frames: ['startup', 'hit', 'recovery'], damage_active_indices: [1] };
  let mapping = animation.frames.map((_, i) => i);
  [animation.frames[0], animation.frames[1]] = [animation.frames[1], animation.frames[0]];
  [mapping[0], mapping[1]] = [mapping[1], mapping[0]];
  // The hit frame moved from ordered index 1 to index 0.
  remapAnimationEventIndices(animation, mapping);
  assert.deepEqual(animation.damage_active_indices, [0]);

  mapping = animation.frames.map((_, i) => i === 0 ? null : i - 1);
  animation.frames.splice(0, 1);
  remapAnimationEventIndices(animation, mapping);
  assert.deepEqual(animation.damage_active_indices, []);
});

test('explicit damage windows survive metadata JSON roundtrip', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/actor-states.json', import.meta.url), 'utf8'));
  const definition = Object.values(fixture.definitions).find(item => item.visual?.animations);
  const animation = Object.values(definition.visual.animations)[0];
  setDamageFrameActive(animation, 0, true);
  const restored = JSON.parse(JSON.stringify(fixture));
  assert.deepEqual(validateDocument(restored), []);
  assert.deepEqual(restored.definitions[definition.id].visual.animations[Object.keys(definition.visual.animations)[0]].damage_active_indices, [0]);
});

test('authored damage controls reach runtime only with both active frames and attack geometry', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/actor-states.json', import.meta.url), 'utf8'));
  fixture.placements = fixture.placements.filter(item => item.id !== 'snapvine_pod');
  const actor = fixture.definitions[fixture.placements.find(item => item.id === 'brambleback_boar').definitionId];
  actor.behavior.speed = 0;
  actor.behavior.states.playerDetected = 'lunge';
  actor.visual.animations.lunge.damage_active_indices = [];
  setDamageFrameActive(actor.visual.animations.lunge, 1, true);

  const play = () => {
    const document = JSON.parse(JSON.stringify(fixture));
    assert.deepEqual(validateDocument(document), []);
    const runtime = new LevelRuntime(document);
    Object.assign(runtime.player, { x: 410, y: 334, vx: 0, vy: 0, grounded: true, standingId: 'ledge' });
    runtime.advance(.05);
    assert.equal(runtime.deaths, 0, 'windup must remain harmless');
    runtime.advance(.1);
    return runtime.deaths;
  };

  assert.equal(play(), 0, 'active frames alone do not invent an attack hitbox');
  setDefinitionGeometry(fixture, actor.id, 'damage', [.65, .5, .35, .25]);
  assert.equal(play(), 1, 'the exported active frame and hitbox kill on overlap');
  setDamageFrameActive(actor.visual.animations.lunge, 1, false);
  assert.equal(play(), 0, 'clearing the window disables damage even with an authored hitbox');
});
