import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createPlacement, parseDocument, serializeDocument, validateDocument, resolvePlacement } from '../document.js';
import { exportAssetLibrary, importAssetLibrary } from '../metadata.js';
import { gameplayAnchor, gameplayTriggerPolygons, resolveGameplay, setGameplayRole } from '../gameplay.js';

const catalog = {
  assets: { atlas: { id: 'atlas', name: 'Test', src: '/assets/sprites/forest/test.png', width: 32, height: 16, frames: { frame: { x: 0, y: 0, w: 16, h: 16 } } } },
  definitions: { prop: { id: 'prop', name: 'Prop', kind: 'prop', visual: { assetId: 'atlas', frameId: 'frame' }, size: { width: 100, height: 40 }, physics: { mode: 'none', collider: null, hitbox: null, lethal: false, gravity: false, calibration: 'authored' }, behavior: { type: 'static' }, gameplay: { role: 'checkpoint', tags: ['forest'], anchor: [0.5, 1], nonblocking: true } } },
};
const doc = () => createDocument(catalog);

test('gameplay resolves shared metadata, instance overrides, and union tags', () => {
  const d = doc(), p = createPlacement(d, 'prop', 20, 30);
  p.gameplay = { tags: ['checkpoint', 'north'], order: 2 };
  const state = resolvePlacement(d, p);
  assert.equal(state.gameplay.role, 'checkpoint');
  assert.deepEqual(state.gameplay.tags, ['forest', 'checkpoint', 'north']);
  assert.equal(state.gameplay.order, 2);
});

test('legacy assets resolve to none without changing physics', () => {
  const d = doc(); delete d.definitions.prop.gameplay;
  const p = createPlacement(d, 'prop', 0, 0);
  const state = resolvePlacement(d, p);
  assert.equal(state.gameplay.role, 'none');
  assert.equal(state.gameplay.nonblocking, false);
  assert.equal(state.physics.mode, 'none');
});

test('role helper is immutable and initializes defaults', () => {
  const current = { tags: ['coin'] }, next = setGameplayRole(current, 'coin');
  assert.deepEqual(current, { tags: ['coin'] });
  assert.equal(next.role, 'coin');
  assert.deepEqual(next.triggerVolume, [0, 0, 1, 1]);
  assert.deepEqual(next.anchor, [0.5, 1]);
  assert.equal(next.nonblocking, true);
});

test('anchor follows rotation and flip and returns player top-left', () => {
  const state = { x: 100, y: 50, width: 40, height: 20, rotation: 90, flipX: true, gameplay: { anchor: [0.5, 1] } };
  const point = gameplayAnchor(state, 20, 30);
  assert.deepEqual(point, { x: 100, y: 30 });
});

test('trigger polygons use gameplay volume and ignore collected/vanished objects', () => {
  const state = { x: 10, y: 20, width: 100, height: 40, rotation: 0, flipX: false, physics: { mode: 'none' }, gameplay: { role: 'coin', triggerVolume: [0.25, 0, 0.5, 0.5] } };
  const polygons = gameplayTriggerPolygons(state);
  assert.equal(polygons.length, 1);
  assert.deepEqual(polygons[0][0], { x: 35, y: 20 });
  assert.deepEqual(gameplayTriggerPolygons({ ...state, collected: true }), []);
  assert.deepEqual(gameplayTriggerPolygons({ ...state, vanished: true }), []);
  assert.deepEqual(gameplayTriggerPolygons({ ...state, gameplay: undefined }), []);
});

test('gameplay assignment does not alter source physics', () => {
  const d = doc(), before = JSON.stringify(d.definitions.prop.physics);
  d.definitions.prop.gameplay = setGameplayRole(d.definitions.prop.gameplay, 'coin');
  assert.equal(JSON.stringify(d.definitions.prop.physics), before);
});

test('gameplay metadata survives export/import and malformed fields are rejected', () => {
  const d = doc(), p = createPlacement(d, 'prop', 0, 0);
  p.gameplay = { role: 'coin', tags: ['reward'], coinValue: 10 };
  d.placements.push(p);
  const roundTrip = parseDocument(serializeDocument(d));
  assert.deepEqual(roundTrip.placements[0].gameplay, p.gameplay);
  d.placements[0].gameplay.coinValue = 0;
  assert.ok(validateDocument(d).some(error => error.includes('coinValue')));
  d.placements[0].gameplay.coinValue = 10;
  d.placements[0].gameplay.role = 'unknown';
  assert.ok(validateDocument(d).some(error => error.includes('role')));
});

test('asset library roundtrip preserves definition gameplay metadata', () => {
  const d = doc();
  d.definitions.prop.gameplay = { role: 'coin', tags: ['reward'], coinValue: 25, targetLevelId: 'forest-1' };
  const copy = importAssetLibrary(doc(), exportAssetLibrary(d, ['atlas']));
  assert.deepEqual(copy.definitions.prop.gameplay, d.definitions.prop.gameplay);
});

test('typed gameplay nulls are rejected while the optional block remains allowed', () => {
  const d = doc();
  d.definitions.prop.gameplay = { role: 'coin', coinValue: null };
  assert.ok(validateDocument(d).some(error => error.includes('coinValue')));
  d.definitions.prop.gameplay = { role: 'coin', triggerVolume: null };
  assert.ok(validateDocument(d).some(error => error.includes('triggerVolume')));
});
