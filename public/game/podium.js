import { drawSprite } from './renderer.js';
import { drawPodiumScene, podiumReducedMotion } from './podium-scene.js';
import { drawWorldPanel } from './world-ui.js';

const WIDTH = 1200, HEIGHT = 720;
// The first clear flagstone course in the full-frame courtyard backdrop.
const COURTYARD_FLOOR_Y = 500;
const FEATURED_TIERS = Object.freeze({
  1: { x: 600, y: 279 },
  2: { x: 410, y: 334 },
  3: { x: 790, y: 359 },
});
const rect = (c, color, x, y, w, h) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const text = (c, value, x, y, size = 14, color = '#e5efd7', align = 'center') => { c.font = `bold ${size}px monospace`; c.fillStyle = color; c.textAlign = align; c.fillText(String(value), Math.round(x), Math.round(y)); c.textAlign = 'left'; };
const short = (s, n) => Array.from(String(s)).length > n ? Array.from(String(s)).slice(0, n - 1).join('') + '…' : s;

export function podiumSlots(results) {
  return results.map((player, index) => {
    const rank = player.rank || index + 1;
    if (rank <= 3) return { ...player, rank, ...FEATURED_TIERS[rank], featured: true };
    const i = rank - 4;
    return { ...player, rank, x: 100 + (i % 11) * 100, y: 515 + Math.floor(i / 11) * 135, featured: false };
  });
}

function begin(ctx) { const canvas = ctx.canvas; ctx.save(); ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0); ctx.imageSmoothingEnabled = false; }

function plaque(ctx, value, x, y, size, color) {
  ctx.font = `bold ${size}px monospace`;
  const width = Math.ceil(ctx.measureText(String(value)).width) + 20;
  drawWorldPanel(ctx, { x: Math.round(x - width / 2), y: y - size - 5, w: width, h: size + 13 }, '#172c25f5');
  text(ctx, value, x, y, size, color);
}

function stoneDais(ctx, rank, x, y) {
  const top = rank === 1 ? '#f3d98b' : rank === 2 ? '#c3d4cf' : '#c69a76';
  const height = COURTYARD_FLOOR_Y - y;
  rect(ctx, '#132a3088', x - 73, COURTYARD_FLOOR_Y - 2, 166, 10);
  rect(ctx, '#666d60', x - 78, y, 156, height);
  for (let row = 0, yy = y + 10; yy < COURTYARD_FLOOR_Y - 3; yy += 24, row++) {
    const courseHeight = Math.min(22, COURTYARD_FLOOR_Y - 3 - yy);
    rect(ctx, row % 2 ? '#a39b80' : '#b4a88b', x - 75, yy, 150, courseHeight);
    rect(ctx, '#d3c5a1', x - 74, yy, 148, 2);
    rect(ctx, '#797d64', x + 64, yy + 3, 11, Math.max(1, courseHeight - 3));
    for (let seam = x - 47 + row % 2 * 25; seam < x + 70; seam += 50) {
      rect(ctx, '#646b5b', seam, yy + 2, 2, Math.max(1, courseHeight - 2));
      rect(ctx, '#d3c5a1', seam + 2, yy + 3, 1, Math.max(1, courseHeight - 4));
    }
  }
  rect(ctx, '#404e43', x - 81, y + 7, 162, 4);
  rect(ctx, top, x - 81, y, 162, 7);
  rect(ctx, '#efe4bd', x - 76, y, 152, 2);
  rect(ctx, '#5b7149', x - 78, COURTYARD_FLOOR_Y - 9, 18, 8); rect(ctx, '#819051', x - 75, COURTYARD_FLOOR_Y - 12, 9, 5);
  rect(ctx, '#52624e', x + 58, y + 9, 17, 4); rect(ctx, '#849655', x + 64, y + 8, 8, 9);
  rect(ctx, top, x - 78, COURTYARD_FLOOR_Y - 3, 156, 3);
  plaque(ctx, rank, x, y + 40, rank === 3 ? 25 : 31, top);
}
function smallDais(ctx, x, y, own) { rect(ctx, own ? '#8ce4ee' : '#b4a88b', x - 45, y - 2, 90, 46); rect(ctx, '#384e47', x - 40, y + 3, 80, 36); rect(ctx, '#78827155', x - 36, y + 7, 72, 2); rect(ctx, '#263c3c66', x - 24, y + 14, 2, 22); rect(ctx, '#263c3c66', x + 15, y + 7, 2, 28); }

export function renderPendingPodium(canvasOrContext, { time = 0 } = {}) {
  const ctx = canvasOrContext.canvas ? canvasOrContext : canvasOrContext.getContext('2d'); begin(ctx); drawPodiumScene(ctx, { time });
  drawWorldPanel(ctx, { x: 180, y: 20, w: 840, h: 126 }, '#172c25f5'); text(ctx, 'CASTLE COURTYARD / THE PODIUM', 600, 44, 12, '#c6d2ae'); text(ctx, 'FINALIZING SCORES…', 600, 106, 31, '#f0edc2'); text(ctx, 'THE ROOM IS COLLECTING FINAL RUN REPORTS', 600, 132, 11, '#b2c4a8');
  const pulse = podiumReducedMotion() ? 1 : .45 + Math.sin(time * 3) * .2; ctx.globalAlpha = pulse; rect(ctx, '#b7ef51', 440, 240, 320, 8); ctx.globalAlpha = 1; plaque(ctx, 'PLEASE WAIT', 600, 310, 18, '#e0e5c4'); ctx.restore();
}

export function renderPodium(canvasOrContext, results, { time = 0, viewerId = null, arrivalAge = 10 } = {}) {
  const ctx = canvasOrContext.canvas ? canvasOrContext : canvasOrContext.getContext('2d'); begin(ctx); drawPodiumScene(ctx, { time });
  drawWorldPanel(ctx, { x: 180, y: 20, w: 840, h: 126 }, '#172c25f5'); text(ctx, 'CASTLE COURTYARD / THE PODIUM', 600, 44, 12, '#c6d2ae'); text(ctx, 'GAME DAY CHAMPIONS', 600, 106, 31, '#f0edc2'); text(ctx, 'FINAL SCORES LOCKED / EVERY ADVENTURE COUNTED', 600, 132, 11, '#b2c4a8');
  for (const rank of [2, 1, 3]) {
    const { x, y } = FEATURED_TIERS[rank];
    stoneDais(ctx, rank, x, y);
  }
  const slots = podiumSlots(results);
  for (const p of slots) {
    const own = p.id === viewerId;
    if (p.featured) {
      plaque(ctx, short(p.name, 22), p.x, p.y - 91, 14, own ? '#8ce4ee' : '#edf2d7');
      if (p.rank === 1) { rect(ctx, '#ffe7a0', p.x - 13, p.y - 82, 26, 5); rect(ctx, '#ffe7a0', p.x - 13, p.y - 88, 5, 7); rect(ctx, '#ffe7a0', p.x - 2, p.y - 90, 5, 9); rect(ctx, '#ffe7a0', p.x + 8, p.y - 88, 5, 7); }
      const bob = podiumReducedMotion() ? 0 : Math.sin(time * 3 + p.rank) * 2; drawSprite(ctx, p.avatar || 'explorer', p.x - 31, p.y - 78 + bob, 62, 78, { color: p.color }); plaque(ctx, `${Math.round(p.score).toLocaleString()} PTS`, p.x, 430, 14, '#ecf4d6'); if (own) plaque(ctx, 'YOU', p.x + 50, p.y - 48, 10, '#8ce4ee');
    } else {
      const { x, y } = p; smallDais(ctx, x, y, own); drawWorldPanel(ctx, {x:x-43,y:y+1,w:86,h:40}, '#172c25f5'); plaque(ctx, short(p.name, 14), x, y - 47, 10, own ? '#8ce4ee' : '#d0e0c0'); const bob = podiumReducedMotion() ? 0 : Math.sin(time * 3 + p.rank) * 1; drawSprite(ctx, p.avatar || 'explorer', x - 17, y - 41 + bob, 34, 41, { color: p.color }); text(ctx, `#${p.rank}`, x, y + 18, 13, own ? '#8ce4ee' : '#c5dba8'); text(ctx, `${Math.round(p.score).toLocaleString()} PTS`, x, y + 33, 10, '#e0eacb'); if (own) rect(ctx, '#8ce4ee', x - 5, y - 67, 10, 4);
    }
  }
  if (!results.length) plaque(ctx, 'NO RUNNERS THIS ROUND', 600, 225, 18, '#c4d2b4');
  if (!podiumReducedMotion()) { for (let i = 0; i < 42; i++) { const x = (i * 109 + Math.sin(time * .5 + i) * 20) % WIDTH, y = (time * (18 + i % 7) + i * 71) % HEIGHT; rect(ctx, ['#d7e7a2', '#8fd3ce', '#e3b78a', '#b9a0ce'][i % 4], x, y, 3 + (i % 2) * 2, 4); } if (arrivalAge < 1) { ctx.globalAlpha = Math.max(0, 1 - arrivalAge) * .5; rect(ctx, '#dbf6d4', 0, 0, WIDTH, HEIGHT); ctx.globalAlpha = 1; for (const p of slots) { ctx.globalAlpha = Math.max(0, 1 - arrivalAge); rect(ctx, '#a9efdb', p.x - 3, p.y - 110, 6, 110); } ctx.globalAlpha = 1; } }
  ctx.restore();
}
