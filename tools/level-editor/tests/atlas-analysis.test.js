import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAtlasCuts, createGridCuts, estimateFrameGeometry } from '../atlas-analysis.js';

function rgba(width, height, rects = []) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) data[(y * width + x) * 4 + 3] = r.a ?? 255;
  return { width, height, data };
}

test('components are deterministic, 4-connected, padded and noise-filtered', () => {
  const image = rgba(8, 6, [{ x: 1, y: 1, w: 2, h: 2 }, { x: 5, y: 1, w: 1, h: 1 }, { x: 6, y: 5, w: 1, h: 1 }]);
  assert.equal(detectAtlasCuts(image, { minAreaPx: 2, mergeGapPx: 0, paddingPx: 2 }).cuts.length, 1);
  const diagonal = rgba(3, 3, [{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 1, w: 1, h: 1 }]);
  assert.equal(detectAtlasCuts(diagonal, { minAreaPx: 1, mergeGapPx: 0 }).cuts.length, 2);
  assert.equal(detectAtlasCuts(diagonal, { minAreaPx: 1, mergeGapPx: 1 }).cuts.length, 1);
});

test('empty, opaque, alpha zero threshold and validation', () => {
  assert.equal(detectAtlasCuts(rgba(2, 2)).cuts.length, 0);
  assert.equal(detectAtlasCuts(rgba(2, 2, [{ x: 0, y: 0, w: 2, h: 2 }])).opaque, true);
  assert.equal(detectAtlasCuts(rgba(2, 2), { alphaThreshold: 0 }).cuts.length, 0);
  assert.throws(() => detectAtlasCuts({ width: 2, height: 2, data: new Uint8ClampedArray(1) }), /data length/i);
});

test('grid uses margin padding and spacing without expanding cells', () => {
  const cuts = createGridCuts({ atlasWidth: 10, atlasHeight: 6, cellWidthPx: 3, cellHeightPx: 2, paddingPx: 1, spacingPx: 1 });
  assert.deepEqual(cuts.map(({ x, y, w, h }) => ({ x, y, w, h })), [
    { x: 1, y: 1, w: 3, h: 2 }, { x: 5, y: 1, w: 3, h: 2 }
  ]);
  assert.throws(() => createGridCuts({ atlasWidth: 5, atlasHeight: 5, cellWidthPx: 3, cellHeightPx: 3, columns: 2 }), /exceed/i);
});

test('geometry is crop-local and schema-shaped', () => {
  const geometry = estimateFrameGeometry(rgba(8, 8, [{ x: 3, y: 2, w: 3, h: 4 }]), { x: 2, y: 1, w: 5, h: 6 });
  assert.deepEqual(geometry.contentBoundsPx, { x: 1, y: 1, w: 3, h: 4 });
  assert.deepEqual(geometry.pivotPx, { x: 3, y: 5 });
  assert.deepEqual(geometry.walkSurfacesPx, [{ kind: 'horizontal', x1: 1, y1: 1, x2: 4, y2: 1 }]);
  assert.equal(estimateFrameGeometry(rgba(2, 2), { x: 0, y: 0, w: 1, h: 1 }).contentBoundsPx, null);
});

test('filters many tiny isolated components instead of failing at maxCuts', () => {
  const image = rgba(100, 100);
  for (let i = 0; i < 3000; i++) image.data[((i % 100) * 100 + ((i * 3) % 100)) * 4 + 3] = 255;
  assert.doesNotThrow(() => detectAtlasCuts(image, { minAreaPx: 2, mergeGapPx: 0, maxCuts: 2000 }));
});
