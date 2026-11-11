import { createState, score, LEVELS, AVATARS, COLORS } from './game/engine.js';
import { renderGame, drawAvatar, prepareLevelArt } from './game/renderer.js';
import { GameAudio } from './game/audio.js';
import { renderWorldUI, worldUIModel, countdownSeconds } from './game/world-ui.js';
import { renderPodium, renderPendingPodium, podiumAwards } from './game/podium.js';
import { DEFAULT_QUESTIONS } from './game/default-questions.js';
import { runtimeMismatch, worldProgressModel, isDuelFrozen, mergePlayerPatch } from './game/client-state.js';
import { DEFAULT_WORLD_ORDER, normalizeWorldOrder, worldOrdinal } from './game/world-order.js';
import { activePowerEffects, renderPowerUI } from './game/power-ui.js';
import { powerQuizModel, renderPowerQuiz } from './game/power-quiz-ui.js';
import { createPowerQuizControls } from './game/power-quiz-controls.js';
import { powerChestOfferModel, createPowerChestControls } from './game/power-chest-ui.js';
import { POWER_DEFINITIONS } from './game/powers.js';
import { LocalRunRuntime, FIXED_STEP_SECONDS, MAX_CATCHUP_STEPS } from './game/local-run.js';
import { LEVEL_CATALOG } from './game/level-catalog.js';
import { createLobbyProfileControls } from './game/lobby-profile-controls.js';
import { GAME_CARD_SCALE } from './game/overlay-layout.js';
import { createCoinAttackControls } from './game/coin-attack-ui.js';
import { hostLocationSnapshotKey, renderHostLocationSnapshot, hostLocationCaption, shouldDrawHostLocation } from './game/host-location-snapshots.js';
import { locationFromState } from './game/run-protocol.js';
import { irisTransitionFor } from './game/iris-transition.js';

await prepareLevelArt();

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const number = n => Math.round(Number(n) || 0).toLocaleString();
const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`; };
const elapsed = seconds => seconds == null ? '—' : clock(seconds * 1000);
const levelNames = Object.fromEntries([[0, 'The waiting woods'], ...LEVEL_CATALOG.map(level=>[level.id,level.name])]);
const routeLabel=order=>normalizeWorldOrder(order).map(id=>levelNames[id]).join(' → ');
const racePosition=(level,state)=>worldOrdinal(level,state?.worldOrder??room?.settings.worldOrder);
const paths = {
 arrow:'M4 12h16m-6-6 6 6-6 6', diagonal:'M6 18 18 6M6 6h12v12', copy:'M9 9h11v12H9zM15 9V3H3v12h6',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m11 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
 close:'M6 6l12 12M6 18 18 6', play:'m7 4 14 8-14 8V4', expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
 volume:'m11 5-6 4H2v6h3l6 4V5m4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14', mute:'m11 5-6 4H2v6h3l6 4V5m5 4 5 6m0-6-5 6',
 shield:'m12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7l9-4m-4 9 3 3 5-6', plus:'M12 5v14M5 12h14', trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
 home:'m3 10 9-7 9 7v11H3V10m6 11v-8h6v8', stop:'M5 5h14v14H5z', check:'m5 12 4 4L19 6', trophy:'M8 3h8v8a4 4 0 0 1-8 0V3m0 2H3v3a5 5 0 0 0 5 5m8-8h5v3a5 5 0 0 1-5 5M12 15v6m-4 0h8', download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', info:'M12 10v7m0-11v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name] || paths.arrow}"/></svg>`;
const brand = () => `<a href="/" class="brand" aria-label="Not Mario's World home"><img src="/assets/icon.svg" alt=""><span>NOT MARIO’S WORLD<small>GAME DAY THURSDAY</small></span></a>`;
const DEFAULTS = { durationMinutes:15, worldOrder:[...DEFAULT_WORLD_ORDER], coinPoints:10, distancePoints:1, attackCoinCost:30, attackCooldownSeconds:60, powerDurationSeconds:8, attackWindowSeconds:15, defendWindowSeconds:15, slowSpeedPercent:25, reverseSpeedPercent:100, slipperySpeedPercent:170, slipperyGripPercent:12, inkDarknessPercent:88, questions:DEFAULT_QUESTIONS };
let profile;
try { profile = JSON.parse(localStorage.getItem('nmw-profile') || '{}'); } catch { profile = {}; }
profile = { name:String(profile.name || '').slice(0,24), avatar:AVATARS.includes(profile.avatar) ? profile.avatar : AVATARS[0], color:COLORS.includes(profile.color) ? profile.color : COLORS[0] };
let hostSession;
try { hostSession = JSON.parse(sessionStorage.getItem('nmw-host') || 'null'); } catch { hostSession = null; }
let ws, room = null, you = null, role = null, screen = 'entry', entryTab = 'join', pending = false;
let connected = false, reconnectTimer, reconnectAttempts = 0, intentionalClose = false;
let checkedRuntime = null, runtimeError = null;
let clockOffset = 0, clockOffsetReady = false, clockSynced = false, lastStatus = null, rosterKey = '', scoreKey = '', questionKey = '', screenKey = '';
let hostReportsOpen = true;
const hostLocationDrawKeys = new Map();
let lobbyLocationRunKey = null;
let localRun = null, input = {left:false,right:false,jump:false};
let localFinalizing = false, simulationCursor = null, finalPending = false;
const audio = new GameAudio();
let stageVictory = null;
let irisTransition = null;
let sceneTransitionActive=false, sceneTransitionApplying=false, pendingRoomState=null;
const SCENE_TRANSITION_DURATION=500;
let podiumArrivedAt=0,lastCountdownSecond=null,lastCountdownRoom=null,finalSentRound=null;
let playerQuizControls=null,playerQuizViewport=null;
let playerChestControls=null,playerChestViewport=null;
let coinAttackControls=null,coinAttackViewport=null;
let lobbyProfileControls=null,lobbyProfileViewport=null;
const demo = createState({level:DEFAULT_WORLD_ORDER[0],name:'A perfectly normal adventure'});
demo.x = 310; demo.y = 500;
const app = $('#app'), modal = $('#modal');
const scoreLocal = state => score(state, room?.settings || DEFAULTS);

function toast(message, error = false) {
  const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message;
  $('#toasts').append(el); setTimeout(() => el.remove(), 4500);
}
function persistProfile() { localStorage.setItem('nmw-profile', JSON.stringify(profile)); }
function send(type, data = {}) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  // Reports are ordered before actions that consume a chest or start a duel.
  if (localRun && room?.status==='running' && ['usePower','powerChestChoice','powerAnswer','coinAttack'].includes(type)) localRun.report('before-action', true, serverNow());
  const me = room?.players?.find(p => p.id === you);
  const lifecycle = role === 'player' && me && room?.roundId && me.runId ? { roundId: room.roundId, runId: me.runId } : {};
  const locationActions = ['profile','spawn','vote','usePower','powerChestChoice','powerAnswer','coinAttack','leave'];
  const location = role === 'player' && locationActions.includes(type) ? locationFromState(localRun?.state) : null;
  ws.send(JSON.stringify({type, ...lifecycle, ...data, ...(location ? { location } : {})})); return true;
}
function ensureLocalRun(me) {
  if (role !== 'player' || !me) return null;
  const roundId = room?.roundId || null, runId = me.runId || null;
  if (!localRun || localRun.roundId !== roundId || localRun.runId !== runId) {
    cancelStageVictory();
    localFinalizing=false; finalPending=false; finalSentRound=null; simulationCursor=serverNow();
    localRun = new LocalRunRuntime({ profile:{name:me.name,avatar:me.avatar,color:me.color}, settings: room?.settings || DEFAULTS, roundId, runId, now:serverNow, deferStageTransition:true,
      sendReport: report => sendRaw('runReport', report),
      onEvent: event => {
        const scene=sceneForLevel(event.level??localRun.state.level);
        if(event.type==='levelComplete')playStageVictory(event.level);
        const tone={death:'death',checkpoint:'checkpoint',enemyKill:'stomp',coin:'coin',respawn:'respawn'}[event.type];
        if(tone)playTone(tone,scene);
        if(event.type==='checkpoint')toast('Checkpoint saved! Your respawn position and distance are protected.');
      } });
    lobbyLocationRunKey = null;
  }
  localRun.settings = {...room.settings,powerEffects:activePowerEffects(me,serverNow())};
  Object.assign(localRun.state,room.status==='lobby'?{...profile,name:profile.name.trim()||'Player'}:{name:me.name,avatar:me.avatar,color:me.color});
  if (room?.status === 'running' && me.spawned && !localRun.state.started) localRun.begin(room.settings?.worldOrder);
  me.state=localRun.state;
  const locationRunKey = `${roundId}:${runId}`;
  if (room?.status === 'lobby' && lobbyLocationRunKey !== locationRunKey && locationFromState(localRun.state)) {
    if (send('playerLocation', { location: locationFromState(localRun.state) })) lobbyLocationRunKey = locationRunKey;
  }
  return localRun;
}
const serverNow=()=>Date.now()+clockOffset;
const ceremony=()=>localFinalizing||room?.status==='settling'||room?.status==='ended';
function finalizeLocal(cutoffAt){
  if(!localRun||!room?.players.find(p=>p.id===you)?.spawned)return;
  cancelStageVictory();
  localRun.pause(true);localFinalizing=true;zeroInput();
  if(finalSentRound!==room.roundId){const retry=!!localRun.finalReportValue;finalSentRound=room.roundId;finalPending=true;localRun.finalReport(cutoffAt,{retry});}
}
function sendRaw(type, data = {}) {
  if(type==='runReport'&&!data.final&&(room?.status!=='running'||serverNow()>=room.endsAt))return false;
  // A fresh clock sample can trail the start packet by a few milliseconds.
  if(type==='runReport')data={...data,at:Math.max(room.startedAt,data.at)};
  if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type, ...data })); return true; } return false;
}
function showRuntimeWarning(message) {
  runtimeError=message; const banner=$('#runtime-warning'); banner.hidden=!message; banner.textContent=message||'';
  if(message)zeroInput();
}
async function checkRuntime() {
  const response=await fetch('/health',{cache:'no-store'});
  if(!response.ok)throw new Error('Could not check the game server.');
  const health=await response.json(),message=runtimeMismatch(health,checkedRuntime);
  showRuntimeWarning(message);if(message)throw new Error(message);
  checkedRuntime=health.runtimeVersion;
}
async function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;
  if (ws?.readyState === WebSocket.CONNECTING) return new Promise((resolve,reject) => { ws.addEventListener('open',resolve,{once:true}); ws.addEventListener('error',reject,{once:true}); });
  await checkRuntime();
  intentionalClose = false;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
  ws.addEventListener('message', e => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error('Room update failed', err); toast('A room update could not be displayed.',true); } });
  ws.addEventListener('close', () => {
    cancelStageVictory();
    connected = false; pending = false; localRun?.pause(true); coinAttackControls?.close(); zeroInput(); updateConnection();
    if (intentionalClose || screen === 'entry') return;
    if (role === 'host' && hostSession) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(async () => { try { await connect(); send('hostJoin',hostSession); } catch { scheduleReconnect(); } }, Math.min(1000 * 2 ** reconnectAttempts++, 10000));
    } else {
      const banner = $('#connection-banner'); if (banner) { banner.hidden = false; banner.innerHTML = `Connection lost. Rejoin to start again with the remaining time. <button class="button small" data-action="rejoin">Rejoin room ${esc(room?.code)}</button>`; }
    }
  });
  return new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error('Could not reach the game server.')); },10000);
    ws.addEventListener('open', () => { clearTimeout(timeout); connected = true; reconnectAttempts = 0; updateConnection(); resolve(); },{once:true});
    ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Could not connect. Check the server and try again.')); },{once:true});
  });
}
function scheduleReconnect() { if (role === 'host' && hostSession) { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(async () => { try { await connect(); send('hostJoin',hostSession); } catch { scheduleReconnect(); } },3000); } }
function updateConnection() { $$('.connection').forEach(el => { el.classList.toggle('offline',!connected); el.innerHTML = `<i class="dot"></i>${connected ? 'Connected' : 'Reconnecting'}`; }); }
function onMessage(msg) {
  if(msg.type==='state'&&!sceneTransitionApplying&&room&&$('.world-screen')){
    const sceneKey=r=>['settling','ended'].includes(r?.status)?'podium':r?.status;
    if(sceneTransitionActive||sceneKey(room)!==sceneKey(msg.room)){
      // Final reports retain the server cutoff even while presentation closes.
      if(msg.room.status==='settling'&&role==='player')finalizeLocal(msg.room.cutoffAt??msg.room.endsAt);
      pendingRoomState=msg;
      if(!sceneTransitionActive)void transitionViewport(()=>{
        const latest=pendingRoomState;pendingRoomState=null;
        if(latest)onMessage(latest);
      });
      return;
    }
  }
  if(msg.type==='reportAck'){if(msg.runId===localRun?.runId&&msg.seq===localRun?.lastReport?.seq&&localRun.lastReport.final)finalPending=false;return;}
  if(msg.type==='error'&&msg.transactionId){const q=room?.players.find(p=>p.id===you)?.powerQuiz;if(q&&q.transactionId===msg.transactionId&&q.id===msg.challengeId){playerQuizControls?.resetSubmission();syncPlayerQuiz();}}
  if(msg.type==='powerAnswerResult'){toast(msg.correct?(msg.role==='attack'?(room?.powerDuel?.source==='coin'?'Correct! Your selected opponent must defend.':'Correct! Your opponents must defend.'):'Correct! You blocked this attack.'):(msg.role==='attack'?'Incorrect. Your power backfires on you.':'Incorrect. The power will affect you.'));return;}
  if(msg.type==='powerQueued'){toast(`${msg.name||'Your power'} queued${msg.position?` (#${msg.position})`:''}. It will activate in turn.`);return;}
  if(msg.type==='coinAttackQueued'){coinAttackControls?.close();toast(`${msg.name||'Coin attack'} queued${msg.position?` (#${msg.position})`:''}.`);return;}
  if(msg.type==='coinAttackCancelled'){coinAttackControls?.close();toast(`${msg.name||'Coin attack'} could not start; your coins were kept.`,true);return;}
  if(msg.type==='hostAttackCancelled'){toast(`${msg.name||'Host challenge'} skipped: no active players remain.`);return;}
  if(msg.type==='powerCancelled'){toast(msg.reason==='NO_TARGET'?'No opponents are ready. Your unused power is kept.':`${msg.name||'Your queued power'} could not start. Your unused power is kept.`);return;}
  if (msg.type === 'progress' || msg.type === 'leaderboard') {
    if (room && Array.isArray(msg.players)) for (const patch of msg.players) {
      const player = room.players.find(p => p.id === patch.id);
      if (player) Object.assign(player,mergePlayerPatch(player,patch));
    }
    renderRoom();
    return;
  }
  if (msg.type === 'timeSync') { const received=Date.now(),sample=msg.serverTime-(msg.clientTime+received)/2;if(!Number.isFinite(sample)||received-msg.clientTime>2000)return;clockOffset=clockSynced?clockOffset*.8+sample*.2:sample;clockOffsetReady=true;clockSynced=true;return; }
  if(msg.type==='error'&&msg.code==='RUN_REPORT_CLOSED'&&finalPending){finalSentRound=null;return;}
  if (msg.type === 'error') { pending = false; playerChestControls?.resetSubmission();coinAttackControls?.resetSubmission();toast(msg.message || 'Something went wrong.',true); $$('.entry-submit').forEach(b => b.disabled=false); if (msg.code === 'AUTH' && !room) { hostSession=null; sessionStorage.removeItem('nmw-host'); role=null; renderEntry(); } return; }
  if (msg.type === 'created') {
    hostSession = {code:msg.code,token:msg.token}; sessionStorage.setItem('nmw-host',JSON.stringify(hostSession));
    role='host'; room={code:msg.code,status:'lobby',settings:{...DEFAULTS},players:[],question:null}; you=null; pending=false; renderRoom(true);
  }
  if (msg.type === 'joined') { you=msg.id; role='player'; pending=false;send('timeSync',{clientTime:Date.now()}); }
  if (msg.type !== 'state') return;
  if(msg.room.runtimeVersion!==checkedRuntime){showRuntimeWarning('The game server changed. Refresh this page before playing.');return;}
  if(!clockOffsetReady){clockOffset=msg.serverTime-Date.now();clockOffsetReady=true;}
  const previous = room; room = msg.room; you = msg.you; if (!role) role = you ? 'player' : 'host';
  const metaMe = room.players.find(p => p.id === you);
  if (role==='player' && metaMe && (previous?.players.find(p=>p.id===you)==null || room.status!=='lobby')) {
    profile={name:metaMe.name,avatar:metaMe.avatar,color:metaMe.color};persistProfile();
  }
  if (role === 'player' && metaMe && ['lobby','running'].includes(room.status)) ensureLocalRun(metaMe);
  if(room.status==='settling'&&role==='player')finalizeLocal(room.cutoffAt??room.endsAt);
  if(ceremony()&&!['settling','ended'].includes(previous?.status)){podiumArrivedAt=performance.now();closeModal();coinAttackControls?.close();zeroInput();playTone('teleport','results');}
  if (room.status !== lastStatus) { lastStatus=room.status; coinAttackControls?.close(); zeroInput(); $$('.player-world-panel').forEach(panel=>panel.open=false); }
  const me = room.players.find(p => p.id === you);
  const previousMe=previous?.players.find(p=>p.id===you);
  if(role==='player'&&me?.powerQuiz&&`${me.powerQuiz.transactionId}:${me.powerQuiz.id}`!==`${previousMe?.powerQuiz?.transactionId}:${previousMe?.powerQuiz?.id}`){coinAttackControls?.close();zeroInput();}
  if(me?.power?.claimed&&me.power.itemId!==previousMe?.power?.itemId){playTone('powerup',sceneForLevel(localRun?.state.level));toast(`${me.power.power.name} found! Press F or USE to unleash it.`);}
  if (role === 'player' && localRun) me.state = localRun.state;
  renderRoom();
  if (previous?.status === 'lobby' && room.status === 'running') { closeModal(); toast('The race is on. Good luck out there!'); playTone('start',sceneForLevel(normalizeWorldOrder(room.settings.worldOrder)[0])); }
}
function header(content = '') {
  const volume=Math.round(audio.volume*100);
  return `<header class="site-header">${brand()}<div class="nav-actions">${content}<button class="link-button" data-action="help">HOW TO PLAY</button><div class="volume-control"><button class="button square ghost" data-action="sound" aria-pressed="${audio.enabled}" aria-label="${audio.enabled?'Mute':'Enable'} music and sound effects" title="${audio.enabled?'Mute':'Enable'} music and sound effects">${icon(audio.enabled&&volume>0?'volume':'mute')}</button><div class="volume-popover"><div class="volume-panel"><label for="game-volume">VOLUME <output for="game-volume" data-volume-value>${volume}%</output></label><input id="game-volume" data-audio-volume type="range" min="0" max="100" step="1" value="${volume}" aria-label="Music and sound effects volume" aria-valuetext="${volume}%"></div></div></div></div></header>`;
}
function renderEntry() {
  cancelStageVictory();
  irisTransition?.cancel();pendingRoomState=null;sceneTransitionActive=false;
  lobbyProfileControls?.destroy();lobbyProfileControls=null;lobbyProfileViewport=null;
  screen='entry'; screenKey='entry'; role=null; rosterKey=scoreKey=questionKey='';
  updateMusicScene();
  const code = new URLSearchParams(location.search).get('room') || '';
  app.innerHTML = `${header(`<button class="button small ghost" data-action="create">HOST A GAME ${icon('diagonal')}</button>`)}
  <main class="landing"><section class="hero"><div class="hero-copy"><div class="eyebrow"><i class="dot"></i> GAME DAY THURSDAY</div>
    <h1>SMALL JUMPS.<br><em>BIG RIVALRIES.</em></h1><p class="hero-description">Race through strange worlds, collect coins, and dodge suspicious surprises. Use powers to trouble your teammates. Highest score wins.</p>
    <div class="entry-box"><div class="tabs" role="tablist" aria-label="Enter a game"><button class="tab ${entryTab==='join'?'active':''}" role="tab" aria-selected="${entryTab==='join'}" data-action="join-tab">Join a game</button><button class="tab ${entryTab==='host'?'active':''}" role="tab" aria-selected="${entryTab==='host'}" data-action="host-tab">Host a room</button></div>
    ${entryTab==='join' ? `<form id="join-form"><div class="field-row"><label class="field"><span class="field-label">ROOM CODE</span><input id="room-code" class="room-input" placeholder="ABC123" autocomplete="off" minlength="6" maxlength="6" pattern="[A-Za-z0-9]{6}" value="${esc(code)}" required aria-label="Six character room code"></label><label class="field"><span class="field-label">YOUR NAME</span><input id="player-name" placeholder="What should we call you?" maxlength="24" autocomplete="nickname" value="${esc(profile.name)}" required></label></div><button class="button primary wide entry-submit" type="submit">Enter the lobby ${icon('arrow')}</button></form><p class="entry-note">${icon('shield')} No account needed. Grab a room code from your host.</p>` : `<p class="host-entry-copy">Bring the team together. Set the timer, choose the world order, and start the race when everyone’s ready.</p><button class="button primary wide entry-submit" data-action="create">Create a room ${icon('arrow')}</button><p class="entry-note">${icon('users')} One host · Up to 25 players · You control the start</p>${hostSession?'<button class="link-button" data-action="resume" style="margin-top:12px;color:var(--lime)">RESUME YOUR HOST ROOM →</button>':''}`}
    </div></div>
    <div class="hero-art"><div class="scene-frame"><div class="scene-topbar"><span>01 / ${esc(levelNames[DEFAULT_WORLD_ORDER[0]].toUpperCase())}</span><div class="window-dots"><i></i><i></i><i></i></div></div><div class="scene-window"><canvas id="demo-canvas" width="960" height="600" aria-label="Animated pixel forest preview"></canvas><div class="scene-caption"><span>CUTE SCENERY.<br><b>QUESTIONABLE SAFETY.</b></span><span class="pill lime">${icon('play')} READY PLAYER YOU</span></div></div></div><div class="float-tag">FRIENDLY COMPETITION. MOSTLY. ↗</div><div class="hero-art-bottom"><span>COLLECT COINS. ESCAPE WORLDS. SETTLE SCORES.</span><span>← → + SPACE</span></div></div>
  </section><section class="realm-strip"><div class="section-kicker"><span>MEET YOUR NEXT OBSTACLES</span><span class="muted">Forest paths. Troubled tides. Plenty of surprises.</span></div><div class="realms" style="--realm-columns:${Math.min(3,LEVEL_CATALOG.length)}">
    ${LEVEL_CATALOG.map((level,index)=>`<div class="realm-card"><span class="realm-number">${String(index+1).padStart(2,'0')}</span><span class="realm-icon ${level.theme==='ocean'?'sea':level.theme==='hell'?'hell':''}">${({forest:'🌲',ocean:'🌊',hell:'🔥'})[level.theme]||'🏁'}</span><div class="realm-copy"><h3>${esc(level.name)}</h3><p>${esc(LEVELS[level.id]?.flavor||'A new route to explore.')}</p></div><span class="arrow">↗</span></div>`).join('')}
  </div></section><footer class="landing-footer"><div class="landing-stats"><span><strong>25</strong> PLAYERS</span><span><strong>UNLIMITED</strong> RESPAWNS</span><span><strong>ONE</strong> TOP SCORE</span></div><div class="keyboard-note"><kbd>A</kbd><kbd>D</kbd><span>MOVE &nbsp;</span><kbd>SPACE</kbd><span>JUMP &nbsp; · &nbsp; DESKTOP ONLY</span></div></footer></main>`;
}
function roomCode() { return `<div class="room-badge"><div><small>ROOM CODE</small><strong class="code">${esc(room.code)}</strong></div><button data-action="copy-code" title="Copy room code" aria-label="Copy room code">${icon('copy')}</button></div>`; }
function renderRoom(force=false) {
  if (!room) return;
  if(sceneTransitionActive&&!sceneTransitionApplying)return;
  if(!sceneTransitionApplying&&$('.world-screen')&&Boolean($('#podium-canvas'))!==ceremony()){
    void transitionViewport(()=>renderRoom(force));return;
  }
  const key = `${role}-${ceremony()?(room.status==='ended'?'ended':'settling'):role==='player'?'play':room.status}`;
  const rebuilding=key!==screenKey||force;
  if (key !== screenKey || force) {
    screenKey=key; screen=role; rosterKey=scoreKey=questionKey='';
    if (ceremony()) renderResults(); else if (role==='host') renderHost(); else renderPlayer();
  }
  updateMusicScene();
  updateConnection();
  if (ceremony()) { updateResults(); updateAnnouncement();syncLobbyProfile();syncPlayerQuiz();syncPlayerChest();if(rebuilding)paintCurrentScene(performance.now());return; }
  updateQuestion(); updateAnnouncement();
  if (role==='host') updateHost(); else updatePlayer();
  syncLobbyProfile();
  syncPlayerQuiz();
  syncPlayerChest();
}
function shellTop(title,subtitle,actions='') {
  return `${header(`<span class="connection"><i class="dot"></i>Connected</span>${roomCode()}`)}<div id="connection-banner" class="disconnected-banner" hidden></div><main class="workspace"><div class="workspace-header"><div><div class="eyebrow"><i class="dot"></i>${room.status==='running'?'THE RACE IS ON':'GOOD COMPANY. BAD DECISIONS.'}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="toolbar">${actions}</div></div>`;
}
function worldControlsMarkup(){
  return `<div class="world-controls" hidden><button class="world-choice" data-vote="0" aria-label="Choice 1"></button><button class="world-choice" data-vote="1" aria-label="Choice 2"></button><button class="world-dismiss" data-action="skip-question" aria-label="Skip question" hidden></button><p class="world-status sr-only" aria-live="polite"></p></div>`;
}
function worldScreenMarkup(id,label,{width=960,height=540,controls=true,overlay=''}={}){
  return `<div class="world-screen"><canvas id="${id}" class="game-canvas ${id==='podium-canvas'?'podium-canvas':''}" width="${width}" height="${height}" tabindex="0" aria-label="${label}"></canvas>${controls?worldControlsMarkup():''}${overlay}</div>`;
}
function wrapWorldCanvas(canvas){
  if(!canvas||canvas.parentElement.classList.contains('world-screen'))return;
  const viewport=document.createElement('div');viewport.className='world-screen';canvas.replaceWith(viewport);viewport.append(canvas);viewport.insertAdjacentHTML('beforeend',worldControlsMarkup());
}
function changeLobbyProfile(patch) {
  if(role!=='player'||room?.status!=='lobby'||!connected||runtimeError)return;
  Object.assign(profile,patch);persistProfile();
  const display={...profile,name:profile.name.trim()||'Player'};
  if(localRun)Object.assign(localRun.state,display);
  const me=room.players.find(p=>p.id===you);if(me)Object.assign(me,display);
  send('profile',profile);syncLobbyProfile();updatePlayer();
}
function syncLobbyProfile() {
  const playerCanvas=role==='player'?$('#game-canvas'):null;
  if(playerCanvas)fitPlayerGame(playerCanvas);
  if(playerCanvas)syncPlayerProgress(playerCanvas);
  const canvas=room?.status==='lobby'?playerCanvas:null;
  if(!canvas){lobbyProfileControls?.destroy();lobbyProfileControls=null;lobbyProfileViewport=null;return;}
  const viewport=canvas.parentElement;
  if(viewport!==lobbyProfileViewport){
    lobbyProfileControls?.destroy();lobbyProfileViewport=viewport;
    lobbyProfileControls=createLobbyProfileControls(viewport,{
      onChange:changeLobbyProfile,onFocus:zeroInput,
      onPlay:()=>canvas.focus({preventScroll:true}),drawAvatar,
    });
  }
  lobbyProfileControls.update({profile,status:room.status,connected:connected&&!runtimeError,obscured:!!room.question},{canvas});
}
function fitPlayerGame(canvas) {
  const shell=canvas.closest('.game-shell');if(!shell||document.fullscreenElement)return;
  const availableWidth=shell.parentElement.clientWidth;
  const viewportHeight=window.visualViewport?.height||window.innerHeight;
  const chrome=$('.game-topbar',shell).getBoundingClientRect().height+$('.game-bottom',shell).getBoundingClientRect().height+2;
  const availableHeight=viewportHeight-(shell.getBoundingClientRect().top+window.scrollY)-12;
  const width=Math.floor(Math.max(1,Math.min(availableWidth,(availableHeight-chrome)*16/9+2)));
  if(shell.style.width!==`${width}px`)shell.style.width=`${width}px`;
}
function syncWorldControls(canvas,model){
  const controls=canvas.parentElement.querySelector('.world-controls');if(!controls)return;
  const q=model.question;controls.hidden=!q;if(!q)return;
  const viewport=canvas.parentElement.getBoundingClientRect(),bounds=canvas.getBoundingClientRect();
  const scale=Math.min(bounds.width/960,bounds.height/540),offsetX=bounds.left-viewport.left+(bounds.width-960*scale)/2,offsetY=bounds.top-viewport.top+(bounds.height-540*scale)/2;
  const place=(button,r)=>{button.style.left=`${offsetX+r.x*scale}px`;button.style.top=`${offsetY+r.y*scale}px`;button.style.width=`${r.w*scale}px`;button.style.height=`${r.h*scale}px`;};
  for(const choice of q.choices){
    const button=$(`[data-vote="${choice.index}"]`,controls);place(button,choice.rect);
    button.disabled=q.closed||q.isHost;button.setAttribute('aria-pressed',String(choice.selected));
    button.setAttribute('aria-label',`${choice.label}. ${choice.count} votes.${choice.names.length?' '+choice.names.join(', '):''}`);
  }
  const dismiss=$('.world-dismiss',controls);dismiss.hidden=!q.isHost;place(dismiss,q.dismiss);dismiss.setAttribute('aria-label',q.closed?'Dismiss question':'Skip question');
  const stateText=`${q.prompt}. ${q.closed?'Voting closed.':'Voting open.'} ${q.choices.map(c=>`${c.label}: ${c.count} votes. ${c.names.join(', ')}`).join(' ')}`;
  const status=$('.world-status',controls);if(status.textContent!==stateText)status.textContent=stateText;
}
function drawWorldBroadcasts(canvas,{viewerId=you,isHost=role==='host',now=Date.now()+clockOffset}={}){
  const model=renderWorldUI(canvas,room,{now,viewerId,isHost,domText:true});syncWorldControls(canvas,model);
  let labels=$('.world-text-layer',canvas.parentElement);
  if(!labels){labels=document.createElement('div');labels.className='world-text-layer';labels.setAttribute('aria-hidden','true');canvas.parentElement.append(labels);}
  const viewport=canvas.parentElement.getBoundingClientRect(),bounds=canvas.getBoundingClientRect(),scale=Math.min(bounds.width/960,bounds.height/540);
  labels.style.left=`${bounds.left-viewport.left+(bounds.width-960*scale)/2}px`;
  labels.style.top=`${bounds.top-viewport.top+(bounds.height-540*scale)/2}px`;
  labels.style.transform=`scale(${scale})`;
  const rows=model.textRows;
  while(labels.children.length>rows.length)labels.lastElementChild.remove();
  rows.forEach((row,index)=>{
    let label=labels.children[index];if(!label){label=document.createElement('span');labels.append(label);}
    if(label.textContent!==row.value)label.textContent=row.value;
    label.style.cssText=`left:${row.x}px;top:${row.y-row.size*.82}px;font-size:${row.size}px;font-weight:${row.bold?'700':'400'};color:${row.color};transform:translateX(${row.align==='center'?-50:row.align==='right'?-100:0}%)`;
  });
  return model;
}
function drawPlayerPowers(canvas,player,{now=Date.now()+clockOffset,time=0,isHost=role==='host'}={}) {
  const model=renderPowerUI(canvas,player,{now,time,isHost,domText:!isHost,running:room?.status==='running'});
  if(isHost||!canvas.parentElement.classList.contains('world-screen'))return;
  let controls=canvas.parentElement.querySelector('.power-controls');
  if(!controls){controls=document.createElement('div');controls.className='power-controls';controls.innerHTML='<button data-action="use-power" aria-label="Use held power, shortcut F"></button><span class="sr-only" role="status" aria-live="polite"></span>';canvas.parentElement.append(controls);}
  controls.hidden=!model.visible;
  const button=$('button',controls);button.hidden=!model.held;button.disabled=!model.canUse;
  if(model.held){
    const viewport=canvas.parentElement.getBoundingClientRect(),bounds=canvas.getBoundingClientRect(),scale=Math.min(bounds.width/960,bounds.height/540),r=model.button;
    button.style.cssText=`left:${bounds.left-viewport.left+(bounds.width-960*scale)/2+r.x*scale}px;top:${bounds.top-viewport.top+(bounds.height-540*scale)/2+r.y*scale}px;width:${r.w*scale}px;height:${r.h*scale}px`;
    button.setAttribute('aria-label',model.queued?`${model.heading}. ${model.detail}.`:`Use ${model.heading} on ${model.detail}. Shortcut F.`);
  }
  let labels=$('.power-text-layer',controls);
  if(!labels){labels=document.createElement('div');labels.className='power-text-layer';labels.setAttribute('aria-hidden','true');controls.append(labels);}
  const viewport=canvas.parentElement.getBoundingClientRect(),bounds=canvas.getBoundingClientRect(),scale=Math.min(bounds.width/960,bounds.height/540);
  labels.style.left=`${bounds.left-viewport.left+(bounds.width-960*scale)/2}px`;
  labels.style.top=`${bounds.top-viewport.top+(bounds.height-540*scale)/2}px`;
  labels.style.transform=`scale(${scale})`;
  const rows=model.textRows||[];
  while(labels.children.length>rows.length)labels.lastElementChild.remove();
  rows.forEach((row,index)=>{
    let label=labels.children[index];if(!label){label=document.createElement('span');labels.append(label);}
    if(label.textContent!==String(row.value))label.textContent=row.value;
    label.style.cssText=`left:${row.x}px;top:${row.y-row.size*.82}px;font-size:${row.size}px;color:${row.color}`;
  });
  const status=$('.sr-only',controls),text=`${model.heading}. ${model.detail}${model.effects.length?'. Active effects: '+model.effects.map(e=>e.name).join(', '):''}`;
  if(status.textContent!==text)status.textContent=text;
}
function syncPlayerQuiz({focus=false}={}) {
  const canvas=role==='player'&&room?.status==='running'?$('#game-canvas'):null;
  if(!canvas){playerQuizControls?.destroy();playerQuizControls=null;playerQuizViewport=null;return;}
  const viewport=canvas.parentElement;
  if(!viewport.classList.contains('world-screen'))return;
  const me=room.players.find(p=>p.id===you),model=powerQuizModel(me,{now:Date.now()+clockOffset});
  if(!playerQuizControls&& !model)return;
  if(viewport!==playerQuizViewport){
    playerQuizControls?.destroy();playerQuizViewport=viewport;
    playerQuizControls=createPowerQuizControls(viewport,{
      onOpen:()=>{zeroInput();if(modal.open)closeModal();},
      onClose:zeroInput,
      onSubmit:({transactionId,challengeId,answer})=>{
        const q=room?.players.find(p=>p.id===you)?.powerQuiz;
        if(!q||q.answered||q.transactionId!==transactionId||q.id!==challengeId||Date.now()+clockOffset>=q.endsAt)return false;
        return send('powerAnswer',{transactionId,challengeId,answer});
      }
    });
  }
  if(model?.canAnswer&&modal.open)closeModal();
  playerQuizControls.update(model,{canvas,focus});
}
function drawPlayerQuiz(canvas,player,{now=Date.now()+clockOffset,isHost=role==='host'}={}){
  if(isHost)renderPowerQuiz(canvas,player,{now,isHost:true});
  else syncPlayerQuiz();
}
function syncPlayerChest() {
  const canvas=role==='player'&&room?.status==='running'?$('#game-canvas'):null;
  const viewport=canvas?.parentElement;
  if(!viewport?.classList.contains('world-screen')){playerChestControls?.destroy();playerChestControls=null;playerChestViewport=null;return;}
  const me=room.players.find(p=>p.id===you),model=powerChestOfferModel(me,{running:connected&&!runtimeError});
  if(!playerChestControls&&!model)return;
  if(viewport!==playerChestViewport){
    playerChestControls?.destroy();playerChestViewport=viewport;
    playerChestControls=createPowerChestControls(viewport,{
      onOpen:()=>{zeroInput();if(modal.open)closeModal();},
      onChoice:choice=>!runtimeError&&connected&&send('powerChestChoice',choice),
    });
  }
  playerChestControls.update(model,{canvas});
}
function syncCoinAttack() {
  const canvas=role==='player'&&room?.status==='running'?$('#game-canvas'):null;
  const viewport=canvas?.parentElement;
  if(!viewport?.classList.contains('world-screen')){coinAttackControls?.destroy();coinAttackControls=null;coinAttackViewport=null;return;}
  const me=room.players.find(p=>p.id===you), wallet=me?.coinAttack||{};
  const cost=Math.max(1,Number(room.settings.attackCoinCost??30)||30);
  const serverEarned=Math.max(0,Number(wallet.earned??me?.summary?.earnedCoins)||0);
  const earned=Math.max(serverEarned,Number(localRun?.state?.earnedCoins)||0);
  const spent=Math.max(0,Number(wallet.spent)||0),reserved=Math.max(0,Number(wallet.reserved)||0);
  const available=Math.max(0,earned-spent-reserved);
  const targets=room.players.filter(p=>p.id!==you&&p.connected&&p.spawned&&!p.summary?.finished&&p.finishTime==null).map(p=>({id:p.id,name:p.name,worldLabel:p.summary?.level?`World ${racePosition(p.summary.level,p)}`:'Racing'}));
  const active=room.powerDuel?.source==='coin'&&room.powerDuel.casterId===you;
  const canActivate=connected&&!runtimeError&&!ceremony()&&!modal.open&&!me?.state?.finished&&!me?.state?.respawnRemaining&&!me?.state?.stageTransition&&!me?.powerOffer&&!(me?.powerQuiz&&!me.powerQuiz.answered);
  const model={visible:connected&&!runtimeError&&!ceremony()&&!!me?.spawned&&(available>=cost||wallet.cooldownEndsAt>serverNow()||wallet.queued||active),canActivate,canAfford:available>=cost,cost,available,now:serverNow(),cooldownEndsAt:Number(wallet.cooldownEndsAt)||0,pending:!!wallet.queued||active,active,queuePosition:wallet.queuePosition,powers:POWER_DEFINITIONS,targets,effectCount:Object.keys(activePowerEffects(me,serverNow())).length};
  if(!coinAttackControls||viewport!==coinAttackViewport){coinAttackControls?.destroy();coinAttackViewport=viewport;coinAttackControls=createCoinAttackControls(viewport,{onOpen:zeroInput,onClose:zeroInput,onAttack:({powerType,targetId})=>send('coinAttack',{powerType,targetId})});}
  coinAttackControls.update(model,{canvas});
}
function renderHost() {
  const running=room.status==='running';
  const existingReports=$('#host-run-reports');
  if(existingReports)hostReportsOpen=existingReports.open;
  app.innerHTML = `${shellTop('The control room.',running?'Follow scores, checkpoints, and escapes as they happen.':'Gather the team, break the ice, then let the chaos begin.',`${running?'<span class="pill lime"><i class="dot"></i> LIVE ROUND</span>':`<button class="button ghost small" data-action="settings">${icon('settings')} Game settings</button>`}<button class="button ${running?'danger':'primary'}" data-action="${running?'end-confirm':'start'}">${icon(running?'stop':'play')}${running?'End round':'Start the race'}</button>`)}
  <div class="session-strip"><div class="session-stat"><div class="stat-label">${running?'TIME REMAINING':'ROUND DURATION'}</div><div class="stat-value lime" id="host-timer">${clock(room.settings.durationMinutes*60000)}</div></div><div class="session-stat"><div class="stat-label">PLAYERS CONNECTED</div><div class="stat-value" id="host-player-count">0 <em>/ 25</em></div></div><div class="session-stat"><div class="stat-label">${running?'TOTAL RESPAWNS':'READY TO EXPLORE'}</div><div class="stat-value" id="host-death-count">0 <em>${running?'second chances':'exploring the lobby'}</em></div></div><div class="session-stat"><div class="stat-label">${running?'FINISHED ALL WORLDS':'SCORING'}</div><div class="stat-value" id="host-finish-count">${running?'0':room.settings.coinPoints} <em>${running?'runners':'pts / coin'}</em></div></div></div>
  <div class="host-layout"><section><details id="host-run-reports" class="host-reports" ${hostReportsOpen?'open':''}><summary><span class="live-section-head"><span><h2>${running?'Run reports':'Lobby roster'} <span class="pill lime" style="margin-left:8px">LIGHTWEIGHT</span></h2><small>Updates at milestones and gameplay events</small></span><span class="report-toggle" aria-hidden="true">${hostReportsOpen?'HIDE':'SHOW'}</span></span></summary><div id="feed-grid" class="feed-grid"></div></details><section class="game-shell broadcast-stage"><div class="game-topbar"><span>WORLD BROADCAST</span><span class="pill lime">SHARED ANNOUNCEMENTS</span><button class="link-button" data-action="fullscreen" aria-label="Full screen world broadcast">${icon('expand')}</button></div>${worldScreenMarkup('host-world-canvas','Shared announcements stage')}</section></section><aside class="aside-stack host-aside"><section class="panel"><div class="panel-head"><h2>${running?'The leaderboard':'The guest list'}</h2><small id="leader-count">0 PLAYERS</small></div><div id="leaderboard" class="leaderboard"></div></section><section class="panel host-power-panel" id="host-power-panel"><div class="panel-head"><h2>Launch a power</h2><span class="pill" id="host-power-status">RUNNING ONLY</span></div><p class="host-power-help">Challenge every active player directly. No attack question.</p><div id="host-power-actions" class="host-power-actions"></div></section><section class="panel" id="host-question-panel"><div class="panel-head"><h2>Break the ice</h2><span class="pill">15s / VOTE</span></div><div id="host-questions" class="host-questions"></div></section><p class="host-note">${running?'Scores and progress come from each player’s local run report.':'Share the room code or copy an invite link.'}</p><button class="button ghost wide small" data-action="copy-link">${icon('copy')} Copy invite link</button></aside></div></main>`;
}
function renderPlayer() {
  app.innerHTML = `${shellTop(room.status==='running'?'Run. Collect. Question everything.':'Your adventure starts here.',room.status==='running'?'Coins are good. The floor is negotiable.':'Pick your character, find your color, and take a practice jump.')}
  <div class="player-layout"><section><div class="game-shell"><div class="game-topbar"><span class="level-label" id="level-label">LOBBY / THE WAITING WOODS</span><div class="player-timer-group"><span id="scoring-note">${room.settings.coinPoints} PTS / COIN · ${room.settings.distancePoints} PT / TILE</span><span class="pill lime" id="player-timer">WAITING FOR HOST</span></div></div><canvas id="game-canvas" class="game-canvas" width="960" height="540" tabindex="0" aria-label="Your game. A and D or arrow keys to move, Space, W, or up arrow to jump."></canvas><div class="game-bottom"><div class="keyboard-note"><kbd>A</kbd><kbd>D</kbd><span>MOVE &nbsp;</span><kbd>SPACE</kbd><span>JUMP &nbsp;</span><kbd>F</kbd><span>USE POWER</span></div><div class="progress-dots" id="world-dots">${normalizeWorldOrder(room.settings.worldOrder).map(()=>'<i></i>').join('')}</div><button class="link-button" data-action="fullscreen" title="Full screen game" aria-label="Full screen game">${icon('expand')}</button></div><div id="finish-overlay" class="finish-overlay" hidden><div><div class="trophy">🏁</div><h2>YOU MADE IT OUT.</h2><p>All worlds cleared. Your points are safe.<br>Catch your breath while everyone else catches up.</p></div></div><div id="death-caption" class="death-caption" hidden></div></div>
  </section>
  <aside class="aside-stack"><section class="panel"><div class="panel-head"><h2>How to stay in one piece</h2></div><div class="instructions"><div class="instruction-line"><span>Move left / right</span><span><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></span></div><div class="instruction-line"><span>Jump</span><span><kbd>SPACE</kbd> / <kbd>W</kbd> / <kbd>↑</kbd></span></div></div><div class="rule-note">Practice safely while your host prepares the race. Late joins enter the first selected world with the room’s remaining time. Release the jump key before jumping again. Collect coins and keep moving. <b>Clearing a world banks your points.</b> Coins and their points stay protected after death. Collected coins and claimed power chests stay collected; decoys remain. Authored checkpoint flags save your position, distance, coins, and progress. Death rolls back distance to your last flag, then respawns after <b>3 seconds</b> (or at the world start before a flag).<br><br>Power chests appear where authored. Hold one power at a time; at the next chest, <b>Attack</b> with the current power or <b>Replace</b> it. Press <b>F</b> or <b>USE</b> to use a power and answer one question to challenge <b>everyone else</b>. Powers can queue across the room; unused powers survive deaths. Wrong attackers hit themselves; correct defenders block. Wrong or missing defense answers are affected. Answers ignore case.<br><br>Power: <b>${room.settings.powerDurationSeconds??8}s</b> · Attack: <b>${room.settings.attackWindowSeconds??15}s</b> · Defend: <b>${room.settings.defendWindowSeconds??15}s</b>. One answer per question.<br><br>Press <b>Q</b> or use the <b>Attack</b> board below the Power slot to choose a power (<b>1–4</b>), then one opponent. Cost: <b>${room.settings.attackCoinCost??30} coins</b>; your score stays unchanged. Each player has a separate <b>${room.settings.attackCooldownSeconds??60}s cooldown</b>. Cooldown begins after the defense resolves (or a failed attack backfires). Coins carry across worlds and deaths. The board hides when you cannot afford an attack; an active cooldown stays visible.<br><br>Same levels. Separate worlds. A little sabotage.</div></section><section class="panel"><div class="panel-head"><h2>The friendly rivalry</h2><small id="leader-count">LIVE</small></div><div id="leaderboard" class="leaderboard"></div></section></aside></div></main>`;
  $('.workspace',app)?.classList.add('player-workspace');
  const siteHeader=$('.site-header',app),intro=$('.workspace-header>div',app);
  if(siteHeader&&intro){
    intro.classList.add('header-adventure');
    siteHeader.classList.add('player-site-header');
    siteHeader.insertBefore(intro,$('.nav-actions',siteHeader));
    $('.workspace-header',app).remove();
  }
  wrapWorldCanvas($('#game-canvas'));
  $('#game-canvas').parentElement.append($('#death-caption'));
  $('#game-canvas').parentElement.append($('#finish-overlay'));
  $('#finish-overlay>div').classList.add('pixel-world-panel');
  renderPlayerProgress();
  renderPlayerPanels();
}
function panelPixelIcon(kind) {
  const rows=kind==='help'?['001100','001100','001100','001100','000000','001100']:['01111110','11011011','11011011','01111110','00011000','00011000','00111100','01111110'];
  return '<svg class="world-panel-icon" viewBox="0 0 24 24" aria-hidden="true" shape-rendering="crispEdges">'+rows.flatMap((row,y)=>[...row].map((cell,x)=>cell==='1'?'<rect x="'+(x*2+4)+'" y="'+(y*2+4)+'" width="2" height="2"/>':'')).join('')+'</svg>';
}
function renderPlayerPanels() {
  const canvas=$('#game-canvas'),aside=$('.player-layout>.aside-stack');if(!canvas||!aside)return;
  canvas.closest('.player-layout').classList.add('in-world-layout');
  const controls=document.createElement('div');controls.className='player-world-panels';
  [...aside.children].forEach((section,index)=>{
    const panel=document.createElement('details');panel.className='player-world-panel pixel-world-panel';panel.open=false;
    const title=$('h2',section)?.textContent||'Leaderboard';
    const summary=document.createElement('summary');summary.setAttribute('aria-label',title);summary.title=title;
    summary.innerHTML=panelPixelIcon(index===0?'help':'trophy')+'<span>'+esc(title)+'</span>';
    const body=document.createElement('div');body.className='world-panel-body';
    const head=$('.panel-head',section);head?.remove();
    if(index===1&&head)body.append(head);
    while(section.firstChild)body.append(section.firstChild);
    panel.append(summary,body);controls.append(panel);
    panel.addEventListener('toggle',zeroInput);
    panel.addEventListener('focusin',zeroInput);
  });
  canvas.parentElement.append(controls);aside.remove();
}
function renderPlayerProgress() {
  const viewport=$('#game-canvas')?.parentElement;if(!viewport)return;
  viewport.insertAdjacentHTML('beforeend',`<div class="player-world-score pixel-world-panel" aria-label="Total score"><span>TOTAL SCORE</span><strong id="my-score">0</strong></div><div class="player-world-progress pixel-world-panel" aria-label="Your race progress"><div class="world-progress-caption"><span id="my-progress-label">WORLD 0 · 0%</span><span id="my-deaths">0 RESPAWNS</span></div><div class="world-progress-track" role="progressbar" aria-label="Current world progress" aria-valuemin="0" aria-valuemax="100"><i id="my-progress"></i></div></div>`);
}
function syncPlayerProgress(canvas) {
  const hud=$('.player-world-progress',canvas.parentElement);if(!hud)return;
  hud.hidden=!!room?.question;
  const viewport=canvas.parentElement.getBoundingClientRect(),bounds=canvas.getBoundingClientRect();
  const scale=Math.min(bounds.width/960,bounds.height/540);
  const top=14;
  const death=$('#death-caption');if(death)death.style.transform=`translate(-50%,-50%) scale(${scale*GAME_CARD_SCALE})`;
  const finish=$('#finish-overlay>div');if(finish)finish.style.transform=`scale(${scale*GAME_CARD_SCALE})`;
  hud.style.left=`${bounds.left-viewport.left+(bounds.width-960*scale)/2+(946-260*GAME_CARD_SCALE)*scale}px`;
  hud.style.top=`${bounds.top-viewport.top+(bounds.height-540*scale)/2+top*scale}px`;
  hud.style.transform=`scale(${scale*GAME_CARD_SCALE})`;
  const scoreHUD=$('.player-world-score',canvas.parentElement);
  if(scoreHUD){
    scoreHUD.hidden=hud.hidden;
    scoreHUD.style.left=`${bounds.left-viewport.left+(bounds.width-960*scale)/2+(946-(260+12+244)*GAME_CARD_SCALE)*scale}px`;
    scoreHUD.style.top=hud.style.top;
    scoreHUD.style.transform=hud.style.transform;
  }
  const panels=$('.player-world-panels',canvas.parentElement);
  if(panels){
    const quiz=room?.players.find(p=>p.id===you)?.powerQuiz;
    panels.hidden=!!room?.question||!!(quiz&&!quiz.answered);
    panels.style.left=`${bounds.left-viewport.left+(bounds.width-960*scale)/2+(946-516*GAME_CARD_SCALE)*scale}px`;
    panels.style.top=`${bounds.top-viewport.top+(bounds.height-540*scale)/2+(top+64*GAME_CARD_SCALE)*scale}px`;
    panels.style.transform=`scale(${scale*GAME_CARD_SCALE})`;
  }
}
function updateHost() {
  const players=room.players;
  setText('#host-player-count',`${players.filter(p=>p.connected).length} / 25`);
  if(room.status==='running') {
    setHTML('#host-death-count',`${number(players.reduce((n,p)=>n+(p.summary?.deaths||0),0))} <em>second chances</em>`);
    setHTML('#host-finish-count',`${players.filter(p=>p.summary?.finished).length} <em>/ ${players.length} runners</em>`);
  } else {
    setHTML('#host-death-count',`${players.filter(p=>p.spawned).length} <em>exploring the lobby</em>`);
    setHTML('#host-finish-count',`${room.settings.coinPoints} <em>pts / coin</em>`);
  }
  const key='players:'+players.map(p=>p.id).sort().join('|');
  if(key!==rosterKey) {
    rosterKey=key;
    $('#feed-grid').innerHTML=players.length ? [...players].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<article class="report-card"><div class="report-location"><canvas width="240" height="135" data-location-snapshot="${p.id}" aria-label="${esc(p.name)} last known location"></canvas><small data-location-caption="${p.id}">Waiting for location</small></div><div class="report-identity"><canvas width="44" height="48" data-roster-avatar="${p.id}" aria-label="${esc(p.avatar)} avatar"></canvas><div><strong data-feed-name="${p.id}"></strong><small data-feed-level="${p.id}">LOBBY</small></div><span class="report-score" data-feed-score="${p.id}">0 PTS</span></div><div class="report-track"><i data-report-bar="${p.id}"></i></div><div class="report-line"><span data-feed-progress="${p.id}"></span><span data-feed-status="${p.id}"></span></div><div class="report-line"><span data-report-coins="${p.id}"></span><span data-report-bank="${p.id}"></span></div><div class="report-line muted"><span data-feed-deaths="${p.id}"></span><span data-report-age="${p.id}"></span></div></article>`).join('') : `<div class="empty-feed"><div class="pixel-prompt">☕</div><h3>Waiting for the usual suspects.</h3><p>Share <b style="color:var(--lime)">${esc(room.code)}</b> with your team. Their run reports will appear here.</p><button class="button small ghost" style="margin-top:18px" data-action="copy-link">${icon('copy')} Copy invite link</button></div>`;
    hostLocationDrawKeys.clear();
  }
  for(const p of players) {
    setHTML(`[data-feed-name="${p.id}"]`,`<i class="player-color" style="background:${esc(p.color)}"></i>${esc(p.name)}`);
    setText(`[data-feed-score="${p.id}"]`,`${number(p.score)} PTS`);
    const summary=p.summary||{};
    const avatar=$(`[data-roster-avatar="${p.id}"]`);if(avatar)drawAvatar(avatar,p.avatar,p.color);
    const locationCanvas=$(`[data-location-snapshot="${p.id}"]`),locationKey=hostLocationSnapshotKey(p);
    const locationCaption=$(`[data-location-caption="${p.id}"]`); if(locationCaption)locationCaption.textContent=hostLocationCaption(p);
    if(locationCanvas && shouldDrawHostLocation({open:hostReportsOpen,previousKey:hostLocationDrawKeys.get(p.id),nextKey:locationKey})){renderHostLocationSnapshot(locationCanvas,p);hostLocationDrawKeys.set(p.id,locationKey);}
    setText(`[data-feed-level="${p.id}"]`,summary.finished?'ALL WORLDS CLEARED':summary.level?`WORLD ${racePosition(summary.level,p)} / ${levelNames[summary.level]}`:'LOBBY');
    setText(`[data-feed-status="${p.id}"]`,!p.connected?'Disconnected':!p.spawned?'Choosing character':summary.respawnRemaining>0?'Respawning…':summary.finished?'Finished':room.status==='lobby'?'Exploring the lobby':summary.checkpoint?'Checkpoint saved':'Running');
    setText(`[data-feed-deaths="${p.id}"]`,`${summary.deaths||0} DEATHS`);
    const checkpoint=(LEVELS[summary.level]?.checkpoints||[]).findIndex(cp=>cp.id===summary.checkpoint?.id)+1;
    setText(`[data-feed-progress="${p.id}"]`,`${Math.round((summary.progress||0)*100)}% · Checkpoint ${checkpoint}/${LEVELS[summary.level]?.checkpoints?.length||0}`);
    setText(`[data-report-coins="${p.id}"]`,`${number(summary.coins)} coins`);
    setText(`[data-report-bank="${p.id}"]`,`${number(summary.banked)} banked`);
    const bar=$(`[data-report-bar="${p.id}"]`);if(bar)bar.style.width=`${Math.round((summary.progress||0)*100)}%`;
    setText(`[data-report-age="${p.id}"]`,reportAge(p));
  }
  updateLeaderboard();
  const qKey=JSON.stringify(room.settings.questions)+room.status;
  const qPanel=$('#host-questions');
  if(qPanel.dataset.key!==qKey) {
    qPanel.dataset.key=qKey;
    qPanel.innerHTML=room.status==='running'?'<p class="leader-empty">Icebreakers are for the lobby.<br>Right now, the floor is asking the questions.</p>':room.settings.questions.length ? room.settings.questions.map((q,i)=>`<div class="question-item"><div><small>QUESTION 0${i+1}</small>${esc(q.prompt)}</div><button class="button small ghost" data-launch="${i}">Launch ${icon('play')}</button></div>`).join('') : `<p class="leader-empty" style="padding:7px 2px 15px">A quick question before a questionable adventure. Add up to five in game settings.</p><button class="button ghost small wide" data-action="settings">${icon('plus')} Add icebreakers</button>`;
  }
  updateHostPowerPanel();
}
function updateHostPowerPanel(){
  const panel=$('#host-power-actions'),status=$('#host-power-status');if(!panel||!status)return;
  const eligible=room.status==='running'&&room.players.some(p=>p.connected&&p.spawned&&!p.summary?.finished);
  const queued=room.powerQueue||[],active=room.activePower||room.powerDuel;
  const activeType=active?.type||active?.power?.type;
  status.textContent=active?`ACTIVE${queued.length?` / ${queued.length} QUEUED`:''}`:queued.length?`${queued.length} QUEUED`:eligible?'READY':'RUNNING ONLY';
  status.className=`pill ${active?'lime':''}`;
  const key=`${eligible}:${runtimeError?'error':''}:${connected}:${queued.map(entry=>entry.powerType||entry.power?.type).join(',')}:${activeType||''}`;
  if(panel.dataset.key===key)return;
  panel.dataset.key=key;
  panel.innerHTML=POWER_DEFINITIONS.map(def=>{
    const queuedCount=queued.filter(entry=>entry.powerType===def.type||entry.power?.type===def.type).length;
    const activeLabel=activeType===def.type?' · ACTIVE':'';
    return `<button class="button ghost small host-power-button" data-host-power="${def.type}" ${eligible&&!runtimeError&&connected?'':'disabled'}>${esc(def.name)}<small>${queuedCount?`${queuedCount} queued`:''}${activeLabel}</small></button>`;
  }).join('');
}
function reportAge(player){return player.lastReportAt?`Updated ${new Date(player.lastReportAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Awaiting race report';}
function updatePlayer() {
  const me=room.players.find(p=>p.id===you); if(!me) return;
  setText('.header-adventure h1',room.status==='running'?'Run. Collect. Question everything.':'Your adventure starts here.');
  setText('.header-adventure p',room.status==='running'?'Coins are good. The floor is negotiable.':'Pick your character, find your color, and take a practice jump.');
  setHTML('.header-adventure .eyebrow',`<i class="dot"></i>${room.status==='running'?'THE RACE IS ON':'GOOD COMPANY. BAD DECISIONS.'}`);
  if(localRun) me.state=localRun.state;
  const s=me.state;
  if(!s)return;
  setText('#level-label',s.level?`0${racePosition(s.level,s)} / ${levelNames[s.level].toUpperCase()}`:'LOBBY / THE WAITING WOODS');
  const localScore=localRun ? scoreLocal(localRun.state) : me.score;
  setText('#my-score',number(localScore));
  setText('#scoring-note',`${room.settings.coinPoints} PTS / COIN · ${room.settings.distancePoints} PT / TILE`);
  const broadcastVisible=!!room.question||!!room.announcement||countdownSeconds(room,Date.now()+clockOffset)!==null;
  const finish=$('#finish-overlay'); if(finish)finish.hidden=!s.finished||broadcastVisible;
  const progressPercent=Math.max(0,Math.min(100,(s.progress||0)*100));
  const progress=$('#my-progress');if(progress){progress.style.width=`${progressPercent}%`;progress.parentElement.setAttribute('aria-valuenow',String(Math.floor(progressPercent)));}
  setText('#my-progress-label',`WORLD ${racePosition(s.level,s)} · ${Math.floor((s.progress||0)*100)}%`); setText('#my-deaths',`${s.deaths} RESPAWNS`);
  const dots=$$('#world-dots i'),progressModel=worldProgressModel(s,room.settings.worldOrder);
  dots.forEach((el,i)=>{el.classList.toggle('done',progressModel.done[i]);el.title=`${i+1}. ${levelNames[progressModel.order[i]]}${progressModel.done[i]?' / cleared':''}`;el.setAttribute('aria-label',el.title);});
  updateLeaderboard();
}
function updateLeaderboard() {
  const node=$('#leaderboard'); if(!node)return;
  const key=JSON.stringify(room.players.map(p=>[p.id,p.name,p.avatar,p.color,p.score,p.connected,p.spawned,p.finishTime,p.state?.level||p.summary?.level,p.state?.deaths||p.summary?.deaths]));
  if(key===scoreKey)return; scoreKey=key;
  setText('#leader-count',`${room.players.length} PLAYERS`);
  node.innerHTML=room.players.length?room.players.map((p,i)=>{
    const level=p.state?.level??p.summary?.level;
    const status=!p.connected?'DISCONNECTED':room.status==='lobby'?(p.spawned?'IN THE LOBBY':'PICKING A CHARACTER'):p.finishTime!=null?`CLEARED IN ${elapsed(p.finishTime)}`:level?`WORLD ${racePosition(level,p.state)}`:'RACING';
    return `<div class="leader-row ${p.id===you?'me':''}"><span class="rank ${i<3?'top':''}">${String(i+1).padStart(2,'0')}</span><div class="leader-person"><strong><i class="player-color" style="background:${esc(p.color)}"></i>${esc(p.name)}${p.id===you?' · you':''}</strong><small>${status}</small></div><span class="leader-score">${room.status==='lobby'?'—':number(p.score)}</span></div>`;
  }).join(''):'<p class="leader-empty">No players yet.<br>The calm before the respawns.</p>';
}
function updateQuestion() {
  const q=room.question;
  const token=q?`${room.code}:${q.index}:${q.endsAt}`:null;
  if(token&&token!==questionKey)playTone('broadcast','lobby');
  questionKey=token;
  const model=worldUIModel(room,{now:Date.now()+clockOffset,viewerId:you,isHost:role==='host'});
  for(const canvas of $$('.world-screen canvas'))syncWorldControls(canvas,model);
}
let announcementId=null;
function updateAnnouncement() {
  const a=room?.announcement,el=$('#world-announcer');
  if(!a||a.endsAt<=Date.now()+clockOffset){if(el)el.textContent='';return;}
  if(`${a.id}:${a.phase||'broadcast'}`!==announcementId){announcementId=`${a.id}:${a.phase||'broadcast'}`;if(el)el.textContent=a.text;playTone('broadcast');}
}
function renderResults() {
  if(!podiumArrivedAt)podiumArrivedAt=performance.now();
  const settling=room.status!=='ended';
  app.innerHTML=`${header(`${roomCode()}<span class="pill lime">${settling?'FINALIZING':'ROUND COMPLETE'}</span>`)}
    <div id="connection-banner" class="disconnected-banner" hidden></div><main class="workspace podium-workspace">
    <div class="workspace-header"><div><div class="eyebrow">${icon('trophy')} TELEPORT COMPLETE</div><h1>Welcome to the castle courtyard.</h1><p>${settling?'Finalizing scores… Please wait for the immutable results.':'Everyone’s here. Final points include your current world. Time breaks equal scores.'}</p></div><span id="podium-rank-label" class="pill lime">${settling?'FINALIZING SCORES…':'FINAL RANKS'}</span></div>
    <section class="game-shell podium-world"><div class="game-topbar"><span>CASTLE COURTYARD / THE PODIUM</span><span>${settling?'FINALIZING SCORES…':'FINAL SCORES LOCKED'}</span></div>
    ${worldScreenMarkup('podium-canvas','Castle courtyard ruins with every player standing in final rank order',{width:1200,height:720,controls:false,overlay:'<div class="podium-awards" aria-label="Ceremony awards"><section class="podium-award podium-award-deaths"></section><section class="podium-award podium-award-coins"></section></div>'})}
    <div class="game-bottom"><span id="podium-status" aria-live="polite">Your team’s final rankings.</span><button class="link-button" data-action="fullscreen" aria-label="Full screen podium">${icon('expand')}</button></div></section>
    <div class="results-actions">${role==='host'&&!settling?`<button class="button ghost" data-action="export">${icon('download')} Download results</button><button class="button primary" data-action="reset">Back to the lobby ${icon('arrow')}</button>`:role==='host'?'':`<button class="button ghost" data-action="home">${icon('home')} Back to home</button>`}</div>
    <details class="podium-details panel"><summary>Full rankings and finish times</summary><table class="result-table"><thead><tr><th>RANK</th><th>PLAYER</th><th>SCORE</th><th>FINISH TIME</th></tr></thead><tbody id="result-rows"></tbody></table></details>
    ${role!=='host'?'<p class="host-status-note">Your host can bring everyone back to the lobby for another round.</p>':''}</main>`;
}
function updateResults() {
  const results=room.status==='ended'?(room.results||[]):[];
  const key=JSON.stringify(results);if(key===scoreKey)return;scoreKey=key;
  const me=results.find(p=>p.id===you);
  if(room.status!=='ended'){setText('#podium-rank-label','FINALIZING SCORES…');setText('#podium-status','Finalizing scores…');}
  else { setText('#podium-rank-label',role==='host'?`${results.length} FINAL RANKS`:me?`YOUR PLACE #${me.rank} / ${number(me.score)} PTS`:'PODIUM SPECTATOR'); setText('#podium-status',me?`${me.name}, you finished #${me.rank} with ${number(me.score)} points.`:role==='host'?`${results.length} players ranked. The highest score wins.`:'The round is over. You’re watching the final podium.'); }
  $('#result-rows').innerHTML=results.map(p=>`<tr class="${p.id===you?'me':''}"><td class="mono">${String(p.rank).padStart(2,'0')}</td><td><i class="player-color" style="background:${esc(p.color)}"></i>${esc(p.name)}${p.id===you?' · you':''}</td><td class="result-points">${number(p.score)}</td><td class="muted mono">${elapsed(p.finishTime)}</td></tr>`).join('')||`<tr><td colspan="4" class="muted">${room.status==='ended'?'No players joined this round.':'Collecting final reports…'}</td></tr>`;
  renderPodiumAwards(results);
}
function renderPodiumAwards(results) {
  const root=$('.podium-awards');if(!root)return;
  const awards=podiumAwards(results);
  for(const [key,award] of Object.entries({deaths:awards.deaths,coins:awards.earnedCoins})) {
    const card=$(`.podium-award-${key}`,root);if(!card)continue;
    const names=award.winners.length?award.winners.map(player=>`<li>${esc(player.name||'Unknown runner')}</li>`).join(''):`<li class="podium-award-empty">${esc(award.message)}</li>`;
    card.innerHTML=`<div class="podium-award-title">${esc(award.title)}</div><div class="podium-award-caption">${award.winners.length>1?'JOINT WINNERS':award.winners.length?'WINNER':''}</div><ul tabindex="0" aria-label="${esc(award.title)} recipients">${names}</ul>${award.winners.length?`<strong class="podium-award-value">${number(award.value)} ${key==='deaths'?'DEATHS':'COINS'}</strong>`:''}`;
  }
}
function syncPodiumAwards(canvas) {
  const root=$('.podium-awards',canvas?.parentElement);if(!root)return;
  root.hidden=room?.status!=='ended';
  const viewport=canvas.parentElement.getBoundingClientRect(),bounds=canvas.getBoundingClientRect();
  const scale=Math.min(bounds.width/1200,bounds.height/720);
  const offsetX=bounds.left-viewport.left+(bounds.width-1200*scale)/2,offsetY=bounds.top-viewport.top+(bounds.height-720*scale)/2;
  root.style.left=`${offsetX}px`;root.style.top=`${offsetY}px`;root.style.transform=`scale(${scale})`;
  for(const card of root.children)card.style.transform=`scale(${GAME_CARD_SCALE})`;
}
function setText(selector,value) { const el=$(selector);if(el&&el.textContent!==String(value))el.textContent=value; }
function setHTML(selector,value) { const el=$(selector);if(el&&el.innerHTML!==value)el.innerHTML=value; }

function openModal(title,body,footer='',className='') {
  zeroInput(); modal.className=className;
  modal.innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="button square ghost" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-content">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
  if(!modal.open)modal.showModal();
}
function closeModal() { modal.close();updateMusicScene(); }
function showHelp() {
  openModal('A field guide to questionable decisions.',`
    <div class="help-block"><h3>01 / LEARN THE MOVES</h3><p>Use <kbd>A</kbd> / <kbd>D</kbd> or <kbd>←</kbd> / <kbd>→</kbd> to move. Jump with <kbd>SPACE</kbd>, <kbd>W</kbd>, or <kbd>↑</kbd>; release the jump key before jumping again. Joining puts you straight into the playable lobby when the room is waiting; a late join enters the first race world. Change your name, circular avatar portrait, or color inside the world while you practice; choices lock when your host starts the race. This game is made for a desktop keyboard.</p></div>
    <div class="help-block"><h3>02 / MAKE IT COUNT</h3><p>Coins and distance add to your score. Find the checkpoint markers authored in each world. Collected coins and their points are protected immediately and never respawn on death. Claimed treasure chests disappear with sparkles and stay spent; decoys remain. Pass each new flag to save your location and distance progress. Reached flags stay gold, and only a later flag replaces your save. Death restores your saved position and distance after 3 seconds. Before the checkpoint, death resets distance progress and sends you to the world start. Your coins and coin points remain safe in both cases. Reach the exit to bank the full world score. There are unlimited respawns.</p></div>
  <div class="help-block"><h3>03 / TRUST YOUR INSTINCTS. MAYBE.</h3><p>Moving platforms move. Vanishing platforms vanish. Spikes, projectiles, and authored melee attacks are lethal; creature body contact is harmless. Watch what’s revealed when you die. Critters chase only when you stand on their platform; some shoot. Power chests and decoys appear where authored in each world. Hold one power at a time. At another chest, choose Attack with your current power or Replace it with the new one.</p><p>Press <kbd>F</kbd> or USE to answer a power-chest challenge and attack everyone else. Coin attacks use <kbd>Q</kbd> to choose one of the four powers and an eligible runner; their cost and cooldown are set by the host. You have ${room?.settings.attackWindowSeconds??15} seconds and one attempt for a chest challenge; a wrong or unanswered chest attack hits you. After a correct chest attack, everyone else gets ${room?.settings.defendWindowSeconds??15} seconds and one attempt to defend. Correct defenders block; wrong or missing answers are affected. Defenders can move again once their answer is accepted. The attacker waits until all defenders answer or their time runs out, for both coin attacks and global chest powers. Answers ignore case. The slow, reverse, slippery, or dark ink effect and its broadcast last ${room?.settings.powerDurationSeconds??8} seconds after defenses resolve. Unused powers survive death; opened chests stay spent. Power turns run one at a time across the room in request order. Every player gets the same layout and their own run.</p></div>
    <div class="help-block"><h3>04 / EARN THE BRAGGING RIGHTS</h3><p>The highest score wins, with the fastest full completion breaking ties. When the timer ends, banked points and your current points count. Late arrivals use the remaining room time. Refreshing resets your game, including checkpoints; rejoin with the same name to replace your disconnected entry.</p></div>`);
}
function worldOrderSettings(settings){
  const order=normalizeWorldOrder(settings.worldOrder);
  return `<div class="settings-section-heading"><span>World order</span></div><div class="settings-fields">${order.map((id,index)=>`<label class="field"><span class="field-label">STAGE ${index+1}</span><select name="worldOrder${index}" data-world-position="${index}" data-previous="${id}" class="world-order-select" aria-label="World at stage ${index+1}">${LEVEL_CATALOG.map(level=>`<option value="${level.id}" ${level.id===id?'selected':''}>${esc(level.name)}</option>`).join('')}</select></label>`).join('')}</div><p class="settings-help">Everyone follows this sequence through all ${order.length} configured worlds. Choosing a world swaps its position with the previous selection.</p>`;
}
function showSettings() {
  if(role!=='host'||room.status!=='lobby')return;
  const s=room.settings; const strengthMarkup=`<div class="settings-section-heading"><span>Power strength</span></div><div class="settings-fields"><label class="field"><span class="field-label">STICKY SPEED / % NORMAL</span><input name="slowSpeedPercent" type="number" min="10" max="90" step="1" value="${s.slowSpeedPercent??25}" required></label><label class="field"><span class="field-label">WRONG WAY SPEED / % NORMAL</span><input name="reverseSpeedPercent" type="number" min="50" max="200" step="1" value="${s.reverseSpeedPercent??100}" required></label><label class="field"><span class="field-label">ICE SPEED / % NORMAL</span><input name="slipperySpeedPercent" type="number" min="110" max="250" step="1" value="${s.slipperySpeedPercent??170}" required></label><label class="field"><span class="field-label">ICE GRIP / % NORMAL BRAKING</span><input name="slipperyGripPercent" type="number" min="2" max="50" step="1" value="${s.slipperyGripPercent??12}" required></label><label class="field"><span class="field-label">INK DARKNESS / %</span><input name="inkDarknessPercent" type="number" min="0" max="95" step="1" value="${s.inkDarknessPercent??88}" required></label></div><p class="settings-help">Speed is relative to normal movement. Ice Skates are faster and have reduced grip, so momentum carries farther. Ink Darkness is the fog darkening percentage.</p>`;
  openModal('A little order before the chaos.',`<form id="settings-form">${worldOrderSettings(s)}<div class="settings-fields"><label class="field"><span class="field-label">ROUND MINUTES</span><input name="durationMinutes" type="number" min="1" max="60" step="1" value="${s.durationMinutes}" required></label><label class="field"><span class="field-label">POINTS / COIN</span><input name="coinPoints" type="number" min="0" max="1000" step="1" value="${s.coinPoints}" required></label><label class="field"><span class="field-label">POINTS / TILE</span><input name="distancePoints" type="number" min="0" max="1000" step="1" value="${s.distancePoints}" required></label></div><p class="settings-help">Distance uses the farthest point reached in the current attempt, in 32-pixel tiles. Completing a world banks its coins and distance. Rounds default to 15 minutes; you can set 1–60 minutes.</p><div class="settings-section-heading"><span>Coin attacks</span></div><div class="settings-fields"><label class="field"><span class="field-label">ATTACK COST / COINS</span><input name="attackCoinCost" type="number" min="1" max="1000" step="1" value="${s.attackCoinCost??30}" required></label><label class="field"><span class="field-label">ATTACK COOLDOWN / SEC</span><input name="attackCooldownSeconds" type="number" min="1" max="3600" step="1" value="${s.attackCooldownSeconds??60}" required></label></div><p class="settings-help">Spend coins to choose one of the four powers, then target an eligible runner. Each player has a separate cooldown. It starts when the selected defender answers or times out. A wrong or unanswered attack starts cooldown when it backfires. Spending coins never deducts score.</p><div class="settings-section-heading"><span>Power challenges</span></div><div class="settings-fields"><label class="field"><span class="field-label">POWER DURATION / SEC</span><input name="powerDurationSeconds" type="number" min="1" max="60" step="1" value="${s.powerDurationSeconds??8}" required></label><label class="field"><span class="field-label">ATTACK WINDOW / SEC</span><input name="attackWindowSeconds" type="number" min="1" max="60" step="1" value="${s.attackWindowSeconds??15}" required></label><label class="field"><span class="field-label">DEFEND WINDOW / SEC</span><input name="defendWindowSeconds" type="number" min="1" max="60" step="1" value="${s.defendWindowSeconds??15}" required></label></div><p class="settings-help">Each setting accepts 1–60 seconds. Chest attacks challenge everyone else; coin attacks challenge the selected runner. Correct defenders block the power; wrong or missing answers are affected. The effect and its broadcast last for the configured power duration after defenses resolve.</p>${strengthMarkup}<div class="settings-section-heading"><span>Lobby icebreakers</span><button type="button" class="button small ghost" data-action="add-question">${icon('plus')} Add question</button></div><div id="question-editors">${s.questions.map((q,i)=>questionEditor(q,i)).join('')}</div><p class="settings-help">Up to 5 questions, with 2 choices each. Launch them manually from your dashboard. Named votes are visible live and close automatically after 15 seconds.</p></form>`,`<button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="settings-form">Save settings ${icon('check')}</button>`);
}
function questionEditor(q={prompt:'',choices:['','']},i=0) { return `<div class="question-editor"><div class="question-editor-top"><span>QUESTION <span class="question-index">${i+1}</span></span><button class="link-button" type="button" data-action="remove-question" aria-label="Remove question">${icon('trash')}</button></div><label class="field"><span class="sr-only">Question</span><input data-q-prompt maxlength="240" placeholder="Pineapple on pizza?" value="${esc(q.prompt)}" required></label><div class="field-row"><label class="field"><span class="sr-only">Choice A</span><input data-q-a maxlength="100" placeholder="Absolutely" value="${esc(q.choices[0])}" required></label><label class="field"><span class="sr-only">Choice B</span><input data-q-b maxlength="100" placeholder="Absolutely not" value="${esc(q.choices[1])}" required></label></div></div>`; }
async function copy(value,message) { try { await navigator.clipboard.writeText(value);toast(message); } catch { openModal('Copy this to your team.',`<label class="field"><input value="${esc(value)}" readonly onclick="this.select()" aria-label="Invitation"></label>`); } }
function zeroInput() { input={left:false,right:false,jump:false}; localRun?.setInput(input); }
function useHeldPower() { const me=room?.players.find(p=>p.id===you);if(!runtimeError&&!me?.power?.queued&&!me?.power?.testing&&(!me?.powerQuiz||me.powerQuiz.answered)){const offer=me?.powerOffer;if(offer?.canAttack)send('powerChestChoice',{offerId:offer.id,itemId:offer.itemId,choice:'attack'});else send('usePower');} }
function sceneForLevel(level){return LEVELS[level]?.theme||'lobby';}
function currentEffectScene(){
  if(!room||room.status==='lobby')return 'lobby';
  if(ceremony())return 'results';
  if(role==='host')return 'lobby';
  const player=room.players.find(p=>p.id===you);
  return sceneForLevel(player?.spawned?player.state?.level:0);
}
function playTone(kind,scene=currentEffectScene()) { audio.playEffect(kind,scene); }
function cancelStageVictory() {
  stageVictory=null;
  audio.cancelVictory();
}
async function transitionViewport(changeScene){
  if(sceneTransitionActive)return false;
  const viewport=$('.world-screen');
  if(!viewport){changeScene();return true;}
  sceneTransitionActive=true;zeroInput();coinAttackControls?.close();
  irisTransition=irisTransitionFor(viewport,{duration:SCENE_TRANSITION_DURATION});
  try{
    await irisTransition.run(async()=>{
      sceneTransitionApplying=true;
      try{changeScene();if(ceremony())renderRoom();}finally{sceneTransitionApplying=false;}
      irisTransition.retarget($('.world-screen')||viewport);
      paintCurrentScene(performance.now());
      await new Promise(resolve=>requestAnimationFrame(resolve));
    });
  }finally{
    sceneTransitionActive=false;zeroInput();simulationCursor=serverNow();
    if(pendingRoomState){const latest=pendingRoomState;pendingRoomState=null;onMessage(latest);}
    else renderRoom();
  }
  return true;
}
function playStageVictory(level) {
  cancelStageVictory();
  zeroInput();
  const token={run:localRun,level};
  stageVictory=token;
  const scene=sceneForLevel(level);
  audio.setScene(scene);
  const complete=async()=>{
    if(stageVictory!==token)return;
    // Consume time spent at the exit before allowing the new world to move.
    advanceLocalSimulation();
    if(stageVictory!==token)return;
    stageVictory=null;
    if(!localRun?.state.stageTransition){updateMusicScene();return;}
    const switchScene=()=>{
      const now=serverNow();
      if(localRun===token.run&&connected&&!runtimeError&&room?.status==='running'&&!ceremony()&&now<room.endsAt&&!pendingRoomState){
        zeroInput();
        localRun.advanceStage({serverNow:serverNow()});
        simulationCursor=serverNow();
        renderRoom();
      }
    };
    await transitionViewport(()=>{
      // Apply the last coordinator snapshot while the iris is fully closed. The
      // transition callback already owns sceneTransitionApplying, so reconcile
      // the packet in that scope before making the advance decision.
      if(pendingRoomState){
        const latest=pendingRoomState;pendingRoomState=null;
        onMessage(latest);
      }
      switchScene();
    });
    updateMusicScene();
  };
  void audio.playVictory(scene).then(complete,complete);
}
function updateMusicScene() {
  if(screen==='entry'||!room){audio.setScene('lobby');return;}
  if(ceremony()){audio.setScene('results');return;}
  if(stageVictory)return;
  if(role==='host'){audio.setScene('lobby');return;}
  const player=room.players.find(p=>p.id===you);
  if(player?.state?.finished){audio.setScene('results');return;}
  const level=player?.spawned?player.state?.level:0;
  const scene=room.status==='lobby'?'lobby':sceneForLevel(level);
  audio.setScene(scene);
}
// Unlock inside a real interaction; network updates never request autoplay.
function unlockAudio(event) {
  if(event.target.closest?.('[data-action="sound"]'))return;
  void audio.unlock();
}
for(const event of ['pointerdown','keydown','click'])document.addEventListener(event,unlockAudio,{capture:true});

document.addEventListener('input',event=>{
  if(!event.target.matches('[data-audio-volume]'))return;
  audio.setVolume(Number(event.target.value)/100);
  const volume=Math.round(audio.volume*100);
  event.target.setAttribute('aria-valuetext',`${volume}%`);
  const control=event.target.closest('.volume-control');
  control.querySelector('[data-volume-value]').textContent=`${volume}%`;
  control.querySelector('[data-action="sound"]').innerHTML=icon(audio.enabled&&volume>0?'volume':'mute');
  if(audio.enabled)void audio.unlock();
});

document.addEventListener('submit',async e=>{
  if(e.target.id==='join-form'){
    e.preventDefault();if(pending)return;pending=true;$('.entry-submit').disabled=true;
    profile.name=$('#player-name').value.trim();persistProfile();
    try{await connect();send('join',{code:$('#room-code').value.trim().toUpperCase(),...profile});}catch(err){pending=false;$('.entry-submit').disabled=false;toast(err.message,true);}
  }
  if(e.target.id==='settings-form'){
    e.preventDefault();const f=e.target;
    const settings={worldOrder:$$('[data-world-position]',f).map(el=>Number(el.value)),durationMinutes:Number(f.elements.durationMinutes.value),coinPoints:Number(f.elements.coinPoints.value),distancePoints:Number(f.elements.distancePoints.value),attackCoinCost:Number(f.elements.attackCoinCost.value),attackCooldownSeconds:Number(f.elements.attackCooldownSeconds.value),powerDurationSeconds:Number(f.elements.powerDurationSeconds.value),attackWindowSeconds:Number(f.elements.attackWindowSeconds.value),defendWindowSeconds:Number(f.elements.defendWindowSeconds.value),slowSpeedPercent:Number(f.elements.slowSpeedPercent.value),reverseSpeedPercent:Number(f.elements.reverseSpeedPercent.value),slipperySpeedPercent:Number(f.elements.slipperySpeedPercent.value),slipperyGripPercent:Number(f.elements.slipperyGripPercent.value),inkDarknessPercent:Number(f.elements.inkDarknessPercent.value),questions:$$('.question-editor',f).map(el=>({prompt:$('[data-q-prompt]',el).value.trim(),choices:[$('[data-q-a]',el).value.trim(),$('[data-q-b]',el).value.trim()]}))};
    send('settings',{settings});closeModal();toast('Game settings saved.');
  }
});
document.addEventListener('toggle',e=>{if(e.target.id==='host-run-reports'){hostReportsOpen=e.target.open;const label=$('.report-toggle',e.target);if(label)label.textContent=hostReportsOpen?'HIDE':'SHOW';if(hostReportsOpen)updateHost();}},{capture:true});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.hostPower){if(runtimeError||!connected||role!=='host'||room?.status!=='running')return;send('hostAttack',{roundId:room.roundId,powerType:b.dataset.hostPower});return;}
  if(b.dataset.vote!==undefined){send('vote',{choice:Number(b.dataset.vote)});return;}
  if(b.dataset.launch!==undefined){send('launchQuestion',{index:Number(b.dataset.launch)});return;}
  const action=b.dataset.action;
  if(action==='host-tab'||action==='join-tab'){entryTab=action==='host-tab'?'host':'join';renderEntry();}
  if(action==='create'){
    if(pending)return;pending=true;b.disabled=true;
    try{if(ws?.readyState===WebSocket.OPEN){intentionalClose=true;ws.close();ws=null;}await connect();send('create',{settings:DEFAULTS});}catch(err){pending=false;b.disabled=false;toast(err.message,true);}
  }
  if(action==='resume'){try{await connect();role='host';send('hostJoin',hostSession);}catch(err){toast(err.message,true);}}
  if(action==='settings')showSettings();
  if(action==='help'){const q=room?.players.find(p=>p.id===you)?.powerQuiz;if(q&&!q.answered)syncPlayerQuiz({focus:true});else showHelp();}
  if(action==='close-modal')closeModal();
  if(action==='copy-code')copy(room.code,'Room code copied.');
  if(action==='copy-link')copy(`${location.origin}/?room=${room.code}`,'Invite link copied. Send it to your team.');
  if(action==='sound'){
    audio.setEnabled(!audio.enabled);
    b.innerHTML=icon(audio.enabled&&audio.volume>0?'volume':'mute');
    b.setAttribute('aria-pressed',String(audio.enabled));
    const label=`${audio.enabled?'Mute':'Enable'} music and sound effects`;
    b.setAttribute('aria-label',label);b.title=label;
    if(audio.enabled)void audio.unlock();
  }
  if(action==='start'){
    if(!room.players.length){toast('Invite at least one player before starting.',true);return;}
    send('start');
  }
  if(action==='end-confirm')openModal('Call time on this round?',`<p class="host-entry-copy">This ends the race for everyone. Banked points and all current attempt points will be included in the final results.</p>`,`<button class="button ghost" data-action="close-modal">Keep playing</button><button class="button danger" data-action="end">End round</button>`);
  if(action==='end'){send('end');closeModal();}
  if(action==='reset'){send('reset');}
  if(action==='skip-question')send('skipQuestion');
  if(action==='use-power')useHeldPower();
  if(action==='fullscreen'){const el=$('.game-shell');try{if(!document.fullscreenElement)await el.requestFullscreen();else await document.exitFullscreen();}catch{toast('Full screen is unavailable in this browser.',true);}}
  if(action==='add-question'){const list=$('#question-editors');if(list.children.length>=5){toast('Five questions is the maximum.');return;}list.insertAdjacentHTML('beforeend',questionEditor(undefined,list.children.length));$('[data-q-prompt]',list.lastElementChild).focus();}
  if(action==='remove-question'){b.closest('.question-editor').remove();$$('.question-index').forEach((el,i)=>el.textContent=i+1);}
  if(action==='home'){intentionalClose=true;send('leave');ws?.close();ws=null;room=null;you=null;renderEntry();}
  if(action==='rejoin'){
    try{await connect();send('join',{code:room.code,...profile});$('#connection-banner').hidden=true;}catch(err){toast(err.message,true);}
  }
  if(action==='export'){
    const rows=[['Rank','Player','Score','Finish seconds'],...(room.results||room.players).map(p=>[p.rank,p.name,p.score,p.finishTime==null?'':p.finishTime.toFixed(2)])];
    const csv=rows.map(row=>row.map(v=>{let s=String(v);if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download=`game-day-${room.code}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-world-position]')){
    const selects=$$('[data-world-position]',e.target.form),previous=e.target.dataset.previous;
    const other=selects.find(el=>el!==e.target&&el.value===e.target.value);
    if(other)other.value=previous;
    for(const el of selects)el.dataset.previous=el.value;
  }
});
const keyMap={a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right',w:'jump',ArrowUp:'jump',' ':'jump'};
function keyboard(e,pressed){
  if(sceneTransitionActive){if(keyMap[e.key]||keyMap[e.key.toLowerCase()]||['f','q','1','2'].includes(e.key.toLowerCase()))e.preventDefault();return;}
  const quiz=room?.players.find(p=>p.id===you)?.powerQuiz;
  if(role==='player'&&quiz&&!quiz.answered){if(!e.target.closest('input,textarea,select,button')&&(keyMap[e.key]||keyMap[e.key.toLowerCase()])){e.preventDefault();if(pressed)syncPlayerQuiz({focus:true});}return;}
  if(pressed&&role==='player'&&coinAttackControls?.isOpen&&!e.target.closest('input,textarea,select')&&coinAttackControls.handleKeydown(e))return;
  if(pressed&&role==='player'&&room?.question&&!room.question.closed&&!modal.open&&!e.target.closest('input,textarea,select')&&(e.key==='1'||e.key==='2')){e.preventDefault();send('vote',{choice:Number(e.key)-1});return;}
  if(e.target.closest('.world-controls button,.power-controls button,.power-chest-controls button,.coin-attack-controls button,.lobby-profile-controls button,.player-world-panels summary')&&(e.key===' '||e.key==='Enter'))return;
  if(pressed&&!e.repeat&&e.key.toLowerCase()==='q'&&!(e.ctrlKey||e.altKey||e.metaKey)&&role==='player'&&room?.status==='running'&&!modal.open&&!runtimeError&&!e.target.closest('input,textarea,select')&&!$('.coin-attack-controls.is-dialog')){const attack=$('.coin-attack-open');if(attack&&!attack.disabled){e.preventDefault();attack.click();return;}}
  if(pressed&&!e.repeat&&e.key.toLowerCase()==='f'&&role==='player'&&room?.status==='running'&&!modal.open&&!$('.coin-attack-controls.is-dialog')&&!runtimeError&&!e.target.closest('input,textarea,select')){e.preventDefault();useHeldPower();return;}
  const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(!k)return;
  if(role!=='player'||!room||ceremony()||irisTransition?.active||modal.open||$('.coin-attack-controls.is-dialog')||runtimeError||e.target.closest('input,textarea,select'))return;
  if(!room.players.find(p=>p.id===you)?.spawned)return;
  e.preventDefault();if(input[k]===pressed)return;
  const state=localRun?.state;
  if(k==='jump'&&pressed&&state&&!state.respawnRemaining&&!state.finished&&!state.stageTransition&&(state.grounded||state.coyote>0))playTone('jump');
  input[k]=pressed;localRun?.setInput(input);
}
document.addEventListener('keydown',e=>keyboard(e,true));document.addEventListener('keyup',e=>keyboard(e,false));
window.addEventListener('blur',zeroInput);document.addEventListener('visibilitychange',()=>{
  if(document.hidden){zeroInput();}
  advanceLocalSimulation();
  if(!document.hidden)syncPlayerQuiz({focus:true});
  audio.setHidden(document.hidden);
});
window.addEventListener('pagehide',event=>{if(role==='player'&&room?.status!=='ended')send('leave');audio.setHidden(true);if(!event.persisted)audio.dispose();});
window.addEventListener('pageshow',()=>{audio.setHidden(document.hidden);syncPlayerQuiz({focus:true});});
window.addEventListener('resize',()=>{syncLobbyProfile();syncPlayerQuiz();syncPlayerChest();});
document.addEventListener('fullscreenchange',()=>{syncLobbyProfile();syncPlayerQuiz();syncPlayerChest();});
setInterval(()=>{if(document.hidden)advanceLocalSimulation();syncLobbyProfile();syncPlayerQuiz();syncPlayerChest();},100);
setInterval(()=>{if(connected)send('timeSync',{clientTime:Date.now()});},10000);
audio.setHidden(document.hidden);
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
modal.addEventListener('close',()=>{updateMusicScene();});

let lastHostDraw=0,lastUiDraw=0;
function advanceLocalSimulation(){
  const now=serverNow(),me=room?.players.find(p=>p.id===you);
  if(role!=='player'||!localRun||!me?.spawned||!connected||runtimeError||!['lobby','running'].includes(room?.status)){simulationCursor=now;return;}
  if(room.status==='running'&&finalSentRound===room.roundId)return;
  simulationCursor??=now;
  const target=room.status==='running'?Math.min(now,room.endsAt):now;
  localRun.pause(false);
  if(sceneTransitionActive){
    localRun.setInput({});
    localRun.advanceLifecycle(Math.min(MAX_CATCHUP_STEPS*FIXED_STEP_SECONDS,Math.max(0,(target-simulationCursor)/1000)),{serverNow:target});
    simulationCursor=target;
  }else if(target-simulationCursor>.001){
    // Background timers can be suspended for minutes. Drop missed physics time
    // instead of replaying it at high speed over subsequent visible frames.
    const delta=Math.min(MAX_CATCHUP_STEPS*FIXED_STEP_SECONDS,(target-simulationCursor)/1000);
    localRun.settings={...room.settings,powerEffects:activePowerEffects(me,target)};
    localRun.setFrozen(isDuelFrozen(room.powerDuel,you,me.powerQuiz));
    localRun.tick(delta,{serverNow:target});
    simulationCursor=target;
  }
  me.state=localRun.state;
  if(room.status==='running'&&now>=room.endsAt){
    const first=!localFinalizing;localFinalizing=true;
    if(simulationCursor>=room.endsAt-.001)finalizeLocal(room.endsAt);
    if(first){podiumArrivedAt=performance.now();closeModal();zeroInput();playTone('teleport','results');void transitionViewport(()=>renderRoom());}
  }
}
function paintCurrentScene(time){
  const t=time/1000,now=serverNow();
  if(screen==='entry') {const canvas=$('#demo-canvas');if(canvas)renderGame(canvas,demo,{time:t,compact:true});}
  if($('#podium-canvas')){
    const canvas=$('#podium-canvas');if(canvas){if(room.status!=='ended')renderPendingPodium(canvas,{time:t});else renderPodium(canvas,room.results||[],{time:t,viewerId:you,arrivalAge:(time-podiumArrivedAt)/1000});renderWorldUI(canvas,room,{now,viewerId:you,isHost:role==='host'});syncPodiumAwards(canvas);}
  }
  if(role==='player'&&room&&$('#game-canvas')){
    const me=room?.players.find(p=>p.id===you),canvas=$('#game-canvas');
    if(canvas){const visual=me?.spawned?localRun.state:createState(profile);renderGame(canvas,visual,{time:t,compact:true,powerChestClaims:me?.powerChestClaims||[],showInstructions:room.status==='lobby'||!me?.spawned});drawPlayerPowers(canvas,me,{now,time:t});syncCoinAttack();drawWorldBroadcasts(canvas,{now});drawPlayerQuiz(canvas,me,{now});}
    const state=localRun?.state,death=$('#death-caption');
    if(death&&state){const remain=state.respawnRemaining||0;death.hidden=remain<=0||!!me?.powerQuiz;if(remain>0)death.innerHTML=`<strong>WELL, THAT HAPPENED.</strong><p>${esc(state.deathCause?.label||'A surprise encounter with danger.')}</p><span class="respawn-countdown">RESPAWNING IN ${Math.max(1,Math.ceil(remain))}s</span><small>${state.checkpoint?'BACK TO YOUR CHECKPOINT · COLLECTED COINS & TREASURE SAFE':'BACK TO THE WORLD START · COLLECTED COINS & TREASURE SAFE'}</small>`;}
    syncLobbyProfile();
  }
}
function frame(time){
  requestAnimationFrame(frame);
  if(document.hidden)return;
  const t=time/1000,now=serverNow();
  advanceLocalSimulation();
  paintCurrentScene(time);
  if(role==='host'&&room&&!ceremony()&&time-lastHostDraw>120){
    lastHostDraw=time;
    const stage=$('#host-world-canvas');
    if(stage){const ctx=stage.getContext('2d');ctx.clearRect(0,0,stage.width,stage.height);ctx.fillStyle='#101b17';ctx.fillRect(0,0,stage.width,stage.height);const model=drawWorldBroadcasts(stage,{now});if(!model.question&&!model.announcement&&model.countdown===null){ctx.fillStyle='#839783';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText('No shared announcements right now.',stage.width/2,stage.height/2);ctx.textAlign='left';}}
  }
  if(time-lastUiDraw>100){lastUiDraw=time;
    if(role==='player'&&room&&!ceremony()){updatePlayer();updateMusicScene();}
    if(room?.status==='running'){const text=clock(room.endsAt-now);setText('#host-timer',text);setText('#player-timer',text);}
    else if(room?.status==='lobby')setText('#host-timer',clock(room.settings.durationMinutes*60000));
    const second=countdownSeconds(room,now),roundKey=room?`${room.code}:${room.startedAt}`:null;
    if(roundKey!==lastCountdownRoom){lastCountdownRoom=roundKey;lastCountdownSecond=null;}
    if(second!==null&&second>0&&second!==lastCountdownSecond){lastCountdownSecond=second;playTone('countdown');}
    if(second===null)lastCountdownSecond=null;
  }
}
renderEntry();requestAnimationFrame(frame);
void checkRuntime().catch(()=>{});
if(hostSession&&!new URLSearchParams(location.search).has('room')){role='host';connect().then(()=>send('hostJoin',hostSession)).catch(err=>{role=null;toast(err.message,true);});}
