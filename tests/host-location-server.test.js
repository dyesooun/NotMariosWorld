import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(check){for(let i=0;i<400;i++){if(check())return;await sleep(5);}throw new Error('Condition timed out');}
async function open(url){const ws=new WebSocket(url);ws.inbox=[];ws.on('message',raw=>ws.inbox.push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
async function take(ws,predicate){await wait(()=>ws.inbox.some(predicate));return ws.inbox.splice(ws.inbox.findIndex(predicate),1)[0];}
const send=(ws,type,data={})=>ws.send(JSON.stringify({type,...data}));
async function fixture(t,count=2){
  let clock=1000000;
  const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>clock});await server.listen();t.after(()=>server.close());
  const url=`ws://127.0.0.1:${server.httpServer.address().port}`,host=await open(url);
  send(host,'create');const made=await take(host,m=>m.type==='created'),room=server.rooms.get(made.code),clients=[],players=[];
  async function join(name){const ws=await open(url);send(ws,'join',{code:room.code,name});const joined=await take(ws,m=>m.type==='joined');return{ws,player:room.players.get(joined.id)};}
  for(let i=0;i<count;i++){const entry=await join(`Runner ${i+1}`);clients.push(entry.ws);players.push(entry.player);}
  const action=(index,type,data={})=>send(clients[index],type,{roundId:room.roundId,runId:players[index].runId,...data});
  async function report(index,location,patch={},extra={}){
    const p=players[index],seq=p.lastSeq+1;
    action(index,'runReport',{seq,at:clock,summary:{...p.summary,...patch},...(location===undefined?{}:{location}),final:false,...extra});
    return take(clients[index],m=>m.type==='error'||m.type==='reportAck'&&m.seq===seq);
  }
  return{server,room,host,clients,players,join,action,report,now:()=>clock,
    async start(){send(host,'start');await take(host,m=>m.type==='state'&&m.room.status==='running');},
    async advance(ms){clock+=ms;await sleep(25);},
  };
}

test('25 players deliver host-only location patches without extra idle updates or public pose fields',async t=>{
  const f=await fixture(t,25);
  for(let i=0;i<25;i++){
    const location={level:0,x:90+i*20,y:-10+i};f.action(i,'playerLocation',{location});
    const patch=await take(f.host,m=>m.type==='progress'&&m.players[0].id===f.players[i].id);
    assert.deepEqual(patch.players[0].location,{...location,at:f.now()});assert.equal(patch.players.length,1);
  }
  await f.start();
  for(let i=0;i<25;i++){
    const location={level:1,x:900+i*20,y:480};
    assert.equal((await f.report(i,location,{current:i*10})).type,'reportAck');
    const patch=await take(f.host,m=>m.type==='progress'&&m.players[0].id===f.players[i].id);
    assert.deepEqual(patch.players[0].location,{...location,at:f.now()});
    assert.equal(Object.hasOwn(patch.players[0].summary,'location'),false);
  }
  await f.advance(100);
  for(const ws of f.clients){assert.equal(JSON.stringify(ws.inbox).includes('"location"'),false);ws.inbox=[];}
  f.host.inbox=[];await f.advance(1000);
  assert.equal(f.host.inbox.length,0,'idle players generate no additional progress/position traffic');
  for(const ws of f.clients)assert.equal(ws.inbox.length,0);
});

test('malformed, duplicate, foreign-run and mismatched-world reports cannot move a marker or alter score',async t=>{
  const f=await fixture(t);await f.start();
  assert.equal((await f.report(0,{level:1,x:250.6,y:-31.8},{current:70})).type,'reportAck');
  const saved={...f.players[0].location},seq=f.players[0].lastSeq;
  for(const location of [null,[],{level:1,x:null,y:1},{level:1,x:'20',y:1},{level:999,x:1,y:1},{level:3,x:1,y:1},{level:2,x:1,y:1},{level:1,x:10000001,y:1}]){
    assert.equal((await f.report(0,location,{current:900})).code,'RUN_REPORT_INVALID');
    assert.deepEqual(f.players[0].location,saved);assert.equal(f.players[0].score,70);assert.equal(f.players[0].lastSeq,seq);
  }
  for(const extra of [{seq},{runId:'old'},{roundId:'old'}]){
    assert.equal((await f.report(0,{level:1,x:999,y:999},{current:900},extra)).code,'RUN_REPORT_INVALID');
    assert.deepEqual(f.players[0].location,saved);
  }
  assert.equal((await f.report(0,undefined,{current:80})).type,'reportAck','omitted metadata remains compatible');
  assert.deepEqual(f.players[0].location,saved);
});

test('accepted power actions piggyback location in the first host broadcast and rejected actions leave it unchanged',async t=>{
  const f=await fixture(t);await f.start();await f.report(0,{level:1,x:100,y:450},{earnedCoins:90});
  f.action(0,'coinAttack',{powerType:'bad',targetId:f.players[1].id,location:{level:1,x:9000,y:450}});
  assert.equal((await take(f.clients[0],m=>m.type==='error')).code,'POWER_INVALID');
  assert.equal(f.players[0].location.x,100);
  f.host.inbox=[];
  f.action(0,'coinAttack',{powerType:'slow',targetId:f.players[1].id,location:{level:1,x:2222,y:450}});
  await take(f.clients[0],m=>m.type==='coinAttackQueued');
  const state=await take(f.host,m=>m.type==='state'&&m.room.powerDuel?.source==='coin');
  assert.equal(state.room.players.find(p=>p.id===f.players[0].id).location.x,2222);
  const duel=f.room.powerDuel;
  f.action(0,'powerAnswer',{transactionId:duel.id,challengeId:duel.attackQuestion.id,answer:'__wrong__',location:{level:1,x:2250,y:450}});
  await take(f.clients[0],m=>m.type==='powerAnswerResult');
  assert.equal(f.players[0].location.x,2250);
  f.action(0,'powerAnswer',{transactionId:duel.id,challengeId:duel.attackQuestion.id,answer:'__wrong__',location:{level:1,x:9000,y:450}});
  await take(f.clients[0],m=>m.type==='error');assert.equal(f.players[0].location.x,2250);
  for(const ws of f.clients)assert.equal(JSON.stringify(ws.inbox).includes('"location"'),false);
});

test('lobby initialization is idempotent and accepted profile/vote actions update the host marker',async t=>{
  const f=await fixture(t),location={level:0,x:90,y:500};
  f.action(0,'playerLocation',{location});await take(f.host,m=>m.type==='progress');
  f.host.inbox=[];f.clients[0].inbox=[];f.action(0,'playerLocation',{location});await f.advance(10);
  assert.equal(f.host.inbox.length,0);assert.equal(f.clients[0].inbox.length,0);
  f.action(0,'playerLocation',{runId:'old',location:{level:0,x:9000,y:500}});
  assert.equal((await take(f.clients[0],m=>m.type==='error')).code,'LOCATION_INVALID');assert.equal(f.players[0].location.x,90);
  f.action(0,'profile',{name:'Runner 1',avatar:'cat',color:'#b7ef51',location:{level:0,x:300,y:500}});
  await take(f.host,m=>m.type==='state'&&m.room.players.find(p=>p.id===f.players[0].id)?.location?.x===300);
  send(f.host,'launchQuestion',{index:0});await take(f.host,m=>m.type==='state'&&!!m.room.question);
  f.action(0,'vote',{choice:1,location:{level:0,x:450,y:400}});
  await take(f.host,m=>m.type==='state'&&m.room.question?.votes[f.players[0].id]===1);
  assert.equal(f.players[0].location.x,450);
});

test('refresh resets location and settlement freezes the final cutoff pose without expanding public results',async t=>{
  const f=await fixture(t,3);await f.start();await f.report(0,{level:1,x:1000,y:450});
  const oldRun=f.players[0].runId;f.clients[0].close();await wait(()=>!f.players[0].connected);
  const replacement=await f.join('Runner 1');f.clients[0]=replacement.ws;f.players[0]=replacement.player;
  assert.notEqual(replacement.player.runId,oldRun);assert.equal(replacement.player.location,null);
  await f.report(0,{level:1,x:1200,y:450});await f.report(1,{level:1,x:600,y:450});
  await f.advance(100);send(f.host,'end');await wait(()=>f.room.status==='settling');
  f.action(1,'leave',{location:{level:1,x:9000,y:450}});await wait(()=>!f.players[1].connected);
  assert.equal(f.players[1].location.x,600);
  assert.equal((await f.report(0,{level:1,x:1100,y:450},{current:10},{final:true,at:f.room.cutoffAt})).type,'reportAck');
  await f.advance(2000);await wait(()=>f.room.status==='ended');
  assert.equal(f.players[0].location.x,1100);
  const results=JSON.stringify(f.room.results);assert.equal(results.includes('"location"'),false);
  assert.equal((await f.report(0,{level:1,x:9999,y:450},{current:900},{final:true,at:f.room.cutoffAt})).code,'RUN_REPORT_CLOSED');
  f.action(0,'leave',{location:{level:1,x:9999,y:450}});await wait(()=>!f.players[0].connected);
  assert.equal(f.players[0].location.x,1100);assert.equal(JSON.stringify(f.room.results),results);
  send(f.host,'reset');await wait(()=>f.room.status==='lobby');
  for(const player of f.players)assert.equal(player.location,null);
});
