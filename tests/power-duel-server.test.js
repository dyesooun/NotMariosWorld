import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { collectPower,powerEffects } from '../public/game/powers.js';
import { LocalRunRuntime } from '../public/game/local-run.js';
import { isDuelFrozen } from '../public/game/client-state.js';
import { duelView } from '../server/power-duels.js';
import { LEVELS } from '../public/game/levels.js';

// Legacy power-duel fixtures require chest-backed inventory; use ocean in the
// former forest slot because authored forest has no power chests.
import { legacyOceanFixture } from './legacy-level-fixtures.js';
LEVELS[1] = legacyOceanFixture();

const waitFor=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Condition timed out');};
const ACTIONS=new Set(['usePower','powerAnswer','powerChestChoice']);
const send=(ws,type,data={})=>{const identity=ws.player&&ACTIONS.has(type)?{roundId:ws.room?.roundId,runId:ws.player.runId}:{};ws.send(JSON.stringify({type,...identity,...data}));};
async function socket(url){const ws=new WebSocket(url);ws.messages=[];ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
async function receive(ws,predicate){await waitFor(()=>ws.messages.some(predicate));return ws.messages.splice(ws.messages.findIndex(predicate),1)[0];}
async function fixture(t,count=3){
  let time=20000000;
  const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>time});await server.listen();t.after(()=>server.close());
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`,url=origin.replace('http:','ws:'),host=await socket(url);
  send(host,'create');const made=await receive(host,m=>m.type==='created'),room=server.rooms.get(made.code),clients=[],players=[];
  for(let i=0;i<count;i++){const ws=await socket(url);send(ws,'join',{code:made.code,name:`Quiz player ${i}`});const joined=await receive(ws,m=>m.type==='joined');send(ws,'spawn');clients.push(ws);players.push(room.players.get(joined.id));ws.player=players.at(-1);ws.room=room;}
  await waitFor(()=>players.every(p=>p.spawned));send(host,'start');await receive(host,m=>m.room?.status==='running');
  for(let i=0;i<count;i++){collectPower(players[i],1,()=>i/4);players[i].powerSlots[1].power.target='all';players[i].power.power.target='all';}
  const reportSeq=new Map();
  const sendRaw=(ws,type,data={})=>ws.send(JSON.stringify({type,...data}));
  const report=async(i,overrides={})=>{const p=players[i],base=p.summary||{},level=overrides.level??base.level??1,completed=overrides.completedWorlds??base.completedWorlds??(level>1?room.settings.worldOrder.slice(0,Math.max(0,room.settings.worldOrder.indexOf(level))):[]),summary={level,completedWorlds:completed,coins:0,current:0,banked:0,distanceMax:0,progress:0,checkpoint:null,deaths:0,respawnRemaining:0,finished:false,finishedAt:null,...base,...overrides,completedWorlds:completed};const seq=(reportSeq.get(p.id)||0)+1;reportSeq.set(p.id,seq);sendRaw(clients[i],'runReport',{roundId:room.roundId,runId:p.runId,seq,at:time,summary,chestId:null,final:false});await receive(clients[i],m=>m.type==='reportAck'&&m.seq===seq);};
  return {server,room,clients,players,host,origin,url,code:made.code,now:()=>time,report,
    async advance(ms){time+=ms;await new Promise(r=>setTimeout(r,25));},
    async use(i=0){send(clients[i],'usePower');await waitFor(()=>room.powerDuel?.caster===players[i]||players[i].power.queued);},
    async answer(i,correct=true,extra={}){
      const duel=room.powerDuel,defense=duel.defenses.get(players[i].id),q=duel.phase==='attack'?duel.attackQuestion:defense.question;
      send(clients[i],'powerAnswer',{transactionId:duel.id,challengeId:q.id,answer:correct?`  ${q.answers[0].toUpperCase()}  `:'definitely incorrect',...extra});
      return receive(clients[i],m=>m.type==='powerAnswerResult');
    }
  };
}

test('correct attack waits for all defenses; only failed defenders get a full five-second effect',async t=>{
  const f=await fixture(t);await f.use();assert.equal(f.room.powerDuel.phase,'attack');assert.equal(f.room.activePower,null);
  assert.ok(f.players.every(p=>Object.keys(powerEffects(p,f.now())).length===0));
  assert.equal((await f.answer(0)).correct,true);assert.equal(f.room.powerDuel.phase,'defense');
  assert.equal(f.room.announcement.id,f.room.powerDuel.id);
  assert.equal(f.room.activePower,null);assert.equal(f.room.announcement.kind,'power-quiz');
  assert.equal((await f.answer(1)).correct,true);assert.equal(f.room.powerDuel.phase,'defense');
  assert.equal(f.room.activePower,null);
  assert.equal((await f.answer(2,false)).correct,false);await waitFor(()=>f.room.activePower);
  assert.deepEqual(powerEffects(f.players[0],f.now()),{});assert.deepEqual(powerEffects(f.players[1],f.now()),{});
  assert.equal(powerEffects(f.players[2],f.now()).slow.endsAt,f.now()+5000);
  assert.equal(f.room.announcement.endsAt,f.room.activePower.endsAt);assert.equal(f.room.powerDuel.outcome,'success');
  await f.advance(4999);assert.ok(f.room.activePower);await f.advance(1);assert.equal(f.room.powerDuel,null);
});

test('duel phase freeze is represented by coordinator metadata and local runtime',async t=>{
  const f=await fixture(t);await f.use();assert.equal(isDuelFrozen(duelView(f.room),f.players[0].id),true);
  const local=new LocalRunRuntime({roundId:'r',runId:'u',profile:{name:'local'},settings:{worldOrder:[1,2,3]}});local.begin([1,2,3]);local.setInput({right:true});local.tick(.2);const x=local.state.x;local.setFrozen(true);local.tick(.2);assert.equal(local.state.x,x);assert.equal(local.state.vx,0);
  await f.answer(0);assert.equal(isDuelFrozen(duelView(f.room),f.players[0].id),true);assert.equal(isDuelFrozen(duelView(f.room),f.players[1].id),true);
  await f.answer(1);await f.answer(2,false);assert.equal(f.room.powerDuel.phase,'effect');
});

test('wrong attacker answer backfires on self with no defense phase',async t=>{
  const f=await fixture(t);await f.use();assert.equal((await f.answer(0,false)).correct,false);
  await waitFor(()=>f.room.activePower);assert.equal(f.room.powerDuel.outcome,'attackerFailed');
  assert.deepEqual(Object.keys(powerEffects(f.players[0],f.now())),['slow']);
  for(const p of f.players.slice(1))assert.deepEqual(powerEffects(p,f.now()),{});
  assert.match(f.room.announcement.text,/backfired/);assert.equal(f.room.announcement.endsAt-f.now(),5000);
});

test('unanswered attack and defense questions count as failures after ten seconds',async t=>{
  const f=await fixture(t);await f.use();await f.advance(9999);assert.equal(f.room.powerDuel.phase,'attack');
  await f.advance(1);assert.equal(f.room.powerDuel.outcome,'attackerFailed');assert.ok(powerEffects(f.players[0],f.now()).slow);
  await f.advance(5000);await f.use(1);await f.answer(1);assert.equal(f.room.powerDuel.phase,'defense');
  await f.advance(10000);assert.equal(f.room.powerDuel.phase,'effect');assert.ok(powerEffects(f.players[0],f.now()).reverse);assert.ok(powerEffects(f.players[2],f.now()).reverse);
});

test('all successful defenders block the attack while its result occupies the five-second slot',async t=>{
  const f=await fixture(t);await f.use();await f.answer(0);await f.answer(1);await f.answer(2);
  assert.equal(f.room.powerDuel.outcome,'blocked');assert.equal(f.room.powerDuel.phase,'effect');
  assert.ok(f.players.every(p=>Object.keys(powerEffects(p,f.now())).length===0));
  assert.match(f.room.announcement.text,/blocked/);assert.equal(f.room.announcement.endsAt-f.now(),5000);
});

test('answers are socket-bound, one-attempt, and reject host, foreign, stale and expired requests',async t=>{
  const f=await fixture(t);await f.use();const duel=f.room.powerDuel;
  const request={transactionId:duel.id,challengeId:duel.attackQuestion.id,answer:duel.attackQuestion.answers[0]};
  send(f.host,'powerAnswer',request);assert.equal((await receive(f.host,m=>m.type==='error')).code,'AUTH');
  send(f.clients[1],'powerAnswer',request);assert.equal((await receive(f.clients[1],m=>m.type==='error')).code,'QUIZ_INVALID');
  send(f.clients[0],'powerAnswer',{...request,transactionId:'stale'});assert.equal((await receive(f.clients[0],m=>m.type==='error')).code,'QUIZ_INVALID');
  await f.answer(0);await f.answer(1);
  const d=f.room.powerDuel.defenses.get(f.players[1].id);
  send(f.clients[1],'powerAnswer',{transactionId:duel.id,challengeId:d.question.id,answer:'different answer'});
  assert.equal((await receive(f.clients[1],m=>m.type==='error')).code,'QUIZ_INVALID');assert.equal(d.result,'correct');
  await f.advance(10000);
  send(f.clients[2],'powerAnswer',{transactionId:duel.id,challengeId:duel.defenses.get(f.players[2].id).question.id,answer:'too late'});
  assert.equal((await receive(f.clients[2],m=>m.type==='error')).code,'QUIZ_CLOSED');
});

test('only participants and the host see prompts; no snapshots or static routes expose answer keys',async t=>{
  const f=await fixture(t);await f.use();
  const own=await receive(f.clients[0],m=>m.room?.powerDuel?.phase==='attack');
  const other=await receive(f.clients[1],m=>m.room?.powerDuel?.phase==='attack');
  const host=await receive(f.host,m=>m.room?.powerDuel?.phase==='attack');
  assert.ok(own.room.players.find(p=>p.id===f.players[0].id).powerQuiz.prompt);
  assert.equal(own.room.announcement.id,own.room.powerDuel.id);
  assert.equal(own.room.players.find(p=>p.id===f.players[0].id).powerQuiz.transactionId,own.room.powerDuel.id);
  assert.equal(other.room.players.find(p=>p.id===f.players[0].id).powerQuiz,null);
  assert.ok(host.room.players.find(p=>p.id===f.players[0].id).powerQuiz.prompt);
  for(const snapshot of [own,other,host]){
    const serialized=JSON.stringify(snapshot);assert.equal(serialized.includes('"answers"'),false);assert.equal(serialized.includes('attackQuestion'),false);assert.equal(serialized.includes('"answer"'),false);
  }
  assert.equal((await fetch(f.origin+'/server/power-questions.js')).status,404);
  assert.equal((await fetch(f.origin+'/../server/power-questions.js')).status,404);
});

test('a defender who refreshes or finishes cannot receive an old attack in the new run',async t=>{
  const f=await fixture(t);await f.use();await f.answer(0);
  const oldRun=f.players[1].runId;
  f.clients[1].close();await waitFor(()=>!f.players[1].connected);
  const rejoined=await socket(f.url);send(rejoined,'join',{code:f.code,name:f.players[1].name});await receive(rejoined,m=>m.type==='joined');
  assert.notEqual(f.players[1].runId,oldRun);send(rejoined,'spawn');await waitFor(()=>f.players[1].spawned);
  const state=await receive(rejoined,m=>m.type==='state'&&m.room.players.find(p=>p.id===f.players[1].id)?.spawned);
  assert.equal(state.room.players.find(p=>p.id===f.players[1].id).powerQuiz,null);
  await f.report(2,{level:3,completedWorlds:[1,2,3],finished:true,finishedAt:f.now()});await f.advance(1);
  assert.equal(f.room.powerDuel.phase,'effect');assert.deepEqual(f.room.powerDuel.affectedIds,[]);
  assert.deepEqual(powerEffects(f.players[1],f.now()),{});
});

test('caster death does not cancel a quiz and caster disconnect advances the FIFO safely',async t=>{
  const f=await fixture(t);await f.use();await f.use(1);
  await f.report(0,{deaths:1,respawnRemaining:3});
  assert.equal((await f.answer(0)).correct,true);await f.answer(1);await f.answer(2);
  await f.advance(5000);assert.equal(f.room.powerDuel.caster.id,f.players[1].id);
  await f.use(2);f.clients[1].close();await waitFor(()=>f.room.powerDuel?.caster===f.players[2]);
  assert.equal(f.room.powerDuel.phase,'attack');assert.equal(f.room.powerQueue.length,0);
});

test('round end and reset cancel every quiz phase and reject answers at the deadline',async t=>{
  for(const phase of ['attack','defense']){
    const f=await fixture(t);await f.use();if(phase==='defense')await f.answer(0);
    await f.advance(f.room.endsAt-f.now());assert.ok(['settling','ended'].includes(f.room.status));assert.equal(f.room.powerDuel,null);assert.equal(f.room.activePower,null);assert.equal(f.room.announcement,null);
    if(f.room.status==='settling') await f.advance(2000);
    send(f.host,'reset');await waitFor(()=>f.room.status==='lobby');
    assert.equal(f.room.powerQueue.length,0);assert.ok(f.players.every(p=>p.power===null));
  }
});

test('selected defenders receive an answer prompt even without a held chest power',async t=>{
  const f=await fixture(t);f.players[1].powerSlots={};f.players[1].power=null;
  await f.report(2,{level:3,completedWorlds:[1,2,3],finished:true,finishedAt:f.now()});
  f.players[0].powerSlots[1].power.target='random';
  await f.use();
  while(!f.room.powerDuel) await f.advance(2000);
  await f.answer(0);
  const state=await receive(f.clients[1],m=>m.room?.powerDuel?.phase==='defense');
  const me=state.room.players.find(p=>p.id===f.players[1].id);
  assert.equal(me.power,null);assert.ok(me.powerQuiz?.prompt);assert.equal(me.powerQuiz.answered,false);
  assert.deepEqual(state.room.powerDuel.targetIds,[f.players[1].id]);
  await f.answer(1);assert.equal(f.room.powerDuel.outcome,'blocked');
});

test('a queued caster still receives their attack question after finishing the level run',async t=>{
  const f=await fixture(t);await f.use();await f.answer(0);await f.answer(1,false);await f.answer(2,false);
  await f.use(1);await f.report(1,{level:3,completedWorlds:[1,2,3],finished:true,finishedAt:f.now()});await f.advance(5000);
  const state=await receive(f.clients[1],m=>m.room?.powerDuel?.phase==='attack'&&m.room.powerDuel.casterId===f.players[1].id);
  assert.equal(state.room.players.find(p=>p.id===f.players[1].id).summary.finished,true);
  assert.ok(state.room.players.find(p=>p.id===f.players[1].id).powerQuiz?.prompt);
  assert.equal(state.room.announcement.id,state.room.powerDuel.id);
  await f.answer(1,false);assert.equal(f.room.powerDuel.outcome,'attackerFailed');
});
