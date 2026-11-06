import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, validateDocument } from '../document.js';

const animation = (frame = 'idle') => ({ frames: [frame], fps: 8, loop: true });
function baseDocument() {
  const assets = { atlas: { id: 'atlas', src: 'data:image/png;base64,AA==', width: 8, height: 8, frames: {
    idle: { x: 0, y: 0, w: 2, h: 2 }, moving: { x: 2, y: 0, w: 2, h: 2 }, detected: { x: 4, y: 0, w: 2, h: 2 }, dead: { x: 6, y: 0, w: 2, h: 2 },
  } } };
  const actor = { id: 'actor', name: 'Actor', kind: 'enemy', size: { width: 32, height: 32 }, visual: { assetId: 'atlas', frameId: 'idle', defaultAnimation: 'idle', animations: { idle: animation(), moving: animation('moving'), detected: animation('detected'), dead: { frames: ['dead'], fps: 8, loop: false } } }, physics: { mode: 'trigger', collider: [0, 0, 1, 1], hitbox: [0, 0, 1, 1], lethal: true, gravity: false, calibration: 'authored' }, behavior: { type: 'enemy', actorType: 'creature', states: { idle: 'idle', moving: 'moving', playerDetected: 'detected', dead: 'dead' }, speed: 42, detectRange: 400, fireIntervalMs: 4800, detectedMode: 'once' } };
  const projectile = { id: 'projectile', name: 'Projectile', kind: 'projectile', size: { width: 16, height: 16 }, visual: { assetId: 'atlas', frameId: 'idle', defaultAnimation: 'flight', animations: { flight: animation(), impact: { frames: ['dead'], fps: 8, loop: false } } }, physics: { mode: 'trigger', collider: [0, 0, 1, 1], hitbox: [0, 0, 1, 1], lethal: true, gravity: false, calibration: 'authored' }, behavior: { type: 'projectile', flightAnimation: 'flight', impactAnimation: 'impact', lifetimeMs: 3000 } };
  const platform = { id: 'platform', name: 'Platform', kind: 'platform', size: { width: 200, height: 16 }, visual: { assetId: 'atlas', frameId: 'idle' }, physics: { mode: 'solid', collider: [0, 0, 1, 1], hitbox: null, lethal: false, gravity: false, calibration: 'authored' }, behavior: { type: 'static' } };
  return { format: 'not-marios-world-level', version: 2, id: 'actors-test', name: 'Actors', biome: 'test', world: { width: 600, height: 400, backgroundColor: '#102030' }, assets, definitions: { actor, projectile, platform }, placements: [{ id: 'floor', definitionId: 'platform', x: 0, y: 300, width: 200, height: 16, layer: 0, flipX: false, rotation: 0, settings: {} }] };
}
const errors = mutate => { const doc = baseDocument(); mutate(doc); return validateDocument(doc); };

test('actor state mappings accept fallback omissions and reject unknown slots or animation refs', () => {
  const valid = baseDocument(); valid.definitions.actor.behavior.states = { idle: 'idle', moving: null, playerDetected: 'detected', dead: null };
  assert.deepEqual(validateDocument(valid), []);
  assert.match(errors(d => { d.definitions.actor.behavior.states.alert = 'idle'; }).join('\n'), /unknown actor state slot/);
  assert.match(errors(d => { d.definitions.actor.behavior.states.idle = 'missing'; }).join('\n'), /existing animation/);
  assert.match(errors(d => { d.placements[0].settings = { type: 'enemy', actorType: 'creature', states: { idle: 'missing' } }; }).join('\n'), /settings\.states\.idle/);
});

test('actor numeric bounds reject invalid speed, detection range, firing interval, and lifetime', () => {
  for (const [field, value] of [['speed', -1], ['detectRange', Infinity], ['fireIntervalMs', 0], ['lifetimeMs', 3600001]]) {
    const message = errors(d => { d.definitions.actor.behavior[field] = value; });
    assert.ok(message.some(text => text.includes(`behavior.${field}`)), `${field} should be rejected`);
  }
});

test('projectile definitions require projectile behavior and valid animation references', () => {
  assert.deepEqual(validateDocument(baseDocument()), []);
  assert.match(errors(d => { d.definitions.projectile.behavior.type = 'static'; }).join('\n'), /projectile behavior/);
  assert.match(errors(d => { d.definitions.projectile.behavior.flightAnimation = 'missing'; }).join('\n'), /flightAnimation.*existing animation/);
  assert.match(errors(d => { d.definitions.actor.behavior.projectileDefinitionId = 'actor'; d.definitions.actor.behavior.actorType = 'shooter'; }).join('\n'), /projectile definition must have projectile kind/);
});

test('validation is read-only for authored actor/projectile documents', () => {
  const doc = baseDocument(), before = JSON.stringify(doc); validateDocument(clone(doc)); assert.equal(JSON.stringify(doc), before);
});
