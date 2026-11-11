import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async predicate => { for (let i=0;i<200;i++) { if (predicate()) return; await pause(5); } throw new Error('condition timeout'); };
const open = async url => {
  const ws = new WebSocket(url); ws.messages=[];
  ws.on('message', raw => ws.messages.push(JSON.parse(raw)));
  await new Promise((resolve,reject)=>{ ws.once('open',resolve); ws.once('error',reject); });
  return ws;
};
const take = async (ws, predicate) => {
  for (let i=0;i<200;i++) {
    const index=ws.messages.findIndex(predicate);
    if (index>=0) return ws.messages.splice(index,1)[0];
    await pause(5);
  }
  throw new Error('message timeout');
};
const send = (ws,type,data={}) => ws.send(JSON.stringify({type,...data}));

async function fixture(t) {
  const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>20_000_000});
  await server.listen(); t.after(()=>server.close());
  const url=`ws://127.0.0.1:${server.httpServer.address().port}`;
  const host=await open(url); send(host,'create');
  const created=await take(host,m=>m.type==='created');
  return {server,url,host,code:created.code};
}

test('resume replaces socket and preserves the same run state', async t => {
  const f=await fixture(t), first=await open(f.url);
  send(first,'join',{code:f.code,name:'Runner'}); const joined=await take(first,m=>m.type==='joined');
  send(f.host,'start'); await take(f.host,m=>m.room?.status==='running');
  const room=f.server.rooms.get(f.code), player=room.players.get(joined.id), currentRunId=player.runId;
  player.score=42; player.lastSeq=7; player.summary={...player.summary,level:1,banked:19,earnedCoins:23};
  player.powerSlots={1:{itemId:'held-item',used:false,power:{type:'slow',name:'Sticky Boots'},chests:{}}};
  player.power={itemId:'held-item',level:1,used:false,power:{type:'slow',name:'Sticky Boots'}};
  player.effects={slow:{type:'slow',startedAt:19_999_900,endsAt:20_000_999,strength:{speedPercent:25}}};
  player.coinAttack={earned:23,spent:4,reserved:2,cooldownEndsAt:20_000_987};
  const previousServerSocket=player.ws;
  const oldClosed=new Promise(resolve=>first.once('close',resolve)), second=await open(f.url);
  send(second,'join',{code:f.code,resumeToken:joined.resumeToken,name:'Ignored'});
  const resumed=await take(second,m=>m.type==='joined'); await oldClosed;
  assert.equal(resumed.resumed,true); assert.equal(resumed.id,joined.id); assert.equal(resumed.runId,currentRunId); assert.equal(resumed.lastSeq,7); assert.equal(resumed.roundId,room.roundId);
  const resumedServerSocket=room.players.get(joined.id).ws;
  assert.notEqual(resumedServerSocket,previousServerSocket);
  assert.equal(f.server.wss.clients.has(resumedServerSocket),true);
  assert.equal(resumedServerSocket._socket.remotePort,second._socket.localPort);
  assert.equal(player.connected,true); assert.equal(player.score,42); assert.equal(player.summary.banked,19); assert.equal(player.summary.earnedCoins,23);
  assert.equal(player.powerSlots[1].itemId,'held-item'); assert.equal(player.effects.slow.endsAt,20_000_999); assert.equal(player.coinAttack.earned,23); assert.equal(player.coinAttack.spent,4); assert.equal(player.coinAttack.cooldownEndsAt,20_000_987);
  const state=second.messages.find(m=>m.type==='state'); assert.equal(JSON.stringify(state).includes('resumeToken'),false);
  send(second,'timeSync',{clientTime:123});
  assert.equal((await take(second,m=>m.type==='timeSync')).clientTime,123);
  second.close();
});

test('invalid resume never falls back to a name-based join', async t => {
  const f=await fixture(t), ws=await open(f.url); send(ws,'join',{code:f.code,name:'Runner'}); await take(ws,m=>m.type==='joined');
  const retry=await open(f.url); send(retry,'join',{code:f.code,name:'Runner',resumeToken:'not-a-token'});
  const rejected=await take(retry,m=>m.type==='error'); assert.equal(rejected.code,'RESUME_INVALID');
  assert.equal([...f.server.rooms.get(f.code).players.values()].length,1); retry.close(); ws.close();
});

test('fresh replacement rotates the old credential and resume is available after results', async t => {
  const f=await fixture(t), first=await open(f.url); send(first,'join',{code:f.code,name:'Runner'});
  const joined=await take(first,m=>m.type==='joined'); first.close(); await waitFor(()=>[...f.server.rooms.get(f.code).players.values()][0].ws===null);
  const replacement=await open(f.url); send(replacement,'join',{code:f.code,name:'Runner'});
  const fresh=await take(replacement,m=>m.type==='joined'); assert.notEqual(fresh.resumeToken,joined.resumeToken); replacement.close(); await waitFor(()=>[...f.server.rooms.get(f.code).players.values()][0].ws===null);
  const room=f.server.rooms.get(f.code); room.status='ended'; room.results=[];
  const resumed=await open(f.url); send(resumed,'join',{code:f.code,resumeToken:fresh.resumeToken});
  const result=await take(resumed,m=>m.type==='joined'); assert.equal(result.resumed,true); assert.equal(result.id,fresh.id); resumed.close();
});

test('resume reports the new round snapshot while the rotated credential stays private', async t => {
  const f=await fixture(t), first=await open(f.url); send(first,'join',{code:f.code,name:'Runner'});
  const joined=await take(first,m=>m.type==='joined'); first.close(); await waitFor(()=>[...f.server.rooms.get(f.code).players.values()][0].ws===null);
  const replacement=await open(f.url); send(replacement,'join',{code:f.code,name:'Runner'});
  const fresh=await take(replacement,m=>m.type==='joined'); replacement.close(); await waitFor(()=>[...f.server.rooms.get(f.code).players.values()][0].ws===null);
  send(f.host,'start'); await take(f.host,m=>m.room?.status==='running'); const oldRound=f.server.rooms.get(f.code).roundId;
  send(f.host,'end'); await take(f.host,m=>m.room?.status==='ended'&&m.room.roundId===oldRound); send(f.host,'reset'); await take(f.host,m=>m.room?.status==='lobby'&&m.room.roundId!==oldRound);
  send(f.host,'start'); const started=await take(f.host,m=>m.room?.status==='running'&&m.room.roundId!==oldRound);
  const resumed=await open(f.url); send(resumed,'join',{code:f.code,resumeToken:fresh.resumeToken});
  const message=await take(resumed,m=>m.type==='joined'); assert.equal(message.resumed,true); assert.notEqual(message.roundId,oldRound); assert.equal(message.lastSeq,0); assert.equal(message.resumeToken,fresh.resumeToken); assert.equal(started.room.roundId,message.roundId);
  resumed.close();
});

test('resuming during settling keeps the frozen player identity and rank inputs', async t => {
  const f=await fixture(t), first=await open(f.url); send(first,'join',{code:f.code,name:'Runner'});
  const joined=await take(first,m=>m.type==='joined'); send(f.host,'start'); await take(f.host,m=>m.room?.status==='running');
  const room=f.server.rooms.get(f.code), player=room.players.get(joined.id); player.score=77; const oldRun=player.runId;
  const oldClosed=new Promise(resolve=>first.once('close',resolve)); send(f.host,'end'); await take(f.host,m=>m.room?.status==='settling');
  const resumed=await open(f.url); send(resumed,'join',{code:f.code,resumeToken:joined.resumeToken}); const message=await take(resumed,m=>m.type==='joined'); await oldClosed;
  assert.equal(room.status,'settling'); assert.equal(message.id,player.id); assert.equal(message.runId,oldRun); assert.equal(room.resultEntries[0].runId,oldRun); assert.equal(room.results,null); resumed.close();
});
