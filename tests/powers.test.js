import test from 'node:test';
import assert from 'node:assert/strict';
import { POWER_DEFINITIONS, collectPower, activatePower, powerEffects, resetPowerInventory, reservePower, releasePowerReservation } from '../public/game/powers.js';

const player = (id, level = 1) => ({ id, name: id, connected: true, spawned: true, state: { level, deadUntil: 0, finished: false }, effects: {} });

test('collects one deterministic power per level and preserves it until use', () => {
  const p = player('caster');
  const event = collectPower(p, 1, () => 0);
  assert.equal(event.type, 'powerCollected');
  assert.equal(event.power.type, POWER_DEFINITIONS[0].type);
  assert.equal(p.powerSlots[1].claimed, true);
  assert.equal(collectPower(p, 1, () => .9), null);
});

test('activation excludes caster, supports random/all, and expires at five seconds', () => {
  const caster = player('caster'), target = player('target'), room = { status: 'running', players: new Map([[caster.id, caster], [target.id, target]]) };
  collectPower(caster, 1, () => 0); // type slow, then random target
  assert.equal(activatePower(room, caster, { now: 100, random: () => .1 }).ok, true);
  assert.equal(target.effects.slow.endsAt, 5100);
  assert.equal(powerEffects(target, 5099).slow.type, 'slow');
  assert.equal(powerEffects(target, 5100).slow, undefined);
  assert.equal(caster.effects.slow, undefined);
});

test('no target does not consume a held power and full reset clears inventory', () => {
  const caster = player('caster');
  const room = { status: 'running', players: new Map([[caster.id, caster]]) };
  collectPower(caster, 1, () => 0);
  assert.equal(activatePower(room, caster).code, 'NO_TARGET');
  assert.equal(caster.powerSlots[1].used, false);
  resetPowerInventory(caster);
  assert.equal(caster.powerSlots[1], undefined);
  assert.equal(caster.power, null);
});

test('all-target power excludes caster and ineligible opponents', () => {
  const caster = player('caster'), ready = player('ready'), disconnected = player('offline'), unspawned = player('unspawned'), finished = player('finished');
  disconnected.connected = false; unspawned.spawned = false; finished.state.finished = true;
  const room = { status: 'running', players: new Map([].concat([caster, ready, disconnected, unspawned, finished].map(p => [p.id, p]))) };
  collectPower(caster, 1, () => 0.01); // type slow, all target
  caster.powerSlots[1].power.target = 'all'; caster.power.power.target = 'all';
  const result = activatePower(room, caster, { now: 50 });
  assert.deepEqual(result.targets.map(p => p.id), ['ready']);
  assert.equal(caster.powerSlots[1].used, true);
});

test('next level gets a fresh slot while the prior slot remains used', () => {
  const p = player('runner');
  collectPower(p, 1, () => 0);
  p.powerSlots[1].used = true;
  p.state.level = 2;
  assert.equal(p.powerSlots[2], undefined);
  collectPower(p, 2, () => .25);
  assert.equal(p.powerSlots[1].used, true);
  assert.equal(p.powerSlots[2].claimed, true);
});

test('all powers last five seconds and direct activation cannot overlap an active power',()=>{
  assert.ok(POWER_DEFINITIONS.every(power=>power.durationMs===5000));
  const first=player('first'),second=player('second'),room={status:'running',players:new Map([[first.id,first],[second.id,second]])};
  collectPower(first,1,()=>0);collectPower(second,1,()=>.25);
  assert.equal(activatePower(room,first,{now:100}).ok,true);
  assert.equal(activatePower(room,second,{now:5099}).ok,false);
  assert.equal(second.powerSlots[1].used,false);
  assert.equal(activatePower(room,second,{now:5100}).ok,true);
  assert.equal(room.activePower.endsAt,10100);
});

test('reservations reject duplicate and stale requests while preserving current-level inventory',()=>{
  const caster=player('caster'),target=player('target'),room={status:'running',players:new Map([[caster.id,caster],[target.id,target]])};
  collectPower(caster,1,()=>0);
  const reservation=reservePower(room,caster,{now:0});assert.equal(reservation.ok,true);
  assert.equal(reservePower(room,caster,{now:1}).ok,false);
  assert.equal(activatePower(room,caster,{now:2,force:true,reservation:{...reservation,id:'stale'}}).ok,false);
  caster.state.level=2;collectPower(caster,2,()=>.99);
  caster.state.deadUntil=100;
  assert.equal(activatePower(room,caster,{now:3,force:true,reservation}).ok,true);
  assert.equal(caster.power.level,2);assert.equal(caster.power.power.type,'fog');assert.equal(caster.power.used,false);
  assert.equal(caster.powerSlots[1].used,true);
  const held=player('held');collectPower(held,1,()=>0);const heldRoom={status:'running',players:new Map([[held.id,held],[target.id,target]])};
  const unused=reservePower(heldRoom,held);releasePowerReservation(unused);
  assert.equal(held.powerSlots[1].used,false);assert.equal(held.powerSlots[1].reserved,null);
});
