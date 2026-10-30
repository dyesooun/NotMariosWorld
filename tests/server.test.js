import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { LEVELS } from '../public/game/engine.js';

test('default questions, cache protection, and runtime version are present on a fresh server',async t=>{
  const server=createGameServer({port:0,host:'127.0.0.1'});await server.listen();t.after(()=>server.close());
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  const health=await fetch(origin+'/health'),version=await health.json();
  assert.equal(version.needsRestart,false);assert.equal(version.runtimeVersion,version.diskVersion);
  assert.equal(health.headers.get('cache-control'),'no-store');
  const script=await fetch(origin+'/app.js');assert.equal(script.headers.get('cache-control'),'no-store');
  const host=await socket(origin.replace('http:','ws:'));host.send(JSON.stringify({type:'create'}));
  const made=await receive(host,m=>m.type==='created'),room=server.rooms.get(made.code);
  assert.equal(room.settings.questions.length,5);
  host.send(JSON.stringify({type:'settings',settings:{questions:[]}}));
  const disabled=await receive(host,m=>m.type==='state'&&m.room.settings.questions.length===0);
  assert.equal(disabled.room.runtimeVersion,version.runtimeVersion);
});

test('real power chest survives deaths, is spent once, and refresh resets the inventory',async t=>{
  let time=7000000;
  const server=createGameServer({port:0,host:'127.0.0.1',tickMs:2,now:()=>time});await server.listen();t.after(()=>server.close());
  const url=`ws://127.0.0.1:${server.httpServer.address().port}`,host=await socket(url);
  host.send(JSON.stringify({type:'create'}));const made=await receive(host,m=>m.type==='created');
  const clients=[];for(const name of ['Caster','Opponent']){const ws=await socket(url);ws.send(JSON.stringify({type:'join',code:made.code,name}));const joined=await receive(ws,m=>m.type==='joined');ws.send(JSON.stringify({type:'spawn'}));clients.push({ws,id:joined.id});}
  const room=server.rooms.get(made.code);await waitFor(()=>[...room.players.values()].every(p=>p.spawned));
  host.send(JSON.stringify({type:'start'}));await receive(host,m=>m.type==='state'&&m.room.status==='running');
  const caster=room.players.get(clients[0].id),target=room.players.get(clients[1].id),chest=LEVELS[1].powerChest;
  const advance=async()=>{const elapsed=caster.state.elapsed;time+=150;await waitFor(()=>caster.state.elapsed>elapsed);};
  Object.assign(caster.state,{x:chest.x+15,y:chest.y});await advance();
  const found=await receive(clients[0].ws,m=>m.type==='state'&&m.room.players.find(p=>p.id===caster.id)?.power?.claimed);
  assert.equal(found.room.players.find(p=>p.id===caster.id).power.used,false);
  const held=JSON.stringify(caster.power);
  Object.assign(caster.state,{y:620,grounded:false,_standingPlatform:null});await advance();
  assert.equal(caster.state.deaths,1);assert.equal(JSON.stringify(caster.power),held);
  for(let i=0;i<22;i++)await advance();
  assert.equal(caster.state.respawnRemaining,0);assert.equal(JSON.stringify(caster.power),held);
  clients[0].ws.send(JSON.stringify({type:'usePower'}));await waitFor(()=>caster.power.used);
  const duel=room.powerDuel;
  clients[0].ws.send(JSON.stringify({type:'powerAnswer',transactionId:duel.id,challengeId:duel.attackQuestion.id,answer:duel.attackQuestion.answers[0]}));
  await waitFor(()=>duel.phase==='defense');
  const defense=duel.defenses.get(target.id);
  clients[1].ws.send(JSON.stringify({type:'powerAnswer',transactionId:duel.id,challengeId:defense.question.id,answer:'wrong'}));
  await waitFor(()=>duel.phase==='effect');
  const active=Object.values(target.effects)[0];assert.ok(active);assert.equal(active.endsAt,time+5000);
  assert.equal(Object.keys(caster.effects).length,0);
  const spent=JSON.stringify(caster.power);
  Object.assign(caster.state,{x:chest.x+15,y:620,grounded:false,_standingPlatform:null});await advance();
  for(let i=0;i<22;i++)await advance();
  Object.assign(caster.state,{x:chest.x+15,y:chest.y});await advance();
  assert.equal(JSON.stringify(caster.power),spent);
  clients[0].ws.send(JSON.stringify({type:'usePower'}));
  assert.equal((await receive(clients[0].ws,m=>m.type==='error')).code,'POWER_UNAVAILABLE');
  Object.assign(caster.state,{x:LEVELS[1].endX,y:450,grounded:false,_standingPlatform:null});await advance();
  assert.equal(caster.state.level,2);assert.equal(caster.power,null);
  const chest2=LEVELS[2].powerChest;Object.assign(caster.state,{x:chest2.x+15,y:chest2.y});await advance();assert.equal(caster.power.level,2);assert.equal(caster.power.used,false);
  clients[0].ws.close();await waitFor(()=>!caster.connected);
  const rejoined=await socket(url);rejoined.send(JSON.stringify({type:'join',code:made.code,name:'Caster'}));await receive(rejoined,m=>m.type==='joined');
  assert.equal(caster.state.level,1);assert.equal(caster.power,null);assert.deepEqual(caster.powerSlots,{});assert.deepEqual(caster.effects,{});
});

test('checkpoint saves and three-second respawns reach both player and host snapshots', async t => {
  let time = 3000000;
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 2, now: () => time });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create' }));
  const made = await receive(host, m => m.type === 'created');
  const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Checkpoint runner' }));
  const joined = await receive(player, m => m.type === 'joined');
  player.send(JSON.stringify({ type: 'spawn' }));
  await waitFor(() => server.rooms.get(made.code).players.get(joined.id).spawned);
  host.send(JSON.stringify({ type: 'start' })); await receive(host, m => m.type === 'state' && m.room.status === 'running');
  const runner = server.rooms.get(made.code).players.get(joined.id), cp = LEVELS[1].checkpoints[0];
  Object.assign(runner.state, { x: cp.x, y: cp.y, current: 20, coins: 2, collected: LEVELS[1].coins.slice(0, 2).map(c => c.id), banked: 500 });
  time += 150;
  const saved = await receive(host, m => m.type === 'state' && m.room.players[0]?.state?.checkpoint?.id === cp.id);
  const savedScore = saved.room.players[0].score;
  runner.state.current += 30; runner.state.coins += 1;
  runner.state.collected.push(LEVELS[1].coins[30].id);
  Object.assign(runner.state, { x: cp.x + 50, y: 620, grounded: false, _standingPlatform: null });
  time += 150;
  const died = await receive(player, m => m.type === 'state' && m.room.players[0]?.state?.deaths === 1);
  assert.equal(died.room.players[0].score, savedScore);
  assert.equal(died.room.players[0].state.coins, 2);
  for (let i = 0; i < 22; i++) {
    const elapsed = runner.state.elapsed;
    time += 150;
    await waitFor(() => runner.state.elapsed > elapsed);
  }
  const restored = await receive(host, m => m.type === 'state' && m.room.players[0]?.state?.deaths === 1 && !m.room.players[0].state.respawnRemaining);
  assert.equal(restored.room.players[0].state.x, cp.x);
  assert.equal(restored.room.players[0].state.y, cp.y);
  assert.equal(restored.room.players[0].score, savedScore);
  assert.deepEqual(restored.room.players[0].state.collected, LEVELS[1].coins.slice(0, 2).map(c => c.id));
});

test('25 active players move independently and host feeds keep updating across two rooms', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 10 });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create' }));
  const made = await receive(host, m => m.type === 'created');
  const runners = [];
  for (let i = 0; i < 25; i++) {
    const ws = await socket(url);
    ws.send(JSON.stringify({ type: 'join', code: made.code, name: `Runner ${i}` }));
    const joined = await receive(ws, m => m.type === 'joined');
    ws.send(JSON.stringify({ type: 'spawn' }));
    ws.send(JSON.stringify({ type: 'input', right: true }));
    runners.push({ ws, id: joined.id });
  }
  const lobby = await receive(host, m => m.type === 'state' && m.room.players.length === 25 && m.room.players.every(p => p.spawned && p.state?.x > 95));
  assert.equal(lobby.room.players.length, 25);
  host.send(JSON.stringify({ type: 'start' }));
  const started = await receive(host, m => m.type === 'state' && m.room.status === 'running');
  assert.ok(started.room.players.every(p => p.spawned && p.state.level === 1));
  for (const runner of runners) runner.ws.send(JSON.stringify({ type: 'input', right: true }));
  await receive(host, m => m.type === 'state' && m.room.status === 'running' && m.room.players.every(p => p.state?.x > 95));
  const own = await receive(runners[0].ws, m => m.type === 'state' && m.room.status === 'running' && m.room.players.find(p => p.id === runners[0].id)?.state?.x > 95);
  assert.equal(own.room.players.filter(p => p.state).length, 1);
  assert.ok(own.room.players.every(p => p.summary && Number.isFinite(p.score)));
  const host2 = await socket(url); host2.send(JSON.stringify({ type: 'create' }));
  const made2 = await receive(host2, m => m.type === 'created');
  const after = Date.now() + 140;
  const [first, second] = await Promise.all([
    receive(host, m => m.type === 'state' && m.serverTime > after),
    receive(host2, m => m.type === 'state' && m.serverTime > after),
  ]);
  assert.equal(first.room.code, made.code); assert.equal(second.room.code, made2.code);
});

test('simultaneous final clears queue exactly one two-second announcement each', async t => {
  let time = 1000000;
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 5, now: () => time });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create' }));
  const made = await receive(host, m => m.type === 'created');
  for (const name of ['First', 'Second']) {
    const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name }));
    await receive(player, m => m.type === 'joined'); player.send(JSON.stringify({ type: 'spawn' }));
    await waitFor(() => [...server.rooms.get(made.code).players.values()].find(p => p.name === name)?.spawned);
  }
  host.send(JSON.stringify({ type: 'start' })); await receive(host, m => m.type === 'state' && m.room.status === 'running');
  const room = server.rooms.get(made.code);
  for (const player of room.players.values()) Object.assign(player.state, { level: 3, x: LEVELS[3].endX + 1, y: 400 });
  time += 20;
  await waitFor(() => [...room.players.values()].every(p => p.state.finished));
  assert.match(room.announcement.text, /^First escaped Inferno Express!/);
  assert.equal(room.announcement.endsAt, time + 2000);
  assert.equal(room.announcementQueue.length, 1);
  assert.equal([...room.players.values()][0].finishTime, .02);
  time += 2001; await waitFor(() => room.announcement?.text.startsWith('Second'));
  assert.equal(room.announcement.endsAt, time + 2000);
  assert.equal(room.announcementQueue.length, 0);
  time += 2001; await waitFor(() => room.announcement === null);
});

test('the deadline includes unbanked points and freezes the final standings', async t => {
  let time = 2000000;
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 5, now: () => time });
  await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1 } }));
  const made = await receive(host, m => m.type === 'created');
  const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Last coin' }));
  const joined = await receive(player, m => m.type === 'joined');
  host.send(JSON.stringify({ type: 'start' })); await receive(host, m => m.type === 'state' && m.room.status === 'running');
  const runner = server.rooms.get(made.code).players.get(joined.id);
  Object.assign(runner.state, { banked: 100, current: 37, distanceMax: 320 });
  time += 60001;
  const ended = await receive(host, m => m.type === 'state' && m.room.status === 'ended');
  assert.equal(ended.room.players[0].score, 147);
  const snapshot = JSON.stringify(runner.state);
  player.send(JSON.stringify({ type: 'input', right: true, jump: true }));
  time += 1000; await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(JSON.stringify(runner.state), snapshot);
});

function receive(ws, predicate = () => true) { const found = ws._inbox.findIndex(predicate); if (found >= 0) return Promise.resolve(ws._inbox.splice(found, 1)[0]); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('timed out')), 2000); const check = () => { const i = ws._inbox.findIndex(predicate); if (i < 0) return; clearTimeout(timer); ws.off('message', check); resolve(ws._inbox.splice(i, 1)[0]); }; ws.on('message', check); }); }
async function socket(url) { const ws = new WebSocket(url); ws._inbox = []; ws.on('message', data => ws._inbox.push(JSON.parse(data))); await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }); return ws; }

function waitFor(check, timeout = 2000) { return new Promise((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => { try { const value = check(); if (value) { clearInterval(timer); resolve(value); } else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('timed out')); } } catch (e) { clearInterval(timer); reject(e); } }, 5); }); }

test('room lifecycle, host token, player capacity, and voting', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 50 }); await server.listen();
  t.after(() => server.close());
  const address = server.httpServer.address(); const url = `ws://127.0.0.1:${address.port}`;
  const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1, questions: [{ prompt: 'Ready?', choices: ['Yes', 'No'] }] } })); const made = await receive(host);
  assert.equal(made.type, 'created'); assert.match(made.code, /^[A-Z0-9]{6}$/);
  const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Ada', color: '#7edcff', avatar: 'robot' })); const joined = await receive(player, m => m.type === 'joined'); assert.equal(joined.type, 'joined');
  host.send(JSON.stringify({ type: 'launchQuestion', index: 0 })); const hostQuestion = await receive(host, m => m.type === 'state' && m.room.question?.prompt === 'Ready?'); assert.equal(hostQuestion.room.question.prompt, 'Ready?');
  player.send(JSON.stringify({ type: 'vote', choice: 0 })); const playerVote = await receive(player, m => m.type === 'state' && m.room.question?.votes?.[joined.id] === 0); assert.equal(playerVote.room.question.votes[joined.id], 0);
  host.send(JSON.stringify({ type: 'start' })); const started = await receive(host, m => m.type === 'state' && m.room.status === 'running'); assert.equal(started.room.status, 'running');
  player.close(); host.close();
});

test('room rejects player 26 while retaining separate host capacity', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 100 }); await server.listen(); t.after(() => server.close());
  const port = server.httpServer.address().port; const host = await socket(`ws://127.0.0.1:${port}`); host.send(JSON.stringify({ type: 'create' })); const made = await receive(host, m => m.type === 'created');
  const players = []; for (let i = 0; i < 26; i++) { const ws = await socket(`ws://127.0.0.1:${port}`); ws.send(JSON.stringify({ type: 'join', code: made.code, name: `P${i}` })); players.push({ ws, msg: await receive(ws, m => m.type === 'joined' || m.type === 'error') }); }
  assert.equal(players.filter(x => x.msg.type === 'joined').length, 25); assert.equal(players[25].msg.code, 'FULL');
  for (const p of players) p.ws.close(); host.close();
});

test('host-only controls, static MIME, and source protection', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 20 }); await server.listen(); t.after(() => server.close());
  const port = server.httpServer.address().port;
  const health = await fetch(`http://127.0.0.1:${port}/health`); assert.equal(health.status, 200); assert.match(health.headers.get('content-type'), /application\/json/);
  const script = await fetch(`http://127.0.0.1:${port}/game/engine.js`); assert.equal(script.status, 200); assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(`http://127.0.0.1:${port}/server/index.js`)).status, 404);
  const host = await socket(`ws://127.0.0.1:${port}`); host.send(JSON.stringify({ type: 'create' })); const made = await receive(host, m => m.type === 'created');
  const player = await socket(`ws://127.0.0.1:${port}`); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Auth' })); await receive(player, m => m.type === 'joined');
  player.send(JSON.stringify({ type: 'start' })); assert.equal((await receive(player, m => m.type === 'error')).code, 'AUTH');
  host.close(); player.close();
});

test('disconnected player with same name reconnects as a reset entry', async t => {
  const server = createGameServer({ port: 0, host: '127.0.0.1', tickMs: 20 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create' })); const made = await receive(host, m => m.type === 'created');
  const first = await socket(url); first.send(JSON.stringify({ type: 'join', code: made.code, name: 'Reconnect' })); const joined = await receive(first, m => m.type === 'joined'); first.close();
  await waitFor(() => { const p = server.rooms.get(made.code)?.players.get(joined.id); return p && !p.ws; });
  const second = await socket(url); second.send(JSON.stringify({ type: 'join', code: made.code, name: 'Reconnect' })); const replacement = await receive(second, m => m.type === 'joined'); assert.equal(replacement.id, joined.id);
  const state = server.rooms.get(made.code).players.get(joined.id); assert.equal(state.score, 0); assert.equal(state.spawned, false); second.close(); host.close();
});

test('fake clock closes votes and freezes an expired race', async t => {
  let clock = 100000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 10 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1, questions: [{ prompt: 'Q', choices: ['A', 'B'] }] } })); const made = await receive(host, m => m.type === 'created');
  const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Clock' })); await receive(player, m => m.type === 'joined');
  host.send(JSON.stringify({ type: 'launchQuestion', index: 0 })); await receive(host, m => m.type === 'state' && m.room.question); clock += 15001; await waitFor(() => server.rooms.get(made.code).question?.closed);
  host.send(JSON.stringify({ type: 'start' })); await receive(host, m => m.type === 'state' && m.room.status === 'running'); clock += 60001; await waitFor(() => server.rooms.get(made.code).status === 'ended'); const before = server.rooms.get(made.code).players.values().next().value.state.elapsed; clock += 1000; await new Promise(r => setTimeout(r, 30)); assert.equal(server.rooms.get(made.code).players.values().next().value.state.elapsed, before);
  player.close(); host.close();
});

test('late join receives shared deadline and may profile before spawning', async t => {
  let clock = 50000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 10 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1 } })); const made = await receive(host, m => m.type === 'created');
  host.send(JSON.stringify({ type: 'start' })); const started = await receive(host, m => m.type === 'state' && m.room.status === 'running'); clock += 3000;
  const late = await socket(url); late.send(JSON.stringify({ type: 'join', code: made.code, name: 'Late' })); const joined = await receive(late, m => m.type === 'joined'); late.send(JSON.stringify({ type: 'profile', name: 'Later', avatar: 'cat', color: '#ffb4df' })); const state = await receive(late, m => m.type === 'state' && m.room.players.some(p => p.id === joined.id && p.name === 'Later')); const roomPlayer = state.room.players.find(p => p.id === joined.id); assert.equal(roomPlayer.summary.level, 1); assert.equal(state.room.endsAt, started.room.endsAt); assert.ok(state.room.remainingMs < started.room.remainingMs);
  late.close(); host.close();
});

test('ended results stay frozen across reconnects, spectators, and leave', async t => {
  let clock = 900000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 5 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1 } })); const made = await receive(host, m => m.type === 'created');
  const first = await socket(url); first.send(JSON.stringify({ type: 'join', code: made.code, name: 'First', avatar: 'cat' })); const firstJoined = await receive(first, m => m.type === 'joined');
  const second = await socket(url); second.send(JSON.stringify({ type: 'join', code: made.code, name: 'Second' })); const secondJoined = await receive(second, m => m.type === 'joined');
  host.send(JSON.stringify({ type: 'start' })); const started = await receive(host, m => m.type === 'state' && m.room.status === 'running');
  const room = server.rooms.get(made.code); const p1 = room.players.get(firstJoined.id), p2 = room.players.get(secondJoined.id); Object.assign(p1.state, { banked: 20, current: 5 }); Object.assign(p2.state, { banked: 40, current: 1 });
  clock = started.room.endsAt; const late = await socket(url); late.send(JSON.stringify({ type: 'join', code: made.code, name: 'Spectator' })); const lateJoined = await receive(late, m => m.type === 'joined');
  const ended = await receive(host, m => m.type === 'state' && m.room.status === 'ended' && m.room.players.some(p => p.id === lateJoined.id)); const frozen = JSON.stringify(ended.room.results);
  assert.deepEqual(ended.room.results.map(r => r.id), [secondJoined.id, firstJoined.id]); assert.equal(ended.room.players.find(p => p.id === lateJoined.id).rank, null);
  first.close(); await waitFor(() => !p1.ws); const reconnect = await socket(url); reconnect.send(JSON.stringify({ type: 'join', code: made.code, name: 'First', avatar: 'robot' })); const rejoined = await receive(reconnect, m => m.type === 'joined'); assert.equal(rejoined.id, firstJoined.id);
  const retained = await receive(reconnect, m => m.type === 'state' && m.room.status === 'ended'); assert.equal(retained.room.players.find(p => p.id === firstJoined.id).score, p1.score); assert.equal(JSON.stringify(retained.room.results), frozen); assert.equal(retained.room.players.find(p => p.id === firstJoined.id).avatar, 'cat');
  late.send(JSON.stringify({ type: 'leave' })); await waitFor(() => !room.players.has(lateJoined.id)); assert.equal(JSON.stringify(room.results), frozen);
  host.send(JSON.stringify({ type: 'reset' })); await waitFor(() => room.results === null && room.status === 'lobby');
  reconnect.close(); second.close(); host.close();
});

test('final ten seconds remain playable and end exactly at the original deadline', async t => {
  let clock = 1200000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 2 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1 } })); const made = await receive(host, m => m.type === 'created');
  const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Countdown' })); const joined = await receive(player, m => m.type === 'joined'); player.send(JSON.stringify({ type: 'spawn' })); await waitFor(() => server.rooms.get(made.code).players.get(joined.id).spawned);
  host.send(JSON.stringify({ type: 'start' })); const started = await receive(host, m => m.type === 'state' && m.room.status === 'running'); const room = server.rooms.get(made.code), runner = room.players.get(joined.id); player.send(JSON.stringify({ type: 'input', right: true }));
  const advance = async delta => { const steps = Math.ceil(delta / 250); for (let i = 0; i < steps; i++) { clock += Math.min(250, delta - i * 250); runner.input = { right: true, left: false, jump: false }; runner.lastInput = clock; await new Promise(resolve => setTimeout(resolve, 3)); } };
  await advance(50000); assert.equal(room.status, 'running'); assert.equal(room.endsAt - clock, 10000); const elapsedBefore = runner.state.elapsed; const xBefore = runner.state.x;
  await advance(9999); assert.equal(room.status, 'running'); assert.equal(room.endsAt - clock, 1); assert.ok(runner.state.elapsed > elapsedBefore); assert.ok(runner.state.x > xBefore || runner.state.deaths > 0); assert.ok(Number.isFinite(runner.score));
  await advance(1); await waitFor(() => room.status === 'ended'); assert.equal(clock, started.room.endsAt); assert.equal(room.endsAt, started.room.endsAt); player.close(); host.close();
});

test('equal scores sort by finish time then stable join order', async t => {
  let clock = 1300000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 2 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create' })); const made = await receive(host, m => m.type === 'created');
  const sockets = []; for (const name of ['First', 'Second', 'Third']) { const ws = await socket(url); ws.send(JSON.stringify({ type: 'join', code: made.code, name })); sockets.push({ ws, joined: await receive(ws, m => m.type === 'joined') }); }
  host.send(JSON.stringify({ type: 'start' })); await receive(host, m => m.type === 'state' && m.room.status === 'running'); const room = server.rooms.get(made.code); const players = sockets.map(item => room.players.get(item.joined.id));
  for (const p of players) Object.assign(p.state, { banked: 10, current: 0 }); players[0].finishTime = 3; players[1].finishTime = 1; players[2].finishTime = 1; host.send(JSON.stringify({ type: 'end' })); const ended = await receive(host, m => m.type === 'state' && m.room.status === 'ended');
  assert.deepEqual(ended.room.results.map(result => result.name), ['Second', 'Third', 'First']); sockets.forEach(item => item.ws.close()); host.close();
});

test('manual host end captures immediately and matches player results', async t => {
  let clock = 1400000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 2 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create' })); const made = await receive(host, m => m.type === 'created'); const player = await socket(url); player.send(JSON.stringify({ type: 'join', code: made.code, name: 'Manual' })); await receive(player, m => m.type === 'joined');
  host.send(JSON.stringify({ type: 'start' })); await receive(host, m => m.type === 'state' && m.room.status === 'running'); const room = server.rooms.get(made.code); Object.assign(room.players.values().next().value.state, { banked: 77, current: 4 }); host.send(JSON.stringify({ type: 'end' }));
  const hostEnded = await receive(host, m => m.type === 'state' && m.room.status === 'ended'); const playerEnded = await receive(player, m => m.type === 'state' && m.room.status === 'ended'); assert.deepEqual(hostEnded.room.results, playerEnded.room.results); assert.equal(room.status, 'ended'); player.close(); host.close();
});

test('joining at the exact deadline freezes before same-name reconnect reset', async t => {
  let clock = 1500000; const server = createGameServer({ port: 0, host: '127.0.0.1', now: () => clock, tickMs: 2 }); await server.listen(); t.after(() => server.close());
  const url = `ws://127.0.0.1:${server.httpServer.address().port}`; const host = await socket(url); host.send(JSON.stringify({ type: 'create', settings: { durationMinutes: 1 } })); const made = await receive(host, m => m.type === 'created'); const first = await socket(url); first.send(JSON.stringify({ type: 'join', code: made.code, name: 'Deadline' })); const joined = await receive(first, m => m.type === 'joined');
  host.send(JSON.stringify({ type: 'start' })); const started = await receive(host, m => m.type === 'state' && m.room.status === 'running'); const room = server.rooms.get(made.code), runner = room.players.get(joined.id); Object.assign(runner.state, { banked: 55, current: 2 }); first.close(); await waitFor(() => !runner.ws); clock = started.room.endsAt;
  const reconnect = await socket(url); reconnect.send(JSON.stringify({ type: 'join', code: made.code, name: 'Deadline', avatar: 'robot' })); const rejoined = await receive(reconnect, m => m.type === 'joined'); const ended = await receive(host, m => m.type === 'state' && m.room.status === 'ended');
  assert.equal(rejoined.id, joined.id); assert.equal(room.status, 'ended'); assert.equal(runner.score, 57); assert.equal(ended.room.results[0].id, joined.id); assert.equal(runner.state.banked, 55); reconnect.close(); host.close();
});
