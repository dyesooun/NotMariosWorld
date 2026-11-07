import { renderGame } from './renderer.js';
import { normalizePlayerLocation } from './run-protocol.js';

export function normalizeHostLocation(value) {
  const normalized = normalizePlayerLocation(value);
  if (!normalized) return null;
  return { ...normalized, at: Number.isFinite(value.at) ? value.at : null };
}

export function hostLocationSnapshotKey(player) {
  const location = normalizeHostLocation(player?.location);
  // `at` is intentionally omitted: it updates the stale-caption text, not the
  // frozen artwork. Connection/finish status is already represented by the
  // report text and does not change the draw-only world snapshot.
  return [location?.level ?? 'none', location?.x ?? '', location?.y ?? '', player?.avatar || '', player?.color || '', player?.runId || ''].join(':');
}

export function shouldDrawHostLocation({ open, previousKey, nextKey }) {
  return !!open && previousKey !== nextKey;
}

export function hostLocationState(player) {
  const location = normalizeHostLocation(player?.location);
  if (!location) return null;
  return {
    level: location.level, x: location.x, y: location.y, vx: 0, vy: 0, grounded: true,
    avatar: player.avatar || 'explorer', color: player.color, name: player.name || 'Explorer',
    worldOrder: player.worldOrder, coins: 0, collected: [], enemies: [], projectiles: [],
    powerChests: [], checkpoint: null, respawnRemaining: 0, reveal: null,
    progress: 0, deaths: 0, _levelTime: 0,
  };
}

function drawPlaceholder(canvas, text = 'WAITING FOR LOCATION') {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#14251f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#385443'; ctx.setLineDash([5, 5]); ctx.strokeRect(8.5, 8.5, canvas.width - 17, canvas.height - 17);
  ctx.setLineDash([]); ctx.fillStyle = '#9aaa91'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4); ctx.restore();
}

export function renderHostLocationSnapshot(canvas, player) {
  const state = hostLocationState(player);
  if (!state) { drawPlaceholder(canvas); return false; }
  renderGame(canvas, state, { time: 0, compact: true });
  return true;
}

export function hostLocationCaption(player) {
  const location = normalizeHostLocation(player?.location);
  if (!location) return 'Waiting for location';
  const stamp = location.at !== null ? new Date(location.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  return `x ${Math.round(location.x)} · y ${Math.round(location.y)} · Snapshot updated ${stamp}`;
}
