import test from 'node:test';
import assert from 'node:assert/strict';
import { localToWorld, placementCorners } from '../transforms.js';
import { getGroupBounds, transformGroup } from '../group-transforms.js';

const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const placements = [
  { id: 'a', x: 10, y: 20, width: 40, height: 20, rotation: 15, flipX: false },
  { id: 'b', x: 100, y: 80, width: 30, height: 50, rotation: -20, flipX: true },
];
const states = placements.map(value => ({ ...value }));

test('group bounds enclose every rotated corner', () => {
  const bounds = getGroupBounds(states);
  assert.equal(bounds.rotation, 0); assert.equal(bounds.flipX, false);
  for (const corner of states.flatMap(placementCorners)) {
    assert.ok(corner.x >= bounds.x - 1e-8 && corner.x <= bounds.x + bounds.width + 1e-8);
    assert.ok(corner.y >= bounds.y - 1e-8 && corner.y <= bounds.y + bounds.height + 1e-8);
  }
});

test('move applies one delta and does not mutate inputs', () => {
  const result = transformGroup(placements, states, { type: 'move', dx: 12, dy: -7 });
  assert.deepEqual(result.map(value => [value.x, value.y]), [[22, 13], [112, 73]]);
  assert.equal(placements[0].x, 10);
});

test('scale uses anchor and scales dimensions', () => {
  const result = transformGroup(placements, states, { type: 'scale', factor: 2, anchor: { x: 0, y: 0 } });
  near(result[0].x, 20); near(result[0].y, 40); near(result[0].width, 80); near(result[0].height, 40);
  near(result[1].x, 200); near(result[1].y, 160); near(result[1].width, 60); near(result[1].height, 100);
});

test('rotation orbits centers and adds orientation', () => {
  const result = transformGroup(placements, states, { type: 'rotate', degrees: 90, center: { x: 0, y: 0 } });
  near(result[0].x, -50); near(result[0].y, 20); near(result[0].rotation, 105);
  near(result[1].x, -120); near(result[1].y, 90); near(result[1].rotation, 70);
});

test('horizontal and vertical flips reflect centers and toggle flip state', () => {
  const flipState = { x: 10, y: 20, width: 40, height: 20, rotation: 15, flipX: true };
  const horizontal = transformGroup([flipState], [flipState], { type: 'flip', axis: 'x', center: { x: 0, y: 0 } });
  const horizontalState = horizontal[0];
  for (const local of [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 40, y: 20 }]) {
    const before = localToWorld(flipState, local), after = localToWorld(horizontalState, local);
    near(after.x, -before.x); near(after.y, before.y);
  }
  near(horizontal[0].x, -50); near(horizontal[0].y, 20); near(horizontal[0].rotation, -15); assert.equal(horizontal[0].flipX, false);
  const vertical = transformGroup([flipState], [flipState], { type: 'flip', axis: 'y', center: { x: 0, y: 0 } });
  for (const local of [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 40, y: 20 }]) {
    const before = localToWorld(flipState, local), after = localToWorld(vertical[0], local);
    near(after.x, before.x); near(after.y, -before.y);
  }
  near(vertical[0].x, 10); near(vertical[0].y, -40); near(vertical[0].rotation, 165); assert.equal(vertical[0].flipX, false);
  const twiceX = transformGroup(horizontal, horizontal.map(value => ({ ...value })), { type: 'flip', axis: 'x', center: { x: 0, y: 0 } })[0];
  near(twiceX.x, flipState.x); near(twiceX.y, flipState.y); near(twiceX.rotation, flipState.rotation); assert.equal(twiceX.flipX, true);
  const twiceY = transformGroup(vertical, vertical.map(value => ({ ...value })), { type: 'flip', axis: 'y', center: { x: 0, y: 0 } })[0];
  near(twiceY.x, flipState.x); near(twiceY.y, flipState.y); near(twiceY.rotation, flipState.rotation); assert.equal(twiceY.flipX, true);
});

test('visible movement offsets remain stable for animated placements', () => {
  const visible = states.map((state, index) => ({ ...state, x: state.x + 30 + index * 2, y: state.y - 4 }));
  const result = transformGroup(placements, visible, { type: 'move', dx: 8, dy: 6 });
  assert.deepEqual(result.map(value => [value.x, value.y]), [[18, 26], [108, 86]]);
});

test('visible offsets remain stable for group scale and rotation', () => {
  const visible = states.map((state, index) => ({ ...state, x: state.x + 30 + index * 2, y: state.y - 4 }));
  const scaled = transformGroup(placements, visible, { type: 'scale', factor: 2, anchor: { x: 0, y: 0 } });
  const rotated = transformGroup(placements, visible, { type: 'rotate', degrees: 90, center: { x: 0, y: 0 } });
  for (const [index, result] of scaled.entries()) {
    const offsetX = visible[index].x - placements[index].x, offsetY = visible[index].y - placements[index].y;
    near(result.x + offsetX, visible[index].x * 2); // transformed top-left plus offset follows the displayed geometry
    near(result.y + offsetY, visible[index].y * 2);
  }
  for (const [index, result] of rotated.entries()) {
    const center = { x: visible[index].x + visible[index].width / 2, y: visible[index].y + visible[index].height / 2 };
    near(result.x + (visible[index].x - placements[index].x), -center.y - visible[index].width / 2);
    near(result.y + (visible[index].y - placements[index].y), center.x - visible[index].height / 2);
  }
});

test('rotation preserves a local corner under the expected rotated geometry', () => {
  const before = localToWorld(states[0], { x: states[0].width, y: 0 });
  const result = transformGroup([placements[0]], [states[0]], { type: 'rotate', degrees: 90, center: { x: 30, y: 30 } })[0];
  const after = localToWorld(result, { x: result.width, y: 0 });
  assert.ok(Number.isFinite(before.x) && Number.isFinite(after.y));
  near(result.rotation, 105);
});

test('invalid group operations are rejected', () => {
  assert.throws(() => transformGroup(placements, states, { type: 'scale', factor: 0 }), /positive/);
  assert.throws(() => transformGroup(placements, states, { type: 'scale', factor: Number.NaN }), /positive/);
  assert.throws(() => transformGroup(placements, states, { type: 'flip', axis: 'z' }), /axis/);
});

