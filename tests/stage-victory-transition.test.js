import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Extract the production function so these tests exercise the browser callback
// and its identity/cutoff guards without loading the DOM, renderer, or audio.
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const playStageVictory = app.slice(
  app.indexOf('function playStageVictory(level) {'),
  app.indexOf('\nfunction updateMusicScene()'),
);
const transitionViewport = app.slice(
  app.indexOf('async function transitionViewport(changeScene){'),
  app.indexOf('\nfunction playStageVictory(level) {'),
);

function fixture({ packet, packetTiming = 'closing', replacement = false } = {}) {
  let resolveVictory;
  const victory = new Promise(resolve => { resolveVictory = resolve; });
  const advances = [];
  const events = [];
  let context;
  const run = {
    state: { stageTransition: { from: 1, to: 2 } },
    advanceStage(options) { advances.push({ options, applying: context.sceneTransitionApplying }); this.state.stageTransition = null; },
  };
  context = createContext({
    stageVictory: null,
    localRun: run,
    pendingRoomState: null,
    sceneTransitionActive: false,
    sceneTransitionApplying: false,
    irisTransition: null,
    SCENE_TRANSITION_DURATION: 1,
    connected: true,
    runtimeError: null,
    simulationCursor: 0,
    room: { status: 'running', endsAt: 1000, roundId: 'round-1', players: [] },
    serverNow: () => 100,
    sceneForLevel: () => 'forest',
    ceremony: () => false,
    zeroInput() {},
    advanceLocalSimulation() {},
    renderRoom() { if (advances.length && advances.at(-1).renderApplying === undefined) advances.at(-1).renderApplying = context.sceneTransitionApplying; },
    paintCurrentScene() {},
    updateMusicScene() {},
    cancelStageVictory() { context.stageVictory = null; },
    audio: { setScene() {}, cancelVictory() {}, playVictory() { return victory; } },
    $() { return {}; },
    coinAttackControls: { close() {} },
    irisTransitionFor() {
      return {
        async run(callback) {
          await callback();
          if (packetTiming === 'opening' && packet) context.pendingRoomState = packet;
        },
        retarget() {},
      };
    },
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { callback(); },
    onMessage(message) {
      events.push({ message, applying: context.sceneTransitionApplying });
      if (message.room.status !== 'running' || replacement) {
        context.room = message.room;
        if (replacement) context.localRun = { state: { stageTransition: null } };
        return;
      }
      context.room = message.room;
      // Model the coordinator's attack/defense snapshot: it updates the room
      // while preserving the active local run and its unanswered quiz.
      context.room.players = [{ powerQuiz: message.powerQuiz }];
    },
  });
  if (packetTiming === 'closing') context.pendingRoomState = packet;
  runInContext(transitionViewport, context);
  runInContext(playStageVictory, context);
  runInContext('playStageVictory(1);', context);
  return { context, resolveVictory, advances, events, run };
}

async function finish(fixtureState) {
  fixtureState.resolveVictory();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('reconciles a same-round attack snapshot at full black and advances once', async () => {
  const state = fixture({ packet: {
    room: { status: 'running', endsAt: 1000, roundId: 'round-1' },
    powerQuiz: { transactionId: 'duel-1', id: 'quiz-1', answered: false },
  } });
  assert.equal(state.advances.length, 0);
  await finish(state);
  assert.equal(state.advances.length, 1);
  assert.equal(state.advances[0].applying, true);
  assert.equal(state.advances[0].renderApplying, true);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].applying, true);
  assert.deepEqual(state.context.room.players[0].powerQuiz, { transactionId: 'duel-1', id: 'quiz-1', answered: false });
  assert.equal(state.run.state.stageTransition, null);
});

test('does not double-advance when a coordinator packet arrives while the iris opens', async () => {
  const state = fixture({ packetTiming: 'opening', packet: {
    room: { status: 'running', endsAt: 1000, roundId: 'round-1' },
    powerQuiz: { transactionId: 'duel-2', id: 'quiz-2', answered: false },
  } });
  assert.equal(state.advances.length, 0);
  await finish(state);
  assert.equal(state.advances.length, 1);
  assert.equal(state.context.room.players[0].powerQuiz.id, 'quiz-2');
});

test('suppresses an old stage advance for terminal cutoff and replacement runs', async () => {
  const ended = fixture({ packet: { room: { status: 'settling', endsAt: 100, roundId: 'round-1' } } });
  await finish(ended);
  assert.equal(ended.advances.length, 0);

  const replaced = fixture({ replacement: true, packet: {
    room: { status: 'running', endsAt: 1000, roundId: 'round-2' },
  } });
  await finish(replaced);
  assert.equal(replaced.advances.length, 0);
});
