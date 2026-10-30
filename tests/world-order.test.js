import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { LEVELS, createState, startRun, step, score } from '../public/game/engine.js';
import { DEFAULT_WORLD_ORDER, normalizeWorldOrder, worldOrdinal } from '../public/game/world-order.js';
import { createGameServer } from '../server/index.js';

function receive(ws, predicate = () => true) {
  const found = ws._inbox.findIndex(predicate);
  if (found >= 0) return Promise.resolve(ws._inbox.splice(found, 1)[0]);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), 2500);
    const check = () => {
      const index = ws._inbox.findIndex(predicate);
      if (index < 0) return;
      clearTimeout(timer); ws.off('message', check); resolve(ws._inbox.splice(index, 1)[0]);
    };
    ws.on('message', check);
  });
}
async function socket(url) {
  const ws = new WebSocket(url); ws._inbox = [];
  ws.on('message', data => ws._inbox.push(JSON.parse(data)));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return ws;
}
function waitFor(check, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      try { const value = check(); if (value) { clearInterval(timer); resolve(value); } else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('timed out')); } }
      catch (error) { clearInterval(timer); reject(error); }
    }, 5);
  });
}

test('world order normalization accepts only complete permutations and never mutates defaults', () => {
  assert.deepEqual(DEFAULT_WORLD_ORDER, [1, 2, 3]);
  assert.deepEqual(normalizeWorldOrder([3, 1, 2]), [3, 1, 2]);
  for (const value of [undefined, [], [1, 1, 2], [0, 2, 3], ['1', 2, 3], [1, 2], [,2,3], [null,2,3]]) assert.deepEqual(normalizeWorldOrder(value), [1, 2, 3]);
  const order = normalizeWorldOrder([2, 3, 1]); order[0] = 9;
  assert.deepEqual(DEFAULT_WORLD_ORDER, [1, 2, 3]);
  assert.equal(worldOrdinal(0, [3, 2, 1]), 0);
  assert.equal(worldOrdinal(2, [3, 2, 1]), 2);
});

test('all six orders start, transition, bank once, and finish on the final ordered identity', () => {
  for (const order of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
    const state = startRun(createState(), { worldOrder: order });
    assert.equal(state.level, order[0]);
    for (const [position, levelId] of order.entries()) {
      assert.equal(state.level, levelId);
      state.x = LEVELS[levelId].endX + 1; state.y = 400; state.current = 7; state.distanceMax = 64;
      const before = state.banked;
      const events = step(state, {}, .016);
      assert.ok(events.some(event => event.type === 'levelComplete' && event.level === levelId));
      assert.equal(state.banked, before + 7 + Math.floor((LEVELS[levelId].endX + 1 - 90) / 32));
      assert.equal(state.completedWorlds.length, position + 1);
      if (position === order.length - 1) assert.ok(state.finished);
    }
    assert.equal(score(state), state.banked);
    const banked=state.banked;assert.deepEqual(step(state,{},.016),[]);assert.equal(state.banked,banked);
  }
  assert.deepEqual(LEVELS.slice(1).map(level=>level.id),['forest','ocean','hell']);
});

test('level transitions retain latched order and completed identities while resetting checkpoint state', () => {
  const state = startRun(createState(), { worldOrder: [3, 1, 2] });
  state.checkpoint = { id: 'checkpoint', x: 300, y: 500, current: 4, coins: 1, collected: ['coin'], distanceMax: 300, progress: .2 };
  state.x = LEVELS[3].endX + 1; state.y = 400; state.current = 10; state.distanceMax = 500;
  step(state, {}, .016, {worldOrder:[1,2,3]});
  assert.equal(state.level, 1);
  assert.deepEqual(state.worldOrder, [3, 1, 2]);
  assert.deepEqual(state.completedWorlds, [3]);
  assert.equal(state.checkpoint, null);
  state.x = LEVELS[1].endX + 1; state.y = 400;
  step(state, {}, .016);
  assert.equal(state.level, 2);
  assert.deepEqual(state.completedWorlds, [3, 1]);
});

test('WebSocket host order starts first identity and survives late join and same-name refresh', async t => {
  let clock = 8000000;
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2, now: () => clock });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { worldOrder: [3, 1, 2] } }));
  const made = await receive(host, message => message.type === 'created');
  host.send(JSON.stringify({ type: 'start' }));
  const started = await receive(host, message => message.type === 'state' && message.room.status === 'running');
  const first = await socket(url); first.send(JSON.stringify({ type: 'join', code: made.code, name: 'Late' }));
  const joined = await receive(first, message => message.type === 'joined');
  const firstState = await receive(first, message => message.type === 'state' && message.room.players.some(player => player.id === joined.id && player.summary.level === 3));
  assert.equal(firstState.room.settings.worldOrder.join(','), '3,1,2');
  assert.equal(firstState.room.endsAt, started.room.endsAt);
  first.close(); await waitFor(() => !server.rooms.get(made.code).players.get(joined.id).ws);
  const refreshed = await socket(url); refreshed.send(JSON.stringify({ type: 'join', code: made.code, name: 'Late' }));
  await receive(refreshed, message => message.type === 'joined');
  const refreshedState = await receive(refreshed, message => message.type === 'state' && message.room.players.some(player => player.id === joined.id && player.summary.level === 3));
  assert.equal(refreshedState.room.endsAt, started.room.endsAt);
  refreshed.close(); host.close();
});

test('WebSocket rooms isolate valid orders and invalid orders fall back to default', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2 });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const hostA = await socket(url), hostB = await socket(url);
  hostA.send(JSON.stringify({ type: 'create', settings: { worldOrder: [2, 3, 1] } }));
  hostB.send(JSON.stringify({ type: 'create', settings: { worldOrder: [2, 2, 1] } }));
  const roomA = await receive(hostA, message => message.type === 'created'), roomB = await receive(hostB, message => message.type === 'created');
  hostA.send(JSON.stringify({ type: 'start' })); hostB.send(JSON.stringify({ type: 'start' }));
  const stateA = await receive(hostA, message => message.type === 'state' && message.room.status === 'running');
  const stateB = await receive(hostB, message => message.type === 'state' && message.room.status === 'running');
  assert.deepEqual(stateA.room.settings.worldOrder, [2, 3, 1]);
  assert.deepEqual(stateB.room.settings.worldOrder, [1, 2, 3]);
  assert.equal(server.rooms.get(roomA.code).settings.worldOrder.join(','), '2,3,1');
  assert.equal(server.rooms.get(roomB.code).settings.worldOrder.join(','), '1,2,3');
  hostA.close(); hostB.close();
});

test('WebSocket ordered completion broadcasts identity, banks once, resets checkpoints, and preserves order after death', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2 });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { worldOrder: [3, 1, 2] } }));
  const made = await receive(host, message => message.type === 'created');
  const playerSocket = await socket(url); playerSocket.send(JSON.stringify({ type: 'join', code: made.code, name: 'Runner' }));
  const joined = await receive(playerSocket, message => message.type === 'joined'); playerSocket.send(JSON.stringify({ type: 'spawn' }));
  await waitFor(() => server.rooms.get(made.code).players.get(joined.id).spawned);
  host.send(JSON.stringify({ type: 'start' })); await receive(host, message => message.type === 'state' && message.room.status === 'running');
  const room = server.rooms.get(made.code), runner = room.players.get(joined.id);
  const names = { 1: 'Whimsical Woods', 2: 'Troubled Tides', 3: 'Inferno Express' };
  for (const [index, levelId] of [3, 1, 2].entries()) {
    runner.state.current = 5; runner.state.x = LEVELS[levelId].endX + 1; runner.state.y = 400;
    if (index === 0) runner.state.checkpoint = { id: 'old', x: 200, y: 500, current: 2, coins: 1, collected: [], distanceMax: 20, progress: .1 };
    const before = runner.state.banked;
    const announcement = await receive(host, message => message.type === 'state' && message.room.announcement?.kind === 'level' && message.room.announcement.text.includes(names[levelId]));
    await waitFor(() => runner.state.completedWorlds.length === index + 1);
    assert.equal(runner.state.banked > before, true);
    assert.deepEqual(runner.state.completedWorlds, [3, 1, 2].slice(0, index + 1));
    if (index < 2) assert.equal(runner.state.finished, false);
    if (index === 0) assert.equal(runner.state.checkpoint, null);
    assert.ok(announcement.room.announcement.text.includes(names[levelId]));
    if (index === 0) {
      runner.state.y = 620; runner.state.x = 100; runner.state.grounded = false; runner.state._standingPlatform = null;
      await waitFor(() => runner.state.deaths > 0);
      assert.deepEqual(runner.state.worldOrder, [3, 1, 2]);
      assert.deepEqual(runner.state.completedWorlds, [3]);
      await waitFor(() => runner.state.deadUntil === 0, 4500);
    }
  }
  assert.equal(runner.state.finished, true); assert.equal(runner.state.level, 2);
  assert.deepEqual(runner.state.worldOrder, [3, 1, 2]);
  assert.deepEqual(runner.state.completedWorlds, [3, 1, 2]);
  playerSocket.close(); host.close();
});
