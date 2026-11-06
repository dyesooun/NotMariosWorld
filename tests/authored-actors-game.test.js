import test from 'node:test';
import assert from 'node:assert/strict';
import { LevelRuntime } from '../public/game/json-level/level-runtime.js';
import { validateDocument } from '../public/game/json-level/document.js';
import { LEVELS, startRun, createState, step, getJsonRuntime } from '../public/game/engine.js';
import { documentToLevel } from '../public/game/level-catalog.js';
import { summarizeRun, validateRunSummary } from '../public/game/run-protocol.js';
import { projectileSpawnOffset } from '../public/game/projectiles.js';

export function actorFixture(actorType = 'creature') {
  const animation = (frames, fps = 10, loop = true) => ({ frames, fps, loop });
  const physics = (mode = 'trigger') => ({ mode, collider: [0, 0, 1, 1], hitbox: null, lethal: false, gravity: false, calibration: 'authored' });
  const visual = { assetId: 'atlas', frameId: 'idle', defaultAnimation: 'idle', pivot: [.5, 1], animations: {
    idle: animation(['idle']), moving: animation(['moving']), detected: animation(['detected', 'idle']),
    shooting: { ...animation(['idle', 'shooting', 'idle']), spawn_projectile_at_index: 1 },
    dead: animation(['dead']),
  } };
  const actor = { id: 'actor', name: 'Actor', kind: 'enemy', size: { width: 40, height: 40 }, visual,
    physics: { ...physics(), collider: [.1, .25, .8, .75] }, behavior: { type: 'enemy', actorType,
      states: { idle: 'idle', [actorType === 'shooter' ? 'shooting' : 'moving']: actorType === 'shooter' ? 'shooting' : 'moving', playerDetected: 'detected', dead: 'dead' },
      speed: actorType === 'shooter' ? 0 : 42, detectRange: 100, fireIntervalMs: 4800, projectileDefinitionId: 'bullet', spawnOffset: [.6, -.5] } };
  const bullet = { id: 'bullet', name: 'Bullet', kind: 'projectile', size: { width: 40, height: 40 },
    visual: { assetId: 'atlas', frameId: 'flight', pivot: [.5, .5], defaultAnimation: 'flight', animations: { flight: animation(['flight', 'idle']), impact: animation(['impact', 'dead']) } },
    physics: { ...physics(), collider: [.3, .3, .4, .4] }, behavior: { type: 'projectile', flightAnimation: 'flight', impactAnimation: 'impact', speed: 120, lifetimeMs: 3000 } };
  const floor = { id: 'floor', name: 'Floor', kind: 'platform', size: { width: 600, height: 16 },
    visual: { assetId: 'atlas', frameId: 'idle' }, physics: physics('solid'), behavior: { type: 'static' } };
  const place = (id, definitionId, x, y, width, height, settings = {}) => ({ id, definitionId, x, y, width, height, layer: 0, flipX: false, rotation: 0, settings });
  return { format: 'not-marios-world-level', version: 2, id: 'actor-game', name: 'Actor game fixture', biome: 'test',
    world: { width: 1000, height: 600, backgroundColor: '#102030', spawn: { x: 40, y: 264 } },
    assets: { atlas: { id: 'atlas', src: 'data:image/png;base64,AA==', width: 7, height: 1, frames: Object.fromEntries(['idle', 'moving', 'detected', 'shooting', 'dead', 'flight', 'impact'].map((id, x) => [id, { x, y: 0, w: 1, h: 1 }])) } },
    definitions: { actor, bullet, floor }, placements: [place('floor-left', 'floor', 0, 300, 600, 16), place('floor-right', 'floor', 650, 300, 350, 16), place('critter', 'actor', 400, 260, 40, 40, { supportId: 'floor-left' })] };
}

function run(runtime, seconds, input = {}) {
  const events = [];
  for (let i = 0; i < Math.ceil(seconds * 120); i++) events.push(...runtime.advance(1 / 120, input));
  return events;
}
function put(runtime, x, platform = 'floor-left', y = 264) { Object.assign(runtime.player, { x, y, vx: 0, vy: 0, grounded: true, standingId: platform }); }

test('detected animation plays once despite looping artwork and rearms only on a new encounter', () => {
  const d = actorFixture(), before = JSON.stringify(d), r = new LevelRuntime(d);
  put(r, 330); const events = run(r, .5);
  assert.equal(events.filter(e => e.type === 'actor-state' && e.state === 'playerDetected').length, 1);
  assert.equal(r.getEntityState('critter'), 'moving');
  assert.ok(r._actors.get('critter').x < 400);
  put(r, 40); run(r, .02); put(r, 330);
  assert.equal(run(r, .02).filter(e => e.type === 'actor-state' && e.state === 'playerDetected').length, 1);
  assert.equal(JSON.stringify(d), before);
});

test('creatures patrol safely and chase only on their supporting platform, from either facing', () => {
  const d = actorFixture(); d.definitions.actor.behavior.detectRange = 1000;
  const r = new LevelRuntime(d); put(r, 700, 'floor-right');
  const events = run(r, .4);
  assert.equal(events.some(e => e.type === 'actor-state' && e.state === 'playerDetected'), false);
  assert.equal(r._actors.get('critter').detected, false);
  put(r, 40); run(r, .25);
  const x = r._actors.get('critter').x; run(r, .1);
  assert.ok(r._actors.get('critter').x < x);
  d.definitions.actor.behavior.detectRange = 0;
  const patrol = new LevelRuntime(d); put(patrol, 700, 'floor-right');
  for (let i = 0; i < 1200; i++) {
    patrol.advance(1 / 60); const actor = patrol._actors.get('critter');
    assert.ok(actor.x >= -1e-6 && actor.x + 40 <= 600 + 1e-6);
  }
});

test('stationary shooters detect across platforms and fire once at the selected animation frame', () => {
  const d = actorFixture('shooter'); d.definitions.actor.behavior.detectRange = 1000;
  const r = new LevelRuntime(d); put(r, 700, 'floor-right');
  assert.equal(run(r, .25).filter(e => e.type === 'projectile-spawn').length, 0);
  const events = run(r, .15);
  assert.equal(events.filter(e => e.type === 'projectile-spawn').length, 1);
  assert.equal(r._actors.get('critter').x, 400);
  const shot = [...r._projectiles.values()][0], state = r.getStates().find(e => e.placement.id === shot.id).state;
  assert.equal(state.physics.hitbox[2] * state.width, 16); assert.equal(state.physics.hitbox[3] * state.height, 16);
  assert.equal(state.width, 40, 'retain artwork size independently of collision body');
  assert.equal(run(r, .3).filter(e => e.type === 'projectile-spawn').length, 0);
});

test('authored projectiles aim at the player head at firing time from either side and elevation', () => {
  for (const [x, y] of [[320, 264], [500, 264], [320, 164], [500, 364]]) {
    const r = new LevelRuntime(actorFixture('shooter'));
    put(r, x, null, y);
    r._actorSimulation.spawn(r._actors.get('critter'));
    const shot = [...r._projectiles.values()][0];
    const targetX = x + 14, targetY = y + 9;
    const travelTime = (targetX - shot.x) / shot.vx;
    assert.ok(travelTime > 0);
    assert.ok(Math.abs(shot.y + shot.vy * travelTime - targetY) < 1e-8);
    assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - 120) < 1e-8);
    const velocity = [shot.vx, shot.vy];
    r.player.y += 80;
    r._actorSimulation.stepProjectiles(1 / 120, r.getStates());
    assert.deepEqual([shot.vx, shot.vy], velocity, 'head position is sampled when fired');
  }
});

test('fire interval is measured between emissions and the detection cue does not repeat each shot', () => {
  const d = actorFixture('shooter'); d.definitions.actor.behavior.detectRange = 1000; d.definitions.bullet.behavior.lifetimeMs = 100;
  const r = new LevelRuntime(d); put(r, 700, 'floor-right');
  const events = run(r, 10.2), shots = events.filter(e => e.type === 'projectile-spawn');
  assert.equal(shots.length, 3);
  for (let i = 1; i < shots.length; i++) assert.ok(Math.abs(shots[i].timeMs - shots[i - 1].timeMs - 4800) <= 9);
  assert.equal(events.filter(e => e.type === 'actor-state' && e.state === 'playerDetected').length, 1);
});

test('unconfigured shooters fire clear of their supporting floor in both directions and reach the player', () => {
  for (const flipX of [false, true]) {
    const d = actorFixture('shooter');
    delete d.definitions.actor.behavior.spawnOffset;
    d.placements.find(p => p.id === 'critter').flipX = flipX;
    const before = JSON.stringify(d), r = new LevelRuntime(d);
    put(r, flipX ? 320 : 500);
    const initial = run(r, .45);
    const shot = [...r._projectiles.values()][0];
    assert.ok(shot); assert.equal(shot.phase, 'flight');
    assert.equal(initial.some(e => e.type === 'projectile-impact'), false);
    assert.ok(flipX ? shot.x < 400 : shot.x > 440);
    assert.equal(r.deaths, 0);
    const events = run(r, 1);
    assert.equal(r.deaths, 1);
    assert.ok(events.some(e => e.type === 'death' && e.cause.kind === 'projectile'));
    assert.equal(JSON.stringify(d), before);
  }
});

test('spawn defaults follow the visual pivot while explicit offsets including zero stay authoritative', () => {
  assert.deepEqual(projectileSpawnOffset({ pivot: [.25, .75] }), [.75, -.25]);
  const offset = [0, 0];
  assert.equal(projectileSpawnOffset({ pivot: [.5, 1] }, { spawnOffset: offset }), offset);
});

test('wall impact plays the separate nonlethal sequence once and despawns', () => {
  const d = actorFixture('shooter'); d.definitions.actor.behavior.detectRange = 1000;
  d.definitions.wall = { ...structuredClone(d.definitions.floor), id: 'wall', kind: 'prop' };
  d.placements.push({ id: 'wall', definitionId: 'wall', x: 480, y: 220, width: 10, height: 80, layer: 0, flipX: false, rotation: 0, settings: {} });
  const r = new LevelRuntime(d); put(r, 700, 'floor-right');
  const events = run(r, .62);
  assert.ok(events.some(e => e.type === 'projectile-impact'));
  const shot = [...r._projectiles.values()][0]; assert.ok(shot); assert.equal(shot.phase, 'impact');
  const state = r.getStates().find(e => e.placement.id === shot.id).state;
  assert.equal(state.animation, 'impact'); assert.equal(state.physics.lethal, false);
  run(r, .3); assert.equal(r._projectiles.size, 0);
});

test('stomps use the authored body top and dead actors stop hurting before their sequence finishes', () => {
  const d = actorFixture(); d.definitions.actor.behavior.speed = 0;
  const r = new LevelRuntime(d); put(r, 410, null, 233.75); r.player.grounded = false; r.player.vy = 100;
  const events = run(r, 1 / 120);
  assert.ok(events.some(e => e.type === 'enemy-kill')); assert.equal(r.deaths, 0); assert.ok(r.player.vy < 0);
  const dead = r.getStates().find(e => e.placement.id === 'critter').state;
  assert.equal(dead.actorState, 'dead'); assert.equal(dead.physics.lethal, false); assert.equal(dead.vanished, false);
  run(r, .15); assert.equal(r.getStates().find(e => e.placement.id === 'critter').state.vanished, true);
});

test('actor body contact is harmless, while an authored melee window uses only its hazard region', () => {
  const safeCreature = actorFixture(); safeCreature.definitions.actor.behavior.speed = 0;
  safeCreature.definitions.actor.physics.lethal = true;
  safeCreature.definitions.actor.physics.hitbox = [0, 0, 1, 1];
  const safe = new LevelRuntime(safeCreature); put(safe, 410); run(safe, .2);
  assert.equal(safe.deaths, 0, 'creature body contact must not be an implicit attack');

  safeCreature.definitions.actor.visual.animations.detected.damage_active_indices = [];
  const emptyWindow = new LevelRuntime(safeCreature); put(emptyWindow, 410); run(emptyWindow, .2);
  assert.equal(emptyWindow.deaths, 0, 'empty attack windows must stay harmless despite authored lethal geometry');

  const melee = actorFixture();
  melee.definitions.actor.behavior.speed = 0;
  melee.definitions.actor.visual.animations.detected = { frames: ['detected', 'shooting', 'idle'], fps: 10, loop: false, damage_active_indices: [1] };
  melee.definitions.actor.physics.hazardShapes = [{ kind: 'rect', rect: [1, .25, .5, .5] }];
  const runtime = new LevelRuntime(melee); put(runtime, 445);
  run(runtime, .05);
  assert.equal(runtime.deaths, 0, 'telegraph frame must be harmless');
  run(runtime, .08);
  assert.equal(runtime.deaths, 1, 'only the authored active melee frame should hurt');

  const outside = new LevelRuntime(melee); put(outside, 410); run(outside, .2);
  assert.equal(outside.deaths, 0, 'the attack region must not be replaced by the body collider');

  melee.definitions.actor.physics.hazardShapes = null;
  melee.definitions.actor.physics.hitbox = [1, .25, .5, .5];
  const hitbox = new LevelRuntime(melee); put(hitbox, 445); run(hitbox, .15);
  assert.equal(hitbox.deaths, 1, 'an authored melee hitbox works independently of the body collider');
  const outsideHitbox = new LevelRuntime(melee); put(outsideHitbox, 410); run(outsideHitbox, .2);
  assert.equal(outsideHitbox.deaths, 0, 'body overlap outside the explicit melee hitbox stays safe');
});

test('authored attack timing follows rendered frames and cannot retain a final-frame hitbox', () => {
  const d = actorFixture();
  d.definitions.actor.visual.animations.detected = { frames: ['detected', 'shooting'], fps: 10, loop: true, damage_active_indices: [0] };
  const r = new LevelRuntime(d), actor = r._actors.get('critter');
  r._actorSimulation.transition(actor, 'playerDetected', false);
  assert.equal(r.getStatesAt(0).find(e => e.placement.id === 'critter').state.damageActive, true);
  assert.equal(r.getStatesAt(199).find(e => e.placement.id === 'critter').state.damageActive, false, 'recovery frame is harmless');
  assert.equal(r.getStatesAt(200).find(e => e.placement.id === 'critter').state.damageActive, false, 'looping artwork must not loop the one-shot attack window');

  const oneShot = actorFixture();
  oneShot.definitions.actor.visual.animations.detected = { frames: ['detected', 'shooting'], fps: 10, loop: false, damage_active_indices: [1] };
  const oneShotRuntime = new LevelRuntime(oneShot), oneShotActor = oneShotRuntime._actors.get('critter');
  oneShotRuntime._actorSimulation.transition(oneShotActor, 'playerDetected', false);
  assert.equal(oneShotRuntime.getStatesAt(100).find(e => e.placement.id === 'critter').state.damageActive, true);
  assert.equal(oneShotRuntime.getStatesAt(200).find(e => e.placement.id === 'critter').state.damageActive, false, 'clamped final frame must be harmless after completion');

  oneShotRuntime._actorSimulation.transition(oneShotActor, 'moving', false);
  oneShotActor.stateName = 'detected';
  assert.equal(oneShotRuntime.getStatesAt(200).find(e => e.placement.id === 'critter').state.damageActive, false, 'non-looping melee also expires in a movement slot');

  d.definitions.actor.visual.animations.moving = { frames: ['moving', 'shooting'], fps: 10, loop: true, damage_active_indices: [1] };
  const looping = new LevelRuntime(d);
  assert.equal(looping.getStatesAt(300).find(e => e.placement.id === 'critter').state.damageActive, true, 'explicit looping attack windows repeat with the visible frames');
  assert.equal(looping.getStatesAt(400).find(e => e.placement.id === 'critter').state.damageActive, false);
});

test('shooter body contact is harmless when no projectile or melee window is authored', () => {
  const d = actorFixture('shooter'); d.definitions.actor.behavior.detectRange = 0;
  const r = new LevelRuntime(d); put(r, 410); run(r, .25);
  assert.equal(r.deaths, 0);
});

test('projectiles kill instantly and respawn clears fired objects and restores actors', () => {
  const d = actorFixture('shooter'); const r = new LevelRuntime(d); put(r, 470);
  const events = run(r, 1);
  assert.equal(r.deaths, 1); assert.ok(events.some(e => e.type === 'death' && e.cause.kind === 'projectile'));
  run(r, 3.1); assert.equal(r.deadRemainingMs, 0); assert.equal(r._projectiles.size, 0);
  assert.equal(r._actors.get('critter').dead, false); assert.equal(r._actors.get('critter').detected, false);
});

test('the authored game bridge records a stomp without putting runtime state into reports', t => {
  const d = actorFixture(); d.definitions.actor.behavior.speed = 0;
  assert.deepEqual(validateDocument(d), []);
  const previous = LEVELS[1]; LEVELS[1] = documentToLevel(d, 1, { theme: 'forest' }); t.after(() => { LEVELS[1] = previous; });
  const state = startRun(createState()), runtime = getJsonRuntime(state);
  put(runtime, 410, null, 233.75); runtime.player.grounded = false; runtime.player.vy = 100;
  assert.ok(step(state, {}, 1 / 60).some(e => e.type === 'enemyKill')); assert.equal(state.enemyKills, 1);
  assert.ok(validateRunSummary(summarizeRun(state), state.worldOrder));
  assert.ok(JSON.stringify(state).length < 6000); assert.doesNotThrow(() => structuredClone(state));
});
