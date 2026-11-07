// Cosmetic Waiting Woods scene. World geometry and gameplay never depend on this module.
const W = 960;
const H = 540;
const ATLAS_URL = '/assets/sprites/lobby/waiting-woods-scenery.png';
const FRIENDS_URL = '/assets/sprites/friendly-creatures.png';
const BACKDROP_URL = '/assets/sprites/forest/tileset/whimsical_forest_3.png';
let sceneryImage = null;
let sceneryReady = null;
let friendsImage = null;
let friendsReady = null;
let backdropImage = null;
let backdropReady = null;
const trimmedCache = new Map();
const pixelCache = new Map();
// Positions are visual only; roots and masonry meet the existing floor at y=500.
const SCENERY = [
  [0, 0, -115, 345, 345], [1, 0, 365, 190, 285],
  [2, 0, 660, 250, 245], [0, 1, 936, 82, 172],
  [1, 1, 1080, 218, 135], [0, 0, 1195, 295, 330],
  [2, 1, 20, 104, 68], [2, 1, 425, 86, 54],
  [2, 1, 865, 112, 72], [2, 1, 1295, 100, 64],
];
const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
let reducedMotion = !!motionQuery?.matches;
motionQuery?.addEventListener?.('change', event => { reducedMotion = event.matches; });

const rect = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const mod = (n, m) => ((n % m) + m) % m;

function trimCell(image, col, row, columns, rows) {
  const key = `${image.src || 'image'}/${col}/${row}/${columns}/${rows}`;
  if (trimmedCache.has(key)) return trimmedCache.get(key);
  const x0 = Math.floor(image.width * col / columns), x1 = Math.floor(image.width * (col + 1) / columns);
  const y0 = Math.floor(image.height * row / rows), y1 = Math.floor(image.height * (row + 1) / rows);
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, x1 - x0); canvas.height = Math.max(1, y1 - y0);
  const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, x0, y0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const pixels = c.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (pixels[(y * canvas.width + x) * 4 + 3] > 18) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  const result = right < 0 ? canvas : { canvas, x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  trimmedCache.set(key, result); return result;
}

function drawCell(ctx, image, col, row, columns, rows, x, y, w, h, alpha = 1, flip = false, sway = 0) {
  const cell = trimCell(image, col, row, columns, rows), source = cell.canvas || cell;
  const sx = cell.canvas ? cell.x : 0, sy = cell.canvas ? cell.y : 0, sw = cell.canvas ? cell.w : source.width, sh = cell.canvas ? cell.h : source.height;
  const scale = Math.min(w / sw, h / sh), dw = Math.max(1, Math.round(sw * scale)), dh = Math.max(1, Math.round(sh * scale));
  const dx = Math.round(x + (w - dw) / 2), dy = Math.round(y + h - dh);
  const key = `${image.src}/${col}/${row}/${columns}/${rows}/${dw}/${dh}`;
  if (!pixelCache.has(key)) {
    const pixels = document.createElement('canvas'); pixels.width = dw; pixels.height = dh;
    const pc = pixels.getContext('2d'); pc.imageSmoothingEnabled = false;
    pc.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    pixelCache.set(key, pixels);
  }
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
  // Shear about the root: the canopy moves a little while its foot stays grounded.
  ctx.translate(dx + (flip ? dw : 0), dy + dh);
  ctx.transform(flip ? -1 : 1, 0, sway / dh, 1, 0, 0);
  ctx.drawImage(pixelCache.get(key), 0, -dh, dw, dh);
  ctx.restore();
}

function loadImage(url) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Unable to load ${url}`)); image.src = url; });
}

export function prepareLobbyScene() {
  if (typeof Image === 'undefined') return Promise.resolve();
  const loads = [];
  if (!sceneryReady) sceneryReady = loadImage(ATLAS_URL).then(image => { sceneryImage = image; });
  loads.push(sceneryReady);
  if (!friendsReady) friendsReady = loadImage(FRIENDS_URL).then(image => { friendsImage = image; }).catch(() => null);
  if (!backdropReady) backdropReady = loadImage(BACKDROP_URL).then(image => { backdropImage = image; });
  loads.push(friendsReady, backdropReady); return Promise.all(loads);
}

function sign(ctx, x, y, title, lines, supportY, number, width = 250) {
  for (const postX of [x + 30, x + width - 38]) {
    rect(ctx, '#473d32', postX, y + 96, 8, supportY - y - 96);
    rect(ctx, '#967653', postX + 2, y + 96, 3, supportY - y - 96);
  }
  rect(ctx, '#152c2b', x + 5, y + 6, width, 100);
  rect(ctx, '#b7ef51', x, y, width, 100);
  rect(ctx, '#203d33', x + 3, y + 3, width - 6, 94);
  for (const [dx, dy] of [[0, 0], [width - 6, 0], [0, 94], [width - 6, 94]]) rect(ctx, '#e0f7a7', x + dx, y + dy, 6, 6);
  rect(ctx, '#f3ce7a', x + 12, y + 13, 22, 19);
  ctx.fillStyle = '#263c30'; ctx.font = 'bold 11px monospace'; ctx.fillText(number, x + 16, y + 26);
  ctx.fillStyle = '#d6f1a0'; ctx.font = 'bold 12px monospace'; ctx.fillText(title, x + 43, y + 27);
  rect(ctx, '#53764d', x + 13, y + 39, width - 26, 1);
  ctx.fillStyle = '#f2efd9'; ctx.font = '11px monospace';
  lines.forEach((line, i) => ctx.fillText(line, x + 14, y + 56 + i * 15));
}

export function drawLobbyScene(ctx, { camera = 0, time = 0, showInstructions = false } = {}) {
  const t = reducedMotion ? 0 : time;
  rect(ctx, '#b6dcd1', 0, 0, W, H);
  // Existing authored woodland art provides depth, rather than block silhouettes.
  if (backdropImage) ctx.drawImage(backdropImage, Math.round(-camera * .12), -66, 1100, 660);
  if (sceneryImage) {
    for (const [col, row, x, w, h] of SCENERY) {
      if (x + w < camera - 10 || x > camera + W + 10) continue;
      const sway = row === 0 && col < 2 ? Math.sin(t * .8 + x) * (reducedMotion ? 0 : 1.5) : 0;
      drawCell(ctx, sceneryImage, col, row, 3, 2, x - camera, 500 - h, w, h, 1, false, sway);
    }
  } else {
    // Keep the scene coherent during a brief image decode, without changing layout.
    for (const x of [80, 520, 1040]) { rect(ctx, '#536d49', x - camera * .35, 360, 26, 140); rect(ctx, '#397556', x - camera * .35 - 52, 310, 130, 95); }
  }
  if (friendsImage) {
    for (let i = 0; i < 4; i++) { const x = mod(120 + i * 280 - camera * .22 + t * (8 + i), 1200) - 80, frame = reducedMotion ? i % 2 : Math.floor(t * 5 + i) % 8; drawCell(ctx, friendsImage, frame, 1, 8, 7, x, 92 + (i % 2) * 48 + Math.sin(t * 2 + i) * 5, 34, 25, .9, i % 2 === 0); }
    for (let i = 0; i < 3; i++) { const x = mod(225 + i * 365 - camera * .18 + t * (5 + i), 1200) - 80, frame = reducedMotion ? (i + 1) % 2 : Math.floor(t * 5 + i) % 8; drawCell(ctx, friendsImage, frame, 0, 8, 7, x, 150 + i * 32 + Math.sin(t * 2.4 + i) * 7, 27, 22, .8, i % 2 === 1); }
  }
  // Gentle wind streaks and drifting leaves are cosmetic only.
  for (let i = 0; i < 15; i++) {
    const x = mod(i * 119 - camera * .4 + t * (20 + i % 3 * 5), 1100) - 60;
    const y = 160 + mod(i * 47 + t * (3 + i % 4), 300) + Math.sin(t + i) * 9;
    if (i % 3 === 0) {
      rect(ctx, '#edf5d455', x, y, 23, 1); rect(ctx, '#edf5d488', x + 22, y - 2, 10, 1);
    } else {
      rect(ctx, i % 2 ? '#b9cf6f' : '#d8ba69', x, y, 5, 2);
      rect(ctx, '#7a9c53', x + 2, y + 2, 3, 2);
    }
  }
  if (showInstructions) {
    sign(ctx, 132 - camera, 326, 'PRACTICE GROVE', ['A / D or arrows: move', 'Space / W / Up: jump', 'Release before jumping again'], 500, '01');
    sign(ctx, 572 - camera, 210, 'TRAIL NOTES', ['Coins survive every death', 'Flags save distance + position', 'Exit banks this world'], 350, '02');
    sign(ctx, 1050 - camera, 280, 'READY WHEN YOU ARE', ['Your host starts the race', 'F / USE: activate a power', 'One answer per question'], 500, '03');
  }
}
