// Cosmetic, world-space cards. No collision, gameplay state or network payload.
const DEFAULTS = { enabled: true, color: '#c1ded3', opacity: .24 };
const textures = new Map();
const mod = (n, d) => ((n % d) + d) % d;

export function forestFogCards(world) {
  // Separated pockets leave most of the course clear, including at overview zoom.
  const cards = [];
  for (let x = 240, i = 0; x < world.width; x += 920, i++) cards.push({
    x, y: Math.max(0, world.height * (.57 + (i % 3) * .11)),
    width: 430 + (i % 3) * 60, height: 65 + (i % 2) * 25,
    drift: 32, speed: i % 2 ? -5 : 6,
  });
  return cards.slice(0, 100);
}

export function resolveAtmosphere(document) {
  const authored = document.world.atmosphere;
  const forest = /^(forest|whimsical[ -]?(forest|woods))$/i.test(document.biome || '');
  return { ...DEFAULTS, enabled: forest, ...authored,
    cards: authored?.cards ?? (forest ? forestFogCards(document.world) : []),
  };
}

export function fogCardBounds(card, timeMs = 0, index = 0) {
  const drift = card.drift ?? 32, speed = card.speed ?? 6;
  const phase = timeMs / 1000 * speed / Math.max(1, drift) + index * 2.4;
  return { x: card.x + Math.sin(phase) * drift, y: card.y + Math.sin(phase * .63) * 5,
    width: card.width, height: card.height };
}

function texture(color) {
  if (textures.has(color)) return textures.get(color);
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(128, 32) : globalThis.document?.createElement('canvas');
  if (!canvas) return null;
  canvas.width = 128; canvas.height = 32;
  const c = canvas.getContext('2d');
  if (!c?.createImageData) return null;
  const pixels = c.createImageData(128, 32), rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) {
    const nx = (x - 64) / 64, ny = (y - 16) / 16;
    const edge = Math.max(0, 1 - nx * nx - (ny + Math.sin(x * .12) * .15) ** 2);
    const wisps = .72 + .18 * Math.sin(x * .14 + y * .42) + .1 * Math.cos(x * .053 - y * .55);
    const i = (y * 128 + x) * 4;
    // A fuller core stays visible against pale scenery; the card still feathers
    // to transparent at its edges and honors the authored opacity/color.
    pixels.data.set([...rgb, Math.round(255 * edge ** .75 * wisps)], i);
  }
  c.putImageData(pixels, 0, 0);
  if (textures.size >= 8) textures.delete(textures.keys().next().value);
  textures.set(color, canvas);
  return canvas;
}

export function drawAtmosphere(c, document, { timeMs = 0, camera = { x: 0, y: 0 }, width = document.world.width, height = document.world.height, atmosphere = resolveAtmosphere(document) } = {}) {
  if (!atmosphere.enabled || atmosphere.opacity <= 0 || !atmosphere.cards.length) return;
  const image = texture(atmosphere.color);
  if (!image) return;
  c.save(); c.imageSmoothingEnabled = false;
  // Fog is a foreground world pass, regardless of any prior sprite blend mode.
  c.globalCompositeOperation = 'source-over';
  for (const [i, card] of atmosphere.cards.entries()) {
    const box = fogCardBounds(card, timeMs, i);
    if (box.x + box.width < camera.x || box.x > camera.x + width || box.y + box.height < camera.y || box.y > camera.y + height) continue;
    c.globalAlpha = atmosphere.opacity * (.84 + .16 * Math.sin(timeMs / 2300 + mod(i * 1.7, Math.PI * 2)));
    c.drawImage(image, Math.round(box.x), Math.round(box.y), box.width, box.height);
  }
  c.restore();
}
