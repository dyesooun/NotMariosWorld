import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createPlacement, parseDocument, serializeDocument, validateDocument } from '../document.js';
import { exportAssetLibrary, mergeLibraryIntoDocument } from '../metadata.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function documentWith(id, assetId, definitionId, frameId = 'frame') {
  const document = createDocument({ assets: { [assetId]: { id: assetId, name: assetId, src: image, width: 1, height: 1, frames: { [frameId]: { x: 0, y: 0, w: 1, h: 1 } } } }, definitions: {
    [definitionId]: { id: definitionId, name: definitionId, kind: 'prop', size: { width: 16, height: 16 }, visual: { assetId, frameId }, physics: { mode: 'none', collider: null, hitbox: null, lethal: false, gravity: false, calibration: 'authored', solidShapes: null, hazardShapes: null, interactionShapes: null }, behavior: { type: 'static' } },
  } });
  document.id = id;
  return document;
}

test('opening disjoint levels retains the reusable library while preserving level state', () => {
  const levelA = documentWith('A', 'atlas-a', 'prop-a');
  levelA.placements.push(createPlacement(levelA, 'prop-a', 25, 30));
  const levelB = documentWith('B', 'atlas-b', 'prop-b');
  levelB.world.width = 777;
  const retained = exportAssetLibrary(levelA);
  const merged = mergeLibraryIntoDocument(levelB, retained);
  assert.equal(merged.id, 'B');
  assert.equal(merged.world.width, 777);
  assert.equal(merged.placements.length, 0);
  assert.ok(merged.assets['atlas-a']);
  assert.ok(merged.definitions['prop-a']);
  assert.deepEqual(validateDocument(merged), []);
  const backToA = mergeLibraryIntoDocument(levelA, exportAssetLibrary(merged));
  assert.equal(backToA.placements.length, 1);
  assert.equal(backToA.placements[0].x, 25);
});

test('incoming same-ID assets and definitions remain authoritative', () => {
  const retained = documentWith('retained', 'shared', 'shared-prop', 'old');
  const incoming = documentWith('incoming', 'shared', 'shared-prop', 'new');
  const merged = mergeLibraryIntoDocument(incoming, exportAssetLibrary(retained));
  assert.ok(merged.assets.shared.frames.new);
  assert.equal(merged.assets.shared.frames.old, undefined);
  assert.equal(merged.definitions['shared-prop'].visual.frameId, 'new');
});

test('incompatible retained references reject atomically', () => {
  const retained = documentWith('retained', 'shared', 'retained-prop', 'old');
  const incoming = documentWith('incoming', 'shared', 'incoming-prop', 'new');
  const before = serializeDocument(incoming);
  assert.throws(() => mergeLibraryIntoDocument(incoming, exportAssetLibrary(retained)));
  assert.equal(serializeDocument(incoming), before);
});

test('retained library survives JSON roundtrip and remains valid', () => {
  const level = documentWith('roundtrip', 'atlas', 'prop');
  const reopened = parseDocument(serializeDocument(mergeLibraryIntoDocument(documentWith('other', 'other-atlas', 'other-prop'), exportAssetLibrary(level))));
  assert.ok(reopened.definitions.prop);
  assert.deepEqual(validateDocument(reopened), []);
});
