import test from 'node:test';
import assert from 'node:assert/strict';
import { LevelRuntime } from '../public/game/json-level/level-runtime.js';
import { supportSurfaces, connectedSupportRun } from '../public/game/json-level/actor-support.js';

const frameNames = ['idle', 'move', 'detect', 'attack', 'dead'];
const anim = (frames, loop = true, damage = false) => ({ frames, fps: 10, loop, ...(damage ? { damage_active_indices: [0] } : {}) });
function fixture({ lethal = true, supportIds, attackCooldownMs = 100, noAttack = false, flying = false } = {}) {
  const visual = { assetId: 'a', frameId: 'idle', defaultAnimation: 'idle', pivot: [.5, 1], animations: {
    idle: anim(['idle']), moving: anim(['move']), detected: anim(['detect']), attack: anim(['attack'], false, true), dead: anim(['dead'], false),
  }};
  const actor = { id: 'actor', name: 'Critter', kind: 'enemy', size: { width: 40, height: 40 }, visual,
    physics: { mode: 'trigger', collider: [.1, .25, .8, .75], hitbox: null, hazardShapes: [{ kind: 'rect', rect: [1, .25, .5, .5] }], lethal, gravity: false, calibration: 'authored' },
    behavior: { type: 'enemy', actorType: 'creature', states: { idle: 'idle', moving: 'moving', playerDetected: 'detected', ...(noAttack ? {} : { attack: 'attack' }), dead: 'dead' }, speed: 30, detectRange: 120, attackRange: 64, attackCooldownMs, flying, ...(supportIds ? { supportIds } : {}) } };
  const platform = (id, x, width, y = 300, settings = {}) => ({ id, definitionId: 'platform', x, y, width, height: 16, layer: 0, flipX: false, rotation: 0, settings });
  return { format: 'not-marios-world-level', version: 2, id: 'combat', name: 'combat', biome: 'test', world: { width: 1200, height: 600, backgroundColor: '#102030', spawn: { x: 40, y: 264 } },
    assets: { a: { id: 'a', src: 'data:image/png;base64,AA==', width: 5, height: 1, frames: Object.fromEntries(frameNames.map((id, x) => [id, { x, y: 0, w: 1, h: 1 }])) } },
    definitions: { actor, platform: { id: 'platform', name: 'Platform', kind: 'platform', size: { width: 100, height: 16 }, visual: { assetId: 'a', frameId: 'idle' }, physics: { mode: 'solid', collider: [0, 0, 1, 1], hitbox: null, lethal: false, gravity: false, calibration: 'authored' }, behavior: { type: 'static' } } },
    placements: [platform('a', 0, 500), platform('b', 508, 300), { id: 'actor', definitionId: 'actor', x: 400, y: 260, width: 40, height: 40, layer: 1, flipX: false, rotation: 0, settings: {} }],
  };
}
const put = (r, x, standingId = 'a') => Object.assign(r.player, { x, y: 264, vx: 0, vy: 0, grounded: true, standingId });
const run = (r, seconds) => { const events = []; for (let i = 0; i < Math.ceil(seconds * 120); i++) events.push(...r.advance(1 / 120)); return events; };

test('creature emits recurring attack states after cooldown and does not cancel recovery on detection loss', () => {
  const r = new LevelRuntime(fixture({ lethal: false })); put(r, 445); const events = run(r, .05);
  put(r, 200); events.push(...run(r, .4)); put(r, 445); events.push(...run(r, .6));
  assert.ok(events.filter(e => e.type === 'actor-state' && e.state === 'attack').length >= 2);
});

test('melee is lethal only during active authored strike geometry', () => {
  const r = new LevelRuntime(fixture({ lethal: true })); put(r, 445); run(r, .2);
  assert.equal(r.deaths, 1);
  const safe = new LevelRuntime(fixture({ lethal: false })); put(safe, 445); run(safe, .2); assert.equal(safe.deaths, 0);
  const outside = new LevelRuntime(fixture({ lethal: true })); put(outside, 470); run(outside, .2); assert.equal(outside.deaths, 0);
});

test('selected support chain crosses only a small seam and no-support actors remain unsnapped', () => {
  const chain = new LevelRuntime(fixture({ lethal: false, supportIds: ['a', 'b'], noAttack: true }));
  const actor = chain._actors.get('actor'); assert.deepEqual([...new Set(actor.supportGroup.map(s => s.id))].sort(), ['a', 'b']);
  put(chain, 520, 'b'); run(chain, 4); assert.equal(actor.supportId, 'b');
  const free = fixture({ lethal: false }); free.placements.find(p => p.id === 'actor').x = 700; free.placements.find(p => p.id === 'actor').y = 100;
  const freeRuntime = new LevelRuntime(free); assert.equal(freeRuntime._actors.get('actor').supportId, null);
});

test('an attack locks facing and completes recovery after the target leaves detection', () => {
  const d = fixture({ lethal: false });
  d.definitions.actor.behavior.states.playerDetected = null;
  d.definitions.actor.behavior.speed = 0;
  d.definitions.actor.visual.animations.attack = { frames: ['detect', 'attack', 'idle'], fps: 10, loop: true, damage_active_indices: [1] };
  const r = new LevelRuntime(d); put(r, 445); run(r, .05);
  const actor = r._actors.get('actor'), facing = actor.facing, start = actor.animationStartMs;
  assert.equal(actor.state, 'attack');
  put(r, 100); run(r, .1);
  assert.equal(actor.state, 'attack'); assert.equal(actor.facing, facing); assert.equal(actor.animationStartMs, start);
  run(r, .2);
  assert.notEqual(actor.state, 'attack'); assert.ok(actor.attackCooldownAtMs > r.timeMs);
  put(r, 445);
  assert.ok(run(r, .3).some(e => e.type === 'actor-state' && e.state === 'attack'));
});

test('crossing onto a moving support never applies the old carrier origin as a movement delta', () => {
  const d = fixture({ lethal: false, supportIds: ['a', 'b'], noAttack: true });
  d.definitions.actor.behavior.states.playerDetected = null;
  d.definitions.actor.behavior.detectRange = 1000;
  d.placements.find(p => p.id === 'actor').x = 470;
  const platform = d.placements.find(p => p.id === 'b'); platform.x = 500;
  platform.settings.motion = { axis: 'x', distance: 6, periodMs: 2000, phaseMs: 0 };
  const r = new LevelRuntime(d), actor = r._actors.get('actor'); put(r, 720, 'b');
  for (let i = 0; i < 240; i++) { const previousX = actor.x; r.advance(1 / 120); assert.ok(Math.abs(actor.x - previousX) < 2, 'carrier switch must not teleport'); }
  assert.equal(actor.supportId, 'b'); assert.ok(actor.x > 520 && actor.x < 630);
});

test('a vanished current support cannot snap the creature to a distant surviving component', () => {
  const d = fixture({ lethal: false, supportIds: ['a', 'b'], noAttack: true });
  d.definitions.actor.behavior.speed = 0;
  d.placements.find(p => p.id === 'actor').x = 650;
  d.placements.find(p => p.id === 'b').settings.vanish = { triggerVolume: [0, -1, 1, 1], countdownMs: 10 };
  const r = new LevelRuntime(d), actor = r._actors.get('actor');
  r.permanentGone.add('b'); run(r, .025);
  assert.equal(actor.x, 650); assert.equal(actor.supportVisible, false);
});

test('support connectivity uses upper surfaces and joins a slope at its endpoint', () => {
  const entry = (id, x, y, width, height, solidShapes) => ({ placement: { id }, state: {
    definition: { kind: 'platform' }, x, y, width, height, rotation: 0, visual: {},
    physics: { mode: 'solid', collider: [0, 0, 1, 1], solidShapes },
  } });
  const entries = [entry('ramp', 0, 250, 100, 50, [{ kind: 'polygon', points: [[0, 1], [1, 0], [1, 1]] }]), entry('top', 100, 250, 100, 16), entry('lower', 100, 290, 100, 16)];
  const surfaces = supportSurfaces(entries, ['ramp', 'top', 'lower']);
  const run = connectedSupportRun(surfaces, { x: 40, y: 240, footOffset: 40, placement: { width: 20, height: 40 } }, { initial: true });
  assert.deepEqual([...new Set(run.map(s => s.id))].sort(), ['ramp', 'top']);
  assert.equal(surfaces.some(s => s.id === 'top' && s.y1 > 250), false, 'bottom edges must not masquerade as supports');
});

test('flying creatures survive vanished supports while grounded creatures retain hidden behavior', () => {
  const flyingDoc = fixture({ lethal: false, flying: true, supportIds: ['a'], noAttack: true });
  flyingDoc.placements.find(p => p.id === 'a').settings.vanish = { triggerVolume: [0, -1, 1, 1], countdownMs: 1, restoreMode: 'timed', restoreMs: 200 };
  const flying = new LevelRuntime(flyingDoc);
  const actor = flying._actors.get('actor'); put(flying, 445); run(flying, .1);
  const before = actor.x, altitude = actor.y;
  flying.triggerTimes.set('a', flying.timeMs); run(flying, .15);
  assert.equal(flying.getStates().find(entry => entry.placement.id === 'a').state.vanished, true);
  const state = flying.getStates().find(entry => entry.placement.id === 'actor').state;
  assert.equal(actor.dead, false); assert.notEqual(state.vanished, true); assert.equal(actor.supportLost, true);
  assert.notEqual(actor.x, before, 'flight patrol continues without live support'); assert.equal(actor.y, altitude);
  for (let i = 0; i < 20; i++) { const previousX = actor.x; flying.advance(1 / 120); assert.ok(Math.abs(actor.x - previousX) < 2); }
  assert.equal(flying.getStates().find(entry => entry.placement.id === 'a').state.vanished, false);
  assert.equal(actor.supportLost, false); assert.equal(actor.y, altitude);
  flying.reset(); assert.equal(flying._actors.get('actor').cachedSupportGroup, null);

  const groundedDoc = fixture({ lethal: false, supportIds: ['a'], noAttack: true });
  groundedDoc.placements.find(p => p.id === 'a').settings.vanish = { triggerVolume: [0, -1, 1, 1], countdownMs: 1, restoreMode: 'permanent' };
  const grounded = new LevelRuntime(groundedDoc);
  run(grounded, .1); grounded.permanentGone.add('a'); run(grounded, .2);
  const groundedState = grounded.getStates().find(entry => entry.placement.id === 'actor').state;
  assert.equal(groundedState.vanished, true);
});
