import { LEVELS, platformAt, enemyAt } from './levels.js';
import { PROJECTILE_RULES } from './projectiles.js';
export { LEVELS };
export const AVATARS = ['explorer', 'cat', 'robot', 'wizard'];
export const COLORS = ['#b7ef51', '#ffb4df', '#7edcff', '#c6a1ff', '#ffd166', '#ff8c69'];
const DEFAULT = { gravity: 1700, runSpeed: 270, accel: 1900, airControl: .78, jumpSpeed: 650, coyote: .11, jumpBuffer: .12, deathDelay: 3, coinPoints: 10, distancePoints: 1 };
const clone = v => JSON.parse(JSON.stringify(v));
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const avatarBox = s => ({ x: s.x - 14, y: s.y - 36, w: 28, h: 36 });

export function createState({ avatar = 'explorer', color = '#b7ef51', name = '', level = 0 } = {}) {
  return { avatar, color, name, level, x: 90, y: 500, vx: 0, vy: 0, grounded: true, coyote: 0, jumpBuffer: 0, elapsed: 0, banked: 0, current: 0, coins: 0, collected: [], progress: 0, distanceMax: 0, checkpoint: null, deaths: 0, deadUntil: 0, respawnRemaining: 0, finished: false, started: false, deathCause: null, reveal: null, events: [], enemies: [], projectiles: [], _levelTime: 0, _enemyPhase: 0, _jumpHeld: false, _standingPlatform: null, _platformX: 0, _platformY: 0, _particles: [] };
}
export function startRun(s) {
  const profile = s.profile;
  Object.assign(s, createState({ name: s.name, avatar: s.avatar, color: s.color, level: 1 }), { started: true });
  if (profile !== undefined) s.profile = clone(profile);
  initializeEnemies(s, LEVELS[s.level] || LEVELS[0]);
  return s;
}
function levelStart(s) {
  const { banked, deaths, elapsed, level, started, name, avatar, color, profile } = s;
  Object.assign(s, createState({ name, avatar, color, level }), { banked, deaths, elapsed, started });
  if (profile !== undefined) s.profile = clone(profile);
  initializeEnemies(s, LEVELS[s.level] || LEVELS[0]);
}
function restoreCheckpoint(s) {
  if (!s.checkpoint) {
    s.current = 0; s.coins = 0; s.collected = []; s.progress = 0; s.distanceMax = 0;
    return;
  }
  const cp = s.checkpoint;
  s.current = cp.current; s.coins = cp.coins; s.collected = [...cp.collected];
  s.progress = cp.progress; s.distanceMax = cp.distanceMax;
}
function respawn(s) {
  const cp = s.checkpoint;
  restoreCheckpoint(s);
  if (cp) { s.x = cp.x; s.y = cp.y; }
  else { s.x = 90; s.y = 500; }
  s.vx = 0; s.vy = 0; s.grounded = true; s.coyote = 0; s.jumpBuffer = 0;
  s.deadUntil = 0; s.respawnRemaining = 0; s.deathCause = null; s.reveal = null;
  s._levelTime = 0; s._enemyPhase = 0; s._jumpHeld = false;
  s._standingPlatform = null; s._platformX = 0; s._platformY = 0; s._particles = [];
  s.projectiles = [];
  s._enemyLevel = null; s.enemies = [];
}
function initializeEnemies(s, level) {
  if (s._enemyLevel === s.level && Array.isArray(s.enemies) && s.enemies.length === level.enemies.length) return;
  s.enemies = level.enemies.map((base, i) => {
    let pi = Number.isInteger(base.platformIndex) ? base.platformIndex : level.platforms.findIndex(p => Math.abs(p.x - base.min) < 100);
    if (pi < 0) pi = 0;
    const p = platformAt(level.platforms[pi], s._levelTime);
    return { id: base.id || `${level.theme}-enemy-${i}`, x: base.x, y: p.y - base.h, w: base.w, h: base.h, kind: base.kind, platformIndex: pi, facing: 1, patrolDirection: 1, cooldown: 2 + i * .5, shooter: !!base.shooter, speed: base.speed || 42, _baseX: base.x };
  });
  s._enemyLevel = s.level;
}
function updateEnemies(s, level, dt) {
  initializeEnemies(s, level);
  for (const e of s.enemies) {
    const p = platformAt(level.platforms[e.platformIndex], s._levelTime);
    if (!p || !p.visible) { e.y = 1000; e.cooldown = Math.max(0, e.cooldown - dt); continue; }
    const minX = p.x + 8, maxX = p.x + p.w - e.w - 8;
    e.y = p.y - e.h;
    const sameBand = Math.abs((s.y - 36) - e.y) <= 140;
    const onOwnPlatform = s.grounded && s._standingPlatform === e.platformIndex;
    const chasing = onOwnPlatform && Math.abs(s.x - e.x) <= 400 && sameBand;
    const target = chasing ? Math.sign(s.x - e.x) : (e.patrolDirection || 1);
    if (target) { e.facing = target; e.x += target * (chasing ? Math.min(e.speed * 1.45, 70) : e.speed) * dt; }
    if (e.x <= minX) { e.x = minX; e.patrolDirection = 1; e.facing = 1; }
    if (e.x >= maxX) { e.x = maxX; e.patrolDirection = -1; e.facing = -1; }
    e.cooldown = Math.max(0, e.cooldown - dt);
    if (e.shooter && e.cooldown <= 0 && Math.abs(s.x - e.x) < 500 && sameBand) {
      const dx = s.x - e.x, dy = (s.y - 22) - (e.y + e.h / 2), len = Math.hypot(dx, dy) || 1;
      s.projectiles.push({ id: `${e.id}-shot-${Math.floor(s.elapsed * 10)}`, x: e.x + e.w / 2, y: e.y + e.h / 2, vx: dx / len * PROJECTILE_RULES.speed, vy: dy / len * PROJECTILE_RULES.speed, life: PROJECTILE_RULES.lifetime, ownerId: e.id, w: PROJECTILE_RULES.width, h: PROJECTILE_RULES.height });
      e.cooldown = PROJECTILE_RULES.fireInterval;
    }
  }
}
function updateProjectiles(s, dt) {
  s.projectiles = (s.projectiles || []).filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0 && p.x > -100 && p.x < 14500 && p.y > -100 && p.y < 650; });
}
function die(s, h, now, cfg) {
  if (s.deadUntil > now || s.finished) return null;
  s.deaths += 1; s.deadUntil = now + cfg.deathDelay; s.respawnRemaining = cfg.deathDelay; s.vx = 0; s.vy = -330;
  s.deathCause = { label: h.label || 'A surprise meeting with danger', x: h.x, y: h.y, kind: h.kind || 'hazard', actualKind: h.actualKind || h.kind || 'hazard' }; s.reveal = clone(s.deathCause);
  // Restore the saved attempt immediately; gains after the flag are lost.
  restoreCheckpoint(s);
  s._particles = Array.from({ length: 22 }, (_, i) => ({ x: s.x, y: s.y - 18, vx: Math.cos(i) * (35 + i * 2), vy: -120 - (i % 5) * 24, life: cfg.deathDelay }));
  return { type: 'death', ...clone(s.deathCause), respawnIn: cfg.deathDelay };
}

export function step(s, input = {}, dt = 1 / 60, config = {}) {
  const cfg = { ...DEFAULT, ...config }, events = []; dt = Math.min(Math.max(Number(dt) || 0, 0), .05); s.events = events; s.elapsed += dt;
  if (s.finished) return events;
  const lobby = !s.started && s.level === 0;
  if (!lobby && s.deadUntil > 0) { s.respawnRemaining = Math.max(0, s.deadUntil - s.elapsed); for (const p of s._particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; } if (s.elapsed + 1e-6 >= s.deadUntil) respawn(s); return events; }
  const level = LEVELS[s.level] || LEVELS[0]; s._levelTime += dt; s._enemyPhase += dt; initializeEnemies(s, level); updateProjectiles(s, dt);
  if (s.grounded && s._standingPlatform != null) {
    const riderPlatform = platformAt(level.platforms[s._standingPlatform], s._levelTime);
    if (riderPlatform.visible) { s.x += riderPlatform.x - s._platformX; s.y += riderPlatform.y - s._platformY; }
  }
  const effects = config.powerEffects || {}, reverse = !!effects.reverse, slow = !!effects.slow, slippery = !!effects.slippery;
  const left = reverse ? !!input.right : !!input.left, right = reverse ? !!input.left : !!input.right, dir = (right ? 1 : 0) - (left ? 1 : 0), target = dir * cfg.runSpeed * (slow ? .55 : 1);
  const control = s.grounded ? 1 : cfg.airControl; const accel = cfg.accel * (slow ? .72 : 1) * (slippery ? .72 : 1); if (dir) s.vx += Math.sign(target - s.vx) * Math.min(Math.abs(target - s.vx), accel * control * dt); else s.vx *= Math.max(0, 1 - (slippery ? 2.2 : 8) * dt);
  s.coyote = s.grounded ? cfg.coyote : Math.max(0, s.coyote - dt);
  const jumpPressed = !!input.jump && !s._jumpHeld; s._jumpHeld = !!input.jump; if (jumpPressed) s.jumpBuffer = cfg.jumpBuffer; else s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
  if (s.jumpBuffer > 0 && (s.grounded || s.coyote > 0)) { s.vy = -cfg.jumpSpeed; s.grounded = false; s.coyote = 0; s.jumpBuffer = 0; }
  s.vy += cfg.gravity * dt; const oldY = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.grounded = false;
  s._standingPlatform = null;
  for (let pi = 0; pi < level.platforms.length; pi++) { const p0 = level.platforms[pi], p = platformAt(p0, s._levelTime); if (!p.visible) continue; const b = avatarBox(s); if (b.x + b.w > p.x && b.x < p.x + p.w && b.y + b.h >= p.y && oldY <= p.y && s.vy >= 0) { s.y = p.y; s.vy = 0; s.grounded = true; s._standingPlatform = pi; s._platformX = p.x; s._platformY = p.y; break; } }
  s.x = Math.max(14, Math.min(level.width - 20, s.x));
  if (lobby) return events;
  s.distanceMax = Math.max(s.distanceMax, Math.max(0, s.x - 90)); s.progress = Math.max(s.progress, Math.min(1, s.x / level.endX));
  updateEnemies(s, level, dt);
  const b = avatarBox(s); let dead = false;
  for (const h of level.hazards) if ((h.kind === 'pit' && s.y > 590 && s.x > h.x && s.x < h.x + h.w) || (h.kind !== 'pit' && hit(b, h))) { const e = die(s, h, s.elapsed, cfg); if (e) events.push(e); dead = true; break; }
  if (!dead && s.y > 590) { const e = die(s, { x: s.x, y: 500, kind: 'pit', actualKind: 'pit', label: level.theme === 'ocean' ? 'Took the scenic route into the sea.' : level.theme === 'hell' ? 'The lava was warmer than expected.' : 'Found a shortcut. It went straight down.' }, s.elapsed, cfg); if (e) events.push(e); dead = true; }
  if (!dead) { for (const e of s.enemies) if (e.y < 700 && hit(b, e)) { const d = die(s, { ...e, kind: 'enemy', label: `Bonked by a ${e.kind}` }, s.elapsed, cfg); if (d) events.push(d); dead = true; break; } }
  if (!dead) for (const p of s.projectiles) if (hit(b, { x: p.x - (p.w || PROJECTILE_RULES.width) / 2, y: p.y - (p.h || PROJECTILE_RULES.height) / 2, w: p.w || PROJECTILE_RULES.width, h: p.h || PROJECTILE_RULES.height })) { const d = die(s, { x: p.x, y: p.y, kind: 'projectile', label: 'A projectile found its mark.' }, s.elapsed, cfg); if (d) events.push(d); dead = true; break; }
  if (!dead) for (const c of level.coins) if (!s.collected.includes(c.id) && Math.hypot(s.x - c.x, s.y - c.y) < 34) { s.collected.push(c.id); s.coins += 1; s.current += cfg.coinPoints; }
  if (!dead && !s.finished && Array.isArray(level.checkpoints)) for (const cp of level.checkpoints) {
    if (s.checkpoint?.id === cp.id || (s.checkpoint && cp.x <= s.checkpoint.x)) continue;
    if (s.x >= cp.x && s.x <= cp.x + 32 && s.y <= cp.y + 2 && s.y > 0) {
      s.checkpoint = { id: cp.id, x: cp.x, y: cp.y, current: s.current, coins: s.coins, collected: [...s.collected], distanceMax: s.distanceMax, progress: s.progress };
      events.push({ type: 'checkpoint', id: cp.id, level: s.level });
      break;
    }
  }
  if (!dead && s.x >= level.endX) { const clearScore = s.current + Math.floor(s.distanceMax / 32) * cfg.distancePoints; s.banked += clearScore; events.push({ type: 'levelComplete', level: s.level, score: clearScore }); if (s.level >= LEVELS.length - 1) { s.current = 0; s.distanceMax = 0; s.finished = true; events.push({ type: 'finished', score: score(s, cfg) }); } else { s.level += 1; levelStart(s); } }
  return events;
}
export function score(s, config = {}) { const c = { ...DEFAULT, ...config }; return s.banked + s.current + Math.floor(s.distanceMax / 32) * c.distancePoints; }
export function snapshot(s) { return clone(s); }
