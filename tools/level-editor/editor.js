import { createTilesetCatalog } from './catalog.js';
import { createDocument, validateDocument, parseDocument, serializeDocument, createPlacement, clone, History } from './document.js';
import { loadImages, drawPlacement, drawThumbnail, getPreviewState } from './preview.js';
import { placementBounds,containsPlacement,getTransformHandles,hitTestHandles,resizePlacement,rotationForPointer,localToWorld,worldToLocal } from './transforms.js';
import { buildAutomaticManifest,readAtlasPixels } from './auto-tileset.js';
import { mountAssetEditor } from './asset-editor.js';
import { exportAssetLibrary,importAssetLibrary,exportTilesetManifest,deleteAssetDefinition,replaceAtlasImage } from './metadata.js';
import {readStored,writeStored} from './storage.js';
import { detectAtlasCuts,createGridCuts } from './atlas-analysis.js';
import { createCharacterCatalog } from './characters.js';
import { mountSequenceEditor } from './sequence-editor.js';
import {getGroupBounds,transformGroup} from './group-transforms.js';
import {GAMEPLAY_ROLES,resolveGameplay,gameplayTriggerPolygons,setLevelSpawn} from './gameplay.js';
import {renderGameplayControls} from './gameplay-controls.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage'), context = stage.getContext('2d'), STORAGE_KEY = 'nmw-level-editor';
let doc, history, images = new Map(), selectedId = null, selectedDef = null;
const selectedIds=new Set();
let mode = 'select', tab = 'placement', filter = 'all', showGrid = true, showCollisions = false;
let view = { x: -32, y: -32, zoom: 1 }, pointer = null, playing = true, timeMs = 0, lastFrame = 0;
const triggerTimes = new Map(), LIBRARY_REVISION = 2;
const previewStates = new Map();
let editingTrigger = false;
let warnings = [], spaceHeld = false;
let assetEditor,sequenceEditor,importDraft=null,draftImages=null,levelFilter='all',saveSequence=0;
let gameplayFilter='all';
let pendingSave=Promise.resolve();

function element(tag, parent, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  if (parent) parent.append(node);
  return node;
}
function toast(message, bad = false) {
  const node = $('#toast'); node.textContent = message; node.style.borderColor = bad ? '#ff9b91' : 'var(--accent)'; node.style.opacity = 1;
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => { node.style.opacity = 0; }, 6000);
}
function bindValue(input, callback, currentValue) {
  const read = () => input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
  let committed = read();
  const apply = () => { const value = read(); if (Object.is(value, currentValue ? currentValue() : committed)) return; committed = value; callback(value); };
  input.onchange = apply; input.onblur = apply;
  input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } };
}
function field(parent, label, value, onChange, { type = 'text', step = 'any', choices, placeholder } = {}) {
  const wrapper = element('label', parent, null, 'field'); element('span', wrapper, label);
  const input = element(choices ? 'select' : 'input', wrapper); input.setAttribute('aria-label', label);
  if (choices) for (const choice of choices) {
    const [key, name] = Array.isArray(choice) ? choice : [choice, choice]; input.append(new Option(name, key));
  } else { input.type = type; if (type === 'number') input.step = step; }
  if (type === 'checkbox') input.checked = !!value; else input.value = value ?? '';
  if (placeholder) input.placeholder = placeholder;
  bindValue(input, onChange);
  return input;
}
function button(parent, label, callback, className) { const node = element('button', parent, label, className); node.onclick = callback; return node; }
function section(parent, title) { const node = element('div', parent, null, 'section'); element('h4', node, title); return node; }
function selectedPlacement() { return doc.placements.find(p => p.id === selectedId); }
function selectedPlacements(){return doc.placements.filter(p=>selectedIds.has(p.id));}
function selectOnly(id){selectedIds.clear();if(id)selectedIds.add(id);selectedId=id||null;editingTrigger=false;}
function toggleSelection(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);selectedId=selectedIds.has(id)?id:[...selectedIds].at(-1)||null;editingTrigger=false;}
function syncSelection(){const ids=new Set(doc.placements.map(p=>p.id));for(const id of selectedIds)if(!ids.has(id))selectedIds.delete(id);if(!selectedIds.has(selectedId))selectedId=[...selectedIds].at(-1)||null;}
function groupOperation(operation){const placements=selectedPlacements();if(!placements.length)return;const states=placements.map(previewState);change(project=>{for(const update of transformGroup(placements,states,operation))Object.assign(project.placements.find(p=>p.id===update.id),update);});}
function groupCenter(){const bounds=getGroupBounds(selectedPlacements().map(previewState));return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};}
function previewOptions(placement) { let state=previewStates.get(placement.id);if(state?.animation&&!doc.definitions[placement.definitionId]?.visual.animations?.[state.animation]){previewStates.delete(placement.id);state=null;}return {triggeredAtMs:triggerTimes.get(placement.id),animation:state?.animation,animationTimeMs:state?Math.max(0,timeMs-state.startedAtMs):undefined}; }
function previewState(placement) { return getPreviewState(doc,placement,timeMs,previewOptions(placement)); }
function resetPreview() { timeMs=0;triggerTimes.clear();for(const state of previewStates.values())state.startedAtMs=0;lastFrame=0; }
function triggerHandles(state) {
  const r=state.behavior.vanish?.triggerVolume;if(!r)return [];
  return [['nw',r[0],r[1]],['ne',r[0]+r[2],r[1]],['se',r[0]+r[2],r[1]+r[3]],['sw',r[0],r[1]+r[3]],['move',r[0]+r[2]/2,r[1]+r[3]/2]].map(([id,x,y])=>{
    const p=localToWorld(state,{x:x*state.width,y:y*state.height});return {id,type:'trigger',...p,screenX:(p.x-view.x)*view.zoom,screenY:(p.y-view.y)*view.zoom};
  });
}
function save() {
  const sequence=++saveSequence;
  $('#saveStatus').textContent='Saving…';
  try { const project=clone(doc),library=exportAssetLibrary(doc);pendingSave=pendingSave.catch(()=>{}).then(()=>writeStored({project,library})).then(()=>{if(sequence===saveSequence)$('#saveStatus').textContent='Saved in this tool';}).catch(()=>{if(sequence===saveSequence)$('#saveStatus').textContent='Autosave unavailable — use Export JSON';}); }
  catch { $('#saveStatus').textContent = 'Autosave unavailable — use Export JSON'; }
  $('#undoBtn').disabled = !history.canUndo; $('#redoBtn').disabled = !history.canRedo;
}
function finishChange(before) {
  if (doc.world.spawnPlacementId) {
    const marker = doc.placements.find(p => p.id === doc.world.spawnPlacementId);
    if (!marker || resolveGameplay(doc.definitions[marker.definitionId], marker).role !== 'spawnpoint') delete doc.world.spawnPlacementId;
  }
  const errors = validateDocument(doc);
  if (errors.length) { doc = before; toast(errors.slice(0, 3).join('\n'), true); render(); return false; }
  history.commit(doc); save(); render(); return true;
}
function change(callback) {
  const before = clone(doc);
  try { callback(doc); return finishChange(before); }
  catch (error) { doc = before; toast(error.message, true); render(); return false; }
}
function editDefinition(callback) { const id = selectedDef; change(project => callback(project.definitions[id], project)); }
function editPlacement(callback) { const id = selectedId; change(project => callback(project.placements.find(p => p.id === id), project)); }
function setMode(value) {
  mode = value;
  for (const [id, tool] of [['selectTool','select'],['placeTool','place'],['panTool','pan']]) $(`#${id}`).classList.toggle('active', mode === tool);
  stage.style.cursor = mode === 'pan' ? 'grab' : mode === 'place' ? 'crosshair' : 'default';
}
function worldPoint(event) {
  const bounds = stage.getBoundingClientRect();
  return { x: view.x + (event.clientX - bounds.left) / view.zoom, y: view.y + (event.clientY - bounds.top) / view.zoom };
}
function snap(value) { const size = Math.max(1, Number($('#snap').value) || 5); return Math.round(value / size) * size; }
function zoomAt(factor, screenX, screenY) {
  const bounds = stage.getBoundingClientRect(), x = screenX ?? bounds.width / 2, y = screenY ?? bounds.height / 2;
  const worldX = view.x + x / view.zoom, worldY = view.y + y / view.zoom;
  view.zoom = Math.max(.02, Math.min(8, view.zoom * factor));
  view.x = worldX - x / view.zoom; view.y = worldY - y / view.zoom;
}
function draw() {
  if (!doc) return;
  const bounds = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * dpr)), height = Math.max(1, Math.round(bounds.height * dpr));
  if (stage.width !== width || stage.height !== height) { stage.width = width; stage.height = height; }
  context.setTransform(dpr, 0, 0, dpr, 0, 0); context.fillStyle = '#10191c'; context.fillRect(0, 0, bounds.width, bounds.height);
  context.save(); context.scale(view.zoom, view.zoom); context.translate(-view.x, -view.y);
  context.fillStyle = doc.world.backgroundColor; context.fillRect(0, 0, doc.world.width, doc.world.height);
  if (showGrid) {
    const grid = Math.max(1, Number($('#snap').value) || 5), stride = grid * Math.max(1, Math.ceil(8 / view.zoom / grid));
    context.beginPath(); context.strokeStyle = '#b5e6cc18'; context.lineWidth = 1 / view.zoom;
    const maxX = Math.min(doc.world.width, view.x + bounds.width / view.zoom), maxY = Math.min(doc.world.height, view.y + bounds.height / view.zoom);
    for (let x = Math.max(0, Math.ceil(view.x / stride) * stride); x <= maxX; x += stride) { context.moveTo(x, 0); context.lineTo(x, doc.world.height); }
    for (let y = Math.max(0, Math.ceil(view.y / stride) * stride); y <= maxY; y += stride) { context.moveTo(0, y); context.lineTo(doc.world.width, y); }
    context.stroke();
  }
  for (const placement of [...doc.placements].sort((a, b) => a.layer - b.layer)) {
    const state = previewState(placement),box=placementBounds(state);
    if (!selectedIds.has(placement.id)&&(box.x + box.width < view.x || box.x > view.x + bounds.width / view.zoom || box.y + box.height < view.y || box.y > view.y + bounds.height / view.zoom)) continue;
    drawPlacement(context, doc, placement, images, { timeMs, ...previewOptions(placement), collisions: showCollisions, selected: selectedIds.has(placement.id) });
    if(showCollisions)for(const polygon of gameplayTriggerPolygons(state)){context.beginPath();polygon.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();context.strokeStyle='#f5d778';context.lineWidth=1/view.zoom;context.stroke();}
  }
  const selected=selectedPlacement();
  if(selected){
    const group=selectedPlacements(),state=group.length>1?getGroupBounds(group.map(previewState)):previewState(selected),handles=group.length===1&&editingTrigger&&state.behavior.vanish?triggerHandles(state):getTransformHandles(state,view),top=handles.find(h=>h.id==='n'),rotate=handles.find(h=>h.id==='rotate');
    if(group.length>1){context.strokeStyle='#9de8ff';context.lineWidth=1.5/view.zoom;context.strokeRect(state.x,state.y,state.width,state.height);}
    if(top&&rotate){context.beginPath();context.moveTo(top.x,top.y);context.lineTo(rotate.x,rotate.y);context.strokeStyle='#ffebad';context.lineWidth=1/view.zoom;context.stroke();}
    for(const handle of handles){
      context.fillStyle=handle.type==='rotate'?'#f5b77c':handle.type==='move'?'#79d6ff':'#fff3c8';
      context.beginPath();context.arc(handle.x,handle.y,(handle.type==='move'?5:4)/view.zoom,0,Math.PI*2);context.fill();context.strokeStyle='#24323a';context.stroke();
    }
  }
  if(pointer?.type==='marquee'){const a=pointer.point,b=pointer.end;context.fillStyle='#79d6ff22';context.strokeStyle='#79d6ff';context.lineWidth=1/view.zoom;context.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);context.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);}
  context.strokeStyle = '#86b6a6'; context.lineWidth = 1 / view.zoom; context.strokeRect(0, 0, doc.world.width, doc.world.height); context.restore();
  $('#timeLabel').textContent = `${(timeMs / 1000).toFixed(2)}s`; $('#scrub').max=Math.max(600000,Math.ceil(timeMs/60000)*60000);$('#scrub').value = timeMs;
  $('#zoomLabel').textContent = `${Math.round(view.zoom * 100)}%`;
  const status=$('#vanishStatus');if(status&&selected){const state=previewState(selected);status.textContent=state.vanished?(state.restoreRemainingMs!=null?`Restores in ${(state.restoreRemainingMs/1000).toFixed(2)}s`:'Vanished · Reset to restore'):state.vanishRestored?'Restored · Simulate entry to test again':state.vanishRemainingMs!=null?`Vanishes in ${(state.vanishRemainingMs/1000).toFixed(2)}s`:'Waiting for trigger entry';}
  const beamStatus=$('#beamStatus');if(beamStatus&&selected){const state=previewState(selected);beamStatus.textContent=timeMs<(state.behavior.startMs||0)?'OFF · Waiting for start time':state.beamOn?'ON · Beam active':'OFF · Beam inactive';}
}

function renderPalette() {
  const container = $('#assetList'), scroll = container.parentElement.scrollTop;
  const query = $('#assetSearch').value.toLowerCase(); container.replaceChildren();
  const definitions = Object.values(doc.definitions).filter(d => {const gameplay=resolveGameplay(d);return (filter === 'all' || d.kind === filter) && (levelFilter==='all'||(d.levels||[]).includes(levelFilter)) && (gameplayFilter==='all'||gameplay.role===gameplayFilter) && `${d.name} ${d.id} ${gameplay.role} ${gameplay.tags.join(' ')}`.toLowerCase().includes(query);});
  $('#assetCount').textContent = `${definitions.length}/${Object.keys(doc.definitions).length}`;
  $('#deleteAssetBtn').disabled=!doc.definitions[selectedDef];
  for (const definition of definitions) {
    const node = element('button', container, null, `asset-card${selectedDef === definition.id ? ' selected' : ''}`);
    const gameplay=resolveGameplay(definition);node.title = `${definition.name} · ${definition.physics.calibration} · ${gameplay.role} ${gameplay.tags.join(', ')}`;
    const canvas = element('canvas', node); canvas.width = 100; canvas.height = 60;
    element('div', node, definition.name); drawThumbnail(canvas, doc, definition.id, images);
    if(gameplay.role!=='none')element('small',node,GAMEPLAY_ROLES.find(([role])=>role===gameplay.role)?.[1]||gameplay.role,'gameplay-badge');
    node.onclick = () => { selectedDef = definition.id; setMode('place'); renderPalette(); renderInspector(); };
  }
  container.parentElement.scrollTop = scroll;
}
function parseRect(value) {
  if (!value.trim()) return null;
  const result = value.split(',').map(Number);
  if (result.length !== 4 || result.some(n => !Number.isFinite(n)) || result[2] <= 0 || result[3] <= 0) throw new Error('Rectangle needs x,y,width,height; width and height must be positive.');
  return result;
}
function advancedJSON(parent, title, value, onApply) {
  const details = element('details', parent, null, 'section'); element('summary', details, title);
  const area = element('textarea', details); area.value = JSON.stringify(value, null, 2); area.setAttribute('aria-label', title); area.spellcheck = false;
  button(details, 'Apply JSON', () => { try { onApply(JSON.parse(area.value)); } catch (error) { toast(error.message, true); } });
}
function renderDefinition(parent, definition) {
  element('h3', parent, definition.name);
  const count = doc.placements.filter(p => p.definitionId === definition.id).length;
  element('p', parent, `Shared definition · ${count} placement${count === 1 ? '' : 's'} · ${definition.physics.calibration}`, 'muted');
  button(parent,'Edit cuts and hitboxes',()=>assetEditor.open(definition.id));
  if(definition.kind==='character'||definition.visual.animations)button(parent,'States and sequences',()=>sequenceEditor.open(definition.id));
  button(parent,'Delete asset',()=>deleteSelectedAsset(definition.id),'danger');
  field(parent, 'Definition name', definition.name, value => editDefinition(d => { d.name = value; }));
  field(parent,'Level tags',(definition.levels||[]).join(', '),value=>editDefinition(d=>{d.levels=[...new Set(value.split(',').map(s=>s.trim()).filter(Boolean))];}));
  const gameplay=section(parent,'Gameplay defaults');renderGameplayControls(gameplay,{definition,onChange:value=>editDefinition((d,project)=>{
    const p=project.placements.find(item=>item.id===selectedId&&item.definitionId===d.id);
    const previousRole=p?resolveGameplay(d,p).role:null;
    d.gameplay=value;
    if(p&&previousRole!=='spawnpoint'&&resolveGameplay(d,p).role==='spawnpoint')project.world.spawnPlacementId=p.id;
  })});
  field(parent,'Asset role',definition.kind,value=>editDefinition(d=>{
    d.kind=value;
    if(value==='platform')d.behavior={type:'static'};
    else if(value==='beam')d.behavior={type:'beam',onMs:1000,offMs:1000,startMs:0,phaseMs:0,startState:'on'};
    else if(!['enemy','projectile','beam'].includes(value))d.behavior={type:'static'};
  }),{choices:['platform','prop','chest','hazard','background','character','enemy','beam','projectile']});
  field(parent, 'Default width', definition.size.width, value => editDefinition(d => { d.size.width = value; }), { type: 'number' });
  field(parent, 'Default height', definition.size.height, value => editDefinition(d => { d.size.height = value; }), { type: 'number' });
  element('p', parent, 'Default size applies to new placements. Existing placements keep their size.', 'muted');
  const visual = section(parent, 'Visual source');
  field(visual, 'Atlas asset', definition.visual.assetId, value => editDefinition((d, project) => {
    const frameId = Object.keys(project.assets[value].frames)[0];
    d.visual = { assetId: value, frameId, ...(d.kind === 'beam' ? { onFrameId: frameId, offFrameId: frameId } : {}) };
    for (const p of project.placements.filter(p => p.definitionId === d.id)) delete p.animation;
  }), { choices: Object.values(doc.assets).map(a => [a.id, a.name]) });
  const choices = Object.entries(doc.assets[definition.visual.assetId].frames).map(([key, value]) => [key, value.name || value.display_name || key]);
  if (definition.kind === 'beam') {
    for (const [key, label] of [['onFrameId','ON frame'],['offFrameId','OFF frame']]) field(visual, label, definition.visual[key], value => editDefinition(d => { d.visual[key] = value; }), { choices });
  } else field(visual, 'Static frame', definition.visual.frameId, value => editDefinition((d, project) => {
    d.visual.frameId = value; delete d.visual.animations; delete d.visual.defaultAnimation;
    for (const p of project.placements.filter(p => p.definitionId === d.id)) delete p.animation;
  }), { choices });
  element('p', visual, 'Image changes preserve placement and collision geometry. Selecting a static frame replaces its animation mapping.', 'muted');
  for (const [key, labels, defaults] of [['offset',['Art offset X','Art offset Y'],[0,0]],['scale',['Art scale X','Art scale Y'],[1,1]]]) {
    labels.forEach((label, axis) => field(visual, label, definition.visual[key]?.[axis] ?? defaults[axis], value => editDefinition(d => {
      d.visual[key] = [...(d.visual[key] || defaults)]; d.visual[key][axis] = value;
    }), { type: 'number' }));
  }
  element('p', visual, 'Art offsets are fractions of placement size. Art scale and offsets adjust imagery without moving its collision.', 'muted');
  const physics = section(parent, 'Collision interpretation');
  field(physics, 'Collision mode', definition.physics.mode, value => editDefinition(d => { d.physics.mode = value; d.physics.calibration = 'authored'; }), { choices: ['none','solid','trigger'] });
  field(physics, 'Body rectangle', definition.physics.collider?.join(', ') || '', value => editDefinition(d => {
    d.physics.collider = parseRect(value); d.physics.solidShapes = null; d.physics.interactionShapes = null; d.physics.calibration = 'authored';
  }), { placeholder: 'x, y, width, height (0–1)' });
  field(physics, 'Damage rectangle', definition.physics.hitbox?.join(', ') || '', value => editDefinition(d => {
    d.physics.hitbox = parseRect(value); d.physics.hazardShapes = null; d.physics.calibration = 'authored';
  }), { placeholder: 'blank means none' });
  field(physics, 'Lethal contact', definition.physics.lethal, value => editDefinition(d => { d.physics.lethal = value; d.physics.calibration = 'authored'; }), { type: 'checkbox' });
  field(physics, 'Uses gravity', definition.physics.gravity, value => editDefinition(d => { d.physics.gravity = value; d.physics.calibration = 'authored'; }), { type: 'checkbox' });
  element('p', physics, 'Rectangles use fractions of placement width/height. Rect edits replace imported shapes. Green: solid; blue: interaction; red: danger; yellow: walking surface.', 'muted');
  advancedJSON(parent, 'Advanced visual / animation JSON', definition.visual, value => editDefinition(d => { d.visual = value; }));
  advancedJSON(parent, 'Advanced physics / polygon JSON', definition.physics, value => editDefinition(d => { d.physics = { ...value, calibration: 'authored' }; }));
  advancedJSON(parent, 'Shared behavior defaults JSON', definition.behavior, value => editDefinition(d => { d.behavior = value; }));
}
function renderPlacement(parent, placement) {
  const definition = doc.definitions[placement.definitionId], behavior = { ...definition.behavior, ...placement.settings };
  element('h3', parent, definition.name); element('p', parent, placement.id, 'muted');
  for (const [key, label] of [['x','X'],['y','Y'],['width','Width'],['height','Height'],['rotation','Rotation degrees'],['layer','Layer']]) field(parent, label, placement[key], value => editPlacement(p => { p[key] = value; }), { type: 'number' });
  field(parent, 'Flip horizontally', placement.flipX, value => editPlacement(p => { p.flipX = value; }), { type: 'checkbox' });
  const gameplay=section(parent,'Gameplay tags');
  const activeSpawn=doc.world.spawnPlacementId===placement.id;
  button(gameplay,activeSpawn?'Level spawn selected':'Use as level spawn',()=>{
    if(change(project=>setLevelSpawn(project,placement.id)))toast('Playtest will start at this asset’s foot anchor.');
  }).disabled=activeSpawn;
  if(activeSpawn)element('p',gameplay,'Playtest starts here. Moving, resizing or changing this asset’s foot anchor updates the starting position.','muted');
  renderGameplayControls(gameplay,{definition,placement,onChange:value=>editPlacement((p,project)=>{
    const previousRole=resolveGameplay(project.definitions[p.definitionId],p).role;
    p.gameplay=value;
    if(previousRole!=='spawnpoint'&&resolveGameplay(project.definitions[p.definitionId],p).role==='spawnpoint')project.world.spawnPlacementId=p.id;
  })});
  const area = section(parent, 'Placement behavior');
  const number = (label, key, fallback) => field(area, label, behavior[key] ?? fallback, value => editPlacement(p => { p.settings[key] = value; }), { type: 'number' });
  const activeMotion=behavior.motion===undefined?(behavior.type==='moving'?behavior:null):behavior.motion;
  const motion=activeMotion&&{axis:activeMotion.axis,distance:activeMotion.distance,periodMs:activeMotion.periodMs,phaseMs:activeMotion.phaseMs||0};
  field(area,'Movable',!!motion,value=>editPlacement(p=>{p.settings.motion=value?{axis:'x',distance:80,periodMs:4000,phaseMs:0}:null;}),{type:'checkbox'});
  if(motion){
    field(area,'Movement axis',motion.axis,value=>editPlacement(p=>{p.settings.motion={...motion,axis:value};}),{choices:['x','y']});
    for(const [key,label]of [['distance','Travel ± pixels'],['periodMs','Cycle milliseconds'],['phaseMs','Movement offset milliseconds']])field(area,label,motion[key],value=>editPlacement(p=>{p.settings.motion={...motion,[key]:value};}),{type:'number'});
    element('p',area,'One complete back-and-forth cycle uses this duration. Movement runs alongside animations and beam timing.','muted');
  }
  if (definition.kind === 'platform') {
    field(area,'Vanish after trigger entry',!!behavior.vanish,value=>{triggerTimes.delete(placement.id);editPlacement(p=>{p.settings.vanish=value?{triggerVolume:[0,-.5,1,.5],countdownMs:1000}:null;});},{type:'checkbox'});
    if(behavior.vanish){
      const vanish=behavior.vanish;
      field(area,'Vanish countdown seconds',vanish.countdownMs/1000,value=>{triggerTimes.delete(placement.id);editPlacement(p=>{p.settings.vanish={...vanish,countdownMs:value*1000};});},{type:'number'});
      const restoreMode=vanish.restoreMode||'respawn';
      field(area,'After vanishing',restoreMode,value=>{triggerTimes.delete(placement.id);editPlacement(p=>{p.settings.vanish={...vanish,restoreMode:value,...(value==='timed'?{restoreMs:vanish.restoreMs||2000}:{})};});},{choices:[['respawn','Restore on respawn'],['timed','Restore after delay'],['permanent','Gone until Restart']]});
      if(restoreMode==='timed')field(area,'Restore delay seconds',(vanish.restoreMs||2000)/1000,value=>{triggerTimes.delete(placement.id);editPlacement(p=>{p.settings.vanish={...vanish,restoreMs:value*1000};});},{type:'number'});
      const trigger=section(area,'Trigger volume');
      ['X','Y','Width','Height'].forEach((label,index)=>field(trigger,`Trigger ${label} pixels`,vanish.triggerVolume[index]*(index%2?placement.height:placement.width),value=>editPlacement(p=>{
        const rect=[...vanish.triggerVolume];rect[index]=value/(index%2?p.height:p.width);p.settings.vanish={...vanish,triggerVolume:rect};
      }),{type:'number'}));
      button(trigger,editingTrigger?'Finish trigger handles':'Edit trigger handles',()=>{editingTrigger=!editingTrigger;renderInspector();});
      element('p',trigger,'Blue box moves and rotates with this placement. Drag its center or corners to edit. Coordinates are relative to the platform.','muted');
      button(area,'Simulate trigger entry',()=>{triggerTimes.set(placement.id,timeMs);playing=true;lastFrame=0;$('#playBtn').textContent='Pause';});
      element('p',area,'Waiting for trigger entry','muted').id='vanishStatus';
      element('p',area,'Timed platforms return automatically and also reset on respawn. Permanent platforms stay gone across deaths until Restart. Reset restores all platforms in this editor preview.','muted');
    }
  }
  if (definition.kind === 'beam') {
    const beamNumber=(label,key,fallback)=>field(area,label,(behavior[key]??fallback)/1000,value=>editPlacement(p=>{p.settings={type:'beam',onMs:1000,offMs:1000,startState:'on',...behavior,...p.settings,[key]:value*1000};}),{type:'number'});
    beamNumber('Start time seconds','startMs',0);beamNumber('ON duration seconds','onMs',1000);beamNumber('OFF duration seconds','offMs',1000);beamNumber('Time offset seconds','phaseMs',0);
    field(area, 'Initial beam state', behavior.startState, value => editPlacement(p => { p.settings.startState = value; }), { choices: ['on','off'] });
    element('p',area,'Start time delays the first cycle. Time offset advances the on/off cycle after that delay. All beams share the live preview clock.','muted');
    element('p',area,'','muted').id='beamStatus';
  }
  const animations = Object.keys(definition.visual.animations || {});
  if (animations.length) {
    field(area,'Preview state',previewStates.get(placement.id)?.animation||'',value=>{previewStates.set(placement.id,{animation:value,startedAtMs:timeMs});playing=true;$('#playBtn').textContent='Pause';},{choices:[['','Definition default'],...animations]});
    button(area,'Restart state preview',()=>{const state=previewStates.get(placement.id);previewStates.set(placement.id,{animation:state?.animation||'',startedAtMs:timeMs});playing=true;$('#playBtn').textContent='Pause';});
    button(area,'States and sequences',()=>sequenceEditor.open(definition.id));
    element('p',area,'State selection is preview-only. The engine controls actual state changes.','muted');
  }
  if (definition.kind === 'enemy') {
    number('Movement speed', 'speed', 42); number('Detection range', 'detectRange', 400); number('Fire interval ms', 'fireIntervalMs', 4800);
    const platforms = doc.placements.filter(p => doc.definitions[p.definitionId].kind === 'platform');
    field(area, 'Support platform', placement.settings.supportId || '', value => editPlacement(p => { if (value) p.settings.supportId = value; else delete p.settings.supportId; }), { choices: [['','Not assigned'], ...platforms.map(p => [p.id, `${doc.definitions[p.definitionId].name} (${Math.round(p.x)}, ${Math.round(p.y)})`])] });
  }
  button(parent, 'Edit shared definition', () => { tab = 'definition'; renderInspector(); });
  button(parent,'Edit cuts and hitboxes',()=>assetEditor.open(definition.id));
  button(parent, 'Duplicate', duplicate); button(parent, 'Delete placement', removeSelected, 'danger');
}
function renderInspector() {
  const node = $('#inspectorContent'); node.replaceChildren();
  if(selectedPlacements().length>1){
    element('h3',node,`${selectedIds.size} objects selected`);
    element('p',node,'Group transforms change placements together. Scale preserves proportions; rotation and flips use the group center.','muted');
    field(node,'Move X pixels',0,value=>groupOperation({type:'move',dx:value,dy:0}),{type:'number'});
    field(node,'Move Y pixels',0,value=>groupOperation({type:'move',dx:0,dy:value}),{type:'number'});
    field(node,'Scale percent',100,value=>groupOperation({type:'scale',factor:value/100,anchor:groupCenter()}),{type:'number'});
    field(node,'Rotate degrees',0,value=>groupOperation({type:'rotate',degrees:value,center:groupCenter()}),{type:'number'});
    button(node,'Flip horizontal',()=>groupOperation({type:'flip',axis:'x',center:groupCenter()}));
    button(node,'Flip vertical',()=>groupOperation({type:'flip',axis:'y',center:groupCenter()}));
    button(node,'Duplicate selected',duplicate);button(node,'Delete selected placements',removeSelected,'danger');
    element('p',node,'Drag any selected object or the center handle to move. Drag a corner/edge to scale, or the orange handle to rotate. Ctrl/Cmd-click toggles objects.','muted');
    return;
  }
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'definition') {
    const d = doc.definitions[selectedDef];
    if (d) renderDefinition(node, d); else element('p', node, 'Choose an asset to edit its reusable definition.', 'muted');
  } else {
    const p = selectedPlacement();
    if (p) renderPlacement(node, p); else element('p', node, 'Choose an asset, then click the canvas to place it. Select objects to edit positions and timers.', 'muted');
  }
}
function renderObjects() {
  const container = $('#objectList'); container.replaceChildren(); element('strong', container, `Objects (${doc.placements.length})`);
  for (const p of [...doc.placements].sort((a, b) => a.layer - b.layer)) {
    const node = element('button', container, `${p.layer} · ${doc.definitions[p.definitionId].name} · ${Math.round(p.x)}, ${Math.round(p.y)}${doc.world.spawnPlacementId===p.id?' · Level spawn':''}`, `object${selectedIds.has(p.id) ? ' selected' : ''}`);
    node.setAttribute('aria-pressed',String(selectedIds.has(p.id)));
    node.onclick = event => { if(event.ctrlKey||event.metaKey)toggleSelection(p.id);else selectOnly(p.id);selectedDef = p.definitionId; setMode('select'); render(); };
    node.ondblclick = () => { view.x = p.x - stage.clientWidth / view.zoom / 2 + p.width / 2; view.y = p.y - stage.clientHeight / view.zoom / 2 + p.height / 2; };
  }
}
function render() {
  if (!doc) return;
  syncSelection();
  $('#selectionCount').textContent=`${selectedIds.size} selected`;
  for(const id of ['flipSelectionX','flipSelectionY','clearSelectionBtn'])$(`#${id}`).disabled=!selectedIds.size;
  $('#playBtn').textContent=playing?'Pause':'Resume';
  $('#docName').value = doc.name; $('#worldWidth').value = doc.world.width; $('#worldHeight').value = doc.world.height;
  $('#worldBiome').value=doc.biome||'custom';
  $('#emptyNotice').hidden = !!doc.placements.length;
  const count = Object.values(doc.definitions).filter(d => d.physics.calibration === 'estimated').length;
  $('#warningBar').textContent = `${count} definitions have estimated geometry. Review with Colliders and Shared Definition. ${warnings[0] || ''}`;
  const levelSelect=$('#levelFilter'),tags=[...new Set(Object.values(doc.definitions).flatMap(d=>d.levels||[]))].sort();
  levelSelect.replaceChildren(new Option('All levels','all'),...tags.map(tag=>new Option(tag,tag)));if(!tags.includes(levelFilter))levelFilter='all';levelSelect.value=levelFilter;
  renderPalette(); renderInspector(); renderObjects();
  assetEditor?.refresh();
  sequenceEditor?.refresh();
}
function duplicate() {
  const originals=selectedPlacements();if(!originals.length)return;
  change(project=>{const ids=new Map(originals.map(p=>[p.id,crypto.randomUUID()])),copies=originals.map(p=>{const copy=clone(p);copy.id=ids.get(p.id);copy.x+=Number($('#snap').value)||5;if(ids.has(copy.settings.supportId))copy.settings.supportId=ids.get(copy.settings.supportId);return copy;});project.placements.push(...copies);selectOnly(null);for(const p of copies)selectedIds.add(p.id);selectedId=copies.at(-1).id;});
}
function deleteSelectedAsset(id=selectedDef){
  const definition=doc.definitions[id];if(!definition){toast('Choose an asset first.');return;}
  const count=doc.placements.filter(p=>p.definitionId===id).length;
  if(change(project=>deleteAssetDefinition(project,id))){
    selectedDef=null;if(!selectedPlacement())selectedId=null;setMode('select');render();
    toast(`${definition.name} deleted with ${count} placed instance${count===1?'':'s'}. Undo restores them.`);
  }
}
function removeSelected() {
  if (!selectedIds.size) return; const removedIds = new Set(selectedIds);
  change(project => { project.placements = project.placements.filter(p => !removedIds.has(p.id)); for (const p of project.placements) if (removedIds.has(p.settings.supportId)) delete p.settings.supportId; selectOnly(null); });
}
async function restoreHistory(direction) {
  const candidate = history[direction](); if (!candidate) return;
  try { const loaded = await loadImages(candidate.assets); doc = candidate; images = loaded; syncSelection(); render(); save(); }
  catch (error) { history[direction === 'undo' ? 'redo' : 'undo'](); toast(error.message, true); }
}
function exportProject() {
  try {
    const url = URL.createObjectURL(new Blob([serializeDocument(doc)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${doc.name.replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 100) || 'level'}.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Level JSON exported.');
  } catch (error) { toast(error.message, true); }
}
function downloadJSON(value,filename){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function saveAssetMetadata(){try{downloadJSON(exportAssetLibrary(doc),'asset-metadata.json');toast('Reusable asset metadata exported without level placements.');}catch(error){toast(error.message,true);}}
function changeMetadata(callback){if(!importDraft)return change(callback);const before=clone(importDraft);try{callback(importDraft);const errors=validateDocument(importDraft);if(errors.length)throw new Error(errors[0]);assetEditor?.refresh();return true;}catch(error){importDraft=before;toast(error.message,true);return false;}}
async function replaceAtlas(assetId, replacement) {
  const target = importDraft || doc;
  if (!target?.assets?.[assetId]) { toast('The selected atlas is no longer available.', true); return false; }
  // Validate on an isolated copy first so the dialog can retain its pending
  // file and offer the alternate crop mode after a bounds failure.
  replaceAtlasImage(clone(target), assetId, replacement, replacement.mode);
  const applied = changeMetadata(project => replaceAtlasImage(project, assetId, replacement, replacement.mode));
  if (!applied) return false;
  const cache = importDraft ? draftImages : images;
  cache?.set(assetId, replacement.image);
  render();
  toast(`Atlas image replaced: ${replacement.name} (${replacement.width} × ${replacement.height}).`);
  return true;
}
function acceptImport(){if(!importDraft)return;const draft=importDraft,loaded=draftImages;importDraft=null;draftImages=null;if(change(project=>{project.assets=draft.assets;project.definitions=draft.definitions;})){images=loaded;render();toast('Reviewed assets added to the drawer.');}}
function cancelImport(){importDraft=null;draftImages=null;toast('Import cancelled; the asset drawer is unchanged.');}
async function loadAssetMetadata(file){
  try{
    if(file.size>100*1024*1024)throw new Error('Metadata exceeds 100 MB.');
    const library=JSON.parse(await file.text()),candidate=importAssetLibrary(doc,library),loaded=await loadImages(candidate.assets);
    if(change(project=>{const merged=importAssetLibrary(project,library);project.assets=merged.assets;project.definitions=merged.definitions;})){
      images=new Map([...images,...loaded]);render();toast('Shared metadata applied to matching assets and existing placements.');
    }
  }catch(error){toast(`Metadata rejected: ${error.message}`,true);}finally{$('#importMetadata').value='';}
}
async function importProject(file) {
  try {
    const candidate = parseDocument(await file.text()), loaded = await loadImages(candidate.assets);
    doc = candidate; images = loaded; history = new History(doc); selectOnly(null); selectedDef = null; playing = true; resetPreview(); editingTrigger=false;
    render(); save(); toast('Level JSON imported.');
  } catch (error) { toast(`Project rejected: ${error.message}`, true); }
  finally { $('#importJson').value = ''; }
}
async function importTileset() {
  const manifestFile = $('#tilesetManifest').files[0], imageFile = $('#tilesetImage').files[0];
  if (!imageFile || ($('#importMode').value==='manifest'&&!manifestFile)) return;
  $('#importTilesetBtn').disabled = true;
  try {
    if(imageFile.size>64*1024*1024||manifestFile?.size>16*1024*1024)throw new Error('Import supports images up to 64 MB and manifests up to 16 MB.');
    const imageSrc = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Cannot read image.')); reader.readAsDataURL(imageFile); });
    let manifest,extraWarnings=[];
    if($('#importMode').value==='manifest')manifest=JSON.parse(await manifestFile.text());
    else{
      const image=await new Promise((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error('Cannot decode atlas image.'));value.src=imageSrc;});
      const result=buildAutomaticManifest(readAtlasPixels(image),{
        name:$('#importName').value.trim()||imageFile.name.replace(/\.[^.]+$/,''),imageName:imageFile.name,method:$('#importMode').value,
        category:$('#importCategory').value,collision:$('#autoCollision').checked,
        alphaThreshold:Number($('#alphaThreshold').value),minAreaPx:Number($('#minArea').value),mergeGapPx:Number($('#mergeGap').value),paddingPx:Number($('#cutPadding').value),
        cellWidthPx:Number($('#cellWidth').value),cellHeightPx:Number($('#cellHeight').value),gridPaddingPx:Number($('#gridPadding').value),spacingPx:Number($('#gridSpacing').value)});
      manifest=result.manifest;extraWarnings=result.warnings;
    }
    const pack = await createTilesetCatalog(manifest, imageSrc, { existingIds: Object.keys(doc.assets) });
    const loaded = await loadImages(pack.assets);
    const levels=$('#importLevels').value.split(',').map(s=>s.trim()).filter(Boolean);for(const definition of Object.values(pack.definitions))definition.levels=[...levels];
    importDraft=clone(doc);Object.assign(importDraft.assets,pack.assets);Object.assign(importDraft.definitions,pack.definitions);draftImages=new Map([...images,...loaded]);
    const first=Object.keys(pack.definitions)[0];if(first){assetEditor.open(first,{importing:true});toast(extraWarnings[0]||'Review assets, then choose Done to add them to the drawer.');}
  } catch (error) { toast(`Tileset rejected: ${error.message}`, true); }
  finally { $('#tilesetManifest').value = ''; $('#tilesetImage').value = ''; updateImportControls(); }
}
function updateImportControls() {
  const manifest = $('#tilesetManifest').files[0], image = $('#tilesetImage').files[0];
  $('#importTilesetBtn').disabled = !image || ($('#importMode').value==='manifest'&&!manifest);
  $('#packFileNames').textContent = image?.name || 'Choose an atlas image to begin.';
  $('#autoCutOptions').hidden=$('#importMode').value==='manifest';$('#alphaCutOptions').hidden=$('#importMode').value!=='alpha';$('#gridCutOptions').hidden=$('#importMode').value!=='grid';
}
function updateCharacterControls(){
  const image=$('#characterImage').files[0],manifest=$('#characterManifest').files[0];
  $('#importCharacterBtn').disabled=!image;
  $('#characterFiles').textContent=`${image?.name||'Choose a character image'}${manifest?` · ${manifest.name}`:''}`;
  $('#characterGrid').hidden=!!manifest||$('#characterMethod').value!=='grid';
  $('#characterMethod').disabled=!!manifest;
}
async function importCharacters(){
  const imageFile=$('#characterImage').files[0],manifestFile=$('#characterManifest').files[0];if(!imageFile)return;
  $('#importCharacterBtn').disabled=true;
  try{
    if(imageFile.size>64*1024*1024||manifestFile?.size>16*1024*1024)throw new Error('Use an image up to 64 MB and sequence JSON up to 16 MB.');
    const imageSrc=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Cannot read character image.'));reader.readAsDataURL(imageFile);});
    const image=await new Promise((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error('Cannot decode character image.'));value.src=imageSrc;});
    const width=image.naturalWidth,height=image.naturalHeight;if(width*height>16_777_216)throw new Error('Use an atlas up to 16,777,216 decoded pixels.');
    const manifest=manifestFile?JSON.parse(await manifestFile.text()):null;
    let cuts;
    if(!manifest){
      if($('#characterMethod').value==='grid')cuts=createGridCuts({atlasWidth:width,atlasHeight:height,cellWidthPx:Number($('#characterCellWidth').value),cellHeightPx:Number($('#characterCellHeight').value),paddingPx:Number($('#characterMargin').value),spacingPx:Number($('#characterSpacing').value)});
      else cuts=detectAtlasCuts(readAtlasPixels(image),{alphaThreshold:32,minAreaPx:24,mergeGapPx:3,paddingPx:1}).cuts;
    }
    const pack=createCharacterCatalog({name:$('#characterName').value.trim()||imageFile.name.replace(/\.[^.]+$/,''),imageSrc,width,height,cuts,manifest,existingIds:Object.keys(doc.assets),levels:$('#characterLevels').value.split(',').map(s=>s.trim()).filter(Boolean)});
    const loaded=await loadImages(pack.assets);
    importDraft=clone(doc);Object.assign(importDraft.assets,pack.assets);Object.assign(importDraft.definitions,pack.definitions);draftImages=new Map([...images,...loaded]);
    const first=Object.keys(pack.definitions)[0];assetEditor.open(first,{importing:true});
    toast('Review character cuts and geometry. Use States and sequences to arrange animations, then Done importing.');
  }catch(error){toast(`Character import rejected: ${error.message}`,true);}
  finally{$('#characterImage').value='';$('#characterManifest').value='';updateCharacterControls();}
}
function cancelPointer() { if (pointer?.before) doc = pointer.before;if(pointer?.selectionBefore){selectedIds.clear();for(const id of pointer.selectionBefore)selectedIds.add(id);selectedId=pointer.primaryBefore;} pointer = null; stage.classList.remove('panning'); render(); }
function bind() {
  for (const kind of ['all','platform','character','enemy','chest','background','prop','hazard','beam','projectile']) button($('#kindFilters'), kind, () => { filter = kind; renderPalette(); });
  $('#assetSearch').oninput = renderPalette;
  $('#deleteAssetBtn').onclick=()=>deleteSelectedAsset();
  $('#levelFilter').onchange=event=>{levelFilter=event.target.value;renderPalette();};
  const gameplaySelect=$('#gameplayFilter');gameplaySelect.replaceChildren(new Option('All gameplay roles','all'),...GAMEPLAY_ROLES.map(([value,label])=>new Option(label,value)));gameplaySelect.onchange=event=>{gameplayFilter=event.target.value;renderPalette();};
  $('#newBtn').onclick = () => { doc = createDocument(doc); history = new History(doc); selectOnly(null); selectedDef = null; playing = true; resetPreview(); editingTrigger=false; view = { x: -32, y: -32, zoom: 1 }; render(); save(); };
  $('#importJson').onchange = e => { if (e.target.files[0]) importProject(e.target.files[0]); }; $('#exportBtn').onclick = exportProject;
  $('#playtestBtn').onclick=async()=>{try{await pendingSave;await writeStored({playtest:clone(doc)});location.href='viewer.html?source=draft';}catch(error){toast(`Playtest could not open: ${error.message}`,true);}};
  $('#tilesetManifest').onchange = ()=>{$('#importMode').value='manifest';updateImportControls();}; $('#tilesetImage').onchange = updateImportControls; $('#importTilesetBtn').onclick = importTileset;$('#importMode').onchange=updateImportControls;
  $('#characterImage').onchange=updateCharacterControls;$('#characterManifest').onchange=updateCharacterControls;$('#characterMethod').onchange=updateCharacterControls;$('#importCharacterBtn').onclick=importCharacters;
  $('#saveMetadataBtn').onclick=saveAssetMetadata;$('#importMetadata').onchange=e=>{if(e.target.files[0])loadAssetMetadata(e.target.files[0]);};
  $('#assetEditorBtn').onclick=()=>assetEditor.open(selectedDef||selectedPlacement()?.definitionId);
  bindValue($('#docName'), value => change(p => { p.name = value; }), () => doc.name);
  bindValue($('#worldBiome'),value=>change(p=>{p.biome=value;}),()=>doc.biome);
  bindValue($('#worldWidth'), value => change(p => { p.world.width = value; }), () => doc.world.width); bindValue($('#worldHeight'), value => change(p => { p.world.height = value; }), () => doc.world.height);
  $('#undoBtn').onclick = () => restoreHistory('undo'); $('#redoBtn').onclick = () => restoreHistory('redo');
  for (const [id, value] of [['selectTool','select'],['placeTool','place'],['panTool','pan']]) $(`#${id}`).onclick = () => setMode(value);
  $('#selectAllBtn').onclick=()=>{selectOnly(null);for(const p of doc.placements)selectedIds.add(p.id);selectedId=doc.placements.at(-1)?.id||null;setMode('select');tab='placement';render();};
  $('#clearSelectionBtn').onclick=()=>{selectOnly(null);render();};
  $('#flipSelectionX').onclick=()=>groupOperation({type:'flip',axis:'x',center:groupCenter()});
  $('#flipSelectionY').onclick=()=>groupOperation({type:'flip',axis:'y',center:groupCenter()});
  $('#gridBtn').onclick = () => { showGrid = !showGrid; $('#gridBtn').classList.toggle('active', showGrid); };
  $('#collisionBtn').onclick = () => { showCollisions = !showCollisions; $('#collisionBtn').classList.toggle('active', showCollisions); };
  $('#fitBtn').onclick = () => { view.zoom = Math.max(.02, Math.min(stage.clientWidth / doc.world.width, stage.clientHeight / doc.world.height) * .9); view.x = (doc.world.width - stage.clientWidth / view.zoom) / 2; view.y = (doc.world.height - stage.clientHeight / view.zoom) / 2; };
  $('#homeBtn').onclick = () => { view = { x: -32, y: -32, zoom: 1 }; }; $('#zoomIn').onclick = () => zoomAt(1.25); $('#zoomOut').onclick = () => zoomAt(.8);
  $('#playBtn').onclick = () => { playing = !playing; $('#playBtn').textContent = playing ? 'Pause' : 'Resume'; }; $('#resetPreview').onclick = resetPreview; $('#scrub').oninput = e => { timeMs = Number(e.target.value);lastFrame=0; };
  for (const node of document.querySelectorAll('[data-tab]')) node.onclick = () => { tab = node.dataset.tab; renderInspector(); };
  stage.onwheel = e => { e.preventDefault(); const r = stage.getBoundingClientRect(); if (e.shiftKey) view.x += e.deltaY / view.zoom; else zoomAt(Math.exp(-e.deltaY * .001), e.clientX - r.left, e.clientY - r.top); };
  stage.onpointerdown = e => {
    if (e.button === 2) return; const point = worldPoint(e); stage.setPointerCapture(e.pointerId);stage.focus();
    const selected=selectedPlacement();
    if(selected&&e.button===0&&!spaceHeld&&!e.ctrlKey&&!e.metaKey&&(mode==='select'||(mode==='place'&&selectedDef===selected.definitionId))){
      const group=selectedPlacements();
      if(group.length>1){
        const states=group.map(previewState),state=getGroupBounds(states),bounds=stage.getBoundingClientRect(),handle=hitTestHandles(getTransformHandles(state,view),{x:e.clientX-bounds.left,y:e.clientY-bounds.top});
        if(handle){pointer={type:`group-${handle.type}`,handle:handle.id,state,point,placements:clone(group),states,before:clone(doc)};return;}
      }else{
      const state=previewState(selected),bounds=stage.getBoundingClientRect();
      const handle=hitTestHandles(editingTrigger&&state.behavior.vanish?triggerHandles(state):getTransformHandles(state,view),{x:e.clientX-bounds.left,y:e.clientY-bounds.top});
      if(handle){pointer={type:handle.type,handle:handle.id,id:selected.id,state,point,x:selected.x,y:selected.y,rect:state.behavior.vanish?.triggerVolume,before:clone(doc)};return;}
      }
    }
    if (e.button === 1 || spaceHeld || e.shiftKey || mode === 'pan') { pointer = { type: 'pan', clientX: e.clientX, clientY: e.clientY, start: { ...view } }; stage.classList.add('panning'); e.preventDefault(); return; }
    if (mode === 'place') { if (!selectedDef) { toast('Choose an asset first.'); return; } change(project => { const p = createPlacement(project, selectedDef, snap(point.x), snap(point.y)); project.placements.push(p); if(resolveGameplay(project.definitions[p.definitionId],p).role==='spawnpoint')project.world.spawnPlacementId=p.id; selectOnly(p.id); });setMode('select');return; }
    const hit = [...doc.placements].sort((a, b) => b.layer - a.layer || doc.placements.indexOf(b) - doc.placements.indexOf(a)).find(p => containsPlacement(previewState(p),point));
    if(hit&&(e.ctrlKey||e.metaKey)){toggleSelection(hit.id);selectedDef=hit.definitionId;tab='placement';render();return;}
    if(hit){
      if(!selectedIds.has(hit.id))selectOnly(hit.id);else selectedId=hit.id;
      selectedDef=hit.definitionId;const group=selectedPlacements();
      pointer=group.length>1?{type:'group-move',point,state:getGroupBounds(group.map(previewState)),placements:clone(group),states:group.map(previewState),before:clone(doc)}:{type:'move',id:hit.id,point,x:hit.x,y:hit.y,before:clone(doc)};
    }else{pointer={type:'marquee',point,end:point,before:clone(doc),selectionBefore:[...selectedIds],primaryBefore:selectedId,additive:e.ctrlKey||e.metaKey};}
    tab='placement';render();
  };
  stage.onpointermove = e => {
    const point = worldPoint(e); $('#cursorLabel').textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
    if (pointer?.type === 'pan') { view.x = pointer.start.x - (e.clientX - pointer.clientX) / view.zoom; view.y = pointer.start.y - (e.clientY - pointer.clientY) / view.zoom; }
    if(pointer?.type==='marquee')pointer.end=point;
    if(pointer?.type.startsWith('group-')){
      const b=pointer.state,center={x:b.x+b.width/2,y:b.y+b.height/2};let operation;
      if(pointer.type==='group-move')operation={type:'move',dx:snap(point.x-pointer.point.x),dy:snap(point.y-pointer.point.y)};
      if(pointer.type==='group-rotate'){
        let degrees=(Math.atan2(point.y-center.y,point.x-center.x)-Math.atan2(pointer.point.y-center.y,pointer.point.x-center.x))*180/Math.PI;
        if(e.shiftKey)degrees=Math.round(degrees/15)*15;operation={type:'rotate',degrees,center};
      }
      if(pointer.type==='group-resize'){
        const h=pointer.handle,anchor={x:h.includes('w')?b.x+b.width:h.includes('e')?b.x:center.x,y:h.includes('n')?b.y+b.height:h.includes('s')?b.y:center.y};
        const handle=getTransformHandles(b,view).find(v=>v.id===h),dx=handle.x-anchor.x,dy=handle.y-anchor.y;
        const minimum=Math.max(...pointer.placements.map(p=>1/Math.min(p.width,p.height)));
        const factor=Math.max(minimum,((point.x-anchor.x)*dx+(point.y-anchor.y)*dy)/(dx*dx+dy*dy));
        operation={type:'scale',factor,anchor};
      }
      if(operation)for(const update of transformGroup(pointer.placements,pointer.states,operation))Object.assign(doc.placements.find(p=>p.id===update.id),update);
    }
    if (pointer?.type === 'move') { const p = doc.placements.find(p => p.id === pointer.id); p.x = snap(pointer.x + point.x - pointer.point.x); p.y = snap(pointer.y + point.y - pointer.point.y); }
    if(pointer?.type==='resize'){
      const p=doc.placements.find(p=>p.id===pointer.id),result=resizePlacement(pointer.state,pointer.handle,point,{lockAspect:e.shiftKey});
      Object.assign(p,result,{x:result.x-(pointer.state.x-pointer.x),y:result.y-(pointer.state.y-pointer.y)});
    }
    if(pointer?.type==='rotate')doc.placements.find(p=>p.id===pointer.id).rotation=rotationForPointer(pointer.state,point,e.shiftKey?15:0);
    if(pointer?.type==='trigger'){
      const p=doc.placements.find(p=>p.id===pointer.id),state=pointer.state,r=pointer.rect,local=worldToLocal(state,point),start=worldToLocal(state,pointer.point);
      let rect;
      if(pointer.handle==='move')rect=[r[0]+(local.x-start.x)/state.width,r[1]+(local.y-start.y)/state.height,r[2],r[3]];
      else{
        const left=pointer.handle.includes('w'),top=pointer.handle.includes('n'),ax=r[0]+(left?r[2]:0),ay=r[1]+(top?r[3]:0);
        const bx=left?Math.min(ax-1/state.width,local.x/state.width):Math.max(ax+1/state.width,local.x/state.width);
        const by=top?Math.min(ay-1/state.height,local.y/state.height):Math.max(ay+1/state.height,local.y/state.height);
        rect=[Math.min(ax,bx),Math.min(ay,by),Math.abs(bx-ax),Math.abs(by-ay)];
      }
      p.settings.vanish={...state.behavior.vanish,triggerVolume:rect};
    }
  };
  stage.onpointerup = () => {
    if(pointer?.type==='marquee'){
      const a=pointer.point,b=pointer.end,left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
      const ids=pointer.additive?[...pointer.selectionBefore]:[];
      if(Math.hypot(a.x-b.x,a.y-b.y)*view.zoom>3)for(const p of doc.placements){const box=placementBounds(previewState(p));if(box.x<=right&&box.x+box.width>=left&&box.y<=bottom&&box.y+box.height>=top)ids.push(p.id);}
      selectOnly(null);for(const id of ids)selectedIds.add(id);selectedId=[...selectedIds].at(-1)||null;pointer=null;render();return;
    }
    const before = pointer?.before; pointer = null; stage.classList.remove('panning'); if (before) finishChange(before);
  }; stage.onpointercancel = cancelPointer;
  window.addEventListener('blur', () => { spaceHeld = false; if (pointer) cancelPointer(); }); document.addEventListener('visibilitychange', () => { lastFrame = 0; });
  window.addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });
  window.addEventListener('keydown', e => {
    if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    if (e.code === 'Space') { spaceHeld = true; e.preventDefault(); } if (e.key === 'Escape') { if (pointer) cancelPointer(); setMode('select'); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault();$('#selectAllBtn').click(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restoreHistory(e.shiftKey ? 'redo' : 'undo'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restoreHistory('redo'); }
  });
}
async function start() {
  try {
    const catalog={assets:{},definitions:{},warnings:['Import an image to create your asset library.']};warnings=catalog.warnings;doc=createDocument(catalog);
    try {
      const revision=await readStored('assetLibraryRevision');
      if(revision!==LIBRARY_REVISION){
        // The user requested a clean library for the image-first timing update.
        // Clear placements too: they reference the removed shared definitions.
        await writeStored({project:clone(doc),library:exportAssetLibrary(doc),assetLibraryRevision:LIBRARY_REVISION});
        localStorage.removeItem(STORAGE_KEY);
        toast('Stale tool assets cleared. Import images to build a fresh library.');
      }else{
        const library=await readStored('library');if(library)doc=importAssetLibrary(doc,library);
        const saved=await readStored('project');if(saved)doc=parseDocument(JSON.stringify(saved));
      }
    }catch(error){toast(`Saved metadata could not be restored: ${error.message}`,true);}
    images = await loadImages(doc.assets,{allowMissing:true});if(images.size<Object.keys(doc.assets).length)warnings.unshift('Some saved images are unavailable; their metadata and placements are retained.');history=new History(doc);
    sequenceEditor=mountSequenceEditor({getDocument:()=>importDraft||doc,getImages:()=>draftImages||images,change:changeMetadata,onMessage:toast});
    assetEditor=mountAssetEditor({getDocument:()=>importDraft||doc,getImages:()=>draftImages||images,change:changeMetadata,onMessage:toast,onSelectDefinition:id=>{if(!importDraft){selectedDef=id;render();}},onAcceptImport:acceptImport,onCancelImport:cancelImport,onExportLibrary:saveAssetMetadata,onEditSequences:id=>sequenceEditor.open(id),onReplaceAtlas:replaceAtlas});
    bind();updateImportControls();updateCharacterControls();render();save();
    requestAnimationFrame(function frame(now) { if (playing && !pointer?.before && !document.hidden && lastFrame) timeMs += Math.min(250, now - lastFrame); lastFrame = now; draw(); requestAnimationFrame(frame); });
  } catch (error) { const node = element('pre', null, `Editor could not start: ${error.message}`, 'error'); document.body.replaceChildren(node); }
}
start();
