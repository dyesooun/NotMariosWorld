// Deterministic authored platform data. Coordinates use a 960x540 logical view.
const platform = (x, y, w = 150, h = 18, kind = 'wood', extra = {}) => ({ x, y, w, h, kind, ...extra });
const coin = (id, x, y) => ({ id, x, y, r: 9 });
function makeLevel(theme, seed, accent, flavor) {
  const platforms = [platform(0, 500, 360, 100, 'ground')]; const hazards = [], enemies = [], coins = [];
  const variationSeed = seed + [...theme].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  let chunkX = 360;
  let n = 0;
  for (let chunk = 0; chunk < 28; chunk++) {
    // Keep the optional upper route within the normal jump rise (at most 100px).
    const x = chunkX; const high = 450 - (chunk % 4) * 12 - ((variationSeed + chunk * 17) % 3) * 7;
    const groundWidth = 350 + ((variationSeed + chunk * 29) % 101);
    if (chunk % 4 === 2) {
      // A real pit, but both lips remain within the player's maximum jump.
      platforms.push(platform(x + 90, 500, 210, 100, 'ground'), platform(x + 420, 500, 180, 100, 'ground'));
    } else platforms.push(platform(x + 90, 500, groundWidth, 100, 'ground'));
    const groundPlatformIndex = platforms.length - 1;
    const elevatedPlatformIndex = platforms.length;
    platforms.push(platform(x + 35, high, 135 + ((variationSeed + chunk * 31) % 71)));
    if (chunk % 3 === 1) platforms.push(platform(x + 240, high - 74, 125, 18, 'moving', { axis: chunk % 2 ? 'x' : 'y', distance: 54, speed: 1.1 + chunk % 3 * .15, phase: chunk * .7 }));
    if (chunk % 5 === 3) platforms.push(platform(x + 300, high - 120, 110, 18, 'vanish', { cycle: 3.4, phase: chunk * .31 }));
    const hazardX = x + (chunk % 4 === 2 ? 180 : 205);
    const decoy = chunk % 3 === 1, bomb = chunk % 2 === 1;
    hazards.push({ id: `${theme}-hazard-${chunk}`, x: hazardX, y: 474, w: 58, h: 26, kind: decoy ? 'decoy' : 'spikes', disguise: bomb ? 'chest' : 'spring', actualKind: decoy && bomb ? 'bomb' : 'spikes', label: decoy ? (bomb ? 'That treasure chest was hiding a bomb!' : 'That friendly mushroom was hiding spikes!') : 'A suspiciously pointy patch of ground.' });
    if (chunk % 4 === 2) hazards.push({ id: `${theme}-pit-${chunk}`, x: x + 300, y: 500, w: 120, h: 100, kind: 'pit', actualKind: 'pit', label: 'Gravity wins this round' });
    coins.push(coin(`${theme}-coin-${n++}`, x + 125, high - 30), coin(`${theme}-coin-${n++}`, x + 280, high - 105));
    if (chunk % 3 === 0) {
      const elevated = chunk % 2 === 0;
      const enemyPlatformX = elevated ? x + 35 : x + (chunk % 4 === 2 ? 420 : 90);
      const enemyPlatformIndex = elevated ? elevatedPlatformIndex : groundPlatformIndex;
      const enemyPlatformWidth = platforms[enemyPlatformIndex].w;
      enemies.push({ id: `${theme}-enemy-${chunk}`, x: enemyPlatformX + 26, y: elevated ? high : 500, w: 32, h: theme === 'hell' ? 38 : 26, kind: theme === 'ocean' ? 'crab' : theme === 'hell' ? 'imp' : 'slime', speed: 40 + chunk % 3 * 8, min: enemyPlatformX + 8, max: enemyPlatformX + Math.min(enemyPlatformWidth - 16, elevated ? 135 : 270), platformIndex: enemyPlatformIndex, shooter: chunk > 0 && chunk % 4 === 0 });
    }
    const gap = 80 + ((variationSeed + chunk * 13) % 41);
    chunkX += (chunk % 4 === 2 ? 390 : groundWidth) + gap;
  }
  const checkpoints = [3500, 7000, 10500].map((x, i) => ({ id: `${theme}-checkpoint-${i + 1}`, x, y: 500, label: `${(i + 1) * 25}% haven` }));
  for (const cp of checkpoints) if (!platforms.some(p => p.kind === 'ground' && p.x <= cp.x && p.x + p.w >= cp.x + 32)) platforms.push(platform(cp.x - 80, 500, 240, 100, 'ground'));
  // Keep a stable, clear landing area around the saved spawn in every world.
  const safeHazards = hazards.filter(h => !checkpoints.some(cp => h.x < cp.x + 150 && h.x + h.w > cp.x - 150) && (h.x + h.w < 3790 || h.x > 4010));
  const safeEnemies = enemies.filter(e => {
    const p = platforms[e.platformIndex];
    return p && !checkpoints.some(cp => p.x < cp.x + 150 && p.x + p.w > cp.x - 150);
  });
  const powerX = 3880;
  if (!platforms.some(p => p.kind === 'ground' && p.x <= powerX && p.x + p.w >= powerX + 40)) platforms.push(platform(3700, 500, 300, 100, 'ground'));
  const powerChest = { id: `${theme}-power-chest`, x: powerX, y: 500, w: 40, h: 34 };
  return { id: theme, seed, theme, accent, flavor, width: 14200, height: 600, endX: 14000, platforms, coins, hazards: safeHazards, enemies: safeEnemies, checkpoints, powerChest };
}
export const LEVELS = [
  { id: 'L0', theme: 'lobby', width: 1400, height: 600, endX: 999999, platforms: [platform(0, 500, 1400, 100, 'ground'), platform(320, 410, 180), platform(650, 350, 180), platform(980, 410, 180)], coins: [], hazards: [], enemies: [], checkpoints: [], sign: 'WELCOME, EXPLORER!  A/D or arrows move · Space jumps · Press START RUN' },
  makeLevel('forest', 19417, '#69b84f', 'A leafy path with suspiciously friendly grass.'),
  makeLevel('ocean', 19417, '#48b8d1', 'A tidepool trail where crabs have strong opinions.'),
  makeLevel('hell', 19417, '#e35b53', 'A warm little lava walk. Nothing to worry about. Probably.')
];
export function platformAt(p, time = 0) {
  const q = { ...p };
  if (p.kind === 'moving') { const d = Math.sin((p.phase || 0) + time * (p.speed || 1)) * p.distance; if (p.axis === 'x') q.x += d; else q.y += d; }
  q.visible = p.kind === 'vanish' ? Math.sin((time + (p.phase || 0)) * Math.PI * 2 / p.cycle) > -.25 : true;
  return q;
}
export function enemyAt(e, time = 0) { return { ...e, x: e.x + Math.sin(time * e.speed / 45) * ((e.max - e.min) / 2), y: e.y - e.h }; }
export const LEVEL_SEED = 19417;
