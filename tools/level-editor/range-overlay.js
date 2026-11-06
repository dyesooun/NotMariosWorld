import { localToWorld } from './transforms.js';
import { projectileSpawnPoint } from '../../public/game/json-level/projectile-origin.js';

const DEFAULT_VERTICAL_RANGE = 140;

export function drawProjectileSpawns(context, states, { zoom = 1, viewport } = {}) {
  for (const state of states || []) {
    if (state.behavior?.type !== 'enemy' || state.behavior.actorType !== 'shooter') continue;
    const point = projectileSpawnPoint(state), pivot = state.visual.pivot || [.5, 1];
    const anchor = localToWorld(state, { x: pivot[0] * state.width, y: pivot[1] * state.height });
    if (viewport && (point.x < viewport.x || point.x > viewport.x + viewport.width || point.y < viewport.y || point.y > viewport.y + viewport.height)) continue;
    context.save(); context.lineWidth = 1.5 / zoom; context.strokeStyle = '#62edff';
    context.setLineDash([3 / zoom, 3 / zoom]);
    context.beginPath(); context.moveTo(anchor.x, anchor.y); context.lineTo(point.x, point.y); context.stroke(); context.setLineDash([]);
    context.beginPath(); context.arc(point.x, point.y, 7 / zoom, 0, Math.PI * 2); context.stroke();
    context.beginPath(); context.moveTo(point.x - 11 / zoom, point.y); context.lineTo(point.x + 11 / zoom, point.y);
    context.moveTo(point.x, point.y - 11 / zoom); context.lineTo(point.x, point.y + 11 / zoom); context.stroke();
    context.fillStyle = '#62edff'; context.beginPath(); context.arc(anchor.x, anchor.y, 2.5 / zoom, 0, Math.PI * 2); context.fill();
    context.font = `${12 / zoom}px ui-monospace, SFMono-Regular, Consolas, monospace`; context.textBaseline = 'bottom'; context.textAlign = 'left';
    const label = 'Projectile spawn', width = context.measureText(label).width;
    const x = viewport ? Math.max(viewport.x + 6 / zoom, Math.min(point.x + 14 / zoom, viewport.x + viewport.width - width - 6 / zoom)) : point.x + 14 / zoom;
    const y = viewport ? Math.max(viewport.y + 18 / zoom, point.y - 12 / zoom) : point.y - 12 / zoom;
    context.fillStyle = '#10191ce6'; context.fillRect(x - 3 / zoom, y - 14 / zoom, width + 6 / zoom, 18 / zoom);
    context.fillStyle = '#a5f5ff'; context.fillText(label, x, y); context.restore();
  }
}

/** Geometry matching the actor simulation's horizontal/foot detection gate. */
export function detectionRangeGeometry(state) {
  const behavior = state?.behavior || {};
  if (behavior.type !== 'enemy' || !['creature', 'shooter'].includes(behavior.actorType)) return null;
  const creature = behavior.actorType === 'creature';
  const range = Number.isFinite(behavior.detectRange) ? behavior.detectRange : creature ? 400 : 500;
  const pivot = Array.isArray(state.visual?.pivot) ? state.visual.pivot : [.5, 1];
  const foot = localToWorld(state, { x: pivot[0] * state.width, y: pivot[1] * state.height });
  return { centerX: state.x + state.width / 2, footY: foot.y, range, verticalRange: DEFAULT_VERTICAL_RANGE, creature };
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath(); context.moveTo(x + r, y); context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r); context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height); context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r); context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}

export function drawDetectionRanges(context, states, { zoom = 1, viewport } = {}) {
  for (const state of states || []) {
    const geometry = detectionRangeGeometry(state); if (!geometry) continue;
    const { centerX, footY, range, verticalRange, creature } = geometry;
    const x = centerX - range, y = footY - verticalRange, width = range * 2, height = verticalRange * 2;
    const lineWidth = 1.5 / zoom, fontSize = 12 / zoom;
    context.save(); context.fillStyle = creature ? '#a7e8c522' : '#f5c77a22'; context.strokeStyle = creature ? '#9de8d5' : '#f5c77a'; context.lineWidth = lineWidth;
    context.setLineDash([6 / zoom, 4 / zoom]); roundedRect(context, x, y, width, height, 5 / zoom); context.fill(); context.stroke(); context.setLineDash([]);
    context.beginPath(); context.moveTo(centerX - range, footY); context.lineTo(centerX + range, footY); context.strokeStyle = creature ? '#9de8d5aa' : '#f5c77aaa'; context.stroke();
    const label = `Detection ±${Math.round(range)} px · ${creature ? 'same connected support chain' : 'player feet ±140 px'}`;
    context.font = `${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`; context.textBaseline = 'bottom'; context.textAlign = 'center';
    const labelWidth = context.measureText(label).width, margin = 8 / zoom;
    const labelX = viewport ? Math.max(viewport.x + labelWidth / 2 + margin, Math.min(centerX, viewport.x + viewport.width - labelWidth / 2 - margin)) : centerX;
    const labelY = viewport ? Math.max(viewport.y + fontSize + margin, Math.min(y - 4 / zoom, viewport.y + viewport.height - margin)) : y - 4 / zoom;
    context.fillStyle = '#10191ccc'; context.fillRect(labelX - labelWidth / 2 - 4 / zoom, labelY - fontSize - 3 / zoom, labelWidth + 8 / zoom, fontSize + 5 / zoom);
    context.fillStyle = creature ? '#d5fff1' : '#ffe4ae'; context.fillText(label, labelX, labelY); context.restore();
  }
}
