const WIDTH = 1200;
const HEIGHT = 720;
const SOURCE = '/assets/sprites/podium/courtyard-ruins.png';

let scenePromise = null;
let sceneImage = null;
let reducedMotion = false;
let mediaQuery = null;

function watchReducedMotion() {
  if (typeof matchMedia !== 'function' || mediaQuery) return;
  mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = !!mediaQuery.matches;
  const update = event => { reducedMotion = !!event.matches; };
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', update);
  else if (mediaQuery.addListener) mediaQuery.addListener(update);
}

export function preparePodiumScene() {
  watchReducedMotion();
  if (typeof Image === 'undefined') return Promise.resolve(null);
  if (scenePromise) return scenePromise;
  scenePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { sceneImage = image; resolve(image); };
    image.onerror = () => {
      scenePromise = null;
      reject(new Error(`Podium scene unavailable: ${SOURCE}`));
    };
    image.src = SOURCE;
  });
  return scenePromise;
}

function rect(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function fallback(ctx) {
  rect(ctx, '#182a38', 0, 0, WIDTH, HEIGHT);
  rect(ctx, '#263f4a', 0, 120, WIDTH, 290);
  rect(ctx, '#3d5149', 0, 410, WIDTH, 310);
  // A quiet, readable ruined courtyard while the authored backdrop is loading.
  for (const x of [30, 1125]) {
    rect(ctx, '#172832', x, 116, 70, 300);
    rect(ctx, '#6a7668', x + 12, 145, 45, 260);
    rect(ctx, '#9ba37a', x - 4, 112, 78, 15);
    rect(ctx, '#263a3e', x + 22, 203, 24, 202);
    for (let y = 150; y < 395; y += 30) rect(ctx, '#4c5b52', x + 17, y, 34, 4);
  }
  for (let x = 110; x < 1100; x += 92) {
    rect(ctx, '#526655', x, 418 + (x % 3) * 4, 58, 11);
    rect(ctx, '#73845f', x + 8, 429, 43, 9);
  }
  for (let i = 0; i < 26; i++) {
    const x = (i * 83) % WIDTH;
    const y = 485 + (i * 47) % 205;
    rect(ctx, i % 2 ? '#718d62' : '#4f704f', x, y, 4 + i % 4, 12 + i % 5);
  }
}

export function drawPodiumScene(ctx, { time = 0 } = {}) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (sceneImage) ctx.drawImage(sceneImage, 0, 0, WIDTH, HEIGHT);
  else fallback(ctx);
  // Small translucent wind/petal pixels sit behind all names and ranks.
  if (!reducedMotion) {
    for (let i = 0; i < 18; i++) {
      const x = (i * 139 + time * (7 + i % 3)) % WIDTH;
      const y = 170 + ((i * 53 + time * (4 + i % 2)) % 385);
      rect(ctx, i % 3 ? '#b7c98799' : '#d5b57b99', x, y, 3, 2);
    }
  }
  ctx.restore();
}

export function podiumReducedMotion() { return reducedMotion; }
