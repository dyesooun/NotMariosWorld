import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { collectPower, coinAttackView } from '../public/game/powers.js';
import { LEVELS } from '../public/game/levels.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check) { for (let i=0; i<400; i++) { if (check()) return; await sleep(5); } throw new Error('Condition timed out'); }
async function open(url) {
  const ws = new WebSocket(url); ws.inbox = [];
  ws.on('message', raw => ws.inbox.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return ws;
}
async function take(ws, predicate) { await wait(() => ws.inbox.some(predicate)); return ws.inbox.splice(ws.inbox.findIndex(predicate), 1)[0]; }
const send = (ws, type, payload={}) => ws.send(JSON.stringify({type, ...payload}));
async function fixture(t, settings={}) {
  let clock = 1000000;
  const server = createGameServer({port:0, host:'127.0.0.1', tickMs:2, now:()=>clock});
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`, host = await open(url);
  // Keep historical timing scenarios explicit; new defaults are covered in server.test.js.
  send(host, 'create', {settings:{powerDurationSeconds:5,attackWindowSeconds:10,defendWindowSeconds:10,...settings}});
  const made = await take(host, m=>m.type==='created'), room = server.rooms.get(made.code), clients=[], players=[];
  async function join(name) {
    const ws = await open(url); send(ws, 'join', {code:made.code, name});
    const joined = await take(ws, m=>m.type==='joined'); return {ws, player:room.players.get(joined.id)};
  }
  for (const name of ['Caster', 'Target', 'Other']) { const p=await join(name); clients.push(p.ws); players.push(p.player); }
  send(host, 'start'); await take(host, m=>m.type==='state'&&m.room.status==='running');
  async function report(index, patch={}, extra={}) {
    const p=players[index], payload={roundId:room.roundId, runId:p.runId, seq:p.lastSeq+1, at:clock, summary:{...p.summary, ...patch}, final:false, ...extra};
    send(clients[index], 'runReport', payload); return take(clients[index], m=>m.type==='error'||m.type==='reportAck'&&m.seq===payload.seq);
  }
  for (let i=0;i<players.length;i++) await report(i, {earnedCoins:90, coins:40, current:400, banked:25});
  const attack = (index, target, powerType='slow', extra={}) => send(clients[index], 'coinAttack', {roundId:room.roundId,runId:players[index].runId,powerType,targetId:players[target].id,...extra});
  async function answer(index, correct) {
    const duel=room.powerDuel, question=duel.phase==='attack'?duel.attackQuestion:duel.defenses.get(players[index].id).question;
    send(clients[index], 'powerAnswer', {roundId:room.roundId,runId:players[index].runId,transactionId:duel.id,challengeId:question.id,answer:correct?question.answers[0]:'__wrong__'});
    return take(clients[index], m=>m.type==='powerAnswerResult'||m.type==='error');
  }
  return {server,room,host,clients,players,join,report,attack,answer,now:()=>clock,
    async advance(ms) { clock+=ms; await sleep(25); },
    async queued(index) { return take(clients[index], m=>m.type==='coinAttackQueued'); },
    async error(index) { return take(clients[index], m=>m.type==='error'); },
  };
}

test('default purchase costs 30 coins, waits to start its cooldown, and preserves score/chest', async t=>{
  const f=await fixture(t), caster=f.players[0];
  collectPower(caster, caster.state.level, ()=>0, LEVELS[caster.state.level].powerChests[0].id);
  const item=caster.power.itemId, score=caster.score, totals={...caster.summary};
  f.attack(0,1,'fog'); const accepted=await f.queued(0);
  assert.equal(accepted.cost,30); assert.equal(accepted.cooldownEndsAt,0); assert.equal(caster.coinAttack.cooldownEndsAt,0);
  assert.equal(caster.coinAttack.spent,30); assert.equal(coinAttackView(caster).available,60);
  assert.equal(caster.score,score); assert.deepEqual(caster.summary,totals);
  assert.equal(caster.power.itemId,item); assert.equal(caster.power.used,false); assert.equal(caster.power.testing,false);
  assert.equal(f.room.powerDuel.entry.power.type,'fog');
  const owned=await take(f.clients[0], m=>m.type==='state'&&m.room.players.find(p=>p.id===caster.id)?.coinAttack?.spent===30);
  assert.equal(owned.room.players.find(p=>p.id===caster.id).coinAttack.available,60);
  assert.equal(owned.room.players.find(p=>p.id===caster.id).coinAttack.cooldownEndsAt,0);
});

test('correct attack challenges only the chosen respawning opponent; a defense blocks without refund', async t=>{
  const f=await fixture(t,{attackCoinCost:12,attackCooldownSeconds:7});
  await f.report(1,{respawnRemaining:3,deaths:1});
  f.attack(0,1,'reverse'); await f.queued(0); await f.advance(2000); await f.answer(0,true);
  assert.deepEqual([...f.room.powerDuel.defenses.keys()],[f.players[1].id]);
  assert.equal(f.room.powerDuel.entry.power.target,'player');
  assert.equal(f.room.announcement.text,`${f.players[1].name} must defend!`);
  await f.advance(3000); assert.equal(f.players[0].coinAttack.cooldownEndsAt,0);
  await f.answer(1,true);
  assert.equal(f.room.powerDuel.outcome,'blocked'); assert.deepEqual(f.room.powerDuel.affectedIds,[]);
  assert.equal(f.players[0].coinAttack.spent,12); assert.equal(coinAttackView(f.players[0]).available,78);
  assert.equal(f.players[0].coinAttack.cooldownEndsAt,f.now()+7000);
});

test('incorrect and timed-out defenses start the full configured cooldown at defense resolution', async t=>{
  for (const timeout of [false,true]) {
    const f=await fixture(t,{attackCooldownSeconds:9,defendWindowSeconds:4});
    f.attack(0,1); await f.queued(0);
    await f.advance(1500); assert.equal(f.players[0].coinAttack.cooldownEndsAt,0);
    await f.answer(0,true);
    await f.advance(1000); assert.equal(f.players[0].coinAttack.cooldownEndsAt,0);
    if (timeout) await f.advance(3000); else await f.answer(1,false);
    assert.equal(f.room.powerDuel.phase,'effect');
    const deadline=f.now()+9000;
    assert.equal(f.players[0].coinAttack.cooldownEndsAt,deadline);
    assert.equal(f.players[1].coinAttack.cooldownEndsAt,0,'defending never starts the defender’s own attack cooldown');
    const state=await take(f.clients[0],m=>m.type==='state'&&m.room.powerDuel?.phase==='effect');
    assert.equal(state.room.players.find(p=>p.id===f.players[0].id).coinAttack.cooldownEndsAt,deadline);
    await f.advance(1000); assert.equal(f.players[0].coinAttack.cooldownEndsAt,deadline);
  }
});

test('a caster refreshing during defense never receives the previous run’s cooldown', async t=>{
  const f=await fixture(t);
  f.attack(0,1); await f.queued(0); await f.answer(0,true);
  const oldRunId=f.players[0].runId;
  f.clients[0].close(); await wait(()=>!f.players[0].connected);
  const replacement=await f.join('Caster');
  assert.notEqual(replacement.player.runId,oldRunId);
  await f.advance(1000); await f.answer(1,false);
  assert.equal(f.room.powerDuel.phase,'effect');
  assert.equal(replacement.player.coinAttack.cooldownEndsAt,0);
  assert.equal(replacement.player.coinAttack.spent,0);
});

test('cooldowns are per player and duplicate requests never reserve twice', async t=>{
  const f=await fixture(t,{attackCoinCost:10,attackCooldownSeconds:7});
  f.attack(0,1); await f.queued(0); f.attack(2,1); await f.queued(2);
  assert.equal(f.players[0].coinAttack.cooldownEndsAt,0); assert.equal(f.players[2].coinAttack.cooldownEndsAt,0);
  assert.equal(f.players[0].coinAttack.spent,10);
  assert.equal(f.players[2].coinAttack.spent,0); assert.equal(f.players[2].coinAttack.reserved,10);
  f.attack(2,0); assert.equal((await f.error(2)).code,'ATTACK_PENDING');
  assert.equal(f.players[2].coinAttack.reserved,10);
  await f.answer(0,false); await f.advance(5000); await f.answer(2,false); await f.advance(5000);
  f.attack(0,1); await f.queued(0);
  assert.equal(f.players[0].coinAttack.spent,20, 'expired personal cooldown permits the next purchase');
});

test('active/cooldown, unaffordable, invalid power, self and stale-run requests do not spend coins', async t=>{
  const f=await fixture(t);
  for (const [powerType,target,extra,code] of [
    ['bad',1,{},'POWER_INVALID'], ['slow',0,{},'TARGET_INVALID'], ['slow',1,{runId:'old-run'},'RUN_INVALID'],
  ]) { f.attack(0,target,powerType,extra); assert.equal((await f.error(0)).code,code); }
  f.players[0].coinAttack.spent=90; f.attack(0,1); assert.equal((await f.error(0)).code,'ATTACK_FUNDS');
  assert.equal(f.players[0].coinAttack.cooldownEndsAt,0); f.players[0].coinAttack.spent=0;
  f.attack(0,1); await f.queued(0); await f.answer(0,false); await f.advance(5000);
  f.attack(0,1); assert.equal((await f.error(0)).code,'ATTACK_COOLDOWN');
  assert.equal(f.players[0].coinAttack.spent,30);
});

test('queued target disconnect releases reservation without starting a cooldown or retargeting', async t=>{
  const f=await fixture(t); f.attack(0,1); await f.queued(0); f.attack(2,1); await f.queued(2);
  await f.answer(0,false);
  f.clients[1].close(); await wait(()=>!f.players[1].connected);
  await f.advance(5000);
  await take(f.clients[2],m=>m.type==='coinAttackCancelled');
  assert.equal(!!f.room.powerDuel,false); assert.equal(f.room.powerQueue.length,0);
  assert.equal(f.players[2].coinAttack.reserved,0); assert.equal(f.players[2].coinAttack.spent,0);
  assert.equal(f.players[2].coinAttack.cooldownEndsAt,0);
});

test('target refresh during attack cannot give a defense or effect to the replacement run', async t=>{
  const f=await fixture(t); f.attack(0,1); await f.queued(0);
  const previous=f.players[1], oldRunId=previous.runId; f.clients[1].close(); await wait(()=>!previous.connected);
  const replacement=await f.join('Target');
  assert.notEqual(replacement.player.runId,oldRunId);
  await f.answer(0,true);
  assert.equal(f.room.powerDuel.defenses.size,0); assert.equal(f.room.powerDuel.outcome,'blocked');
  assert.deepEqual(replacement.player.effects,{}); assert.equal(f.players[0].coinAttack.spent,30);
});

test('queued purchase survives death and a world transition and consumes no chest reservation', async t=>{
  const f=await fixture(t); f.attack(0,1); await f.queued(0); f.attack(2,1); await f.queued(2);
  const held=collectPower(f.players[2],1,()=>0,LEVELS[1].powerChests[0].id);
  assert.ok(held);
  await f.report(2,{respawnRemaining:3,deaths:1});
  await f.report(2,{level:2,completedWorlds:[1],coins:0,current:0,banked:425,respawnRemaining:0});
  assert.equal(f.players[2].power,null,'coin reservation must not preserve an unreserved old-world chest');
  await f.answer(0,false); await f.advance(5000);
  assert.equal(f.room.powerDuel.caster.id,f.players[2].id);
  assert.equal(f.players[2].coinAttack.reserved,0); assert.equal(f.players[2].coinAttack.spent,30);
  assert.equal(f.players[2].coinAttack.earned,90);
  assert.equal(f.players[2].coinAttack.cooldownEndsAt,0, 'starting the queued attack quiz still does not start cooldown');
});

test('wrong or timed-out attacks backfire only on the caster and stay paid once', async t=>{
  for (const timeout of [false,true]) {
    const f=await fixture(t); f.attack(0,1); await f.queued(0);
    if (timeout) await f.advance(10000); else await f.answer(0,false);
    assert.equal(f.room.powerDuel.outcome,'attackerFailed');
    assert.deepEqual(f.room.powerDuel.affectedIds,[f.players[0].id]);
    assert.equal(!!f.players[0].effects.slow,true); assert.equal(!!f.players[1].effects.slow,false);
    assert.equal(f.players[0].coinAttack.spent,30); assert.equal(f.players[0].coinAttack.reserved,0);
    const deadline=f.now()+60000;
    assert.equal(f.players[0].coinAttack.cooldownEndsAt,deadline);
    await f.advance(5000); assert.equal(f.players[0].coinAttack.cooldownEndsAt,deadline, 'ending the result banner must not restart cooldown');
  }
});

test('round cutoff releases queued funds; lobby reset starts fresh wallets and cooldowns', async t=>{
  const f=await fixture(t); f.attack(0,1); await f.queued(0); f.attack(2,1); await f.queued(2);
  send(f.host,'end'); await wait(()=>f.room.status==='settling');
  assert.equal(f.players[2].coinAttack.reserved,0); assert.equal(f.room.powerQueue.length,0);
  assert.equal(f.players[0].coinAttack.cooldownEndsAt,0, 'a cutoff before defense resolution does not start cooldown');
  f.attack(1,0); assert.equal((await f.error(1)).code,'ROUND_ENDED');
  await f.advance(2000); await wait(()=>f.room.status==='ended');
  send(f.host,'reset'); await wait(()=>f.room.status==='lobby');
  for (const player of f.players) assert.deepEqual(coinAttackView(player),{earned:0,spent:0,reserved:0,available:0,cooldownEndsAt:0,queued:false,queuePosition:null});
});

test('repeated coin reports replace earnings rather than refunding purchases', async t=>{
  const f=await fixture(t); f.attack(0,1); await f.queued(0);
  await f.report(0,{earnedCoins:90}); await f.report(0,{earnedCoins:100}); await f.report(0,{earnedCoins:90});
  assert.equal(f.players[0].coinAttack.earned,100); assert.equal(f.players[0].coinAttack.spent,30);
  assert.equal(coinAttackView(f.players[0]).available,70);
});
