import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { LocalRunRuntime, FIXED_STEP_SECONDS, MAX_CATCHUP_STEPS } from '../public/game/local-run.js';
import { activePowerEffects } from '../public/game/power-ui.js';
import { isDuelFrozen } from '../public/game/client-state.js';

// Exercise the actual browser scheduler without loading artwork or a DOM.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const scheduler = app.slice(app.indexOf('function advanceLocalSimulation(){'), app.indexOf('\nfunction frame('));
const maxElapsed = FIXED_STEP_SECONDS * MAX_CATCHUP_STEPS;

function fixture({ running = false, endsAt = 600000 } = {}) {
  let context;
  const runtime = new LocalRunRuntime({ profile: { level: 0 }, roundId: 'round', runId: 'run', now: () => context?.clock ?? 0 });
  if (running) runtime.begin([3, 1, 2]);
  const me = { id: 'player', spawned: true, effects: {} };
  context = createContext({
    clock: 0, serverNow: () => context.clock, role: 'player', you: me.id,
    localRun: runtime, room: { players: [me], status: running ? 'running' : 'lobby', settings: {}, roundId: 'round', endsAt },
    connected: true, runtimeError: null, finalSentRound: null, simulationCursor: 0,
    FIXED_STEP_SECONDS, MAX_CATCHUP_STEPS, activePowerEffects, isDuelFrozen,
    localFinalizing: false, performance: { now: () => 0 },
    closeModal() {}, zeroInput() { runtime.setInput({}); }, playTone() {}, renderRoom() {},
    finalizeLocal(at) { runtime.pause(true); runtime.finalReport(at); context.finalSentRound = 'round'; },
  });
  runInContext(scheduler, context);
  return { runtime, me, context, advance(at) { context.clock = at; context.advanceLocalSimulation(); } };
}

test('minutes of suspended callbacks cannot create accelerated catchup frames', () => {
  const { runtime, context, advance } = fixture();
  advance(300000);
  assert.ok(runtime.state.elapsed <= maxElapsed + 1e-9);
  assert.equal(context.simulationCursor, 300000, 'discard the backlog in the first callback');
  const resumedAt = runtime.state.elapsed;
  for (let frame = 1; frame <= 60; frame++) advance(300000 + frame * 1000 / 60);
  assert.ok(Math.abs(runtime.state.elapsed - resumedAt - 1) < FIXED_STEP_SECONDS + 1e-9, 'subsequent frames run at normal speed');
});

test('repeated throttled callbacks each discard their physics backlog', () => {
  const { runtime, context, advance } = fixture();
  for (let i = 1; i <= 5; i++) advance(i * 60000);
  assert.ok(runtime.state.elapsed <= 5 * maxElapsed + 1e-9);
  assert.equal(context.simulationCursor, 300000);
});

test('recovery uses current power deadlines and expires wall-clock respawns', () => {
  const { runtime, me, advance } = fixture({ running: true });
  me.effects = { slow: { endsAt: 5000 } };
  Object.assign(runtime.state, { deadUntil: 3, respawnRemaining: 3 });
  runtime.respawnWallDeadline = 3000;
  advance(300000);
  assert.equal(runtime.settings.powerEffects.slow, undefined);
  assert.equal(runtime.state.respawnRemaining, 0);
  assert.equal(runtime.respawnWallDeadline, null);
});

test('returning after expiry finalizes at the shared cutoff without replaying the round', () => {
  const { runtime, context, advance } = fixture({ running: true, endsAt: 5000 });
  runtime.state.current = 25;
  advance(300000);
  assert.ok(runtime.state.elapsed <= maxElapsed + 1e-9);
  assert.equal(context.simulationCursor, 5000);
  assert.equal(runtime.finalReportValue.at, 5000);
  assert.equal(runtime.finalReportValue.summary.current, 25);
  assert.equal(context.localFinalizing, true);
  const elapsed = runtime.state.elapsed;
  advance(300100);
  assert.equal(runtime.state.elapsed, elapsed);
});
