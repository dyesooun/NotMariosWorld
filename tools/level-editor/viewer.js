import {parseDocument} from './document.js';
import {readStored} from './storage.js';
import {PlaytestRuntime} from './playtest-runtime.js';
import {LevelRenderer,loadImages} from './level-renderer.js';
import {shapePolygons} from './runtime-geometry.js';

const $=selector=>document.querySelector(selector),canvas=$('#levelCanvas');
const SAMPLE='/assets/sprites/forest/tileset/WhimsicalForest.json';
let runtime=null,renderer=null,playing=true,cameraMode='follow',lastFrame=0,loadSequence=0,drag=null,pickingSpawn=false,sourceLabel='',baseMessage='';
const held=new Set();
function message(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error);}
function clearInput(){held.clear();}
function syncSpawn(){if(!runtime)return;const p=runtime.spawn||runtime.player;$('#spawnX').value=p.x;$('#spawnY').value=p.y;}
function refreshControls(){for(const id of ['playBtn','resetBtn','followBtn','fitBtn','setSpawn','pickSpawn','godMode'])$(`#${id}`).disabled=!runtime;$('#playBtn').textContent=playing?'Pause':'Resume';$('#followBtn').classList.toggle('active',cameraMode==='follow');$('#fitBtn').classList.toggle('active',cameraMode==='fit');$('#pickSpawn').classList.toggle('active',pickingSpawn);}
async function install(text,label){
  const sequence=++loadSequence;message(`Loading ${label}…`);clearInput();
  try{
    const doc=parseDocument(text),candidate=new PlaytestRuntime(doc,{godMode:$('#godMode').checked});
    // Preflight every collision channel before replacing the current scene.
    for(const {state}of candidate.getStates())for(const channel of ['solid','hazard','interaction','vanish'])shapePolygons({...state,vanished:false,beamOn:true,damageActive:true},channel);
    const images=await loadImages(doc.assets);if(sequence!==loadSequence)return;
    runtime=candidate;runtime.setGodMode($('#godMode').checked);renderer=new LevelRenderer(canvas,doc,images);playing=true;cameraMode='follow';lastFrame=0;pickingSpawn=false;sourceLabel=label;
    $('#levelName').textContent=doc.name;document.title=`${doc.name} · JSON Level Runner`;syncSpawn();refreshControls();canvas.focus();
    baseMessage=`${doc.placements.length} objects · ${label}. ${(runtime.warnings||[]).join(' ')||'Spawn comes from the chosen asset, tagged markers, legacy world.spawn, or safe solid geometry.'} Spawn X/Y override this viewer session.`;message(baseMessage);
  }catch(error){if(sequence===loadSequence)message(`Level could not be loaded: ${error.message}`,true);}
}
async function loadUrl(value){
  try{const url=new URL(value,location.href);if(url.origin!==location.origin)throw new Error('Use a JSON URL from this local server, or Open JSON for a local file.');$('#levelUrl').value=url.pathname+url.search;const response=await fetch(url);if(!response.ok)throw new Error(`HTTP ${response.status}: ${url.pathname}`);await install(await response.text(),url.pathname);}
  catch(error){message(error.message,true);}
}
$('#levelFile').onchange=async event=>{const file=event.target.files[0];if(file){if(file.size>100*1024*1024)message('Level JSON exceeds 100 MB.',true);else await install(await file.text(),file.name);}event.target.value='';};
$('#sampleBtn').onclick=()=>loadUrl(SAMPLE);$('#loadUrl').onclick=()=>loadUrl($('#levelUrl').value);$('#levelUrl').onkeydown=event=>{if(event.key==='Enter')loadUrl(event.target.value);};
$('#playBtn').onclick=()=>{playing=!playing;clearInput();lastFrame=0;refreshControls();canvas.focus();};
function restart(spawn){if(!runtime)return;runtime.reset(spawn?{spawn}:{});cameraMode='follow';refreshControls();clearInput();lastFrame=0;syncSpawn();message(spawn?`Viewer spawn set to (${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}). ${sourceLabel} is unchanged.`:baseMessage);canvas.focus();}
$('#resetBtn').onclick=()=>restart();
$('#godMode').onchange=()=>{if(!runtime)return;runtime.setGodMode($('#godMode').checked);clearInput();message(runtime.godMode?'God mode ON · hazards and attacks are harmless; falls return to your checkpoint or spawn.':'God mode OFF · normal deaths restored.');canvas.focus();};
$('#setSpawn').onclick=()=>{const x=Number($('#spawnX').value),y=Number($('#spawnY').value);if(!Number.isFinite(x)||!Number.isFinite(y))return message('Spawn coordinates must be finite.',true);try{restart({x,y});}catch(error){message(error.message,true);}};
$('#pickSpawn').onclick=()=>{pickingSpawn=!pickingSpawn;refreshControls();message(pickingSpawn?'Click the canvas to set the player’s top-left spawn point for this viewer session.':baseMessage);};
$('#followBtn').onclick=()=>{cameraMode='follow';refreshControls();canvas.focus();};$('#fitBtn').onclick=()=>{cameraMode='fit';refreshControls();canvas.focus();};$('#colliders').onchange=()=>canvas.focus();
canvas.onpointerdown=event=>{
  if(!renderer)return;canvas.focus();clearInput();
  if(pickingSpawn){const point=renderer.worldPoint(event.clientX,event.clientY);pickingSpawn=false;restart(point);refreshControls();return;}
  canvas.setPointerCapture(event.pointerId);drag={x:event.clientX,y:event.clientY,camera:{...renderer.camera},moved:false};
};
canvas.onpointermove=event=>{if(drag){if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>4){drag.moved=true;cameraMode='free';refreshControls();}if(drag.moved){renderer.camera.x=drag.camera.x-(event.clientX-drag.x)/renderer.camera.zoom;renderer.camera.y=drag.camera.y-(event.clientY-drag.y)/renderer.camera.zoom;}}};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.onwheel=event=>{if(!renderer)return;event.preventDefault();cameraMode='free';refreshControls();renderer.zoomAt(Math.exp(-event.deltaY*.001),event.clientX,event.clientY);};
window.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
  if(['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyW'].includes(event.code)){event.preventDefault();held.add(event.code);if(cameraMode!=='follow'){cameraMode='follow';refreshControls();}}
  if(event.code==='KeyR'&&!event.repeat){event.preventDefault();restart();}
});
window.addEventListener('keyup',event=>held.delete(event.code));window.addEventListener('blur',()=>{clearInput();drag=null;lastFrame=0;});document.addEventListener('visibilitychange',()=>{clearInput();lastFrame=0;});
function frame(now){
  try{
  if(runtime&&renderer){
    if(playing&&!document.hidden&&lastFrame){
      const events=runtime.advance(Math.min(.1,(now-lastFrame)/1000),{left:held.has('ArrowLeft')||held.has('KeyA'),right:held.has('ArrowRight')||held.has('KeyD'),jump:held.has('Space')||held.has('KeyW')||held.has('ArrowUp')})||[];
      for(const event of events)if(event.type==='interaction')message(`${event.name||event.id} · contact reported to the runtime. ${event.kind==='chest'?'Power rewards are handled by the game coordinator.':''}`);
      for(const event of events)if(event.type==='vanish'||event.type==='restore'){const placement=runtime.document.placements.find(p=>p.id===event.id),definition=placement&&runtime.document.definitions[placement.definitionId];message(`${definition?.name||'Platform'} ${event.type==='restore'?'restored':'vanished'}.`);}
      for(const event of events){
        if(event.type==='coin')message(`Coin collected · ${runtime.coins} coin units`);
        if(event.type==='god-mode-return')message('God mode · returned to your checkpoint or spawn without a death.');
        if(event.type==='checkpoint')message(`Checkpoint ${event.order} reached · ${runtime.checkpoint.coins} coin units saved.`);
        if(event.type==='respawn')message(runtime.checkpoint?`Respawned at checkpoint ${runtime.checkpoint.order} · ${runtime.coins} saved coin units restored.`:'Respawned at the start · coin collection reset.');
        if(event.type==='gameplay-contact'&&event.action==='entered'&&event.role==='power-chest')message('Power chest reached. Rewards and inventory are supplied by the core game coordinator.');
        if(event.type==='level-exit')message('Exit reached. Restart to test this level again.');
      }
    }
    if(cameraMode==='follow')renderer.follow(runtime.player);else if(cameraMode==='fit')renderer.fit();
    renderer.draw(runtime,{collisions:$('#colliders').checked});
    $('#stats').textContent=`${runtime.godMode?'GOD MODE · ':''}${(runtime.timeMs/1000).toFixed(2)}s · X ${runtime.player.x.toFixed(0)} · Y ${runtime.player.y.toFixed(0)} · ${runtime.deaths} deaths · Coins ${runtime.coins||0} · Checkpoint ${runtime.checkpoint?.order??'—'}`;
    $('#finishNotice').hidden=!runtime.finished;
    const dead=runtime.deadRemainingMs>0;$('#deathNotice').hidden=!dead;if(dead)$('#deathNotice').textContent=`${runtime.deathCause||'Hazard contact'}\nRespawning in ${(runtime.deadRemainingMs/1000).toFixed(1)}s`;
  }
  }catch(error){playing=false;clearInput();refreshControls();message(`Runtime stopped: ${error.message}`,true);}
  lastFrame=now;requestAnimationFrame(frame);
}
refreshControls();requestAnimationFrame(frame);
const params=new URLSearchParams(location.search);
if(params.get('source')==='draft'){
  try{const draft=await readStored('playtest');if(!draft)throw new Error('No companion snapshot found. Open the companion and choose Playtest.');await install(JSON.stringify(draft),'Companion snapshot');}catch(error){message(error.message,true);}
}else await loadUrl(params.get('level')||SAMPLE);
