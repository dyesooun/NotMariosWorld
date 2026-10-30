import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step } from '../public/game/engine.js';
import { powerStrength } from '../public/game/powers.js';
import { beginPowerDuel } from '../server/power-duels.js';
import { activePowerEffects, powerUIModel } from '../public/game/power-ui.js';

const run = (effects, config = {}, frames = 120) => {
  const state = createState({ level: 0 });
  for (let i = 0; i < frames; i++) step(state, { right: true }, 1 / 60, { ...config, powerEffects: effects });
  return state.vx;
};

test('power strength defaults and clamps are shared', () => {
  assert.deepEqual(powerStrength({}, 'slow'), { speedPercent: 55 });
  assert.deepEqual(powerStrength({}, 'reverse'), { speedPercent: 100 });
  assert.deepEqual(powerStrength({}, 'slippery'), { speedPercent: 170, gripPercent: 12 });
  assert.deepEqual(powerStrength({}, 'fog'), { darknessPercent: 75 });
  assert.deepEqual(powerStrength({ slowSpeedPercent: -1, reverseSpeedPercent: 999, slipperySpeedPercent: 1, slipperyGripPercent: 999, inkDarknessPercent: 999 }, 'slippery'), { speedPercent: 110, gripPercent: 50 });
});

test('boolean and latched slippery effects use configured strength', () => {
  const normal = run({});
  const slippery = run({ slippery: true });
  const custom = run({ slippery: { strength: { speedPercent: 120, gripPercent: 50 } } });
  assert.equal(normal, 270);
  assert.ok(slippery > normal);
  assert.ok(custom < slippery);
  assert.equal(slippery,459);assert.equal(run({slippery:{strength:{speedPercent:120,gripPercent:50}}},{slipperySpeedPercent:250}),324);
  const coast = createState({ level: 0 }); coast.vx = 270; coast.grounded = true;
  step(coast, {}, 1 / 60, { powerEffects: { slippery: true } });
  assert.ok(coast.vx > 260, 'slippery braking should preserve momentum');
});

test('slow and reverse speed settings affect client prediction', () => {
  assert.ok(run({ slow: true }, { slowSpeedPercent: 40 }) < run({}));
  const reverse = createState({ level: 0 });
  step(reverse, { left: true }, 1 / 60, { powerEffects: { reverse: true }, reverseSpeedPercent: 150 });
  assert.ok(reverse.vx > 0, 'reverse controls invert direction');
});

test('power duel latches strength at turn start', () => {
  const caster = { id: 'caster', connected: true, spawned: true, runId: 'run-a', state: { finished: false }, powerSlots: { 1: { claimed: true, used: false, reserved: 'res', itemId: 'item', power: { type: 'slippery', name: 'Ice Skates', durationMs: 5000 } } } };
  const defender = { id: 'defender', connected: true, spawned: true, runId: 'run-b', state: { finished: false } };
  const room = { status: 'running', settings: { powerDurationSeconds: 5, attackWindowSeconds: 10, defendWindowSeconds: 10, slipperySpeedPercent: 190, slipperyGripPercent: 8 }, powerDuel: null, activePower: null, players: new Map([['caster', caster], ['defender', defender]]) };
  const started = beginPowerDuel(room, { id: 'res', caster, level: 1, itemId: 'item', power: caster.powerSlots[1].power }, { now: 0, random: () => 0 });
  assert.deepEqual(started.duel.entry.power.strength, { speedPercent: 190, gripPercent: 8 });
  room.settings.slipperySpeedPercent = 110;
  assert.deepEqual(started.duel.entry.power.strength, { speedPercent: 190, gripPercent: 8 });
});

test('fog effect preserves custom darkness strength for rendering', () => {
  const active = activePowerEffects({ effects: { fog: { endsAt: 5000, strength: { darknessPercent: 42 } } } }, 1000);
  assert.equal(active.fog.strength.darknessPercent, 42);
  assert.equal(powerUIModel({effects:active},{now:1000}).darkness,.42);
});
