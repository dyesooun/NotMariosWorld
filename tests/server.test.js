import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { emptyRunSummary, PROTOCOL_VERSION } from '../public/game/run-protocol.js';
import { LEVELS } from '../public/game/levels.js';
import { COLORS } from '../public/game/engine.js';

const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function wait(check) { for(let i=0;i<400;i++){const found=check();if(found)return found;await sleep(5);}throw new Error('Condition timed out'); }
async function open(url){const ws=new WebSocket(url);ws.inbox=[];ws.on('message',raw=>ws.inbox.push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
async function receive(ws,predicate){await wait(()=>ws.inbox.some(predicate));return ws.inbox.splice(ws.inbox.findIndex(predicate),1)[0];}
const send=(ws,type,data={})=>ws.send(JSON.stringify({type,...data}));
async function fixture(t,{count=1,settings={}}={}){
  let clock=20000000;
  const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>clock});await server.listen();t.after(()=>server.close());
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`,url=origin.replace('http:','ws:'),host=await open(url);
  send(host,'create',{settings});const made=await receive(host,m=>m.type==='created'),room=server.rooms.get(made.code),clients=[],players=[];
  async function join(name){const ws=await open(url);send(ws,'join',{code:made.code,name});const joined=await receive(ws,m=>m.type==='joined');return{ws,player:room.players.get(joined.id)};}
  for(let i=0;i<count;i++){const {ws,player}=await join(`Runner ${i+1}`);clients.push(ws);players.push(player);await wait(()=>player.spawned);}
  async function report(index,patch={},options={}){
    const player=players[index];const data={roundId:room.roundId,runId:player.runId,seq:player.lastSeq+1,at:room.status==='settling'?room.cutoffAt:clock,summary:{...player.summary,...patch},chestId:null,final:false,...options};
    send(clients[index],'runReport',data);
    return receive(clients[index],m=>m.type==='error'||m.type==='reportAck'&&m.seq===data.seq);
  }
  return{server,origin,url,host,room,clients,players,join,report,now:()=>clock,
    async start(){send(host,'start');await receive(host,m=>m.type==='state'&&m.room.status==='running');},
    async advance(ms){clock+=ms;await sleep(20);},
    async end(){send(host,'end');await wait(()=>room.status!=='running');},
  };
}

test('health, cache protection, defaults, and explicitly disabled icebreakers',async t=>{
  const f=await fixture(t);const response=await fetch(f.origin+'/health'),health=await response.json();
  assert.equal(health.ok,true);assert.equal(health.needsRestart,false);assert.equal(health.protocolVersion,PROTOCOL_VERSION);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(f.room.settings.inkDarknessPercent,95);
  assert.equal((await fetch(f.origin+'/app.js')).headers.get('cache-control'),'no-store');assert.equal(f.room.settings.questions.length,5);
  send(f.host,'settings',{settings:{questions:[]}});await wait(()=>f.room.settings.questions.length===0);
  for(const endpoint of ['/server/power-questions.js','/../server/power-questions.js'])assert.equal((await fetch(f.origin+endpoint)).status,404);
});

test('supplied background WAV files are served as audio',async t=>{
  const f=await fixture(t);
  const response=await fetch(f.origin+'/assets/audio/lobby/lobby_main_loop_30s.wav');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'audio/wav');
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),'RIFF');
});

test('a victory hold reports its banked score and settles without entering the next world',async t=>{
  const f=await fixture(t,{settings:{worldOrder:[2,1]}});
  await f.start();
  const cleared={level:2,completedWorlds:[2],current:0,distanceMax:0,banked:500,progress:1};
  assert.equal((await f.report(0,cleared)).type,'reportAck');
  assert.equal(f.players[0].score,500);
  assert.equal(f.players[0].summary.level,2);
  await f.end();
  assert.equal((await f.report(0,cleared,{final:true})).type,'reportAck');
  await wait(()=>f.room.status==='ended');
  assert.equal(f.room.results[0].score,500);
  assert.equal(f.room.results[0].finishTime,null);
});

test('host authorization, room creation, spawn, and manual start remain separate',async t=>{
  const f=await fixture(t);assert.equal(f.room.status,'lobby');send(f.clients[0],'start');assert.equal((await receive(f.clients[0],m=>m.type==='error')).code,'AUTH');
  const intruder=await open(f.url);send(intruder,'hostJoin',{code:f.room.code,token:'wrong'});assert.equal((await receive(intruder,m=>m.type==='error')).code,'AUTH');intruder.close();
  await f.start();assert.equal(f.room.status,'running');assert.equal(f.players[0].summary.level,1);assert.equal(f.players[0].spawned,true);
});

test('joining enters the playable lobby immediately and lobby profile edits preserve the run',async t=>{
  const f=await fixture(t,{count:2}); const player=f.players[0];
  assert.equal(player.spawned,true);
  const runId=player.runId; player.score=42; player.summary={...player.summary,current:42};
  f.host.inbox=[]; f.clients[1].inbox=[];
  send(f.clients[0],'profile',{name:'  New Name  ',avatar:'cat',color:COLORS[1]});
  await wait(()=>player.name==='New Name');
  assert.equal(player.avatar,'cat'); assert.equal(player.color,COLORS[1]);
  assert.equal(player.runId,runId); assert.equal(player.score,42); assert.equal(player.summary.current,42);
  const hostState=await receive(f.host,m=>m.type==='state'&&m.room.players.some(p=>p.id===player.id&&p.name==='New Name'));
  const peerState=await receive(f.clients[1],m=>m.type==='state'&&m.room.players.some(p=>p.id===player.id&&p.name==='New Name'));
  for(const state of [hostState,peerState]) { const view=state.room.players.find(p=>p.id===player.id); assert.equal(view.name,'New Name'); assert.equal(view.avatar,'cat'); assert.equal(view.color,COLORS[1]); }
  send(f.clients[0],'spawn'); await sleep(5); assert.equal(player.spawned,true);
});

test('legacy spawn remains accepted for lobby players but cannot activate ended spectators',async t=>{
  const f=await fixture(t); const player=f.players[0]; player.spawned=false;
  send(f.clients[0],'spawn'); await wait(()=>player.spawned);
  await f.start(); await f.end(); await f.report(0,{}, {final:true}); await wait(()=>f.room.status==='ended');
  const spectator=await f.join('Spectator'); send(spectator.ws,'spawn'); await sleep(10);
  assert.equal(spectator.player.spawned,false);
});

test('race start locks identity while lobby reset makes players active again',async t=>{
  const f=await fixture(t); const player=f.players[0]; await f.start();
  send(f.clients[0],'profile',{name:'Too Late',avatar:'robot',color:COLORS[4]});
  assert.equal((await receive(f.clients[0],m=>m.type==='error')).code,'PROFILE_LOCKED');
  assert.equal(player.name,'Runner 1'); assert.equal(player.avatar,'explorer'); assert.equal(player.color,COLORS[0]);
  await f.end(); await f.report(0,{},{final:true}); await wait(()=>f.room.status==='ended');
  send(f.host,'reset'); await wait(()=>f.room.status==='lobby');
  assert.equal(player.spawned,true); assert.equal(player.summary.level,0);
  f.clients[0].inbox=[]; send(f.clients[0],'profile',{name:'Lobby Name',avatar:'wizard',color:COLORS[5]});
  await wait(()=>player.name==='Lobby Name'); assert.equal(player.spawned,true);
  assert.equal(player.avatar,'wizard'); assert.equal(player.color,COLORS[5]);
});

test('reports update only host detail and compact rankings, with no simulation payload',async t=>{
  const f=await fixture(t,{count:2});await f.start();f.host.inbox=[];f.clients.forEach(ws=>ws.inbox=[]);
  assert.equal((await f.report(0,{coins:2,current:20,distanceMax:65,progress:.05})).type,'reportAck');
  const progress=await receive(f.host,m=>m.type==='progress');assert.equal(progress.players.length,1);const p=progress.players[0];
  assert.equal(p.score,22);assert.equal(p.summary.coins,2);assert.equal(p.runId,f.players[0].runId);assert.equal('state'in p,false);
  const compact=await receive(f.clients[1],m=>m.type==='leaderboard');assert.equal(compact.players.find(p=>p.id===f.players[0].id).score,22);
  assert.equal(JSON.stringify(compact).includes('checkpoint'),false);assert.equal(JSON.stringify(compact).includes('runId'),false);
  assert.equal(f.clients[1].inbox.some(m=>m.type==='progress'),false);
  assert.equal(f.host.inbox.some(m=>m.type==='state'),false);
  for(const field of ['enemies','projectiles','collected','"vx"','"x"'])assert.equal(JSON.stringify(progress).includes(field),false);
});

test('idle rooms emit no gameplay snapshots or input traffic and ignore legacy movement inputs',async t=>{
  const f=await fixture(t);await f.start();f.host.inbox=[];f.clients[0].inbox=[];
  send(f.clients[0],'input',{right:true,jump:true});await f.advance(1000);
  assert.equal(f.host.inbox.length,0);assert.equal(f.clients[0].inbox.length,0);
  assert.deepEqual(f.players[0].summary,emptyRunSummary(1));assert.equal('x'in f.players[0].state,false);
});

test('report sequences, schema, and run identity reject duplicate or stale awards',async t=>{
  const f=await fixture(t);await f.start();await f.report(0,{current:20});
  assert.equal((await f.report(0,{level:3,current:900})).code,'RUN_REPORT_INVALID');
  for(const options of [{seq:1},{runId:'old-run'},{roundId:'old-round'},{seq:2.5}])assert.equal((await f.report(0,{current:900},options)).code,'RUN_REPORT_INVALID');
  assert.equal((await f.report(0,{current:Infinity})).code,'RUN_REPORT_INVALID');assert.equal(f.players[0].score,20);
  const stranger=await open(f.url);send(stranger,'runReport',{playerId:f.players[0].id});assert.equal((await receive(stranger,m=>m.type==='error')).message,'Join a room first');stranger.close();
});

test('death reports replace points with checkpoint totals and preserve banked worlds',async t=>{
  const f=await fixture(t);await f.start();const checkpoint={id:LEVELS[2].checkpoints[0].id};
  await f.report(0,{level:2,completedWorlds:[1],banked:600,coins:8,current:80,distanceMax:4200,progress:.3,checkpoint});
  await f.report(0,{coins:4,current:40,distanceMax:3500,progress:.25,deaths:1,respawnRemaining:3});
  assert.equal(f.players[0].summary.checkpoint.id,checkpoint.id);assert.equal(f.players[0].score,749);
  await f.report(0,{respawnRemaining:0});assert.equal(f.players[0].summary.banked,600);
  const update=await receive(f.host,m=>m.type==='progress'&&m.players[0].summary.deaths===1);assert.equal(update.players[0].score,749);
});

test('late arrivals and refreshed runs start the selected first biome with shared remaining time',async t=>{
  const f=await fixture(t,{settings:{worldOrder:[2,1]}});await f.start();await f.advance(5000);
  const late=await f.join('Late arrival');assert.equal(late.player.summary.level,2);assert.equal(late.player.spawned,true);const deadline=f.room.endsAt;
  const oldRun=f.players[0].runId;await f.report(0,{current:80});f.clients[0].close();await wait(()=>!f.players[0].connected);
  const refreshed=await f.join(f.players[0].name);assert.equal(refreshed.player,f.players[0]);assert.notEqual(refreshed.player.runId,oldRun);assert.equal(refreshed.player.summary.level,2);
  assert.equal(refreshed.player.score,0);assert.equal(refreshed.player.lastSeq,0);assert.equal(f.room.endsAt,deadline);
  assert.equal(refreshed.player.spawned,true);
});

test('natural expiry uses the original deadline and accepts exact unbanked final totals',async t=>{
  const f=await fixture(t);await f.start();await f.report(0,{banked:100,current:37,distanceMax:320});
  const deadline=f.room.endsAt;await f.advance(deadline-f.now()+60);assert.equal(f.room.status,'settling');assert.equal(f.room.cutoffAt,deadline);
  assert.equal((await f.report(0,{current:55,distanceMax:337},{final:true,at:deadline})).type,'reportAck');
  await wait(()=>f.room.status==='ended');assert.equal(f.room.results[0].score,165);assert.equal(f.room.results[0].rank,1);
  const frozen=JSON.stringify(f.room.results);assert.equal((await f.report(0,{current:999},{final:true})).code,'RUN_REPORT_CLOSED');assert.equal(JSON.stringify(f.room.results),frozen);
});

test('manual end collects one cutoff report per run and then publishes immutable results',async t=>{
  const f=await fixture(t,{count:2});await f.start();await f.advance(100);await f.end();
  assert.equal(f.room.status,'settling');const cutoff=f.room.cutoffAt;
  await f.report(0,{current:50},{final:true,at:cutoff});assert.equal(f.room.status,'settling');
  assert.equal((await f.report(0,{current:80},{final:true,at:cutoff})).code,'RUN_REPORT_CLOSED');
  assert.equal((await f.report(1,{current:80},{final:true,at:cutoff+1})).code,'RUN_REPORT_CLOSED');
  await f.report(1,{current:40},{final:true,at:cutoff});await wait(()=>f.room.status==='ended');
  assert.deepEqual(f.room.results.map(p=>p.score),[50,40]);
});

test('missing final reports fall back after two seconds and resetting waits for published results',async t=>{
  const f=await fixture(t);await f.start();await f.report(0,{current:25});await f.end();
  send(f.host,'reset');await sleep(10);assert.equal(f.room.status,'settling');
  await f.advance(1999);assert.equal(f.room.status,'settling');await f.advance(1);assert.equal(f.room.status,'ended');assert.equal(f.room.results[0].score,25);
  send(f.host,'reset');await wait(()=>f.room.status==='lobby');assert.equal(f.players[0].score,0);assert.equal(f.players[0].spawned,true);
});

test('settlement protects captured runs, and ended refreshes and spectators cannot rerank results',async t=>{
  const f=await fixture(t);await f.start();await f.report(0,{current:30});await f.end();
  const waiting=await open(f.url);send(waiting,'join',{code:f.room.code,name:'Too late'});assert.equal((await receive(waiting,m=>m.type==='error')).code,'ROUND_FINALIZING');waiting.close();
  await f.report(0,{},{final:true});await wait(()=>f.room.status==='ended');const frozen=JSON.stringify(f.room.results),runId=f.players[0].runId;
  f.clients[0].close();await wait(()=>!f.players[0].connected);const restored=await f.join(f.players[0].name);assert.equal(restored.player.runId,runId);
  const spectator=await f.join('Spectator');assert.equal(spectator.player.spawned,false);assert.equal(JSON.stringify(f.room.results),frozen);
  const state=await receive(spectator.ws,m=>m.type==='state');assert.equal(state.room.players.find(p=>p.id===spectator.player.id).rank,null);
});

test('full-course tiebreak time is room-relative and independent of packet arrival order',async t=>{
  const f=await fixture(t,{count:3});await f.start();await f.advance(1000);
  const finished={level:2,completedWorlds:[1,2],finished:true,banked:900};
  await f.report(0,{...finished,finishedAt:f.room.startedAt+900});
  await f.report(1,{...finished,finishedAt:f.room.startedAt+700});
  await f.report(2,{...finished,finishedAt:f.room.startedAt+700});
  await f.end();for(let i=0;i<3;i++)await f.report(i,{},{final:true});await wait(()=>f.room.status==='ended');
  assert.deepEqual(f.room.results.map(p=>p.id),[f.players[1].id,f.players[2].id,f.players[0].id]);assert.equal(f.room.results[0].finishTime,.7);
});

test('host recovery rebuilds lightweight cached progress without resetting the round',async t=>{
  const f=await fixture(t);await f.start();await f.report(0,{coins:3,current:30,progress:.2});
  const token=f.room.token,deadline=f.room.endsAt;f.host.close();await wait(()=>!f.room.hostWs);
  const resumed=await open(f.url);send(resumed,'hostJoin',{code:f.room.code,token});const state=await receive(resumed,m=>m.type==='state');
  assert.equal(state.room.players[0].summary.coins,3);assert.equal(state.room.endsAt,deadline);assert.equal('state'in state.room.players[0],false);
});

test('manual icebreakers keep named votes, skip behavior, and the fifteen-second deadline',async t=>{
  const f=await fixture(t,{count:2});assert.equal(f.room.question,null);send(f.host,'launchQuestion',{index:0});await wait(()=>f.room.question);
  send(f.clients[0],'vote',{choice:0});send(f.clients[1],'vote',{choice:1});await wait(()=>f.room.question.votes.size===2);
  const state=await receive(f.clients[0],m=>m.room?.question&&Object.keys(m.room.question.votes).length===2);assert.equal(state.room.question.votes[f.players[1].id],1);
  await f.advance(15000);assert.equal(f.room.question.closed,true);send(f.clients[0],'vote',{choice:1});await sleep(10);assert.equal(f.room.question.votes.get(f.players[0].id),0);
  send(f.host,'skipQuestion');await wait(()=>f.room.question===null);send(f.host,'launchQuestion',{index:1});await wait(()=>f.room.question?.index===1);
  await f.start();assert.equal(f.room.question,null);
});

test('twenty-five players aggregate reports without consuming a host slot',async t=>{
  const f=await fixture(t,{count:25});const overflow=await open(f.url);send(overflow,'join',{code:f.room.code,name:'Overflow'});assert.equal((await receive(overflow,m=>m.type==='error')).code,'FULL');overflow.close();
  await f.start();await Promise.all(f.players.map((_,i)=>f.report(i,{current:i*10,progress:.05})));
  assert.equal(f.room.players.size,25);assert.equal(f.room.players.has(f.host.id),false);
  await f.end();await Promise.all(f.players.map((_,i)=>f.report(i,{current:i*10+1},{final:true})));await wait(()=>f.room.status==='ended');
  assert.equal(f.room.results.length,25);assert.equal(f.room.results[0].score,241);assert.equal(f.room.results[24].rank,25);
});
