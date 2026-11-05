import { localToWorld } from './transforms.js';

const EPS = 1e-9;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const area = points => points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0) / 2;
const same = (a, b) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
function orientation(a, b, c) { const value = cross(a, b, c); return Math.abs(value) < EPS ? 0 : value > 0 ? 1 : -1; }
function onSegment(a, b, p) { return Math.min(a.x, b.x) - EPS <= p.x && p.x <= Math.max(a.x, b.x) + EPS && Math.min(a.y, b.y) - EPS <= p.y && p.y <= Math.max(a.y, b.y) + EPS; }
function segmentsIntersect(a, b, c, d) {
  const ab1 = orientation(a, b, c), ab2 = orientation(a, b, d), cd1 = orientation(c, d, a), cd2 = orientation(c, d, b);
  if (ab1 === 0 && onSegment(a, b, c) || ab2 === 0 && onSegment(a, b, d) || cd1 === 0 && onSegment(c, d, a) || cd2 === 0 && onSegment(c, d, b)) return true;
  return ab1 !== ab2 && cd1 !== cd2;
}
function validatePolygon(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some(p => !p || !finite(p.x) || !finite(p.y))) throw new Error('Polygon needs at least three finite points.');
  const clean = points.filter((p, i) => i === 0 || !same(p, points[i - 1]));
  if (clean.length > 2 && same(clean[0], clean.at(-1))) clean.pop();
  let simplified = true;
  while (simplified && clean.length > 3) {
    simplified = false;
    for (let i = 0; i < clean.length; i++) {
      const previous = clean[(i - 1 + clean.length) % clean.length];
      const current = clean[i];
      const next = clean[(i + 1) % clean.length];
      if (Math.abs(cross(previous, current, next)) < EPS && onSegment(previous, next, current)) {
        clean.splice(i, 1);
        simplified = true;
        break;
      }
    }
  }
  if (clean.length < 3) throw new Error('Polygon is degenerate.');
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i], b = clean[(i + 1) % clean.length];
    for (let j = i + 1; j < clean.length; j++) {
      if (j === i + 1 || (i === 0 && j === clean.length - 1)) continue;
      if (segmentsIntersect(a, b, clean[j], clean[(j + 1) % clean.length])) throw new Error('Polygon self-intersects.');
    }
  }
  if (Math.abs(area(clean)) < EPS) throw new Error('Polygon is degenerate.');
  if (clean.some((point, i) => same(point, clean[(i + 1) % clean.length]))) throw new Error('Polygon has a zero-length edge.');
  return clean;
}
function pointInTriangle(p, a, b, c, sign) {
  return sign * cross(a, b, p) >= -EPS && sign * cross(b, c, p) >= -EPS && sign * cross(c, a, p) >= -EPS;
}
function isConvex(points) {
  const sign = Math.sign(area(points)); let previous = 0;
  for (let i = 0; i < points.length; i++) { const value = cross(points[i], points[(i + 1) % points.length], points[(i + 2) % points.length]); if (Math.abs(value) < EPS) continue; const current = Math.sign(value); if (previous && current !== previous) return false; previous = current; }
  return true && previous === sign;
}
function triangulate(input) {
  const points = validatePolygon(input); if (isConvex(points)) return [points];
  const sign = area(points) > 0 ? 1 : -1, indices = points.map((_, i) => i), result = [];
  let guard = points.length * points.length;
  while (indices.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const prev = indices[(i - 1 + indices.length) % indices.length], current = indices[i], next = indices[(i + 1) % indices.length];
      if (sign * cross(points[prev], points[current], points[next]) <= EPS) continue;
      let contains = false;
      for (const candidate of indices) if (candidate !== prev && candidate !== current && candidate !== next && pointInTriangle(points[candidate], points[prev], points[current], points[next], sign)) { contains = true; break; }
      if (contains) continue;
      result.push([points[prev], points[current], points[next]]); indices.splice(i, 1); clipped = true; break;
    }
    if (!clipped) throw new Error('Polygon cannot be triangulated; check its winding or intersections.');
  }
  if (indices.length === 3) result.push(indices.map(index => points[index]));
  return result;
}
function normalizedShape(shape, fallback) {
  if (shape?.kind === 'rect') { const r = shape.rect || fallback; if (!r) return null; return [{ x: r[0], y: r[1] }, { x: r[0] + r[2], y: r[1] }, { x: r[0] + r[2], y: r[1] + r[3] }, { x: r[0], y: r[1] + r[3] }]; }
  if (shape?.kind === 'polygon') return shape.points.map(([x, y]) => ({ x, y }));
  return null;
}
function worldPolygon(state, polygon) { return polygon.map(({ x, y }) => localToWorld(state, { x: x * state.width, y: y * state.height })); }
function channelSource(state, channel) {
  const physics = state.physics || {}, shapes = channel === 'solid' ? physics.solidShapes : channel === 'hazard' ? physics.hazardShapes : physics.interactionShapes;
  const fallback = channel === 'hazard' ? physics.hitbox : physics.collider;
  if (shapes !== undefined && shapes !== null) return shapes;
  return fallback && (channel!=='interaction'||physics.mode==='trigger') ? [{ kind: 'rect', rect: fallback }] : [];
}

export function shapePolygons(state, channel) {
  if (!state || !['solid', 'hazard', 'interaction', 'vanish'].includes(channel)) throw new Error('Geometry channel must be solid, hazard, interaction, or vanish.');
  if ((channel === 'solid' || channel === 'interaction') && state.vanished) return [];
  if (channel === 'solid' && state.physics?.mode !== 'solid') return [];
  if (channel === 'hazard' && (!state.physics?.lethal || state.vanished || state.beamOn === false)) return [];
  if (channel === 'hazard') {
    const animation = state.visual?.animations?.[state.animation];
    if (animation && Object.prototype.hasOwnProperty.call(animation, 'damage_active_indices') && state.damageActive !== true) return [];
  }
  let source;
  if (channel === 'vanish') { const rect = state.behavior?.vanish?.triggerVolume; source = rect ? [{ kind: 'rect', rect }] : []; }
  else source = channelSource(state, channel);
  return source.flatMap(shape => { const polygon = normalizedShape(shape); return polygon ? triangulate(worldPolygon(state, polygon)) : []; });
}
export function boxPolygon({ x, y, width, height }) { return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]; }
export function polygonBounds(polygon) { const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }; }
function axes(points) { return points.map((p, i) => { const q = points[(i + 1) % points.length], dx = q.x - p.x, dy = q.y - p.y, length = Math.hypot(dx, dy); return { x: -dy / length, y: dx / length }; }); }
function projection(points, axis) { let min = Infinity, max = -Infinity; for (const p of points) { const value = p.x * axis.x + p.y * axis.y; min = Math.min(min, value); max = Math.max(max, value); } return { min, max }; }
export function overlapPolygons(a, b) { return collisionMTV(a, b) !== null; }
export function collisionMTV(a, b) {
  const pa = validatePolygon(a), pb = validatePolygon(b), allAxes = [...axes(pa), ...axes(pb)]; let best = null;
  const center = points => points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 }); const ca = center(pa), cb = center(pb);
  for (const axis of allAxes) {
    const A = projection(pa, axis), B = projection(pb, axis), overlap = Math.min(A.max, B.max) - Math.max(A.min, B.min); if (overlap <= EPS) return null;
    const movePositive = B.max - A.min, moveNegative = A.max - B.min; const positive = movePositive <= moveNegative; const depth = Math.min(movePositive, moveNegative); let normal = positive ? axis : { x: -axis.x, y: -axis.y };
    const direction = { x: ca.x - cb.x, y: ca.y - cb.y }; if (direction.x * normal.x + direction.y * normal.y < 0) normal = { x: -normal.x, y: -normal.y };
    if (!best || depth < best.depth) best = { x: normal.x * depth, y: normal.y * depth, normal, depth };
  }
  return best;
}
export function polygonsOverlap(listA, listB) { return listA.some(a => listB.some(b => overlapPolygons(a, b))); }
