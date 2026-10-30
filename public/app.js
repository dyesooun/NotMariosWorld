import { createState, step, LEVELS, AVATARS, COLORS } from './game/engine.js';
import { renderGame, drawAvatar } from './game/renderer.js';
import { GameAudio } from './game/audio.js';
import { renderWorldUI, worldUIModel, countdownSeconds } from './game/world-ui.js';
import { renderPodium } from './game/podium.js';
import { DEFAULT_QUESTIONS } from './game/default-questions.js';
import { checkpointRenderState, runtimeMismatch } from './game/client-state.js';
import { activePowerEffects, renderPowerUI } from './game/power-ui.js';
import { powerQuizModel, renderPowerQuiz } from './game/power-quiz-ui.js';
import { createPowerQuizControls } from './game/power-quiz-controls.js';
import { powerChestOfferModel, createPowerChestControls } from './game/power-chest-ui.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const number = n => Math.round(Number(n) || 0).toLocaleString();
const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60).toString().padStart(2,'0')}:${(s % 60).toString().padStart(2,'0')}`; };
const elapsed = seconds => seconds == null ? '—' : clock(seconds * 1000);
const levelNames = ['The waiting woods', 'Whimsical woods', 'Troubled tides', 'Inferno express'];
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
const DEFAULTS = { durationMinutes:10, coinPoints:10, distancePoints:1, powerDurationSeconds:5, attackWindowSeconds:10, defendWindowSeconds:10, slowSpeedPercent:55, reverseSpeedPercent:100, slipperySpeedPercent:170, slipperyGripPercent:12, inkDarknessPercent:75, questions:DEFAULT_QUESTIONS };
let profile;
try { profile = JSON.parse(localStorage.getItem('nmw-profile') || '{}'); } catch { profile = {}; }
profile = { name:String(profile.name || '').slice(0,24), avatar:AVATARS.includes(profile.avatar) ? profile.avatar : AVATARS[0], color:COLORS.includes(profile.color) ? profile.color : COLORS[0] };
let hostSession;
try { hostSession = JSON.parse(sessionStorage.getItem('nmw-host') || 'null'); } catch { hostSession = null; }
let ws, room = null, you = null, role = null, screen = 'entry', entryTab = 'join', pending = false;
let connected = false, reconnectTimer, reconnectAttempts = 0, intentionalClose = false;
let checkedRuntime = null, runtimeError = null;
let clockOffset = 0, predicted = null, lastAuthoritative = null, lastStatus = null, rosterKey = '', scoreKey = '', questionKey = '', screenKey = '';
let watchedPlayer = null, input = {left:false,right:false,jump:false};
const audio = new GameAudio();
let podiumArrivedAt=0,lastCountdownSecond=null,lastCountdownRoom=null;
let playerQuizControls=null,playerQuizViewport=null;
let playerChestControls=null,playerChestViewport=null;
const demo = createState({level:1,name:'A perfectly normal adventure'});
demo.x = 310; demo.y = 500;
const app = $('#app'), modal = $('#modal');

function toast(message, error = false) {
  const el = document.createElement('div'); el.className = `toast${error ? ' error' : ''}`; el.textContent = message;
  $('#toasts').append(el); setTimeout(() => el.remove(), 4500);
}
function persistProfile() { localStorage.setItem('nmw-profile', JSON.stringify(profile)); }
function send(type, data = {}) { if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({type, ...data})); return true; } return false; }
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
    connected = false; pending = false; zeroInput(); updateConnection();
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
  if(msg.type==='error'&&msg.transactionId){const q=room?.players.find(p=>p.id===you)?.powerQuiz;if(q&&q.transactionId===msg.transactionId&&q.id===msg.challengeId){playerQuizControls?.resetSubmission();syncPlayerQuiz();}}
  if(msg.type==='powerAnswerResult'){toast(msg.correct?(msg.role==='attack'?'Correct! Your opponents must defend.':'Correct! You blocked this attack.'):(msg.role==='attack'?'Incorrect. Your power backfires on you.':'Incorrect. The power will affect you.'));return;}
  if(msg.type==='powerQueued'){toast(`${msg.name||'Your power'} queued${msg.position?` (#${msg.position})`:''}. It will activate in turn.`);return;}
  if(msg.type==='powerCancelled'){toast(msg.reason==='NO_TARGET'?'No opponents are ready. Your unused power is kept.':`${msg.name||'Your queued power'} could not start. Your unused power is kept.`);return;}
  if (msg.type === 'error') { pending = false; playerChestControls?.resetSubmission();toast(msg.message || 'Something went wrong.',true); $$('.entry-submit').forEach(b => b.disabled=false); if (msg.code === 'AUTH' && !room) { hostSession=null; sessionStorage.removeItem('nmw-host'); role=null; renderEntry(); } return; }
  if (msg.type === 'created') {
    hostSession = {code:msg.code,token:msg.token}; sessionStorage.setItem('nmw-host',JSON.stringify(hostSession));
    role='host'; room={code:msg.code,status:'lobby',settings:{...DEFAULTS},players:[],question:null}; you=null; pending=false; renderRoom(true);
  }
  if (msg.type === 'joined') { you=msg.id; role='player'; pending=false; }
  if (msg.type !== 'state') return;
  if(msg.room.runtimeVersion!==checkedRuntime){showRuntimeWarning('The game server changed. Refresh this page before playing.');return;}
  clockOffset = msg.serverTime - Date.now();
  const previous = room; room = msg.room; you = msg.you; if (!role) role = you ? 'player' : 'host';
  if(previous?.status!=='ended'&&room.status==='ended'){podiumArrivedAt=performance.now();closeModal();zeroInput();}
  if (room.status !== lastStatus) { predicted=null; lastAuthoritative=null; lastStatus=room.status; zeroInput(); }
  const me = room.players.find(p => p.id === you);
  const previousMe=previous?.players.find(p=>p.id===you);
  if(role==='player'&&me?.powerQuiz&&`${me.powerQuiz.transactionId}:${me.powerQuiz.id}`!==`${previousMe?.powerQuiz?.transactionId}:${previousMe?.powerQuiz?.id}`)zeroInput();
  if(me?.power?.claimed&&me.power.itemId!==previousMe?.power?.itemId){playTone('checkpoint',sceneForLevel(me.state?.level));toast(`${me.power.power.name} found! Press F or USE to unleash it.`);}
  if (me?.state) {
    const s = me.state;
    if (lastAuthoritative && s.deaths > lastAuthoritative.deaths) playTone('death',sceneForLevel(s.level));
    else if (lastAuthoritative && s.finished && !lastAuthoritative.finished) playTone('finish',sceneForLevel(s.level));
    else if (lastAuthoritative && s.level > lastAuthoritative.level && s.level > 1) playTone('clear',sceneForLevel(lastAuthoritative.level));
    else if (lastAuthoritative && s.checkpoint && s.checkpoint.id!==lastAuthoritative.checkpoint?.id) {playTone('checkpoint',sceneForLevel(s.level));toast('Checkpoint saved! Your score and collected coins are protected.');}
    else if (lastAuthoritative?.respawnRemaining > 0 && !s.respawnRemaining) playTone('respawn',sceneForLevel(s.level));
    else if (lastAuthoritative && s.coins > lastAuthoritative.coins) playTone('coin',sceneForLevel(s.level));
    const next = structuredClone(s);
    // Preserve a small visual lead between authoritative snapshots for responsive input.
    if (predicted && predicted.level === next.level && predicted.deaths === next.deaths && !next.respawnRemaining && Math.abs(predicted.x-next.x)<55) { next.x = next.x*.7+predicted.x*.3; next.y = next.y*.7+predicted.y*.3; }
    predicted=next; lastAuthoritative=s;
  }
  renderRoom();
  if (previous?.status === 'lobby' && room.status === 'running') { closeModal(); toast('The race is on. Good luck out there!'); playTone('start','forest'); }
  if (previous?.status === 'running' && room.status === 'ended') playTone('teleport','results');
}
function header(content = '') {
  return `<header class="site-header">${brand()}<div class="nav-actions">${content}<button class="link-button" data-action="help">HOW TO PLAY</button><button class="button square ghost" data-action="sound" aria-pressed="${audio.enabled}" aria-label="${audio.enabled?'Mute':'Enable'} music and sound effects" title="${audio.enabled?'Mute':'Enable'} music and sound effects">${icon(audio.enabled?'volume':'mute')}</button></div></header>`;
}
function renderEntry() {
  screen='entry'; screenKey='entry'; role=null; rosterKey=scoreKey=questionKey='';
  updateMusicScene();
  const code = new URLSearchParams(location.search).get('room') || '';
  app.innerHTML = `${header(`<button class="button small ghost" data-action="host-tab">HOST A GAME ${icon('diagonal')}</button>`)}
  <main class="landing"><section class="hero"><div class="hero-copy"><div class="eyebrow"><i class="dot"></i> CLOCK IN. ZONE OUT.</div>
    <h1>YOUR NEXT<br><em>BAD IDEA.</em></h1><p class="hero-description">Three worlds. One timer. A suspicious number of coins.<br>Welcome to your team's newest friendly rivalry.</p>
    <div class="entry-box"><div class="tabs" role="tablist" aria-label="Enter a game"><button class="tab ${entryTab==='join'?'active':''}" role="tab" aria-selected="${entryTab==='join'}" data-action="join-tab">Join the adventure</button><button class="tab ${entryTab==='host'?'active':''}" role="tab" aria-selected="${entryTab==='host'}" data-action="host-tab">Host a room</button></div>
    ${entryTab==='join' ? `<form id="join-form"><div class="field-row"><label class="field"><span class="field-label">ROOM CODE</span><input id="room-code" class="room-input" placeholder="ABC123" autocomplete="off" minlength="6" maxlength="6" pattern="[A-Za-z0-9]{6}" value="${esc(code)}" required aria-label="Six character room code"></label><label class="field"><span class="field-label">YOUR NAME</span><input id="player-name" placeholder="Your team knows you as…" maxlength="24" autocomplete="nickname" value="${esc(profile.name)}" required></label></div><button class="button primary wide entry-submit" type="submit">Let's do this ${icon('arrow')}</button></form><p class="entry-note">${icon('shield')} No accounts. Just a room code and questionable instincts.</p>` : `<p class="host-entry-copy">Your team brings the chaos. You get the control room.<br>Set the timer, launch icebreakers, and watch every run live.</p><button class="button primary wide entry-submit" data-action="create">Create a game room ${icon('arrow')}</button><p class="entry-note">${icon('users')} One host · Up to 25 players · Your rules</p>${hostSession?'<button class="link-button" data-action="resume" style="margin-top:12px;color:var(--lime)">RESUME YOUR HOST ROOM →</button>':''}`}
    </div></div>
    <div class="hero-art"><div class="scene-frame"><div class="scene-topbar"><span>01 / WHIMSICAL WOODS</span><div class="window-dots"><i></i><i></i><i></i></div></div><div class="scene-window"><canvas id="demo-canvas" width="960" height="600" aria-label="Animated pixel forest preview"></canvas><div class="scene-caption"><span>LOOKS SAFE.<br><b>Probably isn't.</b></span><span class="pill lime">${icon('play')} READY PLAYER YOU</span></div></div></div><div class="float-tag">100% ORIGINAL CHAOS ↗</div><div class="hero-art-bottom"><span>A LITTLE ADVENTURE. A LOT OF BETRAYAL.</span><span>← → + SPACE</span></div></div>
  </section><section class="realm-strip"><div class="section-kicker"><span>THE SCENIC ROUTE TO DISASTER</span><span class="muted">3 WORLDS TO ESCAPE · 5–10 MINUTES OF MAYHEM</span></div><div class="realms">
    <div class="realm-card"><span class="realm-number">01</span><span class="realm-icon">🌲</span><div class="realm-copy"><h3>Whimsical woods</h3><p>Fresh air. Friendly mushrooms. Hidden agendas.</p></div><span class="arrow">↗</span></div>
    <div class="realm-card"><span class="realm-number">02</span><span class="realm-icon sea">🌊</span><div class="realm-copy"><h3>Troubled tides</h3><p>Come for the ocean. Stay because you respawned.</p></div><span class="arrow">↗</span></div>
    <div class="realm-card"><span class="realm-number">03</span><span class="realm-icon hell">🔥</span><div class="realm-copy"><h3>Inferno express</h3><p>A warm welcome. A very, very warm welcome.</p></div><span class="arrow">↗</span></div>
  </div></section><footer class="landing-footer"><div class="landing-stats"><span><strong>25</strong> RUNNERS</span><span><strong>∞</strong> SECOND CHANCES</span><span><strong>1</strong> BRAGGING RIGHT</span></div><div class="keyboard-note"><kbd>A</kbd><kbd>D</kbd><span>MOVE &nbsp;</span><kbd>SPACE</kbd><span>JUMP &nbsp; · &nbsp; DESKTOP ONLY</span></div></footer></main>`;
}
function roomCode() { return `<div class="room-badge"><div><small>ROOM CODE</small><strong class="code">${esc(room.code)}</strong></div><button data-action="copy-code" title="Copy room code" aria-label="Copy room code">${icon('copy')}</button></div>`; }
function renderRoom(force=false) {
  if (!room) return;
  const key = `${role}-${room.status}`;
  if (key !== screenKey || force) {
    screenKey=key; screen=role; rosterKey=scoreKey=questionKey='';
    if (room.status==='ended') renderResults(); else if (role==='host') renderHost(); else renderPlayer();
  }
  updateMusicScene();
  updateConnection();
  if (room.status==='ended') { updateResults(); updateAnnouncement();syncPlayerQuiz();syncPlayerChest();return; }
  updateQuestion(); updateAnnouncement();
  if (role==='host') updateHost(); else updatePlayer();
  syncPlayerQuiz();
  syncPlayerChest();
}
function shellTop(title,subtitle,actions='') {
  return `${header(`<span class="connection"><i class="dot"></i>Connected</span>${roomCode()}`)}<div id="connection-banner" class="disconnected-banner" hidden></div><main class="workspace"><div class="workspace-header"><div><div class="eyebrow"><i class="dot"></i>${room.status==='running'?'THE RACE IS ON':'GOOD COMPANY. BAD DECISIONS.'}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="toolbar">${actions}</div></div>`;
}
function worldControlsMarkup(){
  return `<div class="world-controls" hidden><button class="world-choice" data-vote="0" aria-label="Choice 1"></button><button class="world-choice" data-vote="1" aria-label="Choice 2"></button><button class="world-dismiss" data-action="skip-question" aria-label="Skip question" hidden></button><p class="world-status sr-only" aria-live="polite"></p></div>`;
}
function worldScreenMarkup(id,label,{width=960,height=540,controls=true}={}){
  return `<div class="world-screen"><canvas id="${id}" class="game-canvas ${id==='podium-canvas'?'podium-canvas':''}" width="${width}" height="${height}" tabindex="0" aria-label="${label}"></canvas>${controls?worldControlsMarkup():''}</div>`;
}
function wrapWorldCanvas(canvas){
  if(!canvas||canvas.parentElement.classList.contains('world-screen'))return;
  const viewport=document.createElement('div');viewport.className='world-screen';canvas.replaceWith(viewport);viewport.append(canvas);viewport.insertAdjacentHTML('beforeend',worldControlsMarkup());
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
  const model=renderWorldUI(canvas,room,{now,viewerId,isHost});syncWorldControls(canvas,model);return model;
}
function drawPlayerPowers(canvas,player,{now=Date.now()+clockOffset,time=0,isHost=role==='host'}={}) {
  const model=renderPowerUI(canvas,player,{now,time,isHost,running:room?.status==='running'});
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
  const status=$('span',controls),text=`${model.heading}. ${model.detail}${model.effects.length?'. Active effects: '+model.effects.map(e=>e.name).join(', '):''}`;
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
function renderHost() {
  const running=room.status==='running';
  app.innerHTML = `${shellTop('The control room.',running?'Every adventure. Every questionable jump. All live.':'Gather the team, break the ice, then let the chaos begin.',`${running?'<span class="pill lime"><i class="dot"></i> LIVE ROUND</span>':`<button class="button ghost small" data-action="settings">${icon('settings')} Game settings</button>`}<button class="button ${running?'danger':'primary'}" data-action="${running?'end-confirm':'start'}">${icon(running?'stop':'play')}${running?'End round':'Start the race'}</button>`)}
  <div class="session-strip"><div class="session-stat"><div class="stat-label">${running?'TIME REMAINING':'ROUND DURATION'}</div><div class="stat-value lime" id="host-timer">${clock(room.settings.durationMinutes*60000)}</div></div><div class="session-stat"><div class="stat-label">PLAYERS CONNECTED</div><div class="stat-value" id="host-player-count">0 <em>/ 25</em></div></div><div class="session-stat"><div class="stat-label">${running?'TOTAL RESPAWNS':'READY TO EXPLORE'}</div><div class="stat-value" id="host-death-count">0 <em>${running?'second chances':'spawned in lobby'}</em></div></div><div class="session-stat"><div class="stat-label">${running?'FINISHED ALL WORLDS':'SCORING'}</div><div class="stat-value" id="host-finish-count">${running?'0':room.settings.coinPoints} <em>${running?'runners':'pts / coin'}</em></div></div></div>
  <div class="host-layout"><section><div class="live-section-head"><h2>${running?'Live adventures':'Lobby lookout'} <span class="pill lime" style="margin-left:8px">LIVE FEEDS</span></h2><small>Click a player to watch closer ${icon('expand')}</small></div><div id="feed-grid" class="feed-grid"></div></section><aside class="aside-stack host-aside"><section class="panel"><div class="panel-head"><h2>${running?'The leaderboard':'The guest list'}</h2><small id="leader-count">0 PLAYERS</small></div><div id="leaderboard" class="leaderboard"></div></section><section class="panel" id="host-question-panel"><div class="panel-head"><h2>Break the ice</h2><span class="pill">15s / VOTE</span></div><div id="host-questions" class="host-questions"></div></section><p class="host-note">${running?'Scores include banked points and the current attempt. Each player has a separate world with the same layout.':'Share the room code or copy an invite link. Players can explore the lobby while you get everyone together.'}</p><button class="button ghost wide small" data-action="copy-link">${icon('copy')} Copy invite link</button></aside></div></main>`;
  $('#feed-grid').parentElement.insertAdjacentHTML('afterbegin',`<section class="game-shell broadcast-stage"><div class="game-topbar"><span>WORLD BROADCAST</span><span class="pill lime">INSIDE EVERY PLAYER'S WORLD</span><button class="link-button" data-action="fullscreen" aria-label="Full screen world broadcast">${icon('expand')}</button></div>${worldScreenMarkup('host-world-canvas','Live world broadcast stage')}</section>`);
}
function renderPlayer() {
  app.innerHTML = `${shellTop(room.status==='running'?'Run. Collect. Question everything.':'Your adventure starts here.',room.status==='running'?'Coins are good. The floor is negotiable.':'Pick your character, find your color, and take a practice jump.')}
  <div class="player-layout"><section><div class="game-shell"><div class="game-topbar"><span class="level-label" id="level-label">LOBBY / THE WAITING WOODS</span><span class="pill lime" id="player-timer">WAITING FOR HOST</span></div><canvas id="game-canvas" class="game-canvas" width="960" height="540" tabindex="0" aria-label="Your game. A and D or arrow keys to move, Space, W, or up arrow to jump."></canvas><div class="game-bottom"><div class="keyboard-note"><kbd>A</kbd><kbd>D</kbd><span>MOVE &nbsp;</span><kbd>SPACE</kbd><span>JUMP &nbsp;</span><kbd>F</kbd><span>USE POWER</span></div><div class="progress-dots" id="world-dots"><i></i><i></i><i></i></div><button class="link-button" data-action="fullscreen" title="Full screen game" aria-label="Full screen game">${icon('expand')}</button></div><div id="spawn-overlay" class="spawn-overlay"><div><div class="eyebrow">PLAYER SELECT</div><h2>Make a little trouble.</h2><p>Choose your character and color, then spawn into ${room.status==='running'?'the race. The clock is already running!':'the lobby. Your host will start the race.'}</p><button class="button primary" data-action="spawn">${icon('play')} ${room.status==='running'?'Enter the race':'Spawn into the lobby'}</button></div></div><div id="finish-overlay" class="finish-overlay" hidden><div><div class="trophy">🏁</div><h2>YOU MADE IT OUT.</h2><p>All three worlds cleared. Your points are safe.<br>Catch your breath while everyone else catches up.</p></div></div><div id="death-caption" class="death-caption" hidden></div></div>
  <div class="player-stats"><div class="mini-stat"><div class="stat-label">TOTAL SCORE</div><div class="stat-value lime" id="my-score">0</div></div><div class="mini-stat"><div class="stat-label">LEVELS BANKED</div><div class="stat-value" id="my-banked">0</div></div><div class="mini-stat"><div class="stat-label">CURRENT WORLD</div><div class="stat-value" id="my-current">0</div></div></div><div class="game-under-note"><span id="game-note">The lobby is a safe place to practice.</span><span id="scoring-note">${room.settings.coinPoints} PTS / COIN · ${room.settings.distancePoints} PT / TILE</span></div></section>
  <aside class="aside-stack"><section class="panel" id="profile-section"></section><section class="panel"><div class="panel-head"><h2>How to stay in one piece</h2></div><div class="instructions"><div class="instruction-line"><span>Move left / right</span><span><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></span></div><div class="instruction-line"><span>Jump</span><span><kbd>SPACE</kbd> / <kbd>W</kbd> / <kbd>↑</kbd></span></div></div><div class="rule-note">Collect coins. Go farther. <b>Clearing a world banks your points.</b> Flags at 25%, 50%, and 75% save your score and coins. Death loses progress since that flag. Respawn there after <b>3 seconds</b>, or at the world start if you haven't reached it.<br><br>Three power chests per world. Hold one power at a time; at the next chest, <b>Attack</b> with the current power or <b>Replace</b> it. Press <b>F</b> or <b>USE</b> to answer a question and challenge <b>everyone else</b>. Up to three uses per world. Unused powers and opened chests survive deaths. One power turn runs across the room at a time; other uses queue. Wrong attackers hit themselves; correct defenders block. Wrong or missing defense answers are affected. Answers ignore case.<br><br>Power: <b>${room.settings.powerDurationSeconds??5}s</b> · Attack: <b>${room.settings.attackWindowSeconds??10}s</b> · Defend: <b>${room.settings.defendWindowSeconds??10}s</b>. One answer per question.<br><br>Same levels. Separate worlds. A little sabotage.</div></section><section class="panel"><div class="panel-head"><h2>The friendly rivalry</h2><small id="leader-count">LIVE</small></div><div id="leaderboard" class="leaderboard"></div></section></aside></div></main>`;
  wrapWorldCanvas($('#game-canvas'));
  renderProfile();
}
function renderProfile() {
  const me=room.players.find(p=>p.id===you), target=$('#profile-section'); if (!target) return;
  if (me?.spawned) {
    target.innerHTML=`<div class="running-profile"><div class="eyebrow">${room.status==='lobby'?'YOU’RE IN':'YOUR ADVENTURE'}</div><div class="big-name"><i class="player-color" style="background:${esc(me?.color||profile.color)}"></i>${esc(me?.name||profile.name)}</div><p>${room.status==='lobby'?'Practice your jumps. Your host will start the race when everyone is ready.':'Every little bit of progress counts. Every level clear makes it permanent.'}</p><div class="level-progress"><i id="my-progress"></i></div><div class="progress-caption"><span id="my-progress-label">WORLD 0</span><span id="my-deaths">0 RESPAWNS</span></div></div>`;
  } else {
    target.innerHTML=`<div class="profile-panel"><h2>Your tiny alter ego.</h2><p>Big personality. Small hitbox.</p><label class="field"><span class="field-label">PLAYER NAME</span><input id="profile-name" value="${esc(profile.name)}" maxlength="24" aria-label="Player name"></label><div class="field-label">CHOOSE A CHARACTER</div><div class="avatars">${AVATARS.map(a=>`<button class="avatar-button ${profile.avatar===a?'selected':''}" data-avatar="${a}" aria-label="Choose ${a}" aria-pressed="${profile.avatar===a}" title="${a}"><canvas width="80" height="80" data-avatar-canvas="${a}"></canvas></button>`).join('')}</div><div class="field-label">YOUR SIGNATURE COLOR</div><div class="colors">${COLORS.map((c,i)=>`<button class="color-button ${profile.color===c?'selected':''}" style="--swatch:${c}" data-color="${c}" aria-label="Choose color ${['lime','pink','blue','purple','gold','coral'][i]}" aria-pressed="${profile.color===c}"></button>`).join('')}</div><button class="button primary wide" data-action="spawn">${icon('play')} Spawn into lobby</button></div>`;
  }
  if(me?.spawned)$('.running-profile',target).insertAdjacentHTML('beforeend','<p id="checkpoint-status" class="checkpoint-status"></p>');
}
function updateHost() {
  const players=room.players;
  setText('#host-player-count',`${players.filter(p=>p.connected).length} / 25`);
  if(room.status==='running') {
    setHTML('#host-death-count',`${number(players.reduce((n,p)=>n+(p.state?.deaths||0),0))} <em>second chances</em>`);
    setHTML('#host-finish-count',`${players.filter(p=>p.state?.finished).length} <em>/ ${players.length} runners</em>`);
  } else {
    setHTML('#host-death-count',`${players.filter(p=>p.spawned).length} <em>spawned in lobby</em>`);
    setHTML('#host-finish-count',`${room.settings.coinPoints} <em>pts / coin</em>`);
  }
  const key='players:'+players.map(p=>p.id).sort().join('|');
  if(key!==rosterKey) {
    rosterKey=key;
    $('#feed-grid').innerHTML=players.length ? [...players].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<button class="feed-card" data-watch="${p.id}" aria-label="Watch ${esc(p.name)} live"><canvas class="feed-canvas" width="384" height="216" data-feed="${p.id}"></canvas><div class="feed-topline"><span data-feed-level="${p.id}">LOBBY</span><span>${icon('expand')}</span></div><div class="feed-caption"><span class="name" data-feed-name="${p.id}"></span><span class="points" data-feed-score="${p.id}">0 PTS</span></div><div class="feed-meta"><span data-feed-status="${p.id}"></span><span data-feed-deaths="${p.id}"></span></div></button>`).join('') : `<div class="empty-feed"><div class="pixel-prompt">☕</div><h3>Waiting for the usual suspects.</h3><p>Share <b style="color:var(--lime)">${esc(room.code)}</b> with your team. Their live adventures will appear here as they join.</p><button class="button small ghost" style="margin-top:18px" data-action="copy-link">${icon('copy')} Copy invite link</button></div>`;
  }
  for(const p of players) {
    setHTML(`[data-feed-name="${p.id}"]`,`<i class="player-color" style="background:${esc(p.color)}"></i>${esc(p.name)}`);
    setText(`[data-feed-score="${p.id}"]`,`${number(p.score)} PTS`);
    setText(`[data-feed-level="${p.id}"]`,p.state?.finished?'ALL WORLDS CLEARED':p.state?.level?`0${p.state.level} / ${levelNames[p.state.level]}`:'LOBBY');
    setText(`[data-feed-status="${p.id}"]`,!p.connected?'Disconnected':!p.spawned?'Choosing character':p.state?.respawnRemaining>0?(p.state.checkpoint?'Respawning at checkpoint…':'Respawning…'):p.state?.finished?'Taking a well-earned break':room.status==='lobby'?'Exploring the lobby':p.state?.checkpoint?'Checkpoint saved · on the move':'On the move');
    setText(`[data-feed-deaths="${p.id}"]`,`${p.state?.deaths||0} DEATHS`);
  }
  updateLeaderboard();
  const qKey=JSON.stringify(room.settings.questions)+room.status;
  const qPanel=$('#host-questions');
  if(qPanel.dataset.key!==qKey) {
    qPanel.dataset.key=qKey;
    qPanel.innerHTML=room.status==='running'?'<p class="leader-empty">Icebreakers are for the lobby.<br>Right now, the floor is asking the questions.</p>':room.settings.questions.length ? room.settings.questions.map((q,i)=>`<div class="question-item"><div><small>QUESTION 0${i+1}</small>${esc(q.prompt)}</div><button class="button small ghost" data-launch="${i}">Launch ${icon('play')}</button></div>`).join('') : `<p class="leader-empty" style="padding:7px 2px 15px">A quick question before a questionable adventure. Add up to five in game settings.</p><button class="button ghost small wide" data-action="settings">${icon('plus')} Add icebreakers</button>`;
  }
}
function updatePlayer() {
  const me=room.players.find(p=>p.id===you); if(!me) return;
  const s=me.state;
  if(!s)return;
  setText('#level-label',!me.spawned?'LOBBY / CHOOSE YOUR CHARACTER':s.level?`0${s.level} / ${levelNames[s.level].toUpperCase()}`:'LOBBY / THE WAITING WOODS');
  const spawnButton=$('#profile-section [data-action="spawn"]');
  if(spawnButton&&room.status==='running')spawnButton.innerHTML=`${icon('play')} Enter the race`;
  setText('#my-score',number(me.score)); setText('#my-banked',number(s.banked)); setText('#my-current',number(Math.max(0,me.score-s.banked)));
  const broadcastVisible=!!room.question||!!room.announcement||countdownSeconds(room,Date.now()+clockOffset)!==null;
  const overlay=$('#spawn-overlay'); if(overlay)overlay.hidden=me.spawned||broadcastVisible;
  const finish=$('#finish-overlay'); if(finish)finish.hidden=!s.finished||broadcastVisible;
    if (me.spawned && !$('.running-profile')) renderProfile();
  const progress=$('#my-progress'); if(progress)progress.style.width=`${Math.min(100,(s.progress||0)*100)}%`;
  setText('#my-progress-label',`WORLD ${s.level} · ${Math.floor((s.progress||0)*100)}%`); setText('#my-deaths',`${s.deaths} RESPAWNS`);
  setText('#checkpoint-status',room.status==='lobby'?'Checkpoints every 25% save your score and coins during the race.':s.checkpoint?`Checkpoint saved at ${Math.round(s.checkpoint.x/LEVELS[s.level].endX*100)}% · ${s.checkpoint.coins} coins and your score protected.`:'Checkpoint ahead · find blue flags at 25%, 50%, and 75%.');
  $('#checkpoint-status')?.classList.toggle('saved',!!s.checkpoint);
  setText('#game-note',room.status==='lobby'?'The lobby is a safe place to practice.':s.finished?'Your score is banked. Waiting for the final results.':`${s.coins} COINS · ${s.checkpoint?'CHECKPOINT SAVED':'CHECKPOINT AHEAD'} · Reach the exit to bank this world.`);
  const dots=$$('#world-dots i'); dots.forEach((el,i)=>el.classList.toggle('done',s.finished||s.level>i+1));
  updateLeaderboard();
}
function updateLeaderboard() {
  const node=$('#leaderboard'); if(!node)return;
  const key=JSON.stringify(room.players.map(p=>[p.id,p.name,p.score,p.connected,p.spawned,p.finishTime,p.state?.level||p.summary?.level,p.state?.deaths||p.summary?.deaths]));
  if(key===scoreKey)return; scoreKey=key;
  setText('#leader-count',`${room.players.length} PLAYERS`);
  node.innerHTML=room.players.length?room.players.map((p,i)=>{
    const level=p.state?.level??p.summary?.level;
    const status=!p.connected?'DISCONNECTED':room.status==='lobby'?(p.spawned?'IN THE LOBBY':'PICKING A CHARACTER'):p.finishTime!=null?`CLEARED IN ${elapsed(p.finishTime)}`:level?`WORLD ${level}`:'RACING';
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
  app.innerHTML=`${header(`${roomCode()}<span class="pill lime">ROUND COMPLETE</span>`)}
    <div id="connection-banner" class="disconnected-banner" hidden></div><main class="workspace podium-workspace">
    <div class="workspace-header"><div><div class="eyebrow">${icon('trophy')} TELEPORT COMPLETE</div><h1>Welcome to the podium world.</h1><p>Everyone’s here. Final points include your current world. Time breaks equal scores.</p></div><span id="podium-rank-label" class="pill lime">FINAL RANKS</span></div>
    <section class="game-shell podium-world"><div class="game-topbar"><span>04 / THE PODIUM WORLD</span><span>FINAL SCORES LOCKED</span></div>
    ${worldScreenMarkup('podium-canvas','Podium world with every player standing in final rank order',{width:1200,height:720,controls:false})}
    <div class="game-bottom"><span id="podium-status" aria-live="polite">Your team’s final rankings.</span><button class="link-button" data-action="fullscreen" aria-label="Full screen podium">${icon('expand')}</button></div></section>
    <div class="results-actions">${role==='host'?`<button class="button ghost" data-action="export">${icon('download')} Download results</button><button class="button primary" data-action="reset">Back to the lobby ${icon('arrow')}</button>`:`<button class="button ghost" data-action="home">${icon('home')} Back to home</button>`}</div>
    <details class="podium-details panel"><summary>Full rankings and finish times</summary><table class="result-table"><thead><tr><th>RANK</th><th>PLAYER</th><th>SCORE</th><th>FINISH TIME</th></tr></thead><tbody id="result-rows"></tbody></table></details>
    ${role!=='host'?'<p class="host-status-note">Your host can bring everyone back to the lobby for another round.</p>':''}</main>`;
}
function updateResults() {
  const results=room.results||room.players;
  const key=JSON.stringify(results);if(key===scoreKey)return;scoreKey=key;
  const me=results.find(p=>p.id===you);
  setText('#podium-rank-label',role==='host'?`${results.length} FINAL RANKS`:me?`YOUR PLACE #${me.rank} / ${number(me.score)} PTS`:'PODIUM SPECTATOR');
  setText('#podium-status',me?`${me.name}, you finished #${me.rank} with ${number(me.score)} points.`:role==='host'?`${results.length} players ranked. The highest score wins.`:'The round is over. You’re watching the final podium.');
  $('#result-rows').innerHTML=results.map(p=>`<tr class="${p.id===you?'me':''}"><td class="mono">${String(p.rank).padStart(2,'0')}</td><td><i class="player-color" style="background:${esc(p.color)}"></i>${esc(p.name)}${p.id===you?' · you':''}</td><td class="result-points">${number(p.score)}</td><td class="muted mono">${elapsed(p.finishTime)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">No players joined this round.</td></tr>';
}
function setText(selector,value) { const el=$(selector);if(el&&el.textContent!==String(value))el.textContent=value; }
function setHTML(selector,value) { const el=$(selector);if(el&&el.innerHTML!==value)el.innerHTML=value; }

function openModal(title,body,footer='',className='') {
  zeroInput(); watchedPlayer=null;modal.className=className;
  modal.innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="button square ghost" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-content">${body}</div>${footer?`<div class="modal-footer">${footer}</div>`:''}`;
  if(!modal.open)modal.showModal();
}
function closeModal() { watchedPlayer=null;modal.close();updateMusicScene(); }
function showHelp() {
  openModal('A field guide to questionable decisions.',`
    <div class="help-block"><h3>01 / LEARN THE MOVES</h3><p>Use <kbd>A</kbd> / <kbd>D</kbd> or <kbd>←</kbd> / <kbd>→</kbd> to move. Jump with <kbd>SPACE</kbd>, <kbd>W</kbd>, or <kbd>↑</kbd>. Explore the lobby before your host starts the round. This game is made for a desktop keyboard.</p></div>
    <div class="help-block"><h3>02 / MAKE IT COUNT</h3><p>Coins and distance add to your score. Each world has blue checkpoint flags at 25%, 50%, and 75%. Pass each new flag to save your location, score, and collected coins. Reached flags stay gold, and only a later flag replaces your save. Death restores that saved state after 3 seconds and loses only what you gained afterward. Before the checkpoint, death resets the current world’s points and sends you to its start. Reach the exit to bank the full world score. There are unlimited respawns.</p></div>
    <div class="help-block"><h3>03 / TRUST YOUR INSTINCTS. MAYBE.</h3><p>Moving platforms move. Vanishing platforms vanish. Enemies, spikes, and some very innocent-looking objects are lethal. Watch what’s revealed when you die. Critters chase only when you stand on their platform; some shoot. Each world has three real power chests, just after the checkpoints; other chests can be decoys. Hold one power at a time. At another chest, choose Attack with your current power or Replace it with the new one. You can use up to three chest powers per world.</p><p>Press <kbd>F</kbd> or USE to answer a general-knowledge question and attack everyone else. You have ${room?.settings.attackWindowSeconds??10} seconds and one attempt; a wrong or unanswered attack hits you. After a correct attack, everyone else gets ${room?.settings.defendWindowSeconds??10} seconds and one attempt to defend. Correct defenders block; wrong or missing answers are affected. Answers ignore case. The slow, reverse, slippery, or dark ink effect and its broadcast last ${room?.settings.powerDurationSeconds??5} seconds after defenses resolve. Unused powers survive death; opened chests stay spent. Power turns run one at a time across the room in request order. Every player gets the same layout and their own run.</p></div>
    <div class="help-block"><h3>04 / EARN THE BRAGGING RIGHTS</h3><p>The highest score wins, with the fastest full completion breaking ties. When the timer ends, banked points and your current points count. Late arrivals use the remaining room time. Refreshing resets your game, including checkpoints; rejoin with the same name to replace your disconnected entry.</p></div>`);
}
function showSettings() {
  if(role!=='host'||room.status!=='lobby')return;
  const s=room.settings; const strengthMarkup=`<div class="settings-section-heading"><span>Power strength</span></div><div class="settings-fields"><label class="field"><span class="field-label">STICKY SPEED / % NORMAL</span><input name="slowSpeedPercent" type="number" min="10" max="90" step="1" value="${s.slowSpeedPercent??55}" required></label><label class="field"><span class="field-label">WRONG WAY SPEED / % NORMAL</span><input name="reverseSpeedPercent" type="number" min="50" max="200" step="1" value="${s.reverseSpeedPercent??100}" required></label><label class="field"><span class="field-label">ICE SPEED / % NORMAL</span><input name="slipperySpeedPercent" type="number" min="110" max="250" step="1" value="${s.slipperySpeedPercent??170}" required></label><label class="field"><span class="field-label">ICE GRIP / % NORMAL BRAKING</span><input name="slipperyGripPercent" type="number" min="2" max="50" step="1" value="${s.slipperyGripPercent??12}" required></label><label class="field"><span class="field-label">INK DARKNESS / %</span><input name="inkDarknessPercent" type="number" min="0" max="95" step="1" value="${s.inkDarknessPercent??75}" required></label></div><p class="settings-help">Speed is relative to normal movement. Ice Skates are faster and have reduced grip, so momentum carries farther. Ink Darkness is the fog darkening percentage.</p>`;
  openModal('A little order before the chaos.',`<form id="settings-form"><div class="settings-fields"><label class="field"><span class="field-label">ROUND MINUTES</span><input name="durationMinutes" type="number" min="1" max="60" step="1" value="${s.durationMinutes}" required></label><label class="field"><span class="field-label">POINTS / COIN</span><input name="coinPoints" type="number" min="0" max="1000" step="1" value="${s.coinPoints}" required></label><label class="field"><span class="field-label">POINTS / TILE</span><input name="distancePoints" type="number" min="0" max="1000" step="1" value="${s.distancePoints}" required></label></div><p class="settings-help">Distance uses the farthest point reached in the current attempt, in 32-pixel tiles. Completing a world banks its coins and distance. A 10-minute round is a good starting point; you can set 1–60 minutes.</p><div class="settings-section-heading"><span>Power challenges</span></div><div class="settings-fields"><label class="field"><span class="field-label">POWER DURATION / SEC</span><input name="powerDurationSeconds" type="number" min="1" max="60" step="1" value="${s.powerDurationSeconds??5}" required></label><label class="field"><span class="field-label">ATTACK WINDOW / SEC</span><input name="attackWindowSeconds" type="number" min="1" max="60" step="1" value="${s.attackWindowSeconds??10}" required></label><label class="field"><span class="field-label">DEFEND WINDOW / SEC</span><input name="defendWindowSeconds" type="number" min="1" max="60" step="1" value="${s.defendWindowSeconds??10}" required></label></div><p class="settings-help">Each setting accepts 1–60 seconds. A correct attack challenges everyone else. Correct defenders block the power; wrong or missing answers are affected. The effect and its broadcast last for the configured power duration after defenses resolve.</p>${strengthMarkup}<div class="settings-section-heading"><span>Lobby icebreakers</span><button type="button" class="button small ghost" data-action="add-question">${icon('plus')} Add question</button></div><div id="question-editors">${s.questions.map((q,i)=>questionEditor(q,i)).join('')}</div><p class="settings-help">Up to 5 questions, with 2 choices each. Launch them manually from your dashboard. Named votes are visible live and close automatically after 15 seconds.</p></form>`,`<button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="settings-form">Save settings ${icon('check')}</button>`);
}
function questionEditor(q={prompt:'',choices:['','']},i=0) { return `<div class="question-editor"><div class="question-editor-top"><span>QUESTION <span class="question-index">${i+1}</span></span><button class="link-button" type="button" data-action="remove-question" aria-label="Remove question">${icon('trash')}</button></div><label class="field"><span class="sr-only">Question</span><input data-q-prompt maxlength="240" placeholder="Pineapple on pizza?" value="${esc(q.prompt)}" required></label><div class="field-row"><label class="field"><span class="sr-only">Choice A</span><input data-q-a maxlength="100" placeholder="Absolutely" value="${esc(q.choices[0])}" required></label><label class="field"><span class="sr-only">Choice B</span><input data-q-b maxlength="100" placeholder="Absolutely not" value="${esc(q.choices[1])}" required></label></div></div>`; }
function watch(id) { const p=room.players.find(p=>p.id===id); if(!p)return;openModal(`${esc(p.name)}’s adventure.`,`<canvas id="watch-canvas" width="960" height="540" aria-label="Live gameplay view"></canvas>`,`<span class="muted" style="font-size:12px" id="watch-score"></span><button class="button ghost small" data-action="close-modal">Back to all players</button>`,'watch-dialog');watchedPlayer=id;wrapWorldCanvas($('#watch-canvas'));updateQuestion();updateMusicScene(); }
async function copy(value,message) { try { await navigator.clipboard.writeText(value);toast(message); } catch { openModal('Copy this to your team.',`<label class="field"><input value="${esc(value)}" readonly onclick="this.select()" aria-label="Invitation"></label>`); } }
function zeroInput() { input={left:false,right:false,jump:false};send('input',input); }
function useHeldPower() { const me=room?.players.find(p=>p.id===you);if(!runtimeError&&!me?.power?.queued&&!me?.power?.testing&&(!me?.powerQuiz||me.powerQuiz.answered)){const offer=me?.powerOffer;if(offer?.canAttack)send('powerChestChoice',{offerId:offer.id,itemId:offer.itemId,choice:'attack'});else send('usePower');} }
function sceneForLevel(level){return ['lobby','forest','ocean','hell'][level]||'lobby';}
function hostWorldPlayer(){return room?.players.find(p=>p.id===watchedPlayer)||room?.players.find(p=>p.spawned&&p.connected)||room?.players[0];}
function currentEffectScene(){
  if(!room||room.status==='lobby')return 'lobby';
  if(room.status==='ended')return 'results';
  const player=role==='host'?hostWorldPlayer():room.players.find(p=>p.id===you);
  return sceneForLevel(player?.spawned?player.state?.level:0);
}
function playTone(kind,scene=currentEffectScene()) { audio.playEffect(kind,scene); }
function updateMusicScene() {
  if(screen==='entry'||!room){audio.setScene('lobby');return;}
  if(room.status==='ended'){audio.setScene('results');return;}
  const player=role==='host'?hostWorldPlayer():room.players.find(p=>p.id===you);
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

document.addEventListener('submit',async e=>{
  if(e.target.id==='join-form'){
    e.preventDefault();if(pending)return;pending=true;$('.entry-submit').disabled=true;
    profile.name=$('#player-name').value.trim();persistProfile();
    try{await connect();send('join',{code:$('#room-code').value.trim().toUpperCase(),...profile});}catch(err){pending=false;$('.entry-submit').disabled=false;toast(err.message,true);}
  }
  if(e.target.id==='settings-form'){
    e.preventDefault();const f=e.target;
    const settings={durationMinutes:Number(f.elements.durationMinutes.value),coinPoints:Number(f.elements.coinPoints.value),distancePoints:Number(f.elements.distancePoints.value),powerDurationSeconds:Number(f.elements.powerDurationSeconds.value),attackWindowSeconds:Number(f.elements.attackWindowSeconds.value),defendWindowSeconds:Number(f.elements.defendWindowSeconds.value),slowSpeedPercent:Number(f.elements.slowSpeedPercent.value),reverseSpeedPercent:Number(f.elements.reverseSpeedPercent.value),slipperySpeedPercent:Number(f.elements.slipperySpeedPercent.value),slipperyGripPercent:Number(f.elements.slipperyGripPercent.value),inkDarknessPercent:Number(f.elements.inkDarknessPercent.value),questions:$$('.question-editor',f).map(el=>({prompt:$('[data-q-prompt]',el).value.trim(),choices:[$('[data-q-a]',el).value.trim(),$('[data-q-b]',el).value.trim()]}))};
    send('settings',{settings});closeModal();toast('Game settings saved.');
  }
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.avatar){profile.avatar=b.dataset.avatar;persistProfile();send('profile',profile);renderProfile();return;}
  if(b.dataset.color){profile.color=b.dataset.color;persistProfile();send('profile',profile);renderProfile();return;}
  if(b.dataset.watch){watch(b.dataset.watch);return;}
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
    b.innerHTML=icon(audio.enabled?'volume':'mute');
    b.setAttribute('aria-pressed',String(audio.enabled));
    const label=`${audio.enabled?'Mute':'Enable'} music and sound effects`;
    b.setAttribute('aria-label',label);b.title=label;
    if(audio.enabled)void audio.unlock();
  }
  if(action==='spawn'){
    const name=$('#profile-name');if(name){profile.name=name.value.trim()||profile.name;persistProfile();send('profile',profile);}
    send('spawn');zeroInput();$('#game-canvas')?.focus({preventScroll:true});
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
document.addEventListener('change',e=>{if(e.target.id==='profile-name'){profile.name=e.target.value.trim()||profile.name;persistProfile();send('profile',profile);}});
const keyMap={a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right',w:'jump',ArrowUp:'jump',' ':'jump'};
function keyboard(e,pressed){
  const quiz=room?.players.find(p=>p.id===you)?.powerQuiz;
  if(role==='player'&&quiz&&!quiz.answered){if(!e.target.closest('input,textarea,select,button')&&(keyMap[e.key]||keyMap[e.key.toLowerCase()])){e.preventDefault();if(pressed)syncPlayerQuiz({focus:true});}return;}
  if(pressed&&role==='player'&&room?.question&&!room.question.closed&&!modal.open&&!e.target.closest('input,textarea,select')&&(e.key==='1'||e.key==='2')){e.preventDefault();send('vote',{choice:Number(e.key)-1});return;}
  if(e.target.closest('.world-controls button,.power-controls button,.power-chest-controls button')&&(e.key===' '||e.key==='Enter'))return;
  if(pressed&&!e.repeat&&e.key.toLowerCase()==='f'&&role==='player'&&room?.status==='running'&&!modal.open&&!runtimeError&&!e.target.closest('input,textarea,select')){e.preventDefault();useHeldPower();return;}
  const k=keyMap[e.key]||keyMap[e.key.toLowerCase()];if(!k)return;
  if(role!=='player'||!room||room.status==='ended'||modal.open||runtimeError||e.target.closest('input,textarea,select'))return;
  if(!room.players.find(p=>p.id===you)?.spawned)return;
  e.preventDefault();if(input[k]===pressed)return;
  if(k==='jump'&&pressed&&predicted&&!predicted.respawnRemaining&&!predicted.finished&&(predicted.grounded||predicted.coyote>0))playTone('jump');
  input[k]=pressed;send('input',input);
}
document.addEventListener('keydown',e=>keyboard(e,true));document.addEventListener('keyup',e=>keyboard(e,false));
window.addEventListener('blur',zeroInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)zeroInput();audio.setHidden(document.hidden);if(!document.hidden)syncPlayerQuiz({focus:true});});
window.addEventListener('pagehide',event=>{if(role==='player'&&room?.status!=='ended')send('leave');audio.setHidden(true);if(!event.persisted)audio.dispose();});
window.addEventListener('pageshow',()=>{audio.setHidden(document.hidden);syncPlayerQuiz({focus:true});});
window.addEventListener('resize',()=>{syncPlayerQuiz();syncPlayerChest();});
document.addEventListener('fullscreenchange',()=>{syncPlayerQuiz();syncPlayerChest();});
setInterval(()=>{syncPlayerQuiz();syncPlayerChest();},100);
audio.setHidden(document.hidden);
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
modal.addEventListener('close',()=>{watchedPlayer=null;updateMusicScene();});
setInterval(()=>{if(role==='player'&&connected&&room?.status!=='ended'&&!runtimeError)send('input',input);},50);

// Avatar selection uses the same production atlas as the game.
const atlas=new Image();atlas.src='/assets/sprites.png';
function drawAvatarSelections(){if(!atlas.complete||!atlas.naturalWidth)return;$$('[data-avatar-canvas]').forEach(canvas=>drawAvatar(canvas,canvas.dataset.avatarCanvas,profile.color));}
let previousTime=performance.now(),lastHostDraw=0,lastUiDraw=0;
function frame(time){
  requestAnimationFrame(frame);const dt=Math.min((time-previousTime)/1000,.035);previousTime=time;
  if(document.hidden)return;
  const t=time/1000,now=Date.now()+clockOffset;
  if(screen==='entry') {const canvas=$('#demo-canvas');if(canvas)renderGame(canvas,demo,{time:t,compact:true});}
  if(room?.status==='ended'){
    const canvas=$('#podium-canvas');if(canvas){renderPodium(canvas,room.results||room.players,{time:t,viewerId:you,arrivalAge:(time-podiumArrivedAt)/1000});renderWorldUI(canvas,room,{now,viewerId:you,isHost:role==='host'});}
  }
  if(role==='player'&&room?.status!=='ended'){
    const me=room?.players.find(p=>p.id===you),canvas=$('#game-canvas');
    if(predicted&&me?.spawned&&connected&&!modal.open&&!runtimeError&&(room.status!=='running'||now<room.endsAt))step(predicted,input,dt,{...room.settings,powerEffects:activePowerEffects(me,now)});
    if(canvas){const visual=me?.spawned?checkpointRenderState(predicted,me.state):createState(profile);renderGame(canvas,visual,{time:t,compact:true,powerChestClaims:me?.powerChestClaims||[],showInstructions:room.status==='lobby'||!me?.spawned});drawPlayerPowers(canvas,me,{now,time:t});drawWorldBroadcasts(canvas,{now});drawPlayerQuiz(canvas,me,{now});}
    const state=lastAuthoritative,death=$('#death-caption');
    if(death&&state){const remain=state.respawnRemaining||0;death.hidden=remain<=0||!!me?.powerQuiz;if(remain>0)death.innerHTML=`<strong>WELL, THAT HAPPENED.</strong><p>${esc(state.deathCause?.label||'A surprise encounter with danger.')}</p><small>RESPAWNING IN ${Math.max(1,Math.ceil(remain))}s · ${state.checkpoint?'BACK TO YOUR CHECKPOINT · SAVED SCORE & COINS RESTORED':'BACK TO THE WORLD START · LEVELS BANKED ARE SAFE'}</small>`;}
    drawAvatarSelections();
  }
  if(role==='host'&&room?.status!=='ended'&&time-lastHostDraw>120){
    lastHostDraw=time;
    const stage=$('#host-world-canvas'),mainPlayer=hostWorldPlayer();
    if(stage){renderGame(stage,mainPlayer?.state||createState(),{time:t,compact:true,powerChestClaims:mainPlayer?.powerChestClaims||[]});drawPlayerPowers(stage,mainPlayer,{now,time:t});drawWorldBroadcasts(stage,{now});drawPlayerQuiz(stage,mainPlayer,{now});}
    for(const canvas of $$('[data-feed]')){
      const p=room?.players.find(p=>p.id===canvas.dataset.feed);
      if(p?.state){renderGame(canvas,p.state,{time:t,compact:true,powerChestClaims:p.powerChestClaims||[],showInstructions:room.status==='lobby'});drawPlayerPowers(canvas,p,{now,time:t});renderWorldUI(canvas,room,{now,viewerId:p.id,isHost:true});drawPlayerQuiz(canvas,p,{now});}
    }
    if(watchedPlayer){const p=room?.players.find(p=>p.id===watchedPlayer),canvas=$('#watch-canvas');if(p?.state&&canvas){renderGame(canvas,p.state,{time:t,compact:true,powerChestClaims:p.powerChestClaims||[],showInstructions:room.status==='lobby'});drawPlayerPowers(canvas,p,{now,time:t});drawWorldBroadcasts(canvas,{now,viewerId:p.id});drawPlayerQuiz(canvas,p,{now});setText('#watch-score',`${number(p.score)} points · ${p.state.deaths} deaths · ${p.connected?'Live':'Disconnected'}`);}}
  }
  if(time-lastUiDraw>100){lastUiDraw=time;
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
