import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATARS, LEVELS, createState, startRun, step, score, snapshot } from '../public/game/engine.js';
import { platformAt } from '../public/game/levels.js';
import { PROJECTILE_RULES } from '../public/game/projectiles.js';

test('holding jump cannot repeatedly bounce, and a fresh press can jump again', () => {
  const state = createState();
  step(state, { jump: true }, 1 / 60);
  for (let i = 0; i < 100; i++) step(state, { jump: true }, 1 / 60);
  assert.equal(state.grounded, true);
  assert.equal(state.y, 500);
  step(state, { jump: false }, 1 / 60);
  step(state, { jump: true }, 1 / 60);
  assert.ok(state.vy < 0);
});

test('falling through any gap dies, preserves the bank, and resets all hazard clocks on respawn', () => {
  const state = startRun(createState());
  state.banked = 444;
  state.x = 400;
  state.y = 620;
  state.current = 20;
  state._enemyPhase = 10;
  assert.equal(step(state, {}, 1 / 60)[0].type, 'death');
  assert.equal(score(state), 444);
  for (let i = 0; i < 181; i++) step(state, {}, 1 / 60);
  assert.equal(state.x, 90);
  assert.ok(state._enemyPhase < .04);
  assert.ok(state._levelTime < .04);
});

test('a rider is carried by the same moving platform trajectory used by rendering', () => {
  const state = startRun(createState());
  const index = LEVELS[1].platforms.findIndex(p => p.kind === 'moving' && p.axis === 'x');
  const base = LEVELS[1].platforms[index], before = platformAt(base, 0);
  Object.assign(state, { x: before.x + before.w / 2, y: before.y, grounded: true, _standingPlatform: index, _platformX: before.x, _platformY: before.y });
  step(state, {}, 1 / 60);
  const after = platformAt(base, 1 / 60);
  assert.ok(Math.abs(state.x - (after.x + after.w / 2)) < .01);
  assert.equal(state.y, after.y);
});
test('state contract is JSON serializable and starts in lobby', () => { const state = createState({ name: 'Ada', avatar: 'cat' }); assert.equal(state.level, 0); assert.equal(state.started, false); assert.equal(JSON.parse(JSON.stringify(snapshot(state))).name, 'Ada'); assert.ok(AVATARS.includes(state.avatar)); });
test('lobby allows movement and a single edge-triggered jump', () => { const state = createState(); step(state, { right: true }, .1); assert.ok(state.x > 90); step(state, { jump: true }, .016); assert.ok(state.vy < 0); const vy = state.vy; step(state, { jump: true }, .016); assert.ok(state.vy < vy + 40); });
test('hazard death immediately loses attempt score and respawns after three seconds', () => { const state = startRun(createState()); state.x = LEVELS[1].hazards.find(h=>h.kind==='spikes').x + 29; state.y = 500; state.current = 99; state.coins = 5; state.progress = .4; state.distanceMax = 500; const events = step(state, {}, .016); assert.equal(events[0]?.type, 'death'); assert.equal(state.current, 0); assert.equal(state.coins, 0); assert.equal(state.progress, 0); assert.equal(score(state), 0); assert.equal(state.deathCause.actualKind, 'spikes'); for (let i = 0; i < 59; i++) step(state, {}, .05); assert.ok(state.respawnRemaining > 0); step(state, {}, .05); assert.equal(state.deathCause, null); assert.equal(state.x, 90); assert.equal(state.y, 500); assert.equal(state.grounded, true); });
test('level completion banks coin and distance score without final double count', () => { const state = startRun(createState()); state.current = 20; state.distanceMax = 320; state.x = LEVELS[1].endX + 1; state.y = 400; const first = step(state, {}, .016); assert.ok(first.some(e => e.type === 'levelComplete')); assert.ok(state.banked >= 20 + Math.floor((LEVELS[1].endX + 1 - 90) / 32)); assert.equal(state.current, 0); assert.equal(state.level, 2); state.level = 3; state.x = LEVELS[3].endX + 1; state.y = 400; state.current = 10; state.distanceMax = 64; const last = step(state, {}, .016); assert.ok(last.some(e => e.type === 'finished')); assert.equal(state.finished, true); assert.equal(state.current, 0); assert.equal(state.distanceMax, 0); assert.equal(score(state), state.banked); });
test('progress is maximum reached in an attempt and snapshot retains simulation clocks', () => { const state = startRun(createState()); state.x = 900; step(state, {}, .016); const max = state.progress; state.x = 200; step(state, {}, .016); assert.equal(state.progress, max); const copy = snapshot(state); assert.equal(copy._levelTime, state._levelTime); assert.equal(copy._enemyPhase, state._enemyPhase); });
test('world dimensions, stable ids, and ground gaps remain deterministic and traversable', () => { assert.equal(LEVELS.length, 4); assert.deepEqual(LEVELS.slice(1).map(l => l.width), [14200, 14200, 14200]); for (const level of LEVELS.slice(1)) { assert.equal(new Set(level.coins.map(c => c.id)).size, level.coins.length); const grounds = level.platforms.filter(p => p.kind === 'ground').sort((a, b) => a.x - b.x); for (let i = 1; i < grounds.length; i++) assert.ok(grounds[i].x - (grounds[i - 1].x + grounds[i - 1].w) <= 120 || grounds[i - 1].x + grounds[i - 1].w > grounds[i].x); } });

test('checkpoint activates once and keeps an immutable collected snapshot', () => {
  const level = LEVELS[1], original = level.checkpoints;
  level.checkpoints = [...(original || []), { id: 'test-checkpoint', x: 200, y: 500 }];
  try {
    const state = startRun(createState()); state.x = 200; state.current = 30; state.coins = 3; state.collected = ['coin-a']; state.distanceMax = 110; state.progress = .2;
    const first = step(state, {}, 0); assert.deepEqual(first.find(e => e.type === 'checkpoint'), { type: 'checkpoint', id: 'test-checkpoint', level: 1 });
    state.collected.push('coin-b'); state.current = 40;
    assert.deepEqual(state.checkpoint, { id: 'test-checkpoint', x: 200, y: 500, current: 30, coins: 3, collected: ['coin-a'], distanceMax: 110, progress: .2 });
    assert.equal(step(state, {}, 0).some(e => e.type === 'checkpoint'), false);
  } finally { level.checkpoints = original; }
});

test('checkpoint death restores score immediately and respawns at saved clocks', () => {
  const level = LEVELS[1], original = level.checkpoints;
  level.checkpoints = [{ id: 'test-checkpoint', x: 200, y: 500 }];
  try {
    const state = startRun(createState()); state.x = 200; state.current = 30; state.coins = 3; state.collected = ['coin-a']; state.distanceMax = 110; state.progress = .2; step(state, {}, 0);
    state.x = LEVELS[1].hazards.find(h=>h.kind==='spikes').x + 29; state.y = 500; state.current = 80; state.coins = 8; state.distanceMax = 900; state.progress = .8; state._enemyPhase = 42;
    assert.equal(step(state, {}, .016)[0]?.type, 'death'); assert.equal(state.current, 30); assert.equal(state.coins, 3); assert.equal(state.distanceMax, 110); assert.deepEqual(state.collected, ['coin-a']);
    for (let i = 0; i < 60; i++) step(state, {}, .05);
    assert.equal(state.x, 200); assert.equal(state.y, 500); assert.equal(state._enemyPhase, 0); assert.equal(state._levelTime, 0); assert.equal(state.vx, 0); assert.equal(state.vy, 0);
  } finally { level.checkpoints = original; }
});

test('new level and new run clear checkpoint state while preserving banked score', () => {
  const state = startRun(createState()); state.checkpoint = { id: 'cp', x: 100, y: 500, current: 10, coins: 1, collected: [], distanceMax: 20, progress: .1 }; state.current = 10; state.distanceMax = 20; state.banked = 77;
  state.level = 2; state.x = LEVELS[2].endX + 1; state.y = 400; const clear = step(state, {}, .016); assert.equal(state.checkpoint, null); assert.equal(state.banked, 77 + clear[0].score);
  startRun(state); assert.equal(state.checkpoint, null); assert.equal(state.banked, 0);
});

test('all three real checkpoints save monotonically and restore the latest progress after death', () => {
  for (let levelIndex = 1; levelIndex <= 3; levelIndex++) {
    const level = LEVELS[levelIndex], state = startRun(createState());
    assert.deepEqual(level.checkpoints.map(cp => cp.x), [3500, 7000, 10500]);
    state.level = levelIndex; state.banked = 500; state.current = 20; state.coins = 2; state.collected = [];
    for (const [i, cp] of level.checkpoints.entries()) {
      state.current += 10; state.coins += 1; state.collected.push(`checkpoint-coin-${i}`);
      Object.assign(state, { x: cp.x, y: cp.y, grounded: true });
      assert.equal(step(state, {}, 0).find(e => e.type === 'checkpoint')?.id, cp.id);
      assert.equal(state.checkpoint.id, cp.id);
      assert.equal(state.checkpoint.current, state.current);
      assert.equal(state.checkpoint.coins, state.coins);
      assert.deepEqual(state.checkpoint.collected, state.collected);
    }
    const saved = JSON.stringify(state.checkpoint), latest = level.checkpoints.at(-1);
    state.x = level.checkpoints[0].x; step(state, {}, 0);
    assert.equal(JSON.stringify(state.checkpoint), saved, 'backtracking must not downgrade the latest checkpoint');
    state.x = latest.x + 50; state.y = 620;
    assert.equal(step(state, {}, 1 / 60)[0].type, 'death');
    for (let i = 0; i < 182; i++) step(state, {}, 1 / 60);
    assert.equal(state.x, latest.x); assert.equal(state.y, latest.y); assert.equal(state.checkpoint.id, latest.id);
    assert.equal(state.current, 50); assert.equal(state.coins, 5); assert.deepEqual(state.collected, ['checkpoint-coin-0', 'checkpoint-coin-1', 'checkpoint-coin-2']);
  }
});

test('checkpoint spawn areas stay safe, and falling below a flag does not activate it', () => {
  for (let levelIndex = 1; levelIndex <= 3; levelIndex++) {
    const level = LEVELS[levelIndex];
    for (const cp of level.checkpoints) {
    const falling = startRun(createState());
    Object.assign(falling, { level: levelIndex, x: cp.x, y: 620 });
    step(falling, {}, 1 / 60);
    assert.equal(falling.checkpoint, null);
    assert.equal(falling.deaths, 1);
    const standing = startRun(createState());
    Object.assign(standing, { level: levelIndex, x: cp.x, y: cp.y });
    step(standing, {}, 0);
    for (let i = 0; i < 600; i++) step(standing, {}, 1 / 60);
    assert.equal(standing.deaths, 0);
    assert.equal(standing.grounded, true);
    assert.equal(standing.checkpoint.id, cp.id);
    assert.equal(level.enemies.some(e => Math.abs(e.x - cp.x) < 150), false);
    }
  }
});

test('each of the nine flags protects coins and score without allowing coin farming',()=>{
  for(let levelIndex=1;levelIndex<=3;levelIndex++)for(const cp of LEVELS[levelIndex].checkpoints){
    const level=LEVELS[levelIndex],state=startRun(createState());
    Object.assign(state,{level:levelIndex,banked:500,x:cp.x,y:cp.y,current:20,coins:2,collected:level.coins.slice(0,2).map(c=>c.id)});
    step(state,{},0);const savedScore=score(state),saved=JSON.stringify(state.checkpoint);
    const laterCoin=level.coins.find(c=>c.x>cp.x+100);
    Object.assign(state,{x:laterCoin.x,y:laterCoin.y,grounded:false,_standingPlatform:null});step(state,{},0);
    assert.equal(state.coins,3);assert.equal(JSON.stringify(state.checkpoint),saved);
    Object.assign(state,{x:cp.x+50,y:620,grounded:false,_standingPlatform:null});step(state,{},1/60);
    assert.equal(state.deaths,1);assert.equal(score(state),savedScore);assert.equal(state.coins,2);
    assert.equal(state.collected.includes(laterCoin.id),false);
    for(let i=0;i<182;i++)step(state,{},1/60);
    assert.equal(state.x,cp.x);assert.equal(state.y,cp.y);assert.equal(score(state),savedScore);
    const savedCoin=level.coins[0];
    Object.assign(state,{x:savedCoin.x,y:savedCoin.y,grounded:false,_standingPlatform:null});step(state,{},0);
    assert.equal(state.coins,2);assert.equal(score(state),savedScore);
    Object.assign(state,{x:cp.x+50,y:620,grounded:false,_standingPlatform:null});step(state,{},1/60);
    assert.equal(score(state),savedScore);assert.equal(state.banked,500);
  }
});

test('critters stay inside their assigned platform while chasing across a cliff', () => {
  const state = startRun(createState());
  const level = LEVELS[state.level], enemy = state.enemies.find(e => level.platforms[e.platformIndex]?.kind === 'ground');
  assert.ok(enemy);
  const platform = level.platforms[enemy.platformIndex];
  enemy.x = platform.x + 180;
  state.x = platform.x + platform.w + 700; state.y = 500;
  for (let i = 0; i < 90; i++) {
    step(state, {}, 1 / 60);
    assert.ok(enemy.x >= platform.x + 8 - 1e-6 && enemy.x <= platform.x + platform.w - enemy.w - 8 + 1e-6);
  }
});

test('elevated critters attach to their platform height instead of floating', () => {
  const state = startRun(createState()), level = LEVELS[state.level];
  const enemy = state.enemies.find(e => level.platforms[e.platformIndex]?.y < 500);
  assert.ok(enemy, 'expected at least one elevated critter');
  const platform = level.platforms[enemy.platformIndex];
  enemy.x = platform.x + platform.w - enemy.w - 40;
  step(state, {}, 1 / 60);
  assert.equal(enemy.y, platform.y - enemy.h);
});

test('shooter projectiles spawn on cooldown, collide, expire, and reset on respawn', () => {
  const state = startRun(createState()), shooter = state.enemies.find(e => e.shooter);
  assert.ok(shooter);
  state.x = shooter.x - 80; state.y = 500; shooter.cooldown = 0;
  step(state, {}, 1 / 60);
  assert.ok(state.projectiles.length > 0);
  const spawned = state.projectiles[0];
  assert.equal(Math.round(Math.hypot(spawned.vx, spawned.vy)), PROJECTILE_RULES.speed);
  assert.equal(spawned.w, PROJECTILE_RULES.width); assert.equal(spawned.h, PROJECTILE_RULES.height);
  assert.equal(shooter.cooldown, PROJECTILE_RULES.fireInterval);
  step(state, {}, 1 / 60); assert.equal(state.projectiles.length, 1, 'cooldown prevents immediate refiring');
  const shot = {...state.projectiles[0],x:90,y:480,vx:0,vy:0};
  state.x = 90; state.y = 500; state.projectiles = [shot];
  const events = step(state, {}, 1 / 60);
  assert.ok(events.some(e => e.type === 'death' && e.kind === 'projectile'));
  for(let i=0;i<181;i++)step(state,{},1/60);
  assert.equal(state.respawnRemaining,0);
  assert.equal(state.projectiles.length, 0);
  const expiry=startRun(createState());
  expiry.projectiles=[{id:'expiry',x:800,y:200,vx:0,vy:0,life:.001,ownerId:shooter.id}];
  step(expiry,{},1/60);assert.equal(expiry.projectiles.length,0);
});

test('sustained firing takes 4.8 seconds between shots instead of 2.4 seconds',()=>{
  const state=startRun(createState()),shooter=state.enemies.find(e=>LEVELS[1].platforms[e.platformIndex].kind==='wood');
  for(const enemy of state.enemies)enemy.shooter=false;
  shooter.shooter=true;shooter.cooldown=0;state.x=shooter.x-400;
  const fired=[];
  for(let i=0;i<600;i++){
    state.projectiles=[];step(state,{},1/60);
    if(state.projectiles.some(shot=>shot.ownerId===shooter.id))fired.push(state.elapsed);
  }
  assert.equal(state.deaths,0);assert.equal(fired.length,3);
  for(let i=1;i<fired.length;i++)assert.ok(Math.abs(fired[i]-fired[i-1]-4.8)<=1/60+1e-6);
});

test('larger fireball body collides at its visible edge',()=>{
  const state=startRun(createState());
  // The player ends at x104. A 16px shot at x110 overlaps; the old 10px shot would miss.
  state.projectiles=[{id:'grazing-fireball',x:110,y:480,vx:0,vy:0,life:1}];
  assert.ok(step(state,{},1/60).some(e=>e.type==='death'&&e.kind==='projectile'));
});

test('world starts give players time to begin moving without projectile spawn camping',()=>{
  for(let level=1;level<=3;level++){
    const state=createState({level});state.started=true;
    for(let i=0;i<600;i++)step(state,{},1/60);
    assert.equal(state.deaths,0,`world ${level} start must remain clear`);
  }
});

test('power movement effects change speed, direction, and braking', () => {
  const normal = createState(), slow = createState(), reversed = createState(), slippery = createState();
  step(normal, { right: true }, .1); step(slow, { right: true }, .1, { powerEffects: { slow: true } });
  step(reversed, { right: true }, .1, { powerEffects: { reverse: true } });
  step(slippery, { right: true }, .1); step(slippery, {}, .1, { powerEffects: { slippery: true } });
  const braking = createState(); step(braking, { right: true }, .1); step(braking, {}, .1);
  assert.ok(slow.x < normal.x);
  assert.ok(reversed.x < 90.1);
  assert.ok(slippery.vx > braking.vx);
});

test('biome variations keep power chests on safe ground and primary gaps reachable', () => {
  for (const level of LEVELS.slice(1)) {
    assert.ok(level.powerChests?.length >= 3);
    const chest = level.powerChests[0];
    const support = level.platforms.find(p => p.kind === 'ground' && chest.x >= p.x && chest.x + chest.w <= p.x + p.w);
    assert.ok(support, `${level.id} power chest needs ground support`);
    assert.equal(level.hazards.some(h => h.x < chest.x + chest.w + 90 && h.x + h.w > chest.x - 90), false);
    const widths = new Set(level.platforms.filter(p => p.kind === 'ground').map(p => p.w));
    assert.ok(widths.size > 3);
    const grounds = level.platforms.filter(p => p.kind === 'ground').sort((a, b) => a.x - b.x);
    for (let i = 1; i < grounds.length; i++) assert.ok(grounds[i].x - (grounds[i - 1].x + grounds[i - 1].w) <= 120);
    assert.ok(grounds[0].x <= 0 && grounds.at(-1).x + grounds.at(-1).w >= level.endX);
    for (const upper of level.platforms.filter(p => p.kind === 'wood' && p.w >= 135)) assert.ok(upper.y >= 400, `${level.id} primary upper route exceeds the main jump rise`);
  }
});

test('checkpoint can activate while airborne above the flag', () => {
  const level = LEVELS[1], original = level.checkpoints;
  level.checkpoints = [{ id: 'air-checkpoint', x: 200, y: 500 }];
  try {
    const state = startRun(createState()); state.x = 200; state.y = 450; state.vy = -100;
    assert.equal(step(state, {}, 0).some(e => e.type === 'checkpoint'), true);
  } finally { level.checkpoints = original; }
});

test('critters do not chase a grounded player on a nearby lower platform', () => {
  const state = startRun(createState()), level = LEVELS[state.level], enemy = state.enemies.find(e => level.platforms[e.platformIndex]?.y < 500);
  assert.ok(enemy, 'expected an elevated critter');
  const lower = level.platforms.find((p, i) => p.kind === 'ground' && i !== enemy.platformIndex && Math.abs((p.x + 20) - enemy.x) <= 400);
  assert.ok(lower, 'expected a lower platform beneath the elevated critter');
  const hazards = level.hazards; level.hazards = [];
  try {
    enemy.patrolDirection = -1; enemy.facing = -1;
    state.x = lower.x + 20; state.y = lower.y; state.grounded = true; state._standingPlatform = level.platforms.indexOf(lower); state._platformX = lower.x; state._platformY = lower.y;
    const before = enemy.x; step(state, {}, .1);
    assert.ok(enemy.x < before, 'nearby lower-platform player must not reverse the elevated critter patrol');
  } finally { level.hazards = hazards; }
});

test('critters do not chase an airborne player even inside the vertical chase band', () => {
  const state = startRun(createState()), level = LEVELS[state.level], enemy = state.enemies.find(e => level.platforms[e.platformIndex]?.kind === 'ground');
  const hazards = level.hazards; level.hazards = [];
  try {
    enemy.patrolDirection = 1; enemy.facing = 1;
    state.x = enemy.x - 100; state.y = 444; state.vy = 0; state.grounded = false; state._standingPlatform = null;
    const before = enemy.x; step(state, {}, .01);
    assert.ok(enemy.x > before, 'airborne player inside range/band must not reverse the ground patrol');
  } finally { level.hazards = hazards; }
});

test('critters chase both directions only when the player is grounded on their platform', () => {
  const state = startRun(createState()), level = LEVELS[state.level], enemy = state.enemies.find(e => { const p = level.platforms[e.platformIndex]; return p?.kind === 'ground' && p.w > 300; });
  const platform = level.platforms[enemy.platformIndex];
  enemy.x = platform.x + 180;
  const hazards = level.hazards; level.hazards = [];
  try {
    state.x = enemy.x + 100; state.y = platform.y; state.grounded = true; state._standingPlatform = enemy.platformIndex; state._platformX = platform.x; state._platformY = platform.y;
    const rightBefore = enemy.x; step(state, {}, .1); assert.ok(enemy.x > rightBefore);
    state.x = enemy.x - 20; state.y = platform.y; state.grounded = true; state._standingPlatform = enemy.platformIndex; state._platformX = platform.x; state._platformY = platform.y;
    const leftBefore = enemy.x; step(state, {}, .1); assert.ok(enemy.x < leftBefore);
  } finally { level.hazards = hazards; }
});

test('losing a chase resumes patrol in its prior direction away from an edge', () => {
  const state = startRun(createState()), level = LEVELS[state.level], enemy = state.enemies.find(e => { const p = level.platforms[e.platformIndex]; return p?.kind === 'ground' && p.w > 300; });
  const platform = level.platforms[enemy.platformIndex];
  enemy.patrolDirection = -1; enemy.facing = -1; enemy.x = platform.x + platform.w - enemy.w - 40;
  const hazards = level.hazards; level.hazards = [];
  try {
    state.x = enemy.x - 100; state.y = platform.y; state.grounded = true; state._standingPlatform = enemy.platformIndex; state._platformX = platform.x; state._platformY = platform.y;
    step(state, {}, .05);
    const afterChase = enemy.x;
    state.x = enemy.x; state.y = 300; state.grounded = false; state._standingPlatform = null;
    step(state, {}, .1);
    assert.ok(enemy.x < afterChase);
    assert.ok(enemy.x >= platform.x + 8 && enemy.x <= platform.x + platform.w - enemy.w - 8);
  } finally { level.hazards = hazards; }
});
