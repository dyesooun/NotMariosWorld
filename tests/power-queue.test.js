import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { collectPower,powerEffects } from '../public/game/powers.js';

const waitFor=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Condition timed out');};
async function socket(url){const ws=new WebSocket(url);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
async function receive(ws,predicate){await waitFor(()=>ws.messages.some(predicate));return ws.messages.splice(ws.messages.findIndex(predicate),1)[0];}
const send=(ws,type,data={})=>ws.send(JSON.stringify({type,...data}));
async function fixture(t,count=3){
  let clock=10000000;
  const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>clock});await server.listen();t.after(()=>server.close());
  const url=`ws://127.0.0.1:${server.httpServer.address().port}`,host=await socket(url);
  send(host,'create');const made=await receive(host,m=>m.type==='created'),room=server.rooms.get(made.code),clients=[],players=[];
  for(let i=0;i<count;i++){
    const ws=await socket(url);send(ws,'join',{code:made.code,name:`Caster ${i+1}`});const joined=await receive(ws,m=>m.type==='joined');
    send(ws,'spawn');clients.push(ws);players.push(room.players.get(joined.id));
  }
  await waitFor(()=>players.every(p=>p.spawned));send(host,'start');await receive(host,m=>m.room?.status==='running');
  for(let i=0;i<count;i++){collectPower(players[i],1,()=>i/4);players[i].powerSlots[1].power.target='all';players[i].power.power.target='all';}
  const resolveQuiz=async()=>{
    const duel=room.powerDuel;if(duel?.phase!=='attack')return;
    const casterIndex=players.indexOf(duel.caster);
    send(clients[casterIndex],'powerAnswer',{transactionId:duel.id,challengeId:duel.attackQuestion.id,answer:duel.attackQuestion.answers[0]});
    await waitFor(()=>duel.phase!=='attack');
    for(const defense of duel.defenses.values())send(clients[players.indexOf(defense.player)],'powerAnswer',{transactionId:duel.id,challengeId:defense.question.id,answer:'intentionally wrong'});
    await waitFor(()=>duel.phase==='effect');
  };
  return {server,room,host,clients,players,url,code:made.code,now:()=>clock,
    async advance(ms){clock+=ms;await new Promise(r=>setTimeout(r,20));await resolveQuiz();},
    async use(index){send(clients[index],'usePower');await waitFor(()=>players[index].powerSlots[players[index].state.level].used||players[index].powerSlots[players[index].state.level].reserved);await resolveQuiz();},
    async state(predicate=()=>true){return receive(host,m=>m.type==='state'&&m.serverTime===clock&&predicate(m.room));}
  };
}

test('three simultaneous powers run FIFO with one effect and one five-second banner at a time',async t=>{
  const f=await fixture(t),[a,b,c]=f.players;
  await f.use(0);const first=(await f.state(r=>r.activePower?.by===a.id)).room;
  assert.equal(first.announcement.kind,'power');assert.equal(first.announcement.endsAt-first.announcement.startedAt,5000);
  assert.equal(first.activePower.endsAt,first.announcement.endsAt);
  assert.equal(b.effects.slow.endsAt,first.announcement.endsAt);
  await f.use(1);await f.use(2);
  const queued=(await f.state(r=>r.powerQueue.length===2)).room;
  assert.deepEqual(queued.powerQueue.map(q=>[q.casterId,q.position]),[[b.id,1],[c.id,2]]);
  assert.equal(b.power.queued,true);assert.equal(b.power.queuePosition,1);assert.equal(c.power.queuePosition,2);
  send(f.clients[1],'usePower');assert.equal((await receive(f.clients[1],m=>m.type==='error')).code,'POWER_UNAVAILABLE');
  assert.equal(f.room.powerQueue.length,2);
  await f.advance(2000);assert.equal(f.room.announcement.id,first.announcement.id);assert.equal(f.room.activePower.casterId,a.id);
  await f.advance(2999);assert.deepEqual(Object.keys(powerEffects(c,f.now())),['slow']);assert.equal(b.power.used,false);
  await f.advance(1);const second=(await f.state(r=>r.activePower?.by===b.id)).room;
  assert.equal(second.announcement.startedAt,first.announcement.endsAt);
  assert.equal(second.announcement.endsAt-second.announcement.startedAt,5000);
  assert.deepEqual(Object.keys(powerEffects(c,f.now())),['reverse']);
  assert.equal(c.power.queuePosition,1);
  await f.advance(5000);const third=(await f.state(r=>r.activePower?.by===c.id)).room;
  assert.equal(third.activePower.endsAt,f.now()+5000);assert.equal(third.powerQueue.length,0);
  assert.deepEqual(Object.keys(powerEffects(a,f.now())),['slippery']);
  await f.advance(5000);assert.equal(f.room.activePower,null);assert.equal(f.room.announcement,null);
  for(const player of f.players){assert.deepEqual(powerEffects(player,f.now()),{});assert.equal(player.powerSlots[1].used,true);}
});

test('level broadcasts share FIFO ordering without shortening power effects or starting them early',async t=>{
  const f=await fixture(t);await f.use(0);
  f.room.announcementQueue.push({id:'escape',kind:'level',text:'A runner escaped!',level:1});
  await f.use(1);
  await f.advance(5000);
  assert.equal(f.room.announcement.id,'escape');assert.equal(f.room.announcement.endsAt-f.now(),2000);
  assert.equal(f.room.activePower,null);assert.equal(f.players[1].power.used,false);
  assert.deepEqual(powerEffects(f.players[2],f.now()),{});
  await f.advance(1999);assert.equal(f.room.announcement.id,'escape');
  await f.advance(1);assert.equal(f.room.activePower.casterId,f.players[1].id);
  assert.equal(f.room.announcement.endsAt,f.now()+5000);
});

test('queued use survives death and level changes, blocking new pickup until consumed',async t=>{
  const f=await fixture(t),b=f.players[1];await f.use(0);await f.use(1);
  b.state.level=2;assert.equal(collectPower(b,2,()=>.99),null);
  b.state.deadUntil=b.state.elapsed+100;b.state.respawnRemaining=100;
  await f.advance(5000);
  assert.equal(f.room.activePower.casterId,b.id);assert.equal(f.room.activePower.level,1);
  assert.equal(b.powerSlots[1].used,true);assert.equal(b.power.level,1);assert.equal(b.power.used,true);
  b.state.deadUntil=0;b.state.respawnRemaining=0;assert.ok(collectPower(b,2,()=>.99));assert.equal(b.power.level,2);assert.equal(b.power.power.type,'fog');await f.use(1);
  b.state.deadUntil=b.state.elapsed+100;b.state.respawnRemaining=100;
  await f.advance(5000);
  assert.equal(f.room.activePower.level,2);assert.equal(b.powerSlots[2].used,true);
  assert.deepEqual(Object.keys(powerEffects(f.players[0],f.now())),['fog']);
});

test('disconnect removes a queued reservation and refresh starts with no inventory',async t=>{
  const f=await fixture(t),b=f.players[1];await f.use(0);await f.use(1);
  f.clients[1].close();await waitFor(()=>!b.connected);
  assert.equal(f.room.powerQueue.length,0);assert.equal(b.powerSlots[1].reserved,null);assert.equal(b.power.used,false);
  const rejoined=await socket(f.url);send(rejoined,'join',{code:f.code,name:b.name});await receive(rejoined,m=>m.type==='joined');
  assert.deepEqual(b.powerSlots,{});assert.equal(b.power,null);
  await f.advance(5000);assert.equal(f.room.activePower,null);
});

test('a queued power with no remaining opponent is returned unused',async t=>{
  const f=await fixture(t,2),b=f.players[1];await f.use(0);await f.use(1);
  f.clients[0].close();await waitFor(()=>!f.players[0].connected);await f.advance(5000);
  assert.equal(f.room.activePower,null);assert.equal(f.room.announcement,null);assert.equal(f.room.powerQueue.length,0);
  assert.equal(b.powerSlots[1].used,false);assert.equal(b.powerSlots[1].reserved,null);assert.equal(b.power.queued,false);
  assert.equal((await receive(f.clients[1],m=>m.type==='powerCancelled')).name,'Wrong Way');
});

test('round expiry cancels the queue before another power can start',async t=>{
  const f=await fixture(t),b=f.players[1];await f.use(0);await f.use(1);
  const deadline=f.room.endsAt;await f.advance(deadline-f.now());
  assert.equal(f.room.status,'ended');assert.equal(f.room.activePower,null);assert.equal(f.room.powerQueue.length,0);assert.equal(f.room.announcement,null);
  assert.equal(b.powerSlots[1].used,false);assert.equal(b.powerSlots[1].reserved,null);
  for(const player of f.players)assert.deepEqual(player.effects,{});
  assert.equal(f.host.messages.some(m=>m.serverTime===deadline&&m.room?.status==='running'&&m.room.activePower?.by===b.id),false);
});

test('manual end and lobby reset clear active powers and every queued reservation',async t=>{
  const f=await fixture(t);await f.use(0);await f.use(1);send(f.host,'end');await waitFor(()=>f.room.status==='ended');
  assert.equal(f.room.activePower,null);assert.equal(f.room.powerQueue.length,0);
  for(const player of f.players){assert.deepEqual(player.effects,{});assert.equal(player.powerSlots[1].reserved,null);}
  send(f.host,'reset');await waitFor(()=>f.room.status==='lobby');
  assert.equal(f.room.announcementQueue.length,0);
  for(const player of f.players){assert.deepEqual(player.powerSlots,{});assert.equal(player.power,null);}
});
