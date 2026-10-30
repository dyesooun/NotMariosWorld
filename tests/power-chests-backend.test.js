import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../public/game/levels.js';
import { collectPower, chestPower } from '../public/game/powers.js';
import { beginPowerDuel, answerPowerDuel } from '../server/power-duels.js';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const player = (id, level = 1) => ({ id, runId: `${id}-run`, connected: true, spawned: true,
  state: { level, finished: false, deadUntil: 0 }, powerSlots: {}, power: null, effects: {} });

test('each race level exposes three stable, clear power chests', () => {
  for (const level of LEVELS.slice(1)) {
    assert.deepEqual(level.powerChests.map(chest => chest.x), level.theme==='forest'?[3940,7460,10940]:[3880,7380,10880]);
    assert.equal(new Set(level.powerChests.map(chest => chest.id)).size, 3);
    for (const chest of level.powerChests) assert.equal(level.hazards.some(h => h.x < chest.x + 150 && h.x + h.w > chest.x - 150), false);
  }
});

test('three authored chest claims are allowed but a fourth is rejected', () => {
  const p = player('p');
  for (let i = 1; i <= 3; i++) { p.power = null; assert.ok(collectPower(p, 1, () => 0, `forest-power-chest-${i}`)); }
  p.power = null;
  assert.equal(collectPower(p, 1, () => 0, 'forest-power-chest-4'), null);
  assert.equal(Object.keys(p.powerSlots[1].chests).length, 3);
});

test('an unopened chest keeps its offered reward until claimed, including after death',()=>{
  const p=player('cached'),chest=LEVELS[1].powerChests[1];
  assert.equal(chestPower(p,1,chest.id,()=>.99).type,'fog');
  p.state.deadUntil=3;assert.equal(collectPower(p,1,()=>0,chest.id),null);
  p.state.deadUntil=0;
  assert.equal(chestPower(p,1,chest.id,()=>0).type,'fog');
  assert.equal(collectPower(p,1,()=>0,chest.id).power.type,'fog');
  assert.equal(collectPower(p,1,()=>0,LEVELS[1].powerChests[2].id),null);
});

test('duel uses configured windows and targets every eligible opponent', () => {
  const caster = player('caster'), one = player('one'), two = player('two');
  caster.powerSlots = { 1: { claimed: true, used: false, reserved: 'item', itemId: 'i', power: { type: 'slow', name: 'Sticky Boots', durationMs: 5000 } } };
  const room = { status: 'running', settings: { attackWindowSeconds: 3, defendWindowSeconds: 4, powerDurationSeconds: 6 }, powerDuel: null, activePower: null,
    players: new Map([[caster.id, caster], [one.id, one], [two.id, two]]) };
  const started = beginPowerDuel(room, { id: 'item', itemId: 'i', caster, level: 1, power: caster.powerSlots[1].power }, { now: 100, random: () => 0 });
  assert.equal(started.duel.endsAt, 3100);
  const attack = started.duel.attackQuestion;
  assert.equal(answerPowerDuel(room, caster, { transactionId: started.duel.id, challengeId: attack.id, answer: attack.answers[0], now: 101 }).ok, true);
  assert.deepEqual(started.duel.targets.map(p => p.id).sort(), ['one', 'two']);
  assert.equal(started.duel.endsAt, 4101);
  assert.equal(started.duel.entry.power.durationMs, 6000);
});

const ws = async url => { const socket = new WebSocket(url); socket.inbox = []; socket.on('message', data => socket.inbox.push(JSON.parse(data))); await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }); return socket; };
const message = async (socket, predicate) => { for (let i = 0; i < 400; i++) { const index = socket.inbox.findIndex(predicate); if (index >= 0) return socket.inbox.splice(index, 1)[0]; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('timed out waiting for WebSocket message'); };

test('WebSocket chest offer supports attack and rejects stale, duplicate, and out-of-range choices', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`, host = await ws(url); host.send(JSON.stringify({ type: 'create' }));
  const created = await message(host, m => m.type === 'created'); const casterWs = await ws(url), opponentWs = await ws(url);
  casterWs.send(JSON.stringify({ type: 'join', code: created.code, name: 'Caster' })); const casterJoin = await message(casterWs, m => m.type === 'joined');
  opponentWs.send(JSON.stringify({ type: 'join', code: created.code, name: 'Opponent' })); await message(opponentWs, m => m.type === 'joined');
  casterWs.send(JSON.stringify({ type: 'spawn' })); opponentWs.send(JSON.stringify({ type: 'spawn' }));
  host.send(JSON.stringify({ type: 'start' })); await message(host, m => m.type === 'state' && m.room.status === 'running');
  const room = server.rooms.get(created.code), caster = room.players.get(casterJoin.id), chest = LEVELS[1].powerChests[0], nextChest = LEVELS[1].powerChests[1];
  Object.assign(caster.state, { x: chest.x + 15, y: chest.y }); await message(casterWs, m => m.type === 'state' && m.room.players.find(p => p.id === caster.id)?.power);
  Object.assign(caster.state, { x: nextChest.x + 15, y: nextChest.y }); const offered = await message(casterWs, m => m.type === 'state' && m.room.players.find(p => p.id === caster.id)?.powerOffer);
  let offer = offered.room.players.find(p => p.id === caster.id).powerOffer; assert.ok(offer.id); assert.equal(offer.itemId, caster.power.itemId);
  casterWs.send(JSON.stringify({ type: 'powerChestChoice', offerId: 'stale', itemId: offer.itemId, choice: 'attack' })); assert.equal((await message(casterWs, m => m.type === 'error')).code, 'POWER_OFFER_INVALID');
  caster.state.x = 100; casterWs.send(JSON.stringify({ type: 'powerChestChoice', offerId: offer.id, itemId: offer.itemId, choice: 'attack' })); assert.equal((await message(casterWs, m => m.type === 'error')).code, 'POWER_OFFER_INVALID');
  await new Promise(resolve=>setTimeout(resolve,10));const priorId=offer.id;caster.state.x = nextChest.x + 15;
  const renewed=await message(casterWs,m=>m.type==='state'&&m.room.players.find(p=>p.id===caster.id)?.powerOffer?.id&&m.room.players.find(p=>p.id===caster.id).powerOffer.id!==priorId);offer=renewed.room.players.find(p=>p.id===caster.id).powerOffer;
  casterWs.send(JSON.stringify({ type: 'powerChestChoice', offerId: offer.id, itemId: offer.itemId, choice: 'attack' })); await message(casterWs, m => m.type === 'state' && m.room.powerDuel?.casterId === caster.id);
  casterWs.send(JSON.stringify({ type: 'powerChestChoice', offerId: offer.id, itemId: offer.itemId, choice: 'attack' })); assert.equal((await message(casterWs, m => m.type === 'error')).code, 'POWER_OFFER_INVALID');
  casterWs.close(); opponentWs.close(); host.close();
});

test('WebSocket replace consumes the offered chest and preserves configured duel windows', async t => {
  let clock = 9000000; const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2, now: () => clock }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`, host = await ws(url); host.send(JSON.stringify({ type: 'create', settings: { powerDurationSeconds: 7, attackWindowSeconds: 3, defendWindowSeconds: 4 } }));
  const created = await message(host, m => m.type === 'created'), casterWs = await ws(url), opponentWs = await ws(url);
  casterWs.send(JSON.stringify({ type: 'join', code: created.code, name: 'Replacer' })); const joined = await message(casterWs, m => m.type === 'joined'); opponentWs.send(JSON.stringify({ type: 'join', code: created.code, name: 'Target' })); await message(opponentWs, m => m.type === 'joined');
  casterWs.send(JSON.stringify({ type: 'spawn' })); opponentWs.send(JSON.stringify({ type: 'spawn' })); host.send(JSON.stringify({ type: 'start' })); await message(host, m => m.type === 'state' && m.room.status === 'running');
  const room = server.rooms.get(created.code), caster = room.players.get(joined.id), first = LEVELS[1].powerChests[0], second = LEVELS[1].powerChests[1];
  Object.assign(caster.state, { x: first.x + 15, y: first.y }); await message(casterWs, m => m.type === 'state' && m.room.players.find(p => p.id === caster.id)?.power);
  const oldItem = caster.power.itemId; Object.assign(caster.state, { x: second.x + 15, y: second.y }); const offered = await message(casterWs, m => m.type === 'state' && m.room.players.find(p => p.id === caster.id)?.powerOffer); const offer = offered.room.players.find(p => p.id === caster.id).powerOffer;
  casterWs.send(JSON.stringify({ type: 'powerChestChoice', offerId: offer.id, itemId: offer.itemId, choice: 'replace' })); await message(casterWs, m => m.type === 'state' && m.room.players.find(p => p.id === caster.id)?.power?.chestId===second.id);
  assert.notEqual(caster.power.itemId, oldItem); assert.equal(room.players.get(caster.id).powerSlots[1].chests[second.id].claimed, true);
  clock += 1000; await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(room.settings.attackWindowSeconds, 3); assert.equal(room.settings.defendWindowSeconds, 4); assert.equal(room.settings.powerDurationSeconds, 7);
  casterWs.close(); opponentWs.close(); host.close();
});

test('WebSocket configured deadlines resolve mixed defenses and keep the full effect banner', async t => {
  let clock = 12000000;
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2, now: () => clock }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`, host = await ws(url); host.send(JSON.stringify({ type: 'create', settings: { powerDurationSeconds: 6, attackWindowSeconds: 2, defendWindowSeconds: 3, slowSpeedPercent:35, coinPoints: 9999 } }));
  const created = await message(host, m => m.type === 'created'), sockets = [], ids = [];
  for (const name of ['Attacker', 'Blocked', 'Hit']) { const client = await ws(url); client.send(JSON.stringify({ type: 'join', code: created.code, name })); const joined = await message(client, m => m.type === 'joined'); client.send(JSON.stringify({ type: 'spawn' })); sockets.push(client); ids.push(joined.id); }
  host.send(JSON.stringify({ type: 'start' })); await message(host, m => m.type === 'state' && m.room.status === 'running');
  const room = server.rooms.get(created.code), caster = room.players.get(ids[0]); collectPower(caster, 1, () => 0, 'forest-power-chest-1');
  sockets[0].send(JSON.stringify({ type: 'usePower' })); const privateState=await message(sockets[0], m => m.type === 'state' && m.room.powerDuel?.phase === 'attack');
  const duel = room.powerDuel, attackQuestion = duel.attackQuestion; assert.equal(duel.endsAt, clock + 2000);
  assert.equal(privateState.room.players.find(p=>p.id===ids[0]).powerQuiz.durationMs,2000);assert.equal(privateState.room.players.find(p => p.id === ids[1]).powerQuiz, null);
  sockets[0].send(JSON.stringify({ type: 'powerAnswer', transactionId: duel.id, challengeId: attackQuestion.id, answer: attackQuestion.answers[0] }));
  await message(sockets[1], m => m.type === 'state' && m.room.powerDuel?.phase === 'defense');
  const defense = duel.defenses.get(ids[1]); assert.ok(defense); assert.equal(duel.endsAt, clock + 3000);
  sockets[1].send(JSON.stringify({ type: 'powerAnswer', transactionId: duel.id, challengeId: defense.question.id, answer: defense.question.answers[0] }));
  await message(sockets[1],m=>m.type==='powerAnswerResult');
  clock += 3000; await new Promise(resolve => setTimeout(resolve, 20)); await message(sockets[2], m => m.type === 'state' && m.room.powerDuel?.phase === 'effect');
  assert.equal(duel.outcome, 'success'); assert.deepEqual(duel.affectedIds, [ids[2]]); assert.equal(room.announcement.durationMs, 6000); assert.equal(room.announcement.endsAt, clock + 6000);
  assert.deepEqual(room.players.get(ids[2]).effects.slow.strength,{speedPercent:35});
  const applied=await message(sockets[0],m=>m.type==='state'&&m.room.powerDuel?.phase==='effect');
  assert.equal(applied.room.players.find(p=>p.id===ids[2]).effects.slow.strength.speedPercent,35);
  for (const client of sockets) client.close(); host.close();
});

test('WebSocket room settings default and clamp power windows to one through sixty seconds', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1' }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const defaults = await ws(url); defaults.send(JSON.stringify({ type: 'create' })); const made = await message(defaults, m => m.type === 'created');
  assert.deepEqual(Object.fromEntries(['powerDurationSeconds', 'attackWindowSeconds', 'defendWindowSeconds'].map(key => [key, server.rooms.get(made.code).settings[key]])), { powerDurationSeconds: 5, attackWindowSeconds: 10, defendWindowSeconds: 10 });
  defaults.send(JSON.stringify({ type: 'settings', settings: { powerDurationSeconds: 0, attackWindowSeconds: 100, defendWindowSeconds: 'bad', slowSpeedPercent:0,reverseSpeedPercent:400,slipperySpeedPercent:400,slipperyGripPercent:0,inkDarknessPercent:100 } }));
  await message(defaults, m => m.type === 'state' && m.room.settings.powerDurationSeconds === 1);
  assert.equal(server.rooms.get(made.code).settings.powerDurationSeconds, 1); assert.equal(server.rooms.get(made.code).settings.attackWindowSeconds, 60); assert.equal(server.rooms.get(made.code).settings.defendWindowSeconds, 1);
  const strengths=server.rooms.get(made.code).settings;assert.equal(strengths.slowSpeedPercent,10);assert.equal(strengths.reverseSpeedPercent,200);assert.equal(strengths.slipperySpeedPercent,250);assert.equal(strengths.slipperyGripPercent,2);assert.equal(strengths.inkDarknessPercent,95);
  defaults.close();
});

test('a player can cast all three chest items in one world without reopening a spent chest',async t=>{
  let clock=18000000;const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>clock});await server.listen();t.after(()=>server.close());
  const url=`ws://127.0.0.1:${server.httpServer.address().port}`,host=await ws(url);
  host.send(JSON.stringify({type:'create'}));const made=await message(host,m=>m.type==='created');
  const casterWs=await ws(url),targetWs=await ws(url);
  casterWs.send(JSON.stringify({type:'join',code:made.code,name:'Three casts'}));const joined=await message(casterWs,m=>m.type==='joined');
  targetWs.send(JSON.stringify({type:'join',code:made.code,name:'Target'}));await message(targetWs,m=>m.type==='joined');
  casterWs.send(JSON.stringify({type:'spawn'}));targetWs.send(JSON.stringify({type:'spawn'}));
  host.send(JSON.stringify({type:'start'}));await message(host,m=>m.type==='state'&&m.room.status==='running');
  const room=server.rooms.get(made.code),caster=room.players.get(joined.id),items=new Set();
  for(const [index,chest] of LEVELS[1].powerChests.entries()){
    Object.assign(caster.state,{x:chest.x+15,y:500,vx:0,vy:0,grounded:true});
    const pickup=await message(casterWs,m=>m.type==='state'&&m.room.players.find(p=>p.id===caster.id)?.power?.chestId===chest.id&&!m.room.players.find(p=>p.id===caster.id).power.used);
    const inventory=pickup.room.players.find(p=>p.id===caster.id);assert.equal(inventory.powerChestClaims.length,index+1);items.add(inventory.power.itemId);
    casterWs.send(JSON.stringify({type:'usePower'}));await message(casterWs,m=>m.type==='state'&&m.room.powerDuel?.phase==='attack'&&m.room.players.find(p=>p.id===caster.id)?.power.itemId===inventory.power.itemId);
    const duel=room.powerDuel;casterWs.send(JSON.stringify({type:'powerAnswer',transactionId:duel.id,challengeId:duel.attackQuestion.id,answer:'wrong'}));
    await message(casterWs,m=>m.type==='state'&&m.room.activePower?.id===duel.id);
    assert.equal(caster.power.used,true);clock+=5000;
    await message(casterWs,m=>m.type==='state'&&m.serverTime===clock&&!m.room.activePower);
    assert.equal(caster.powerSlots[1].chests[chest.id].claimed,true);
  }
  assert.equal(items.size,3);assert.equal(Object.values(caster.powerSlots[1].chests).filter(chest=>chest.claimed).length,3);
  Object.assign(caster.state,{x:LEVELS[1].powerChests[0].x+15,y:500});clock+=100;
  const revisit=await message(casterWs,m=>m.type==='state'&&m.serverTime===clock);
  assert.equal(revisit.room.players.find(p=>p.id===caster.id).power.used,true);
  casterWs.close();targetWs.close();host.close();
});
