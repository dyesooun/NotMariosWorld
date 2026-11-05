import test from 'node:test';
import assert from 'node:assert/strict';
import { shapePolygons, boxPolygon, polygonBounds, overlapPolygons, collisionMTV, polygonsOverlap } from '../runtime-geometry.js';

const base = (physics, extra = {}) => ({ x: 10, y: 20, width: 100, height: 50, rotation: 0, flipX: false, physics, behavior: {}, ...extra });
test('rotates and flips authored shape points with placement geometry', () => {
  const state = base({ mode: 'solid', solidShapes: [{ kind: 'polygon', points: [[0, 0], [1, 0], [0, 1]] }] }, { rotation: 90, flipX: true });
  const points = shapePolygons(state, 'solid').flat();
  assert.deepEqual(points, [{ x: 85, y: 95 }, { x: 85, y: -5 }, { x: 35, y: 95 }]);
});
test('explicit empty shapes stay empty while null uses collider fallback', () => {
  const physics = { mode: 'solid', collider: [0, 0, 1, 1], solidShapes: [] }; assert.equal(shapePolygons(base(physics), 'solid').length, 0);
  assert.equal(shapePolygons(base({ mode: 'solid', collider: [0, 0, 1, 1], solidShapes: null }), 'solid').length, 1);
});
test('hazards require lethal and active beam state, independently of mode', () => {
  const hazard = { mode: 'solid', lethal: true, hitbox: [0, 0, 1, 1], hazardShapes: null }; assert.equal(shapePolygons(base(hazard), 'hazard').length, 1);
  assert.equal(shapePolygons(base({ ...hazard, lethal: false }), 'hazard').length, 0); assert.equal(shapePolygons(base(hazard, { beamOn: false }), 'hazard').length, 0);
});
test('vanished solids and interactions have no geometry', () => {
  const state = base({ mode: 'solid', collider: [0, 0, 1, 1], solidShapes: null, interactionShapes: null }, { vanished: true });
  assert.equal(shapePolygons(state, 'solid').length, 0);
  assert.equal(shapePolygons(state, 'interaction').length, 0);
  assert.equal(shapePolygons({ ...state, vanished: false }, 'solid').length, 1);
});
test('animation damage windows gate hazards only when explicitly authored', () => {
  const state = base({ mode: 'none', lethal: true, hitbox: [0, 0, 1, 1] }, { animation: 'idle', visual: { animations: { idle: { damage_active_indices: [1] } } } });
  assert.equal(shapePolygons(state, 'hazard').length, 0);
  assert.equal(shapePolygons({ ...state, damageActive: true }, 'hazard').length, 1);
  const contact = { ...state, visual: { animations: { idle: {} } } };
  assert.equal(shapePolygons(contact, 'hazard').length, 1);
});
test('vanish trigger can extend outside the asset body', () => {
  const state = base({ mode: 'none' }, { behavior: { vanish: { triggerVolume: [-1, -2, 3, 4] } } }); const bounds = polygonBounds(shapePolygons(state, 'vanish')[0]); assert.deepEqual(bounds, { x: -90, y: -80, width: 300, height: 200 });
});
test('concave polygon triangulates without filling its inner notch', () => {
  const shape = [{ kind: 'polygon', points: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]] }]; const polygons = shapePolygons(base({ mode: 'solid', solidShapes: shape }), 'solid'); assert.ok(polygons.length > 1); assert.equal(polygonsOverlap(polygons, [boxPolygon({ x: 150, y: 100, width: 20, height: 20 })]), false);
});
test('self intersecting authored polygons fail clearly', () => { assert.throws(() => shapePolygons(base({ mode: 'solid', solidShapes: [{ kind: 'polygon', points: [[0, 0], [1, 1], [0, 1], [1, 0]] }] }), 'solid'), /self-intersects/); });
test('SAT MTV handles floor, side, ceiling, and containment', () => {
  const floor = collisionMTV(boxPolygon({ x: 0, y: 0, width: 10, height: 10 }), boxPolygon({ x: 0, y: 8, width: 20, height: 10 })); assert.ok(floor && Math.abs(floor.depth - 2) < 1e-8 && floor.normal.y === -1);
  const side = collisionMTV(boxPolygon({ x: 0, y: 0, width: 10, height: 10 }), boxPolygon({ x: 8, y: 0, width: 10, height: 10 })); assert.ok(side && side.normal.x === -1);
  const ceiling = collisionMTV(boxPolygon({ x: 0, y: 8, width: 10, height: 10 }), boxPolygon({ x: 0, y: 0, width: 20, height: 10 })); assert.ok(ceiling && ceiling.normal.y === 1);
  const contained = boxPolygon({ x: 5, y: 5, width: 2, height: 2 }); const container = boxPolygon({ x: 0, y: 0, width: 20, height: 20 }); const mtv = collisionMTV(contained, container); assert.ok(mtv && mtv.depth >= 7);
  const moved = contained.map(point => ({ x: point.x + mtv.x, y: point.y + mtv.y })); assert.equal(overlapPolygons(moved, container), false);
  assert.equal(overlapPolygons(boxPolygon({ x: 0, y: 0, width: 1, height: 1 }), boxPolygon({ x: 2, y: 0, width: 1, height: 1 })), false);
});
test('collinear redundant vertices are normalized before SAT', () => {
  const polygon = [{ kind: 'polygon', points: [[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]] }];
  assert.equal(shapePolygons(base({ mode: 'solid', solidShapes: polygon }), 'solid').length, 1);
});
