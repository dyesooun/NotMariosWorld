import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { collectPower, powerEffects } from '../public/game/powers.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async check => { for (let i = 0; i < 300; i++) { if (check()) return; await pause(5); } throw new Error('Condition timed out'); };
const open = async url => { const ws = new WebSocket(url); ws.messages = []; ws.on('message', raw => ws.messages.push(JSON.parse(raw))); await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }); return ws; };
const take = async (ws, check) => { await waitFor(() => ws.messages.some(check)); return ws.messages.splice(ws.messages.findIndex(check), 1)[0]; };
const send = (ws, type, data = {}) => ws.send(JSON.stringify({ type, ...data }));

async function fixture(t, count = 3, settings = {}) {
  let clock = 50_000_000;
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2, now: () => clock });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await open(url); send(host, 'create', { settings });
  const created = await take(host, m => m.type === 'created');
  const room = server.rooms.get(created.code), clients = [], players = [];
  for (let i = 0; i < count; i++) {
    const ws = await open(url); send(ws, 'join', { code: created.code, name: `Host target ${i}` });
    const joined = await take(ws, m => m.type === 'joined'); send(ws, 'spawn');
    ws.player = room.players.get(joined.id); ws.room = room; clients.push(ws); players.push(ws.player);
  }
  await waitFor(() => players.every(p => p.spawned)); send(host, 'start'); await take(host, m => m.room?.status === 'running');
  return { server, room, host, clients, players, code: created.code, token: created.token, url, now: () => clock,
    async advance(ms) { clock += ms; await pause(25); },
    attack(powerType = 'slow') { send(host, 'hostAttack', { roundId: room.roundId, powerType }); },
    async report(index, changes = {}) { const player=players[index],seq=player.lastSeq+1; send(clients[index],'runReport',{roundId:room.roundId,runId:player.runId,seq,at:clock,summary:{...player.summary,...changes},chestId:null,final:false}); await take(clients[index],m=>m.type==='reportAck'&&m.seq===seq); },
    async answer(index, correct = true) { const duel = room.powerDuel, defense = duel.defenses.get(players[index].id); const answer = correct ? `  ${defense.question.answers[0].toUpperCase()}  ` : 'not the answer'; send(clients[index], 'powerAnswer', { roundId: room.roundId, runId: players[index].runId, transactionId: duel.id, challengeId: defense.question.id, answer }); await take(clients[index], m => m.type === 'powerAnswerResult'); }
  };
}

test('host attack requires host auth, running phase, valid round, and power type', async t => {
  const f = await fixture(t, 1);
  f.attack('slow');
  assert.equal((await take(f.host, m => m.type === 'powerQueued')).source, 'host');
  send(f.host, 'hostAttack', { powerType: 'slow' }); assert.equal((await take(f.host, m => m.type === 'error')).code, 'RUN_INVALID');
  send(f.host, 'hostAttack', { roundId: 'stale', powerType: 'slow' }); assert.equal((await take(f.host, m => m.type === 'error')).code, 'RUN_INVALID');
  await f.advance(5_000);
  f.attack('invalid'); assert.equal((await take(f.host, m => m.type === 'error')).code, 'POWER_INVALID');
  send(f.clients[0], 'hostAttack', { roundId: f.room.roundId, powerType: 'slow' }); assert.equal((await take(f.clients[0], m => m.type === 'error')).code, 'AUTH');
  f.attack('slow'); assert.equal((await take(f.host, m => m.type === 'powerQueued')).source, 'host');
  assert.equal(f.room.powerDuel.phase, 'defense');
});

test('host attack privately challenges every active player and mixes individual outcomes without inventory', async t => {
  const f = await fixture(t, 3, { powerDurationSeconds: 7, defendWindowSeconds: 3, slowSpeedPercent: 42 });
  await f.report(2,{deaths:1,respawnRemaining:3});
  f.attack('slow'); await waitFor(() => f.room.powerDuel?.phase === 'defense');
  assert.equal(f.room.powerDuel.targets.length, 3); assert.equal(f.room.powerDuel.caster, null);
  for (let i = 0; i < 3; i++) assert.ok(f.room.powerDuel.defenses.get(f.players[i].id).question);
  const snapshot=await take(f.clients[0],m=>m.room?.powerDuel?.id===f.room.powerDuel.id);
  assert.equal(snapshot.room.powerDuel.source,'host');assert.equal(snapshot.room.powerDuel.casterId,null);
  assert.equal(snapshot.room.players[0].powerQuiz.role,'defense');
  assert.ok(snapshot.room.players.slice(1).every(p=>p.powerQuiz===null));
  assert.equal(JSON.stringify(snapshot).includes('"answers"'),false);
  assert.equal(f.room.powerDuel.endsAt-f.now(),3000);
  await f.answer(0, true); await f.answer(1, false); await f.answer(2, true); await waitFor(() => f.room.powerDuel.phase === 'effect');
  assert.deepEqual(Object.keys(powerEffects(f.players[0], f.now())), []);
  assert.deepEqual(Object.keys(powerEffects(f.players[1], f.now())), ['slow']);
  assert.equal(powerEffects(f.players[1], f.now()).slow.strength.speedPercent, 42);
  assert.deepEqual(Object.keys(powerEffects(f.players[2], f.now())), []);
  assert.equal(f.players.every(p => p.power === null && Object.keys(p.powerSlots).length === 0), true);
  assert.equal(f.room.activePower.casterId, null); assert.equal(f.room.activePower.casterName, 'Host');
  assert.equal(f.room.activePower.endsAt-f.now(),7000);
});

test('host defense timeout and all-blocked result each occupy the full configured effect slot', async t => {
  const f = await fixture(t, 2, { powerDurationSeconds: 4, defendWindowSeconds: 2 });
  f.attack('fog'); await take(f.host, m => m.type === 'powerQueued'); await waitFor(() => f.room.powerDuel?.phase === 'defense'); await f.advance(2000); assert.equal(f.room.powerDuel.phase, 'effect'); assert.equal(f.room.powerDuel.outcome, 'success');
  assert.equal(f.room.activePower.endsAt - f.now(), 4000); assert.ok(powerEffects(f.players[0], f.now()).fog);
  await f.advance(4000); f.attack('reverse'); await waitFor(() => f.room.powerDuel?.phase === 'defense'); await f.answer(0, true); await f.answer(1, true);
  assert.equal(f.room.powerDuel.outcome, 'blocked'); assert.equal(f.room.activePower.endsAt - f.now(), 4000); assert.equal(Object.keys(powerEffects(f.players[0],f.now())).length, 0);
  const id=f.room.powerDuel.id;await f.advance(3999);assert.equal(f.room.powerDuel.id,id);await f.advance(1);assert.equal(f.room.powerDuel,null);
});

test('host attacks share FIFO ordering with player powers and level announcements', async t => {
  const f = await fixture(t, 2); collectPower(f.players[0], 1, () => 0); send(f.clients[0], 'usePower', { roundId: f.room.roundId, runId: f.players[0].runId });
  await waitFor(() => f.room.powerDuel?.caster === f.players[0]);
  const playerDuel = f.room.powerDuel; send(f.clients[0], 'powerAnswer', { roundId: f.room.roundId, runId: f.players[0].runId, transactionId: playerDuel.id, challengeId: playerDuel.attackQuestion.id, answer: 'wrong' }); await take(f.clients[0], m => m.type === 'powerAnswerResult');
  await waitFor(() => f.room.powerDuel?.phase === 'effect'); f.attack('slippery'); await take(f.host, m => m.type === 'powerQueued');
  await f.report(1,{level:2,completedWorlds:[1],banked:100});
  f.attack('fog');await take(f.host,m=>m.type==='powerQueued'&&m.powerType==='fog');
  assert.deepEqual(f.room.announcementQueue.map(a=>a.source==='host'?a.power.type:a.kind),['slippery','level','fog']);
  const first = f.room.powerDuel.id; await f.advance(5_000);
  await waitFor(() => f.room.powerDuel?.entry.source === 'host'); assert.notEqual(f.room.powerDuel.id, first); assert.equal(f.room.powerDuel.entry.source, 'host');
  assert.equal(f.room.powerDuel.entry.power.type,'slippery');assert.equal(f.room.powerDuel.targets.length,2);
  await f.answer(0);await f.answer(1);await f.advance(5000);
  assert.equal(f.room.powerDuel,null);assert.equal(f.room.announcement.kind,'level');assert.match(f.room.announcement.text,/escaped Whimsical Woods/);
  await f.advance(1999);assert.equal(f.room.announcement.kind,'level');await f.advance(1);
  assert.equal(f.room.powerDuel.entry.power.type,'fog');assert.equal(f.room.powerDuel.phase,'defense');
});

test('host queued attack survives temporary host disconnect and defender refresh is isolated', async t => {
  const f = await fixture(t, 2); f.attack('slow'); await take(f.host, m => m.type === 'powerQueued');
  f.attack('fog');await take(f.host,m=>m.type==='powerQueued'&&m.powerType==='fog');
  f.host.close(); await waitFor(() => !f.room.hostWs); assert.equal(f.room.powerQueue.length, 1); assert.equal(f.room.powerDuel?.entry.source, 'host');
  const resumedHost = await open(f.url); send(resumedHost, 'hostJoin', { code: f.code, token: f.token }); await take(resumedHost, m => m.type === 'state');
  const oldRun = f.players[1].runId; f.clients[1].close(); await waitFor(() => !f.players[1].connected);
  const replacement = await open(f.url); send(replacement, 'join', { code: f.code, name: f.players[1].name }); await take(replacement, m => m.type === 'joined');
  assert.notEqual(f.players[1].runId, oldRun); send(replacement, 'spawn'); await f.advance(10_000);
  assert.equal(f.room.powerDuel?.defenses.has(f.players[1].id), true); assert.equal(f.room.powerDuel.defenses.get(f.players[1].id).runId, oldRun);
  await f.advance(1); assert.equal(f.room.powerDuel.phase, 'effect'); assert.equal(powerEffects(f.players[1], f.now()).slow, undefined);
  await f.advance(5000);assert.equal(f.room.powerDuel.entry.power.type,'fog');assert.equal(f.room.powerDuel.targets.length,2);
  assert.equal(f.room.powerDuel.defenses.get(f.players[1].id).runId,f.players[1].runId);
});

test('a queued host attack skips safely if every eligible player has left',async t=>{
  const f=await fixture(t,1);f.attack('slow');await take(f.host,m=>m.type==='powerQueued');
  f.attack('fog');await take(f.host,m=>m.type==='powerQueued'&&m.powerType==='fog');
  f.clients[0].close();await waitFor(()=>!f.players[0].connected);
  assert.equal(f.room.powerDuel.outcome,'blocked');await f.advance(5000);
  const skipped=await take(f.host,m=>m.type==='hostAttackCancelled');assert.equal(skipped.reason,'NO_TARGET');
  assert.equal(f.room.powerDuel,null);assert.equal(f.room.powerQueue.length,0);assert.equal(f.room.announcement,null);
});

test('host attack with no target is rejected and end/reset cleans queued or active host powers', async t => {
  const f = await fixture(t, 1); f.clients[0].close(); await waitFor(() => !f.players[0].connected); f.attack('slow'); assert.equal((await take(f.host, m => m.type === 'error')).code, 'NO_TARGET');
  const g = await fixture(t, 1); g.attack('slow'); await take(g.host, m => m.type === 'powerQueued');
  g.attack('fog');await take(g.host,m=>m.type==='powerQueued'&&m.powerType==='fog');
  send(g.host, 'end'); await waitFor(() => ['settling', 'ended'].includes(g.room.status)); assert.equal(g.room.powerQueue.length, 0); assert.equal(g.room.powerDuel, null);
  if (g.room.status === 'settling') {
    send(g.host, 'hostAttack', { roundId: g.room.roundId, powerType: 'slow' }); assert.equal((await take(g.host, m => m.type === 'error')).code, 'ROUND_ENDED');
    await g.advance(2_000);
  }
  send(g.host, 'hostAttack', { roundId: g.room.roundId, powerType: 'slow' }); assert.equal((await take(g.host, m => m.type === 'error')).code, 'ROUND_ENDED');
  send(g.host, 'reset'); await waitFor(() => g.room.status === 'lobby'); assert.equal(g.room.announcementQueue.length, 0);
  send(g.host, 'hostAttack', { roundId: g.room.roundId, powerType: 'slow' }); assert.equal((await take(g.host, m => m.type === 'error')).code, 'ROUND_ENDED');
});
