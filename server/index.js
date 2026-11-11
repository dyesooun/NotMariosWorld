import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { AVATARS, COLORS } from '../public/game/engine.js';
import { LEVELS } from '../public/game/levels.js';
import { LEVEL_CATALOG } from '../public/game/level-catalog.js';
import { POWER_DEFINITIONS, chestPower, collectPower, powerEffects, powerStrength, reservePower, releasePowerReservation, resetPowerInventory, resetCoinAttack, coinAttackView } from '../public/game/powers.js';
import { DEFAULT_QUESTIONS } from '../public/game/default-questions.js';
import { beginPowerDuel, answerPowerDuel, advancePowerDuel, prunePowerDuel, duelView, privateDuelQuiz } from './power-duels.js';
import { normalizeWorldOrder } from '../public/game/world-order.js';
import { PROTOCOL_VERSION, FINAL_REPORT_WINDOW_MS, emptyRunSummary, validateRunSummary, summaryScore, normalizePlayerLocation } from '../public/game/run-protocol.js';

const { WebSocketServer } = createRequire(import.meta.url)('ws');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PLAYERS = 25, MAX_ROOMS = 500, MAX_PAYLOAD = 16384, ROOM_TTL = 3600000;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon', '.wav':'audio/wav', '.flac':'audio/flac' };
const clean = (value, length, fallback = '') => typeof value === 'string' ? value.trim().slice(0, length) || fallback : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number.isFinite(Number(value)) ? Number(value) : low));
const send = (ws, value) => ws?.readyState === 1 && ws.send(JSON.stringify(value));
const error = (ws, message, code, details = {}) => send(ws, { type:'error', message, ...(code ? { code } : {}), ...details });
const profile = msg => ({ name:clean(msg.name, 24, 'Player'), avatar:AVATARS.includes(msg.avatar) ? msg.avatar : AVATARS[0], color:COLORS.includes(msg.color) ? msg.color : COLORS[0] });
const biomeNames = Object.fromEntries([[0, 'the lobby'], ...LEVEL_CATALOG.map(level => [level.id, level.name])]);
function settings(input = {}) {
  const result = { worldOrder:normalizeWorldOrder(input.worldOrder) };
  for (const [key, fallback, low, high] of [
    ['durationMinutes',15,1,60], ['coinPoints',10,0,1000], ['distancePoints',1,0,1000],
    ['powerDurationSeconds',8,1,60], ['attackWindowSeconds',15,1,60], ['defendWindowSeconds',15,1,60],
    ['attackCoinCost',30,1,1000], ['attackCooldownSeconds',60,1,3600],
    ['slowSpeedPercent',25,10,90], ['reverseSpeedPercent',100,50,200], ['slipperySpeedPercent',170,110,250],
    ['slipperyGripPercent',12,2,50], ['inkDarknessPercent',88,0,95],
  ]) result[key] = input[key] == null ? fallback : (key==='attackCoinCost'||key==='attackCooldownSeconds' ? Math.trunc(clamp(input[key], low, high)) : clamp(input[key], low, high));
  result.questions = Array.isArray(input.questions)
    ? input.questions.slice(0,5).map(q => ({ prompt:clean(q?.prompt,240), choices:Array.isArray(q?.choices) ? q.choices.slice(0,2).map(c => clean(c,100)) : [] })).filter(q => q.prompt && q.choices.length === 2 && q.choices.every(Boolean))
    : DEFAULT_QUESTIONS.map(q => ({ prompt:q.prompt, choices:[...q.choices] }));
  return result;
}

export function createGameServer({ port=Number(process.env.PORT)||10000, host='0.0.0.0', staticRoot=path.join(ROOT,'public'), now=()=>Date.now(), tickMs=50 } = {}) {
  const versionFiles = ['server/index.js','server/power-duels.js','server/power-questions.js','public/app.js','public/game/audio.js','public/game/audio-tracks.js','public/game/engine.js','public/game/local-run.js','public/game/run-protocol.js','public/game/client-state.js','public/game/levels.js','public/game/world-order.js','public/game/projectiles.js','public/game/powers.js','public/game/default-questions.js'];
  const fingerprint = () => {
    const hash=createHash('sha256');
    const files=new Set([...versionFiles, 'public/bootstrap.js', 'public/game/level-catalog.json']);
    for(const name of readdirSync(path.join(ROOT,'public/game')).sort())if(name.endsWith('.js'))files.add('public/game/'+name);
    // Read the disk catalog on every health check, including newly added levels.
    // This catches authored JSON changes until the server is restarted.
    const catalogPath=path.join(ROOT,'public/game/level-catalog.json');
    if (existsSync(catalogPath)) {
      try {
        const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));
        for (const entry of Array.isArray(catalog)?catalog:catalog.levels||[]) if(entry.src) {
          const url=new URL(entry.src,'http://localhost/game/level-catalog.json');
          const full=path.resolve(ROOT,'public','.'+decodeURIComponent(url.pathname));
          if(full.startsWith(path.join(ROOT,'public')+path.sep))files.add(path.relative(ROOT,full));
        }
      } catch { hash.update('invalid-level-catalog'); }
    }
    const shared=path.join(ROOT,'public/game/json-level');
    if(existsSync(shared))for(const name of readdirSync(shared).sort())if(name.endsWith('.js'))files.add('public/game/json-level/'+name);
    for (const file of [...files].sort()) { const full=path.join(ROOT,file); hash.update(file); if (existsSync(full)) hash.update(readFileSync(full)); else hash.update('missing'); }
    return hash.digest('hex');
  };
  const runtimeVersion = fingerprint(), rooms = new Map();
  const ranked = room => [...room.players.values()].sort((a,b) => b.score-a.score || (a.finishTime??Infinity)-(b.finishTime??Infinity) || a.joinedAt-b.joinedAt);
  const playerDTO = (room, player, viewer = {}) => {
    const privileged = viewer.host || viewer.id === player.id;
    const rank = room.status === 'ended' ? room.results?.find(p => p.id === player.id)?.rank ?? null : ranked(room).findIndex(p => p === player)+1;
    return {
      id:player.id, name:player.name, avatar:player.avatar, color:player.color,
      connected:player.connected, spawned:player.spawned, runId:privileged ? player.runId : undefined,
      summary:privileged ? player.summary : { level:player.summary.level, completedWorlds:player.summary.completedWorlds, finished:player.summary.finished },
      score:player.score, finishTime:player.finishTime, rank, lastReportAt:privileged ? player.lastReportAt : undefined,
      power:privileged ? player.power : undefined,
      powerChestClaims:privileged ? Object.entries(player.powerSlots?.[player.summary.level]?.chests||{}).filter(([,chest])=>chest.claimed).map(([id])=>id) : undefined,
      powerOffer:privileged ? player.powerOffer || null : undefined,
      powerQuiz:privileged ? privateDuelQuiz(room,player) : null,
      effects:privileged ? powerEffects(player,now()) : undefined,
      location:viewer.host && player.location ? {...player.location} : undefined,
      coinAttack:privileged ? coinAttackView(player,now()) : undefined,
    };
  };
  const snapshot = (room, viewer) => ({
    code:room.code, roundId:room.roundId, status:room.status, settings:room.settings,
    startedAt:room.startedAt, endsAt:room.endsAt, cutoffAt:room.cutoffAt, settleEndsAt:room.settleEndsAt,
    remainingMs:room.status==='running' ? Math.max(0,room.endsAt-now()) : 0,
    runtimeVersion, protocolVersion:PROTOCOL_VERSION, results:room.results,
    activePower:room.activePower ? { id:room.activePower.id, source:room.activePower.source||'player', by:room.activePower.casterId, byName:room.activePower.casterName, type:room.activePower.power.type, name:room.activePower.power.name, level:room.activePower.level, startedAt:room.activePower.startedAt, endsAt:room.activePower.endsAt } : null,
    powerDuel:duelView(room), powerQueue:room.powerQueue.map((q,index)=>({id:q.id,source:q.source||'player',casterId:q.source==='host'?null:q.casterId,casterName:q.source==='host'?'Host':q.casterName,level:q.level,power:q.power,position:index+1})),
    players:[...room.players.values()].map(p=>playerDTO(room,p,viewer)),
    question:room.question ? { index:room.question.index,prompt:room.question.prompt,choices:room.question.choices,votes:Object.fromEntries(room.question.votes),endsAt:room.question.endsAt,closed:room.question.closed } : null,
    announcement:room.announcement,
  });
  const sendPlayerState = (room, player) => send(player.ws,{type:'state',room:snapshot(room,{id:player.id}),you:player.id,serverTime:now()});
  const broadcast = room => { for (const player of room.players.values()) sendPlayerState(room,player); send(room.hostWs,{type:'state',room:snapshot(room,{host:true}),you:null,serverTime:now()}); };
  const reportProgress = (room, player) => { send(room.hostWs,{type:'progress',players:[playerDTO(room,player,{host:true})],serverTime:now()}); room.leaderboardDirty=true; };
  const updatePlayerLocation = (room, player, msg, { lobbyOnly=false, reportAt=null } = {}) => {
    if (!Object.prototype.hasOwnProperty.call(msg || {}, 'location')) return null;
    if (msg.roundId !== room.roundId || msg.runId !== player.runId) return null;
    if (reportAt==null && !['lobby','running'].includes(room.status)) return null;
    const location=normalizePlayerLocation(msg.location);
    if (!location || (lobbyOnly ? location.level !== 0 : location.level !== player.summary.level)) return null;
    const changed=!player.location || player.location.level!==location.level || player.location.x!==location.x || player.location.y!==location.y;
    player.location={...location,at:reportAt ?? now()};
    return changed;
  };
  const reportLocationProgress = (room, player) => send(room.hostWs,{type:'progress',players:[playerDTO(room,player,{host:true})],serverTime:now()});
  const syncPower = (room, player) => {
    const existing=player.power, slot=player.powerSlots?.[existing?.level];
    const held=existing && slot?.itemId===existing.itemId && slot.power;
    const queued=room.powerQueue.find(q=>q.caster===player&&q.itemId===existing?.itemId);
    const quiz=privateDuelQuiz(room,player);
    player.power=held ? {...existing,claimed:true,used:!!slot.used,queued:!!queued,queuePosition:queued?room.powerQueue.indexOf(queued)+1:null,testing:!!quiz&&!quiz.answered&&room.powerDuel?.entry?.source!=='coin',power:{...slot.power}} : null;
  };
  const syncPowers = room => { for (const p of room.players.values()) syncPower(room,p); };
  const syncCoinAttacks = room => {
    for (const p of room.players.values()) {
      const state=p.coinAttack||resetCoinAttack(p);
      const queued=room.powerQueue.find(q=>q.source==='coin'&&q.caster===p);
      state.queued=!!queued; state.queuePosition=queued?room.powerQueue.indexOf(queued)+1:null;
    }
  };
  const nextAnnouncement = room => {
    const item=room.announcementQueue.shift();
    if (!item) { room.announcement=null; syncPowers(room); syncCoinAttacks(room); return; }
    const startedAt=now();
    if (item.kind==='power') {
      room.powerQueue=room.powerQueue.filter(q=>q.id!==item.id);
      const result=beginPowerDuel(room,item,{now:startedAt});
      if (!result.ok) {
        if (item.source==='coin' && item.caster?.coinAttack) item.caster.coinAttack.reserved=Math.max(0,item.caster.coinAttack.reserved-(item.cost||0));
        else releasePowerReservation(item);
        send(item.caster?.ws||room.hostWs,{type:item.source==='host'?'hostAttackCancelled':item.source==='coin'?'coinAttackCancelled':'powerCancelled',name:item.power.name,reason:result.code});
        syncCoinAttacks(room); return nextAnnouncement(room);
      }
      if (item.source==='coin' && item.caster?.coinAttack) {
        const wallet=item.caster.coinAttack;
        wallet.reserved=Math.max(0,wallet.reserved-(item.cost||0));
        wallet.spent+=(item.cost||0);
      }
      room.announcement={id:result.duel.id,kind:'power-quiz',phase:result.duel.phase,text:item.source==='host'?`Host challenges everyone with ${item.power.name}!`:item.source==='coin'?`${item.caster.name} attacks ${result.duel.targets[0].name} with ${item.power.name}!`:`${item.caster.name} is challenged!`,startedAt,endsAt:result.duel.endsAt,durationMs:item.source==='host'?result.duel.defendMs:result.duel.attackMs};
    } else room.announcement={...item,kind:'level',startedAt,endsAt:startedAt+2000,durationMs:2000};
    syncPowers(room); syncCoinAttacks(room);
    for(const player of room.players.values())tryCollect(room,player);
    syncPowers(room); syncCoinAttacks(room);
  };
  const announce = (room, level, player) => { room.announcementQueue.push({id:randomUUID(),kind:'level',level,text:`${player.name} escaped ${biomeNames[level]}!`}); if (!room.announcement) nextAnnouncement(room); };
  const removeQueued = (room, player) => {
    const released=new Set();
    for (const queue of [room.powerQueue,room.announcementQueue]) for (let i=queue.length-1;i>=0;i--) if (queue[i].kind==='power'&&queue[i].caster===player) {
      const item=queue[i]; if(!released.has(item.id)&&item.source==='coin'&&player.coinAttack) player.coinAttack.reserved=Math.max(0,player.coinAttack.reserved-(item.cost||0)); released.add(item.id);
      releasePowerReservation(item); queue.splice(i,1);
    }
    syncPowers(room); syncCoinAttacks(room);
  };
  const enterEffect = (room, startedAt=now()) => {
    const duel=room.powerDuel; if (!duel) return;
    // A purchased attack waits through queueing and both quizzes before its
    // personal cooldown begins. Backfires resolve here without a defense.
    if (duel.entry.source==='coin' && duel.entry.cooldownStartedAt==null && duel.caster?.runId===duel.casterRunId) {
      duel.entry.cooldownStartedAt=startedAt;
      duel.caster.coinAttack.cooldownEndsAt=startedAt+room.settings.attackCooldownSeconds*1000;
    }
    const targets=duel.outcome==='attackerFailed' ? (duel.caster?.connected&&duel.caster.runId===duel.casterRunId?[duel.caster]:[]) : [...duel.defenses.values()].filter(d=>d.result!=='correct'&&d.result!=='skipped'&&d.player.connected&&d.player.runId===d.runId&&!d.player.state.finished).map(d=>d.player);
    duel.affectedIds=targets.map(p=>p.id); duel.phase='effect'; duel.endsAt=startedAt+duel.entry.power.durationMs;
    for (const target of targets) (target.effects||={})[duel.entry.power.type]={type:duel.entry.power.type,strength:{...duel.entry.power.strength},by:duel.entry.source==='host'?null:duel.caster.id,startedAt,endsAt:duel.endsAt,id:duel.id};
    room.activePower={id:duel.id,casterId:duel.entry.source==='host'?null:duel.caster.id,casterName:duel.entry.source==='host'?'Host':duel.caster.name,power:duel.entry.power,level:duel.entry.level??null,source:duel.entry.source||'player',startedAt,endsAt:duel.endsAt};
    const casterName=duel.entry.source==='host'?'Host':duel.caster.name;
    const text=duel.outcome==='attackerFailed' ? `${casterName}'s ${duel.entry.power.name} backfired!` : duel.outcome==='blocked' ? `${casterName}'s ${duel.entry.power.name} was blocked!` : `${casterName} unleashed ${duel.entry.power.name}!`;
    room.announcement={id:duel.id,kind:'power',phase:'effect',text,startedAt,endsAt:duel.endsAt,durationMs:duel.entry.power.durationMs};
    for(const player of room.players.values())tryCollect(room,player);
    syncPowers(room); broadcast(room);
  };
  const clearPowers = room => {
    const released=new Set();
    for (const item of [...room.powerQueue,...room.announcementQueue]) if(item.kind==='power'&&!released.has(item.id)) {
      released.add(item.id);
      if(item.source==='coin'&&item.caster?.coinAttack) item.caster.coinAttack.reserved=Math.max(0,item.caster.coinAttack.reserved-(item.cost||0));
      else releasePowerReservation(item);
    }
    room.activePower=null; room.powerDuel=null; room.powerQueue=[]; room.announcementQueue=[]; room.announcement=null;
    for (const player of room.players.values()) { player.powerOffer=null; player.chestContact=null; player.effects={}; }
    syncPowers(room);
    syncCoinAttacks(room);
  };
  const finish = room => {
    if (room.status!=='settling') return;
    room.status='ended'; room.leaderboardDirty=false;
    const entries=room.resultEntries.filter(entry=>entry.player.runId===entry.runId).map(entry=>({...entry,score:entry.player.score,finishTime:entry.player.finishTime,summary:{...entry.player.summary}}));
    entries.sort((a,b)=>b.score-a.score||(a.finishTime??Infinity)-(b.finishTime??Infinity)||a.joinedAt-b.joinedAt);
    room.results=entries.map((entry,index)=>({id:entry.player.id,name:entry.name,avatar:entry.avatar,color:entry.color,score:entry.score,finishTime:entry.finishTime,summary:entry.summary,rank:index+1}));
    broadcast(room);
  };
  const settle = (room, cutoffAt=room.endsAt) => {
    if (room.status!=='running') return;
    room.status='settling'; room.cutoffAt=cutoffAt; room.endsAt=cutoffAt; room.settleEndsAt=now()+FINAL_REPORT_WINDOW_MS;
    room.resultEntries=[...room.players.values()].map(player=>({player,runId:player.runId,name:player.name,avatar:player.avatar,color:player.color,joinedAt:player.joinedAt}));
    room.pendingFinal=new Set(room.resultEntries.filter(entry=>entry.player.connected&&entry.player.spawned).map(entry=>entry.runId));
    for (const player of room.players.values()) player.finalAccepted=false;
    room.question=null; clearPowers(room); broadcast(room);
    if (!room.pendingFinal.size) finish(room);
  };
  const drop = (room, player) => {
    player.connected=false; player.powerOffer=null; player.chestContact=null;
    removeQueued(room,player);
    if (room.powerDuel?.caster===player&&room.powerDuel.phase==='attack') { releasePowerReservation(room.powerDuel.entry); room.powerDuel=null; room.announcement=null; nextAnnouncement(room); }
    else if (prunePowerDuel(room,{now:now()})) enterEffect(room);
    if (room.status==='settling') { room.pendingFinal.delete(player.runId); if (!room.pendingFinal.size) finish(room); }
  };
  const resetPlayer = (player, level=0) => {
    player.runId=randomUUID(); player.summary=emptyRunSummary(level); player.state={level,finished:false,deadUntil:0};
    player.spawned=false; player.score=0; player.finishTime=null; player.lastSeq=0; player.lastReportAt=0; player.lastReportTime=null;
    player.chestContact=null; player.powerOffer=null; player.finalAccepted=false; player.effects={}; resetPowerInventory(player); resetCoinAttack(player);
    player.location=null;
  };
  const start = room => {
    if (room.status!=='lobby') return;
    room.status='running'; room.roundId=randomUUID(); room.startedAt=now(); room.endsAt=room.startedAt+room.settings.durationMinutes*60000;
    room.cutoffAt=null; room.settleEndsAt=null; room.results=null; room.resultEntries=[]; room.pendingFinal=new Set(); room.question=null; clearPowers(room);
    // Lobby players are already active; starting only changes their world/run.
    for (const player of room.players.values()) { resetPlayer(player,room.settings.worldOrder[0]); player.spawned=true; }
    broadcast(room);
  };
  const reset = room => {
    if (room.status!=='ended') return;
    clearPowers(room); room.status='lobby'; room.roundId=randomUUID(); room.startedAt=null; room.endsAt=null; room.cutoffAt=null; room.settleEndsAt=null;
    room.results=null; room.resultEntries=[]; room.pendingFinal=new Set(); room.question=null; room.leaderboardDirty=false;
    // Returning to the lobby must leave every connected player immediately playable.
    for (const player of room.players.values()) { resetPlayer(player); player.spawned=true; }
    broadcast(room);
  };
  const addPlayer = (room, msg, ws) => {
    const info=profile(msg), old=[...room.players.values()].find(p=>!p.ws&&p.name===info.name);
    if (old) {
      Object.assign(old,{ws,connected:true});
      if (room.status!=='ended') { Object.assign(old,info); resetPlayer(old,room.status==='running'?room.settings.worldOrder[0]:0); old.spawned=true; }
      return old;
    }
    if (room.players.size>=MAX_PLAYERS) return null;
    const player={id:randomUUID(),...info,room,ws,connected:true,joinedAt:now()};
    resetPlayer(player,room.status==='running'?room.settings.worldOrder[0]:0);
    // New lobby/running joins enter as active players. Ended-room arrivals remain spectators.
    player.spawned=room.status!=='ended';
    room.players.set(player.id,player); return player;
  };
  const tryCollect = (room, player) => {
    const level=player.summary.level, chestId=player.chestContact;
    const chest=LEVELS[level]?.powerChests?.find(c=>c.id===chestId);
    const quiz=privateDuelQuiz(room,player);
    if (room.status!=='running'||!player.connected||!player.spawned||player.state.deadUntil||player.state.finished||!chest||(quiz&&!quiz.answered)) { const changed=!!player.powerOffer; player.powerOffer=null; return changed; }
    const slot=player.powerSlots?.[level];
    if (slot?.chests?.[chest.id]?.claimed||Object.values(player.powerSlots||{}).some(s=>s.reserved)) { const changed=!!player.powerOffer; player.powerOffer=null; return changed; }
    if (player.power&&!player.power.used) {
      let canAttack=false;
      // Checking availability must not reserve or consume the held item.
      canAttack=[...room.players.values()].some(p=>p!==player&&p.connected&&p.spawned&&!p.state.finished);
      const previous=player.powerOffer;
      if (previous?.chestId===chest.id&&previous.itemId===player.power.itemId&&previous.canAttack===canAttack) return false;
      player.powerOffer={id:randomUUID(),runId:player.runId,chestId:chest.id,level,power:chestPower(player,level,chest.id,Math.random,room.settings.powerDurationSeconds*1000),itemId:player.power.itemId,canAttack,canReplace:true,queued:false};
      return true;
    }
    player.powerOffer=null;
    return !!collectPower(player,level,Math.random,chest.id,{durationMs:room.settings.powerDurationSeconds*1000});
  };
  const queuePower = (room, player, ws, msg = null) => {
    const quiz=privateDuelQuiz(room,player);
    if (quiz&&!quiz.answered) return error(ws,'Answer your current power question first','QUIZ_ACTIVE');
    const result=reservePower(room,player,{now:now()});
    if (!result.ok) return error(ws,result.code==='NO_TARGET'?'No opponents are ready for this power yet':'Power could not be used',result.code);
    const item={...result,casterId:player.id,casterName:player.name,kind:'power'};
    room.powerQueue.push(item); room.announcementQueue.push(item); player.powerOffer=null;
    updatePlayerLocation(room,player,msg);
    send(ws,{type:'powerQueued',name:item.power.name,position:room.powerQueue.length});
    if (!room.announcement) nextAnnouncement(room);
    syncPowers(room); broadcast(room);
    return true;
  };
  const queueHostAttack = (room, ws, msg) => {
    if (room.status !== 'running') return error(ws,'Host attacks are only available during a running round','ROUND_ENDED');
    if (msg.roundId !== room.roundId) return error(ws,'This action belongs to another round','RUN_INVALID');
    const definition=POWER_DEFINITIONS.find(power=>power.type===msg.powerType);
    if (!definition) return error(ws,'Unknown host power','POWER_INVALID');
    const eligibleTargets=[...room.players.values()].filter(p=>p.connected&&p.spawned&&!p.state.finished);
    if (!eligibleTargets.length) return error(ws,'No opponents are ready for this power yet','NO_TARGET');
    const item={id:randomUUID(),source:'host',kind:'power',caster:null,casterId:null,casterName:'Host',level:null,power:{...definition,target:'all',durationMs:room.settings.powerDurationSeconds*1000,strength:powerStrength(room.settings,definition.type)}};
    room.powerQueue.push(item); room.announcementQueue.push(item);
    send(ws,{type:'powerQueued',id:item.id,source:'host',powerType:item.power.type,name:item.power.name,position:room.powerQueue.length});
    if (!room.announcement) nextAnnouncement(room);
    broadcast(room);
  };
  const queueCoinAttack = (room, player, ws, msg) => {
    if (room.status!=='running') return error(ws,'The round has ended','ROUND_ENDED');
    if (msg.roundId!==room.roundId||msg.runId!==player.runId) return error(ws,'This action belongs to another run','RUN_INVALID');
    const type=msg.powerType, definition=POWER_DEFINITIONS.find(power=>power.type===type);
    const target=room.players.get(msg.targetId);
    const wallet=player.coinAttack||resetCoinAttack(player), nowMs=now();
    if (!definition) return error(ws,'Unknown power','POWER_INVALID');
    if (privateDuelQuiz(room,player)?.answered===false) return error(ws,'Answer your current power question first','QUIZ_ACTIVE');
    if (!player.connected||!player.spawned||player.state.deadUntil||player.state.finished) return error(ws,'Player cannot attack right now','ATTACK_UNAVAILABLE');
    if (!target||target===player||!target.connected||!target.spawned||target.state.finished||target.runId===player.runId) return error(ws,'Target is unavailable','TARGET_INVALID');
    if (room.powerQueue.some(q=>q.source==='coin'&&q.caster===player)||room.announcementQueue.some(q=>q.source==='coin'&&q.caster===player)||(room.powerDuel?.entry?.source==='coin'&&room.powerDuel?.caster===player)) return error(ws,'Coin attack already queued','ATTACK_PENDING');
    if (wallet.cooldownEndsAt>nowMs) return error(ws,'Coin attack is on cooldown','ATTACK_COOLDOWN',{cooldownEndsAt:wallet.cooldownEndsAt});
    const cost=room.settings.attackCoinCost;
    if (wallet.earned-wallet.spent-wallet.reserved<cost) return error(ws,'Not enough coins for this attack','ATTACK_FUNDS');
    wallet.reserved+=cost;
    const item={id:randomUUID(),source:'coin',kind:'power',caster:player,casterId:player.id,casterName:player.name,runId:player.runId,targetId:target.id,targetRunId:target.runId,cost,level:player.state.level,power:{...definition,target:'player',durationMs:room.settings.powerDurationSeconds*1000,strength:powerStrength(room.settings,definition.type)}};
    room.powerQueue.push(item); room.announcementQueue.push(item);
    updatePlayerLocation(room,player,msg);
    send(ws,{type:'coinAttackQueued',id:item.id,powerType:type,name:definition.name,cost,position:room.powerQueue.length,cooldownEndsAt:wallet.cooldownEndsAt});
    if (!room.announcement) nextAnnouncement(room);
    syncCoinAttacks(room); broadcast(room);
    return true;
  };
  const acceptReport = (room, player, msg, ws) => {
    const time=now();
    if (room.status==='running'&&time>=room.endsAt) settle(room,room.endsAt);
    if (!['running','settling'].includes(room.status)||!player.spawned||!player.connected) return error(ws,'Run report closed','RUN_REPORT_CLOSED');
    if (msg.roundId!==room.roundId||msg.runId!==player.runId||!Number.isSafeInteger(msg.seq)||msg.seq<=player.lastSeq||!Number.isFinite(msg.at)||msg.at>time+2000||msg.at<room.startedAt) return error(ws,'Run report rejected','RUN_REPORT_INVALID');
    const isFinal=msg.final===true;
    if (room.status==='settling'&&(!isFinal||time>=room.settleEndsAt||msg.at>room.cutoffAt||!room.pendingFinal.has(player.runId)||player.finalAccepted)) return error(ws,'Final report closed','RUN_REPORT_CLOSED');
    if (room.status==='running'&&(isFinal||msg.at>room.endsAt)) return error(ws,'Final report is not open yet','RUN_REPORT_CLOSED');
    const summary=validateRunSummary(msg.summary,room.settings.worldOrder), before=player.summary;
    if (Object.prototype.hasOwnProperty.call(msg,'location')) {
      const supplied=normalizePlayerLocation(msg.location);
      if (!supplied || supplied.level!==summary?.level) return error(ws,'Run report rejected','RUN_REPORT_INVALID');
    }
    if (!summary||summary.level===0||room.status==='running'&&(before.completedWorlds.some((id,index)=>summary.completedWorlds[index]!==id)||summary.deaths<before.deaths)||summary?.finishedAt!=null&&(summary.finishedAt<room.startedAt||summary.finishedAt>msg.at)) return error(ws,'Run report rejected','RUN_REPORT_INVALID');
    if (player.lastReportTime!=null&&msg.at<player.lastReportTime&&room.status==='running') return error(ws,'Stale run report','RUN_REPORT_INVALID');
    if (msg.chestId!=null&&!LEVELS[summary.level]?.powerChests?.some(c=>c.id===msg.chestId)) return error(ws,'Unknown chest','RUN_REPORT_INVALID');
    const inventoryBefore=JSON.stringify([player.power,player.powerOffer,player.powerSlots]);
    const coinEarnedBefore=player.coinAttack?.earned||0;
    player.lastSeq=msg.seq; player.lastReportAt=time; player.lastReportTime=msg.at; player.summary=summary;
    updatePlayerLocation(room,player,msg,{reportAt:msg.at});
    // Coin attacks use cumulative earned coins, independent of the current
    // world's displayed coin count. Never allow a stale report to mint funds.
    if (Number.isSafeInteger(summary.earnedCoins) && summary.earnedCoins >= (player.coinAttack?.earned||0)) player.coinAttack.earned=summary.earnedCoins;
    player.state={level:summary.level,finished:summary.finished,deadUntil:summary.respawnRemaining>0?1:0};
    player.score=summaryScore(summary,room.settings);
    player.finishTime=summary.finished?(summary.finishedAt-room.startedAt)/1000:null;
    if (room.status==='running') {
      const newCompleted=summary.completedWorlds.slice(before.completedWorlds.length);
      if (newCompleted.length) {
        if (!room.powerQueue.some(q=>q.source!=='coin'&&q.caster===player)) player.power=null;
        player.powerOffer=null;
        for (const level of newCompleted) announce(room,level,player);
      }
      player.chestContact=!summary.respawnRemaining&&!summary.finished ? msg.chestId??null : null;
      if (player.powerOffer?.chestId!==player.chestContact||summary.level!==before.level||summary.deaths!==before.deaths) player.powerOffer=null;
      tryCollect(room,player); syncPower(room,player);
      if (prunePowerDuel(room,{now:time})) enterEffect(room,time);
      if (newCompleted.length) broadcast(room);
    } else {
      player.finalAccepted=true; room.pendingFinal.delete(player.runId);
    }
    send(ws,{type:'reportAck',runId:player.runId,seq:player.lastSeq,serverTime:time});
    reportProgress(room,player);
    if (JSON.stringify([player.power,player.powerOffer,player.powerSlots])!==inventoryBefore || (player.coinAttack?.earned||0)!==coinEarnedBefore) sendPlayerState(room,player);
    if (room.status==='settling'&&!room.pendingFinal.size) finish(room);
  };
  async function handle(ws, msg, session) {
    if (!msg||typeof msg.type!=='string') return error(ws,'Invalid message');
    if (msg.type==='create') {
      if (session.room) return error(ws,'Already joined a room');
      if (rooms.size>=MAX_ROOMS) return error(ws,'Server is full','FULL');
      let code; do code=randomBytes(3).toString('hex').toUpperCase(); while (rooms.has(code));
      const room={code,token:randomBytes(18).toString('hex'),hostWs:ws,status:'lobby',settings:settings(msg.settings),players:new Map(),results:null,createdAt:now(),roundId:randomUUID(),startedAt:null,endsAt:null,cutoffAt:null,settleEndsAt:null,question:null,announcement:null,announcementQueue:[],activePower:null,powerQueue:[],powerDuel:null,pendingFinal:new Set(),resultEntries:[],leaderboardDirty:false,lastLeaderboardAt:0};
      rooms.set(code,room); session.room=room; session.host=true;
      send(ws,{type:'created',code,token:room.token}); return broadcast(room);
    }
    if (msg.type==='hostJoin') {
      if (session.room) return error(ws,'Already joined a room');
      const room=rooms.get(clean(msg.code,6).toUpperCase());
      if (!room||msg.token!==room.token) return error(ws,'Invalid room or token','AUTH');
      room.hostWs?.close(); room.hostWs=ws; session.room=room; session.host=true; return broadcast(room);
    }
    if (msg.type==='join') {
      if (session.room) return error(ws,'Already joined a room');
      const room=rooms.get(clean(msg.code,6).toUpperCase());
      if (!room) return error(ws,'Room not found','ROOM');
      if (room.status==='running'&&now()>=room.endsAt) settle(room,room.endsAt);
      if (room.status==='settling') return error(ws,'Scores are finalizing. Rejoin in a moment.','ROUND_FINALIZING');
      const player=addPlayer(room,msg,ws); if (!player) return error(ws,'Room is full','FULL');
      session.room=room; session.player=player;
      send(ws,{type:'joined',id:player.id,code:room.code,runId:player.runId}); return broadcast(room);
    }
    const room=session.room, player=session.player;
    if (!room) return error(ws,'Join a room first');
    if (room.status==='running'&&now()>=room.endsAt) settle(room,room.endsAt);
    if (msg.type==='timeSync') return send(ws,{type:'timeSync',clientTime:msg.clientTime,serverTime:now()});
    if (session.host) {
      if (room.hostWs!==ws) return error(ws,'Host session superseded','AUTH');
      if (msg.type==='start') start(room);
      else if (msg.type==='end'&&room.status==='running') settle(room,now());
      else if (msg.type==='reset') reset(room);
      else if (msg.type==='settings'&&room.status==='lobby') { room.settings=settings(msg.settings); broadcast(room); }
      else if (msg.type==='launchQuestion'&&room.status==='lobby') { const index=clamp(msg.index,0,4), q=room.settings.questions[index]; if (q) { room.question={...q,index,votes:new Map(),endsAt:now()+15000,closed:false}; broadcast(room); } }
      else if (msg.type==='skipQuestion'&&room.status==='lobby') { room.question=null; broadcast(room); }
      else if (msg.type==='hostAttack') return queueHostAttack(room,ws,msg);
      else if (['usePower','powerAnswer','powerChestChoice','coinAttack','runReport'].includes(msg.type)) return error(ws,'Player action required','AUTH');
      return;
    }
    if (!player||player.ws!==ws||!player.connected) return error(ws,'Invalid player session','AUTH');
    if (['start','end','reset','settings','launchQuestion','skipQuestion','hostAttack'].includes(msg.type)) return error(ws,'Host only','AUTH');
    if (msg.type==='runReport') return acceptReport(room,player,msg,ws);
    if (msg.type==='coinAttack') return queueCoinAttack(room,player,ws,msg);
    if (msg.type==='profile') {
      if (room.status!=='lobby') return error(ws,'Player identity is locked after the race starts','PROFILE_LOCKED');
      Object.assign(player,profile(msg)); updatePlayerLocation(room,player,msg,{lobbyOnly:true}); return broadcast(room);
    }
    if (msg.type==='spawn'&&['lobby','running'].includes(room.status)) { player.spawned=true; updatePlayerLocation(room,player,msg,{lobbyOnly:room.status==='lobby'}); return broadcast(room); }
    if (msg.type==='playerLocation') {
      if (room.status!=='lobby'||!player.spawned) return error(ws,'Location snapshot is lobby-only','LOCATION_INVALID');
      const changed=updatePlayerLocation(room,player,msg,{lobbyOnly:true});
      if (changed === null) return error(ws,'Location snapshot rejected','LOCATION_INVALID');
      if (changed) reportLocationProgress(room,player);
      return;
    }
    if (msg.type==='vote'&&room.status==='lobby'&&room.question&&!room.question.closed&&now()<room.question.endsAt&&(msg.choice===0||msg.choice===1)) { room.question.votes.set(player.id,msg.choice); updatePlayerLocation(room,player,msg,{lobbyOnly:true}); return broadcast(room); }
    if (['usePower','powerAnswer','powerChestChoice'].includes(msg.type)) {
      if (room.status!=='running') return error(ws,'The round has ended','ROUND_ENDED',{transactionId:msg.transactionId,challengeId:msg.challengeId});
      if (msg.roundId!==room.roundId||msg.runId!==player.runId) return error(ws,'This action belongs to another run','RUN_INVALID',{transactionId:msg.transactionId,challengeId:msg.challengeId});
    }
    if (msg.type==='powerAnswer') {
      const result=answerPowerDuel(room,player,{transactionId:msg.transactionId,challengeId:msg.challengeId,answer:msg.answer,now:now()});
      if (!result.ok) return error(ws,'Power quiz answer rejected',result.code,{transactionId:msg.transactionId,challengeId:msg.challengeId});
      updatePlayerLocation(room,player,msg);
      send(ws,{type:'powerAnswerResult',transactionId:msg.transactionId,challengeId:msg.challengeId,correct:result.correct,role:result.role,powerName:room.powerDuel.entry.power.name});
      if (result.role==='attack'&&result.correct) room.announcement={...room.announcement,phase:'defense',text:room.powerDuel.entry.source==='coin'?`${room.powerDuel.defenses.values().next().value?.player?.name||'Target'} must defend!`:'Everyone else must defend!',startedAt:now(),endsAt:room.powerDuel.endsAt,durationMs:room.powerDuel.defendMs};
      for(const p of room.players.values())tryCollect(room,p);
      syncPowers(room);
      if (result.advance&&room.powerDuel?.phase==='effect') enterEffect(room); else broadcast(room);
      return;
    }
    if (msg.type==='usePower') return queuePower(room,player,ws,msg);
    if (msg.type==='powerChestChoice') {
      const offer=player.powerOffer, level=player.summary.level, quiz=privateDuelQuiz(room,player);
      if (!offer||offer.runId!==player.runId||offer.level!==level||msg.offerId!==offer.id||msg.itemId!==offer.itemId||offer.chestId!==player.chestContact||!player.spawned||player.state.deadUntil||player.state.finished||Object.values(player.powerSlots||{}).some(s=>s.reserved)||player.power?.used||player.power?.itemId!==offer.itemId||player.powerSlots?.[level]?.chests?.[offer.chestId]?.claimed||(quiz&&!quiz.answered)) return error(ws,'Power chest choice rejected','POWER_OFFER_INVALID');
      if (msg.choice==='attack') return queuePower(room,player,ws,msg);
      if (msg.choice!=='replace') return error(ws,'Choose attack or replace','POWER_OFFER_INVALID');
      const previous=player.power; player.power=null;
      if (!collectPower(player,level,Math.random,offer.chestId,{durationMs:room.settings.powerDurationSeconds*1000})) { player.power=previous; return error(ws,'Power chest choice rejected','POWER_OFFER_INVALID'); }
      player.powerOffer=null; syncPower(room,player); updatePlayerLocation(room,player,msg); sendPlayerState(room,player); reportProgress(room,player); return;
    }
    if (msg.type==='leave') {
      updatePlayerLocation(room,player,msg);
      player.ws=null; drop(room,player); session.player=null;
      if (room.status==='lobby') room.players.delete(player.id);
      return broadcast(room);
    }
  }
  const root=path.resolve(staticRoot);
  const server=http.createServer((req,res)=>{
    const headers={'cache-control':'no-store'};
    if (req.url==='/health') { const diskVersion=fingerprint(); res.writeHead(200,{'content-type':'application/json',...headers}); return res.end(JSON.stringify({ok:true,rooms:rooms.size,runtimeVersion,diskVersion,needsRestart:diskVersion!==runtimeVersion,protocolVersion:PROTOCOL_VERSION})); }
    let file;
    try { const url=new URL(req.url,'http://localhost'); file=path.resolve(root,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`); } catch { return res.writeHead(400).end('Bad request'); }
    if (!(file===root||file.startsWith(root+path.sep))||!existsSync(file)||statSync(file).isDirectory()) return res.writeHead(404).end('Not found');
    res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',...headers}); res.end(readFileSync(file));
  });
  const wss=new WebSocketServer({server,maxPayload:MAX_PAYLOAD});
  wss.on('connection',ws=>{
    const session={room:null,player:null,host:false,alive:true,windowAt:now(),messageCount:0}; ws._session=session;
    ws.on('pong',()=>{session.alive=true;});
    ws.on('message',raw=>{
      if (now()-session.windowAt>=1000) { session.windowAt=now(); session.messageCount=0; }
      if (++session.messageCount>120) return error(ws,'Too many requests','RATE_LIMIT');
      try { handle(ws,JSON.parse(raw),session).catch(()=>error(ws,'Request failed')); } catch { error(ws,'Invalid JSON'); }
    });
    ws.on('close',()=>{const room=session.room;if(room?.hostWs===ws)room.hostWs=null;if(session.player?.ws===ws){session.player.ws=null;drop(room,session.player);broadcast(room);}});
    ws.on('error',()=>{});
  });
  // This scheduler checks shared deadlines only. It never steps a player world.
  const timer=setInterval(()=>{
    const time=now();
    for (const [code,room] of rooms) {
      if (room.status==='running'&&time>=room.endsAt) settle(room,room.endsAt);
      if (room.status==='settling'&&(room.pendingFinal.size===0||time>=room.settleEndsAt)) finish(room);
      if (room.status==='running') {
        if (room.powerDuel&&room.powerDuel.phase!=='effect'&&time>=room.powerDuel.endsAt) { advancePowerDuel(room,{now:time}); enterEffect(room,time); }
        if (room.powerDuel?.phase==='defense'&&prunePowerDuel(room,{now:time})) enterEffect(room,time);
        if (room.announcement&&time>=room.announcement.endsAt) {
          if (room.announcement.kind==='power') { room.activePower=null; room.powerDuel=null; }
          nextAnnouncement(room); broadcast(room);
        }
      }
      if (room.question&&!room.question.closed&&time>=room.question.endsAt) { room.question.closed=true; broadcast(room); }
      if (room.leaderboardDirty&&room.status!=='ended'&&time-room.lastLeaderboardAt>=100) {
        const players=ranked(room).map((p,index)=>({id:p.id,score:p.score,rank:index+1,finishTime:p.finishTime,summary:{level:p.summary.level,finished:p.summary.finished}}));
        const message={type:'leaderboard',players,serverTime:time};
        for (const p of room.players.values()) send(p.ws,message); send(room.hostWs,message);
        room.leaderboardDirty=false; room.lastLeaderboardAt=time;
      }
      if (time-room.createdAt>ROOM_TTL&&!['running','settling'].includes(room.status)&&!room.hostWs&&[...room.players.values()].every(p=>!p.ws)) rooms.delete(code);
    }
  },tickMs);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){const session=ws._session;if(!session.alive){ws.terminate();continue;}session.alive=false;ws.ping();}},15000);
  return {httpServer:server,wss,rooms,async listen(){return new Promise(resolve=>server.listen(port,host,resolve));},close(){clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();return new Promise(resolve=>server.close(()=>resolve()));}};
}
if (process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) createGameServer().listen().then(()=>console.log(`Not Mario's World server listening on ${process.env.PORT||10000}`));
