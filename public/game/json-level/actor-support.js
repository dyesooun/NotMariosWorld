import { shapePolygons } from './runtime-geometry.js';

const EPS = 1e-6;
export const SUPPORT_SEAM = 8;
const yAt = (s, x) => s.y1 + (x - s.lo) / (s.hi - s.lo) * (s.y2 - s.y1);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

// Outward-facing upper edges only. Reject internal triangulation edges, which
// otherwise create false walkable ramps through an authored solid polygon.
export function supportSurfaces(entries, ids) {
  const selected = new Set(ids), result = [];
  for (const { placement, state } of entries) {
    if (!selected.has(placement.id) || state.vanished || state.definition.kind !== 'platform') continue;
    const polygons = shapePolygons(state, 'solid');
    for (const polygon of polygons) {
      const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
      for (let i = 0; i < polygon.length; i++) {
        let a = polygon[i], b = polygon[(i + 1) % polygon.length];
        if ((b.x - a.x) * Math.sign(area) <= EPS) continue;
        const above = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - EPS * 10 };
        if (polygons.some(other => other !== polygon && inside(above, other))) continue;
        if (a.x > b.x) [a, b] = [b, a];
        result.push({ id: placement.id, lo: a.x, hi: b.x, y1: a.y, y2: b.y });
      }
    }
  }
  return result;
}

function adjoining(a, b) {
  if (Math.max(a.lo, b.lo) - Math.min(a.hi, b.hi) > SUPPORT_SEAM + EPS) return false;
  if (a.hi < b.lo) return Math.abs(a.y2 - b.y1) <= SUPPORT_SEAM + EPS;
  if (b.hi < a.lo) return Math.abs(b.y2 - a.y1) <= SUPPORT_SEAM + EPS;
  const lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi);
  const d1 = yAt(a, lo) - yAt(b, lo), d2 = yAt(a, hi) - yAt(b, hi);
  return d1 * d2 <= 0 || Math.min(Math.abs(d1), Math.abs(d2)) <= SUPPORT_SEAM + EPS;
}

export function connectedSupportRun(pieces, actor, { initial = false } = {}) {
  if (!pieces.length) return [];
  const x = actor.x, width = actor.placement.width, foot = actor.y + actor.footOffset;
  const candidates = pieces.map(piece => {
    const overlap = Math.min(x + width, piece.hi) - Math.max(x, piece.lo);
    const sampleX = clamp(x + width / 2, piece.lo, piece.hi);
    return { piece, overlap, distance: Math.abs(yAt(piece, sampleX) - foot) };
  });
  // An initial explicit attachment may snap to its selected tile; a changing
  // chain must never teleport an actor to a remote surviving platform.
  const near = candidates.filter(c => c.overlap > EPS && (initial || c.distance <= Math.max(16, actor.placement.height / 2)));
  near.sort((a, b) => a.distance - b.distance || b.overlap - a.overlap);
  const seed = near[0]?.piece;
  if (!seed) return [];
  const connected = new Set([seed]), queue = [seed];
  while (queue.length) {
    const piece = queue.pop();
    for (const next of pieces) if (!connected.has(next) && adjoining(piece, next)) { connected.add(next); queue.push(next); }
  }
  return [...connected];
}

export function supportRunBounds(run) {
  if (!run.length) return null;
  const x = Math.min(...run.map(s => s.lo)), end = Math.max(...run.map(s => s.hi));
  return { x, width: end - x };
}

export function supportTop(run, x, width) {
  const heights = [];
  for (const s of run) {
    const lo = Math.max(x, s.lo), hi = Math.min(x + width, s.hi);
    if (hi - lo > EPS) heights.push(yAt(s, lo), yAt(s, hi));
  }
  return heights.length ? Math.min(...heights) : null;
}

export function supportingId(run, x, width, foot) {
  const center = x + width / 2;
  return run.filter(s => Math.min(x + width, s.hi) - Math.max(x, s.lo) > EPS)
    .map(s => ({ id: s.id, center: center >= s.lo && center <= s.hi, distance: Math.abs(yAt(s, clamp(center, s.lo, s.hi)) - foot) }))
    .sort((a, b) => Number(b.center) - Number(a.center) || a.distance - b.distance)[0]?.id || null;
}
