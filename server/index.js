import http from 'node:http';
import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as engine from '../public/game/engine.js';
import { LEVELS } from '../public/game/levels.js';
import { chestPower, collectPower, powerEffects, reservePower, releasePowerReservation, resetPowerInventory, powerStrength } from '../public/game/powers.js';
import { DEFAULT_QUESTIONS } from '../public/game/default-questions.js';
import { beginPowerDuel, answerPowerDuel, advancePowerDuel, prunePowerDuel, duelView, privateDuelQuiz } from './power-duels.js';

const { WebSocketServer } = createRequire(import.meta.url)('ws');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PUBLIC = path.join(ROOT, 'public');
const MAX_PLAYERS = 25, MAX_ROOMS = 500, MAX_PAYLOAD = 16384, ROOM_TTL = 3600000;
const AVATARS = new Set(engine.AVATARS), COLORS = new Set(engine.COLORS);
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon' };
const clean = (v,n,f='') => typeof v === 'string' ? v.trim().slice(0,n) || f : f;
const clamp = (v,a,b) => Math.max(a, Math.min(b, Number.isFinite(Number(v)) ? Number(v) : a));
const send = (ws,v) => ws?.readyState === 1 && ws.send(JSON.stringify(v));
const error = (ws,message,code) => send(ws,{type:'error',message,...(code ? {code} : {})});
const makeCode = () => randomBytes(3).toString('hex').toUpperCase();
const profile = m => ({ name:clean(m.name,24,'Player'), avatar:AVATARS.has(m.avatar) ? m.avatar : [...AVATARS][0], color:COLORS.has(m.color) ? m.color : [...COLORS][0] });
const versionFiles = ['server/index.js','server/power-duels.js','server/power-questions.js','public/game/engine.js','public/game/levels.js','public/game/projectiles.js','public/game/powers.js','public/game/default-questions.js'].map(file=>path.join(ROOT,file));
const hashFiles = () => { const hash=createHash('sha256'); for(const file of versionFiles) hash.update(readFileSync(file)); return hash.digest('hex'); };
function settings(input={}) { const questions=Array.isArray(input.questions) ? input.questions.slice(0,5).map(q=>({prompt:clean(q?.prompt,240),choices:Array.isArray(q?.choices) ? q.choices.slice(0,2).map(c=>clean(c,100)) : []})).filter(q=>q.prompt && q.choices.length===2 && q.choices.every(Boolean)) : DEFAULT_QUESTIONS.map(q=>({prompt:q.prompt,choices:[...q.choices]})); return { durationMinutes:input.durationMinutes == null ? 10 : clamp(input.durationMinutes,1,60), coinPoints:input.coinPoints == null ? 10 : clamp(input.coinPoints,0,1000), distancePoints:input.distancePoints == null ? 1 : clamp(input.distancePoints,0,1000), powerDurationSeconds:input.powerDurationSeconds == null ? 5 : clamp(input.powerDurationSeconds,1,60), attackWindowSeconds:input.attackWindowSeconds == null ? 10 : clamp(input.attackWindowSeconds,1,60), defendWindowSeconds:input.defendWindowSeconds == null ? 10 : clamp(input.defendWindowSeconds,1,60), slowSpeedPercent:input.slowSpeedPercent == null ? 55 : clamp(input.slowSpeedPercent,10,90), reverseSpeedPercent:input.reverseSpeedPercent == null ? 100 : clamp(input.reverseSpeedPercent,50,200), slipperySpeedPercent:input.slipperySpeedPercent == null ? 170 : clamp(input.slipperySpeedPercent,110,250), slipperyGripPercent:input.slipperyGripPercent == null ? 12 : clamp(input.slipperyGripPercent,2,50), inkDarknessPercent:input.inkDarknessPercent == null ? 75 : clamp(input.inkDarknessPercent,0,95), questions }; }

export function createGameServer({port=Number(process.env.PORT)||10000, host='0.0.0.0', staticRoot=DEFAULT_PUBLIC, now=()=>Date.now(), tickMs=1000/60}={}) {
  const runtimeVersion = hashFiles();
  const rooms = new Map(); let lastTick = now(), lastPlayerSnapshot = now(), lastHostSnapshot = now();
  const snapshot = (room, viewer) => { const frozenRanks=new Map((room.results||[]).map(result=>[result.id,result.rank])); const ranked=[...room.players.values()].sort((a,b)=>{const ar=frozenRanks.get(a.id),br=frozenRanks.get(b.id);if(room.status==='ended')return (ar??Infinity)-(br??Infinity) || a.joinedAt-b.joinedAt;return b.score-a.score || (a.finishTime??Infinity)-(b.finishTime??Infinity) || a.joinedAt-b.joinedAt;}); return { code:room.code,status:room.status,settings:room.settings,startedAt:room.startedAt,endsAt:room.endsAt,remainingMs:room.status==='running'?Math.max(0,room.endsAt-now()):0,runtimeVersion,activePower:room.activePower?{id:room.activePower.id,by:room.activePower.casterId,byName:room.activePower.casterName,type:room.activePower.power.type,name:room.activePower.power.name,level:room.activePower.level,startedAt:room.activePower.startedAt,endsAt:room.activePower.endsAt}:null,powerDuel:duelView(room),powerQueue:room.powerQueue.map((q,index)=>({id:q.id,casterId:q.casterId,casterName:q.casterName,level:q.level,power:q.power,position:index+1})),results:room.results,players:ranked.map((p,index)=>{const privileged=viewer.host||viewer.id===p.id;const claims=Object.keys(p.powerSlots?.[p.state.level]?.chests||{}).filter(id=>p.powerSlots[p.state.level].chests[id]?.claimed);return {id:p.id,name:p.name,avatar:p.avatar,color:p.color,connected:!!p.ws,spawned:p.spawned,power:p.power,powerChestClaims:privileged?claims:undefined,powerOffer:privileged?p.powerOffer||null:undefined,powerQuiz:privileged?privateDuelQuiz(room,p):null,effects:powerEffects(p,now()),summary:{level:p.state.level,deaths:p.state.deaths,finished:p.state.finished,banked:p.state.banked,progress:p.state.progress},state:privileged ? engine.snapshot(p.state) : undefined,score:p.score,rank:room.status==='ended'?(frozenRanks.get(p.id)??null):index+1,finishTime:p.finishTime};}),question:room.question?{index:room.question.index,prompt:room.question.prompt,choices:room.question.choices,votes:Object.fromEntries(room.question.votes),endsAt:room.question.endsAt,closed:room.question.closed}:null,announcement:room.announcement}; };
  const broadcast = room => { for(const p of room.players.values()) if(p.ws) send(p.ws,{type:'state',room:snapshot(room,{id:p.id}),you:p.id,serverTime:now()}); if(room.hostWs) send(room.hostWs,{type:'state',room:snapshot(room,{host:true}),you:null,serverTime:now()}); };
  const syncPlayerPower = (room, player) => { const existing=player.power, level=existing?.level, slot=level == null ? null : player.powerSlots?.[level]; const held=existing && slot?.itemId===existing.itemId && slot.power ? slot.power : null; const queued=room.powerQueue.find(item=>item.caster===player&&item.itemId===existing?.itemId); const testing=!!privateDuelQuiz(room,player)&&!privateDuelQuiz(room,player).answered; player.power=held ? {level,itemId:existing.itemId,chestId:existing.chestId,claimed:true,used:!!slot.used,queued:!!queued,queuePosition:queued ? room.powerQueue.indexOf(queued)+1 : null,testing,power:{...held}} : null; };
  const syncQueuePositions = room => { for(const player of room.players.values()) syncPlayerPower(room,player); };
  const nextAnnouncement = room => { const item=room.announcementQueue.shift(); if(!item){room.announcement=null;syncQueuePositions(room);return;} const startedAt=now(); if(item.kind==='power'){room.powerQueue=room.powerQueue.filter(q=>q.id!==item.id);syncQueuePositions(room);const result=beginPowerDuel(room,item,{now:startedAt}); if(!result.ok){releasePowerReservation(item);send(item.caster.ws,{type:'powerCancelled',name:item.power.name,reason:result.code});syncQueuePositions(room);return nextAnnouncement(room);} item.startedAt=startedAt;item.endsAt=result.duel.endsAt;room.announcement={id:result.duel.id,kind:'power-quiz',phase:'attack',text:`${item.caster.name} is challenged!`,startedAt,endsAt:item.endsAt,durationMs:result.duel.attackMs};syncQueuePositions(room);return;} room.announcement={...item,kind:'level',startedAt,endsAt:startedAt+2000,durationMs:2000}; };
  const announce = (room,text,level) => { room.announcementQueue.push({id:randomUUID(),text,kind:'level',...(level == null ? {} : {level})}); if(!room.announcement) nextAnnouncement(room); };
  const removeQueuedFor = (room, player) => { for(let i=room.powerQueue.length-1;i>=0;i--) if(room.powerQueue[i].caster===player){releasePowerReservation(room.powerQueue[i]);room.powerQueue.splice(i,1);} for(let i=room.announcementQueue.length-1;i>=0;i--) if(room.announcementQueue[i].kind==='power'&&room.announcementQueue[i].caster===player){releasePowerReservation(room.announcementQueue[i]);room.announcementQueue.splice(i,1);} syncQueuePositions(room); };
  const enterDuelEffect = (room, startedAt=now()) => { const duel=room.powerDuel;if(!duel)return;const targets=duel.outcome==='attackerFailed'?[duel.caster]:[...duel.defenses.values()].filter(item=>item.result!=='correct'&&item.player.connected&&item.player.runId===item.runId&&!item.player.state.finished).map(item=>item.player);duel.affectedIds=targets.map(p=>p.id);duel.phase='effect';duel.endsAt=startedAt+duel.entry.power.durationMs;for(const target of targets){target.effects ||= {};target.effects[duel.entry.power.type]={type:duel.entry.power.type,strength:duel.entry.power.strength,by:duel.caster.id,endsAt:duel.endsAt,id:duel.id};}room.activePower={id:duel.id,casterId:duel.caster.id,casterName:duel.caster.name,power:duel.entry.power,level:duel.entry.level,startedAt,endsAt:duel.endsAt};const text=duel.outcome==='attackerFailed'?`${duel.caster.name}'s ${duel.entry.power.name} backfired!`:duel.outcome==='blocked'?`${duel.caster.name}'s ${duel.entry.power.name} was blocked!`:`${duel.caster.name} unleashed ${duel.entry.power.name}!`;room.announcement={id:duel.id,kind:'power',phase:'effect',text,startedAt,endsAt:duel.endsAt,durationMs:duel.entry.power.durationMs};syncQueuePositions(room);broadcast(room); };
  const cancelAttackDuel = room => { if(!room?.powerDuel || room.powerDuel.phase!=='attack') return; const duel=room.powerDuel;releasePowerReservation(duel.entry);room.powerDuel=null;room.announcement=null;nextAnnouncement(room);broadcast(room); };
  const dropPowerParticipant = (room, player) => {
    player.connected=false;
    player.powerOffer=null;
    removeQueuedFor(room,player);
    if(room.powerDuel?.caster===player&&room.powerDuel.phase==='attack')cancelAttackDuel(room);
    else if(prunePowerDuel(room,{now:now()}))enterDuelEffect(room,now());
  };
  const score = p => { p.score=Number(engine.score(p.state,p.room.settings)||0); };
  const syncPower = p => { syncPlayerPower(p.room,p); };
  const resetPlayer = (p, clearPowers=false) => { p.runId=randomUUID(); p.state=engine.createState({name:p.name,avatar:p.avatar,color:p.color}); p.spawned=false; p.input={}; p.lastInput=now(); p.score=0; p.finishTime=null; p.powerOffer=null; if(clearPowers){p.effects={};resetPowerInventory(p);} };
  const start = room => { if(room.status!=='lobby') return; room.status='running';room.startedAt=now();room.endsAt=room.startedAt+room.settings.durationMinutes*60000;room.results=null;room.question=null; for(const p of room.players.values()){const wasSpawned=p.spawned;resetPlayer(p,true);p.spawned=wasSpawned;engine.startRun(p.state);} broadcast(room); };
  const end = room => { if(room.status==='ended') return; clearPowerState(room); room.announcement=null; room.status='ended'; const entries=[...room.players.values()]; for(const p of entries){p.effects={};score(p);} entries.sort((a,b)=>b.score-a.score || (a.finishTime??Infinity)-(b.finishTime??Infinity) || a.joinedAt-b.joinedAt); room.results=entries.map((p,index)=>({id:p.id,name:p.name,avatar:p.avatar,color:p.color,score:p.score,rank:index+1,finishTime:p.finishTime,summary:{level:p.state.level,deaths:p.state.deaths,finished:p.state.finished,banked:p.state.banked,progress:p.state.progress}})); broadcast(room); };
  const clearPowerState = room => { for(const item of room.powerQueue) releasePowerReservation(item); for(const item of room.announcementQueue) if(item.kind==='power') releasePowerReservation(item); for(const player of room.players.values())player.powerOffer=null; if(room.activePower) room.activePower=null; room.powerDuel=null; room.powerQueue=[]; room.announcementQueue=room.announcementQueue.filter(item=>item.kind!=='power'); };
  const reset = room => { if(room.status==='running') return; clearPowerState(room); room.status='lobby';room.startedAt=null;room.endsAt=null;room.results=null;room.question=null;room.announcement=null;room.announcementQueue=[];for(const p of room.players.values())resetPlayer(p,true);broadcast(room); };
  const addPlayer = (room,msg,ws) => { const info=profile(msg), old=[...room.players.values()].find(p=>!p.ws&&p.name===info.name); if(old){if(room.status==='ended'){Object.assign(old,{ws,connected:true,room});}else{removeQueuedFor(room,old);Object.assign(old,info,{ws,connected:true,room});resetPlayer(old,true);}return old;} if(room.players.size>=MAX_PLAYERS)return null; const p={id:randomUUID(),runId:randomUUID(),...info,ws,connected:true,room,joinedAt:now(),state:engine.createState(info),spawned:false,input:{},lastInput:now(),score:0,finishTime:null,powerSlots:{},power:null,powerOffer:null,effects:{}};room.players.set(p.id,p);return p; };
  async function handle(ws,msg,session) {
    if(!msg || typeof msg.type!=='string') return error(ws,'Invalid message');
    if(msg.type==='create'){if(session.room)return error(ws,'Already joined a room');if(rooms.size>=MAX_ROOMS)return error(ws,'Server is full','FULL');let code;do code=makeCode();while(rooms.has(code));const room={code,token:randomBytes(18).toString('hex'),hostWs:ws,status:'lobby',settings:settings(msg.settings),players:new Map(),results:null,createdAt:now(),startedAt:null,endsAt:null,question:null,announcement:null,announcementQueue:[],activePower:null,powerQueue:[],powerDuel:null};rooms.set(code,room);session.room=room;session.host=true;return send(ws,{type:'created',code,token:room.token});}
    if(msg.type==='hostJoin'){if(session.room)return error(ws,'Already joined a room');const room=rooms.get(clean(msg.code,6).toUpperCase());if(!room||msg.token!==room.token)return error(ws,'Invalid room or token','AUTH');room.hostWs?.close();room.hostWs=ws;session.room=room;session.host=true;return broadcast(room);}
    if(msg.type==='join'){if(session.room)return error(ws,'Already joined a room');const room=rooms.get(clean(msg.code,6).toUpperCase());if(!room)return error(ws,'Room not found','ROOM');if(room.status==='running'&&now()>=room.endsAt)end(room);const p=addPlayer(room,msg,ws);if(!p)return error(ws,'Room is full','FULL');session.room=room;session.player=p;send(ws,{type:'joined',id:p.id,code:room.code});if(room.status==='running')engine.startRun(p.state);return broadcast(room);}
    const room=session.room, player=session.player;if(!room)return error(ws,'Join a room first');
    if(session.host){if(room.hostWs!==ws)return error(ws,'Host session superseded','AUTH');if(msg.type==='start'&&room.status==='lobby')start(room);else if(msg.type==='end'&&room.status==='running')end(room);else if(msg.type==='reset'&&room.status!=='running')reset(room);else if(msg.type==='settings'&&room.status==='lobby'){room.settings=settings(msg.settings);broadcast(room);}else if(msg.type==='launchQuestion'&&room.status==='lobby'){const i=clamp(msg.index,0,4),q=room.settings.questions[i];if(q){room.question={...q,index:i,votes:new Map(),endsAt:now()+15000,closed:false};broadcast(room);}}else if(msg.type==='skipQuestion'&&room.status==='lobby'){room.question=null;broadcast(room);}else if(msg.type==='usePower'||msg.type==='powerAnswer')return error(ws,'Host only','AUTH');return;}
    if(!player)return error(ws,'Invalid player session','AUTH');
    if(['start','end','reset','settings','launchQuestion','skipQuestion'].includes(msg.type)) return error(ws,'Host only','AUTH');
    if(msg.type==='profile'&&(room.status==='lobby'||room.status==='running')&&!player.spawned){const i=profile(msg);Object.assign(player,i);Object.assign(player.state,i);broadcast(room);}
    else if(msg.type==='spawn'&&(room.status==='lobby'||room.status==='running')){player.spawned=true;broadcast(room);}
    else if(msg.type==='input'&&(room.status==='lobby'||room.status==='running')){player.input={left:!!msg.left,right:!!msg.right,jump:!!msg.jump};player.lastInput=now();}
    else if(msg.type==='vote'&&room.question&&!room.question.closed&&now()<room.question.endsAt&&(msg.choice===0||msg.choice===1)){room.question.votes.set(player.id,msg.choice);broadcast(room);}
    else if(msg.type==='powerAnswer'){
      if(room.status==='running'&&now()>=room.endsAt){end(room);return error(ws,'Power quiz closed','ROUND_ENDED');}
      const result=answerPowerDuel(room,player,{transactionId:msg.transactionId,challengeId:msg.challengeId,answer:msg.answer,now:now()});
      if(!result.ok)return send(ws,{type:'error',message:'Power quiz answer rejected',code:result.code,transactionId:msg.transactionId,challengeId:msg.challengeId});
      send(ws,{type:'powerAnswerResult',transactionId:msg.transactionId,challengeId:msg.challengeId,correct:result.correct,role:result.role,powerName:room.powerDuel.entry.power.name});
      if(result.role==='attack'&&result.correct){room.announcement={...room.announcement,phase:'defense',text:'Everyone else must defend!',startedAt:now(),endsAt:room.powerDuel.endsAt,durationMs:room.powerDuel.defendMs};syncQueuePositions(room);}
      if(result.advance && room.powerDuel?.phase==='effect')enterDuelEffect(room,now()); else broadcast(room);
    }
    else if(msg.type==='powerChestChoice'){
      if(room.status==='running'&&now()>=room.endsAt){end(room);return error(ws,'The round has ended','ROUND_ENDED');}
      const offer=player.powerOffer;
      const level=player.state.level, chest=LEVELS[level]?.powerChests?.find(c=>c.id===offer?.chestId);
      const foot={x:player.state.x-14,y:player.state.y-36,w:28,h:36};
      const close=chest && foot.x<chest.x+chest.w && foot.x+foot.w>chest.x && foot.y<chest.y && foot.y+foot.h>chest.y-34;
      const quiz=privateDuelQuiz(room,player),slot=player.powerSlots?.[level];
      if(room.status!=='running'||!offer||offer.runId!==player.runId||offer.level!==level||msg.offerId!==offer.id||msg.itemId!==offer.itemId||!close||!player.spawned||player.state.deadUntil>0||player.state.finished||!player.connected||Object.values(player.powerSlots||{}).some(s=>s.reserved)||player.power?.used||player.power?.itemId!==offer.itemId||slot?.chests?.[chest.id]?.claimed||(quiz&&!quiz.answered)) return error(ws,'Power chest choice rejected','POWER_OFFER_INVALID');
      if(msg.choice==='attack'){
        const result=reservePower(room,player,{now:now()}); if(!result.ok)return error(ws,'Power could not be used',result.code);
        const item={...result,casterId:player.id,casterName:player.name,kind:'power'}; room.powerQueue.push(item);room.announcementQueue.push(item);player.powerOffer=null;syncQueuePositions(room);if(!room.announcement)nextAnnouncement(room);broadcast(room);
      } else if(msg.choice==='replace'){
        const previous=player.power;player.power=null;
        const got=collectPower(player,level,Math.random,chest.id,{durationMs:room.settings.powerDurationSeconds*1000});
        if(!got){player.power=previous;return error(ws,'Power chest choice rejected','POWER_OFFER_INVALID');}
        player.powerOffer=null;syncPower(player);broadcast(room);
      } else error(ws,'Unknown power chest choice','POWER_OFFER_INVALID');
    }
    else if(msg.type==='usePower'){
      if(room.status==='running'&&now()>=room.endsAt){end(room);return error(ws,'Power could not be used','ROUND_ENDED');}
      const quiz=privateDuelQuiz(room,player);
      if(quiz&&!quiz.answered)return error(ws,'Answer your current power question first','POWER_UNAVAILABLE');
      const result=reservePower(room,player,{now:now()});
      if(!result.ok) return error(ws,result.code==='NO_TARGET'?'No opponents are ready for this power yet':'Power could not be used',result.code);
      const item={...result,casterId:player.id,casterName:player.name,kind:'power'};
      room.powerQueue.push(item);room.announcementQueue.push(item);player.powerOffer=null;syncQueuePositions(room);
      if(!room.announcement) nextAnnouncement(room); else send(ws,{type:'powerQueued',name:item.power.name,position:room.powerQueue.length});
      broadcast(room);
    }
    else if(msg.type==='leave'){player.ws=null;dropPowerParticipant(room,player);room.players.delete(player.id);session.player=null;broadcast(room);}
  }
  const root=path.resolve(staticRoot), server=http.createServer((req,res)=>{const headers={'cache-control':'no-store'};if(req.url==='/health'){const diskVersion=hashFiles();res.writeHead(200,{'content-type':'application/json',...headers});return res.end(JSON.stringify({ok:true,rooms:rooms.size,runtimeVersion,diskVersion,needsRestart:runtimeVersion!==diskVersion}));}let file;try{const u=new URL(req.url,'http://localhost');file=path.resolve(root,`.${decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname)}`);}catch{return res.writeHead(400).end('Bad request');}if(!(file===root||file.startsWith(root+path.sep))||!existsSync(file)||statSync(file).isDirectory())return res.writeHead(404).end('Not found');res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',...headers});res.end(readFileSync(file));});
  const wss=new WebSocketServer({server,maxPayload:MAX_PAYLOAD});wss.on('connection',ws=>{const s={room:null,player:null,host:false,alive:true};ws.on('pong',()=>s.alive=true);ws.on('message',data=>{if(data.length>MAX_PAYLOAD)return ws.close(1009);try{handle(ws,JSON.parse(data),s).catch(()=>error(ws,'Request failed'));}catch{error(ws,'Invalid JSON');}});ws.on('close',()=>{if(s.room?.hostWs===ws)s.room.hostWs=null;if(s.player&&s.player.ws===ws){s.player.ws=null;s.player.input={};dropPowerParticipant(s.room,s.player);}});ws.on('error',()=>{});ws._session=s;});
  const tryCollect = (room, player) => {
    const previousOffer=player.powerOffer;
    if(player.powerOffer && (room.status!=='running' || !player.connected || !player.spawned || player.state.finished || player.state.deadUntil>0 || player.powerOffer.level!==player.state.level)) player.powerOffer=null;
    if(room.status!=='running' || !player.connected || !player.spawned || player.state.finished || player.state.deadUntil>0) return previousOffer!==player.powerOffer;
    const level=LEVELS[player.state.level], chests=level?.powerChests || []; if(!chests.length) return previousOffer!==player.powerOffer;
    const foot={x:player.state.x-14,y:player.state.y-36,w:28,h:36};
    if(player.powerOffer){const offered=chests.find(c=>c.id===player.powerOffer.chestId);if(!offered||player.powerOffer.level!==player.state.level||foot.x>=offered.x+offered.w||foot.x+foot.w<=offered.x||foot.y>=offered.y||foot.y+foot.h<=offered.y-34) player.powerOffer=null;}
    for(const chest of chests){
      if(foot.x>=chest.x+chest.w || foot.x+foot.w<=chest.x || foot.y>=chest.y || foot.y+foot.h<=chest.y-34) continue;
      const slot=player.powerSlots?.[player.state.level], claimed=slot?.chests?.[chest.id]?.claimed;
      if(claimed) continue;
      const held=player.power && !player.power.used, pending=Object.values(player.powerSlots||{}).some(s=>s.reserved);
      if(pending){player.powerOffer=null;continue;}
      if(held){
        const quiz=privateDuelQuiz(room,player),canReplace=!quiz||quiz.answered;
        const canAttack=canReplace&&[...room.players.values()].some(p=>p!==player&&p.connected&&p.spawned&&!p.state.finished);
        if(player.powerOffer?.chestId===chest.id&&player.powerOffer.itemId===player.power.itemId&&player.powerOffer.canAttack===!!canAttack&&player.powerOffer.canReplace===!!canReplace)continue;
        player.powerOffer={id:randomUUID(),runId:player.runId,chestId:chest.id,level:player.state.level,power:chestPower(player,player.state.level,chest.id,Math.random,room.settings.powerDurationSeconds*1000),itemId:player.power.itemId,canAttack:!!canAttack,canReplace:!!canReplace,queued:false};return true;
      }
      player.powerOffer=null;
      const got=collectPower(player,player.state.level,Math.random,chest.id,{durationMs:room.settings.powerDurationSeconds*1000}); if(got){syncPower(player);return true;}
    }
    return previousOffer!==player.powerOffer;
  };
  let accumulator = 0;
  const timer = setInterval(() => {
    const t = now();
    accumulator += Math.min(.25, Math.max(0, (t - lastTick) / 1000));
    lastTick = t;
    const ticks = Math.min(15, Math.floor((accumulator + 1e-9) * 60));
    accumulator -= ticks / 60;
    const sendPlayers = t - lastPlayerSnapshot >= 66;
    const sendHost = t - lastHostSnapshot >= 125;
    if (sendPlayers) lastPlayerSnapshot = t;
    if (sendHost) lastHostSnapshot = t;
    for (const [key, room] of rooms) {
      if (room.status === 'running' && t >= room.endsAt) {
        end(room);
        continue;
      }
      if(room.powerDuel && room.powerDuel.phase!=='effect' && t>=room.powerDuel.endsAt){advancePowerDuel(room,{now:t});enterDuelEffect(room,t);}
      if(room.powerDuel && room.powerDuel.phase==='defense' && prunePowerDuel(room,{now:t})) enterDuelEffect(room,t);
      if (room.announcement && t >= room.announcement.endsAt) {
        if(room.announcement.kind==='power'){room.activePower=null;room.powerDuel=null;}
        nextAnnouncement(room);
        broadcast(room);
      }
      if (room.question && !room.question.closed && t >= room.question.endsAt) {
        room.question.closed = true;
        broadcast(room);
      }
      if (room.status !== 'ended') {
        for (const player of room.players.values()) {
          if (!player.spawned || !player.connected) continue;
          if (t - player.lastInput > 1000) player.input = {};
          for (let tick = 0; tick < ticks; tick++) {
            const activeEffects=powerEffects(player,t);
            const events = engine.step(player.state, player.input, 1 / 60, {...room.settings,powerEffects:activeEffects});
            for (const event of events) {
              if (event.type === 'levelComplete') { const queued=room.powerQueue.some(item=>item.caster===player)||room.announcementQueue.some(item=>item.kind==='power'&&item.caster===player); if(!queued) player.power=null; player.powerOffer=null; syncPower(player); announce(room, `${player.name} escaped ${['the lobby', 'Whimsical Woods', 'Troubled Tides', 'Inferno Express'][event.level]}!`, event.level); }
              if (event.type === 'finished') player.finishTime = (t - room.startedAt) / 1000;
            }
          }
          if (tryCollect(room, player)) broadcast(room);
          score(player);
        }
      }
      if (sendPlayers) {
        for (const player of room.players.values()) {
          if (player.ws) send(player.ws, { type: 'state', room: snapshot(room, { id: player.id }), you: player.id, serverTime: t });
        }
      }
      if (sendHost && room.hostWs) send(room.hostWs, { type: 'state', room: snapshot(room, { host: true }), you: null, serverTime: t });
      if (t - room.createdAt > ROOM_TTL && room.status !== 'running' && !room.hostWs && [...room.players.values()].every(player => !player.ws)) rooms.delete(key);
    }
  }, tickMs);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){const s=ws._session;if(!s.alive){ws.terminate();continue}s.alive=false;ws.ping();}},15000);
  return {httpServer:server,wss,rooms,async listen(){return new Promise(resolve=>server.listen(port,host,resolve));},close(){clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();return new Promise(resolve=>server.close(()=>resolve()));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createGameServer().listen().then(()=>console.log(`Not Mario's World server listening on ${process.env.PORT||10000}`));
