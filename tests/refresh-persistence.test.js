import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRunRuntime } from '../public/game/local-run.js';
import { getJsonRuntime } from '../public/game/engine.js';
import { LEVELS } from '../public/game/levels.js';

const make = () => new LocalRunRuntime({ roundId: 'refresh-round', runId: 'refresh-run',
  settings: { worldOrder: [1, 2] }, now: () => 1000, deferStageTransition: true });
const save = run => JSON.parse(JSON.stringify(run.exportSession()));

test('refresh restores authored collection, checkpoint, carrier clocks and actor state without embedding artwork', () => {
  const original = make(); original.begin([1, 2]);
  const runtime = getJsonRuntime(original.state);
  assert.ok(runtime, 'fixture uses the production authored forest');
  runtime.timeMs = 1234; runtime._motionEpochMs = 321;
  runtime.player.x = 400; runtime.player.vx = 91;
  runtime.collected.add('saved-coin'); runtime.coins = 1;
  runtime.collectedAtMs.set('saved-coin', 900);
  runtime.claimedChests.set('saved-chest', 950);
  runtime.checkpoint = { id: 'saved-checkpoint', order: 1, x: 300, y: 200, coins: 1, collected: ['saved-coin'], farthestX: 250, progress: .1 };
  runtime.reachedCheckpoints.add('saved-checkpoint');
  runtime.triggerTimes.set('saved-platform', 700);
  const actor = runtime._actors.values().next().value;
  assert.ok(actor); actor.x += 50; actor.nextFireAtMs = 4000;
  runtime._actorSimulation.sequence = 19;
  const projectileDefinition = Object.entries(runtime.document.definitions).find(([, definition]) => definition.kind === 'projectile');
  if (projectileDefinition) {
    const [definitionId, definition] = projectileDefinition;
    runtime._projectiles.set('saved-shot', { id: 'saved-shot', definitionId, definition, x: 30, y: 40,
      vx: 2, vy: 3, rotation: 0, width: 12, height: 12, lifeMs: 300, phase: 'flight', stateName: null, animationStartMs: 1000 });
  }
  const snapshot = save(original), restored = make();
  assert.equal(restored.restoreSession(snapshot, { minimumSeq: 50, serverNow: 9000 }), true);
  const recovered = getJsonRuntime(restored.state);
  assert.deepEqual(recovered.exportSession(), runtime.exportSession());
  assert.equal(recovered.document, LEVELS[1].jsonDocument);
  assert.equal(recovered._actors.get(actor.id).definition, runtime.document.definitions[actor.placement.definitionId]);
  assert.equal(restored.seq, 50);
  assert.deepEqual(restored.input, { left: false, right: false, jump: false });
  assert.equal(recovered.timeMs, 1234, 'offline time does not advance terrain or actors');
  assert.equal(JSON.stringify(snapshot).includes('data:image'), false);
  assert.equal(Object.hasOwn(snapshot.engine.runtime, 'document'), false);
});

test('refresh retains cutoff history and pending stage transition, rejects a different run or missing runtime', () => {
  const original = make(); original.begin([1, 2]);
  original.state.stageTransition = { from: 1, to: 2 };
  original.state.banked = 77;
  original._recordLocalSummary(1100);
  const snapshot = save(original), restored = make();
  assert.equal(restored.restoreSession(snapshot), true);
  assert.deepEqual(restored.state.stageTransition, { from: 1, to: 2 });
  assert.deepEqual(restored.history, original.history);
  const priorState = restored.state;
  assert.equal(restored.restoreSession({ ...snapshot, runId: 'another-run' }), false);
  assert.equal(restored.state, priorState);
  snapshot.engine.runtime = null;
  assert.equal(restored.restoreSession(snapshot), false);
  assert.equal(restored.state, priorState);
});

test('refresh keeps death deadline while restoring expired deaths without replaying physics', () => {
  const original = make(); original.begin([1, 2]);
  const runtime = getJsonRuntime(original.state);
  runtime.deadRemainingMs = 3000; runtime.deaths = 1;
  original.state.deadUntil = original.state.elapsed + 3;
  original.state.respawnRemaining = 3; original.respawnWallDeadline = 4000;
  const snapshot = save(original), partial = make(), expired = make();
  assert.equal(partial.restoreSession(snapshot, { serverNow: 2500 }), true);
  assert.equal(partial.state.respawnRemaining, 1.5);
  assert.equal(getJsonRuntime(partial.state).deadRemainingMs, 1500);
  assert.equal(expired.restoreSession(snapshot, { serverNow: 5000 }), true);
  assert.equal(expired.state.respawnRemaining, 0);
  assert.equal(getJsonRuntime(expired.state).deadRemainingMs, 0);
  assert.equal(expired.state.x, runtime.spawn.x + runtime.player.width / 2);
});

test('corrupt transition, checkpoint, particles and runtime collections fail without replacing the live run', () => {
  const original = make(); original.begin([1, 2]);
  original.state.checkpoint = { id: 'checkpoint', x: 200, y: 300, current: 10, coins: 1,
    collected: ['coin'], progress: .1, distanceMax: 100 };
  getJsonRuntime(original.state).checkpoint = { id: 'checkpoint', order: 1, x: 186, y: 264,
    coins: 1, collected: ['coin'], farthestX: 100, progress: .1 };
  const snapshot = save(original), restored = make();
  assert.equal(restored.restoreSession(snapshot), true, 'both legitimate checkpoint schemas remain supported');
  const currentState = restored.state;
  const corruptions = [
    value => { value.engine.state.stageTransition = { from: 1, to: 999 }; },
    value => { value.engine.state.stageTransition = { from: 2, to: 2 }; },
    value => { value.engine.state.checkpoint.collected = null; },
    value => { delete value.engine.state.checkpoint.distanceMax; },
    value => { value.engine.state._particles = null; },
    value => { value.engine.state._particles = [{}]; },
    value => { delete value.engine.state._platformX; },
    value => { delete value.engine.runtime.values.checkpoint.farthestX; },
    value => { value.engine.runtime.maps.triggerTimes = [['platform', {}]]; },
    value => { value.engine.runtime.maps._entities = [['actor', {}]]; },
    value => { value.engine.runtime.sets.collected = [null]; },
  ];
  for (const corrupt of corruptions) {
    const value = JSON.parse(JSON.stringify(snapshot)); corrupt(value);
    assert.equal(restored.restoreSession(value), false);
    assert.equal(restored.state, currentState);
  }
});
