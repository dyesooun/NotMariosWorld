import { loadForestCatalog, createTilesetCatalog } from './catalog.js';
import { createDocument, validateDocument, parseDocument, serializeDocument, createPlacement, clone, History } from './document.js';
import { loadImages, drawPlacement, drawThumbnail, getPreviewState } from './preview.js';
import { placementBounds,containsPlacement,getTransformHandles,hitTestHandles,resizePlacement,rotationForPointer } from './transforms.js';
import { buildAutomaticManifest,readAtlasPixels } from './auto-tileset.js';
import { mountAssetEditor } from './asset-editor.js';
import { exportAssetLibrary,importAssetLibrary,exportTilesetManifest } from './metadata.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage'), context = stage.getContext('2d'), STORAGE_KEY = 'nmw-level-editor';
let doc, history, images = new Map(), selectedId = null, selectedDef = null;
let mode = 'select', tab = 'placement', filter = 'all', showGrid = true, showCollisions = false;
let view = { x: -32, y: -32, zoom: 1 }, pointer = null, playing = false, timeMs = 0, lastFrame = 0;
let warnings = [], spaceHeld = false;
let assetEditor,metadataSchema;
const getSchema=async()=>metadataSchema ||= await (await fetch('/assets/sprites/schema.json')).json();

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
function save() {
  try { localStorage.setItem(STORAGE_KEY, serializeDocument(doc)); $('#saveStatus').textContent = 'Saved in this browser'; }
  catch { $('#saveStatus').textContent = 'Autosave unavailable — use Export JSON'; }
  $('#undoBtn').disabled = !history.canUndo; $('#redoBtn').disabled = !history.canRedo;
}
function finishChange(before) {
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
function snap(value) { const size = Math.max(1, Number($('#snap').value) || 1); return Math.round(value / size) * size; }
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
    const grid = Math.max(1, Number($('#snap').value) || 16), stride = grid * Math.max(1, Math.ceil(8 / view.zoom / grid));
    context.beginPath(); context.strokeStyle = '#b5e6cc18'; context.lineWidth = 1 / view.zoom;
    const maxX = Math.min(doc.world.width, view.x + bounds.width / view.zoom), maxY = Math.min(doc.world.height, view.y + bounds.height / view.zoom);
    for (let x = Math.max(0, Math.ceil(view.x / stride) * stride); x <= maxX; x += stride) { context.moveTo(x, 0); context.lineTo(x, doc.world.height); }
    for (let y = Math.max(0, Math.ceil(view.y / stride) * stride); y <= maxY; y += stride) { context.moveTo(0, y); context.lineTo(doc.world.width, y); }
    context.stroke();
  }
  for (const placement of [...doc.placements].sort((a, b) => a.layer - b.layer)) {
    const state = getPreviewState(doc, placement, timeMs),box=placementBounds(state);
    if (box.x + box.width < view.x || box.x > view.x + bounds.width / view.zoom || box.y + box.height < view.y || box.y > view.y + bounds.height / view.zoom) continue;
    drawPlacement(context, doc, placement, images, { timeMs, collisions: showCollisions, selected: placement.id === selectedId });
  }
  const selected=selectedPlacement();
  if(selected){
    const handles=getTransformHandles(getPreviewState(doc,selected,timeMs),view),top=handles.find(h=>h.id==='n'),rotate=handles.find(h=>h.id==='rotate');
    context.beginPath();context.moveTo(top.x,top.y);context.lineTo(rotate.x,rotate.y);context.strokeStyle='#ffebad';context.lineWidth=1/view.zoom;context.stroke();
    for(const handle of handles){
      context.fillStyle=handle.type==='rotate'?'#f5b77c':handle.type==='move'?'#79d6ff':'#fff3c8';
      context.beginPath();context.arc(handle.x,handle.y,(handle.type==='move'?5:4)/view.zoom,0,Math.PI*2);context.fill();context.strokeStyle='#24323a';context.stroke();
    }
  }
  context.strokeStyle = '#86b6a6'; context.lineWidth = 1 / view.zoom; context.strokeRect(0, 0, doc.world.width, doc.world.height); context.restore();
  $('#timeLabel').textContent = `${(timeMs / 1000).toFixed(2)}s`; $('#scrub').value = timeMs;
  $('#zoomLabel').textContent = `${Math.round(view.zoom * 100)}%`;
}

function renderPalette() {
  const container = $('#assetList'), scroll = container.parentElement.scrollTop;
  const query = $('#assetSearch').value.toLowerCase(); container.replaceChildren();
  const definitions = Object.values(doc.definitions).filter(d => (filter === 'all' || d.kind === filter) && `${d.name} ${d.id}`.toLowerCase().includes(query));
  $('#assetCount').textContent = `${definitions.length}/${Object.keys(doc.definitions).length}`;
  for (const definition of definitions) {
    const node = element('button', container, null, `asset-card${selectedDef === definition.id ? ' selected' : ''}`);
    node.title = `${definition.name} · ${definition.physics.calibration}`;
    const canvas = element('canvas', node); canvas.width = 100; canvas.height = 60;
    element('div', node, definition.name); drawThumbnail(canvas, doc, definition.id, images);
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
  field(parent, 'Definition name', definition.name, value => editDefinition(d => { d.name = value; }));
  field(parent,'Asset role',definition.kind,value=>editDefinition(d=>{
    d.kind=value;
    if(value==='platform')d.behavior={type:'static'};
    else if(!['enemy','projectile','beam'].includes(value))d.behavior={type:'static'};
  }),{choices:['platform','prop','chest','hazard','background','enemy','beam','projectile']});
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
  const area = section(parent, 'Placement behavior');
  const number = (label, key, fallback) => field(area, label, behavior[key] ?? fallback, value => editPlacement(p => { p.settings[key] = value; }), { type: 'number' });
  if (definition.kind === 'platform') {
    field(area, 'Platform motion', behavior.type, value => editPlacement(p => {
      p.settings = { ...p.settings, type: value, axis: behavior.axis || 'x', distance: behavior.distance ?? 80, periodMs: behavior.periodMs ?? 4000, phaseMs: behavior.phaseMs ?? 0 };
    }), { choices: [['static','Static'],['moving','Moving']] });
    if (behavior.type === 'moving') {
      field(area, 'Movement axis', behavior.axis, value => editPlacement(p => { p.settings.axis = value; }), { choices: ['x','y'] });
      number('Travel ± pixels', 'distance', 80); number('Cycle milliseconds', 'periodMs', 4000); number('Phase milliseconds', 'phaseMs', 0);
      element('p', area, 'One complete back-and-forth cycle uses the configured duration.', 'muted');
    }
  }
  if (definition.kind === 'beam') {
    number('ON milliseconds', 'onMs', 1000); number('OFF milliseconds', 'offMs', 1000); number('Phase milliseconds', 'phaseMs', 0);
    field(area, 'Initial beam state', behavior.startState, value => editPlacement(p => { p.settings.startState = value; }), { choices: ['on','off'] });
  }
  const animations = Object.keys(definition.visual.animations || {});
  if (animations.length) field(area, 'Preview animation', placement.animation || '', value => editPlacement(p => { if (value) p.animation = value; else delete p.animation; }), { choices: [['','Definition default'], ...animations] });
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
    const node = element('button', container, `${p.layer} · ${doc.definitions[p.definitionId].name} · ${Math.round(p.x)}, ${Math.round(p.y)}`, `object${p.id === selectedId ? ' selected' : ''}`);
    node.onclick = () => { selectedId = p.id; selectedDef = p.definitionId; setMode('select'); renderInspector(); renderObjects(); renderPalette(); };
    node.ondblclick = () => { view.x = p.x - stage.clientWidth / view.zoom / 2 + p.width / 2; view.y = p.y - stage.clientHeight / view.zoom / 2 + p.height / 2; };
  }
}
function render() {
  if (!doc) return;
  $('#docName').value = doc.name; $('#worldWidth').value = doc.world.width; $('#worldHeight').value = doc.world.height;
  $('#worldBiome').value=doc.biome||'custom';
  $('#emptyNotice').hidden = !!doc.placements.length;
  const count = Object.values(doc.definitions).filter(d => d.physics.calibration === 'estimated').length;
  $('#warningBar').textContent = `${count} definitions have estimated geometry. Review with Colliders and Shared Definition. ${warnings[0] || ''}`;
  renderPalette(); renderInspector(); renderObjects();
  assetEditor?.refresh();
}
function duplicate() {
  const p = selectedPlacement(); if (!p) return;
  change(project => { const copy = clone(p); copy.id = crypto.randomUUID(); copy.x += Number($('#snap').value) || 16; project.placements.push(copy); selectedId = copy.id; });
}
function removeSelected() {
  if (!selectedId) return; const removedId = selectedId;
  change(project => { project.placements = project.placements.filter(p => p.id !== removedId); for (const p of project.placements) if (p.settings.supportId === removedId) delete p.settings.supportId; selectedId = null; });
}
async function restoreHistory(direction) {
  const candidate = history[direction](); if (!candidate) return;
  try { const loaded = await loadImages(candidate.assets); doc = candidate; images = loaded; selectedId = null; render(); save(); }
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
async function saveTilesetManifest(assetId){try{const manifest=exportTilesetManifest(doc,assetId,await getSchema());downloadJSON(manifest,`${assetId}-manifest.json`);toast('Corrected generic tileset manifest exported.');}catch(error){toast(error.message,true);}}
async function loadAssetMetadata(file){
  try{
    if(file.size>100*1024*1024)throw new Error('Metadata exceeds 100 MB.');
    const library=JSON.parse(await file.text()),schema=await getSchema(),candidate=importAssetLibrary(doc,library,schema),loaded=await loadImages(candidate.assets);
    if(change(project=>{const merged=importAssetLibrary(project,library,schema);project.assets=merged.assets;project.definitions=merged.definitions;})){
      images=new Map([...images,...loaded]);render();toast('Shared metadata applied to matching assets and existing placements.');
    }
  }catch(error){toast(`Metadata rejected: ${error.message}`,true);}finally{$('#importMetadata').value='';}
}
async function importProject(file) {
  try {
    const candidate = parseDocument(await file.text()), loaded = await loadImages(candidate.assets);
    doc = candidate; images = loaded; history = new History(doc); selectedId = selectedDef = null; playing = false; timeMs = 0;
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
    if (change(project => { Object.assign(project.assets, pack.assets); Object.assign(project.definitions, pack.definitions); })) {
      images = new Map([...images, ...loaded]); warnings = [...extraWarnings,...warnings, ...(pack.warnings || [])]; render();toast(extraWarnings[0]||'Tileset validated and imported. Its image is included in exported JSON.');
      const first=Object.keys(pack.definitions)[0];selectedDef=first;if(first)assetEditor.open(first);
    }
  } catch (error) { toast(`Tileset rejected: ${error.message}`, true); }
  finally { $('#tilesetManifest').value = ''; $('#tilesetImage').value = ''; updateImportControls(); }
}
function updateImportControls() {
  const manifest = $('#tilesetManifest').files[0], image = $('#tilesetImage').files[0];
  $('#importTilesetBtn').disabled = !image || ($('#importMode').value==='manifest'&&!manifest);
  $('#packFileNames').textContent = `${manifest?.name || 'No manifest selected'} · ${image?.name || 'No image selected'}`;
  $('#autoCutOptions').hidden=$('#importMode').value==='manifest';$('#alphaCutOptions').hidden=$('#importMode').value!=='alpha';$('#gridCutOptions').hidden=$('#importMode').value!=='grid';
}
function cancelPointer() { if (pointer?.before) doc = pointer.before; pointer = null; stage.classList.remove('panning'); renderInspector(); renderObjects(); }
function bind() {
  for (const kind of ['all','platform','enemy','chest','background','prop','hazard','beam','projectile']) button($('#kindFilters'), kind, () => { filter = kind; renderPalette(); });
  $('#assetSearch').oninput = renderPalette;
  $('#newBtn').onclick = () => { doc = createDocument(doc); history = new History(doc); selectedId = selectedDef = null; playing = false; timeMs = 0; view = { x: -32, y: -32, zoom: 1 }; render(); save(); };
  $('#importJson').onchange = e => { if (e.target.files[0]) importProject(e.target.files[0]); }; $('#exportBtn').onclick = exportProject;
  $('#tilesetManifest').onchange = ()=>{$('#importMode').value='manifest';updateImportControls();}; $('#tilesetImage').onchange = updateImportControls; $('#importTilesetBtn').onclick = importTileset;$('#importMode').onchange=updateImportControls;
  $('#saveMetadataBtn').onclick=saveAssetMetadata;$('#importMetadata').onchange=e=>{if(e.target.files[0])loadAssetMetadata(e.target.files[0]);};
  $('#assetEditorBtn').onclick=()=>assetEditor.open(selectedDef||selectedPlacement()?.definitionId);
  bindValue($('#docName'), value => change(p => { p.name = value; }), () => doc.name);
  bindValue($('#worldBiome'),value=>change(p=>{p.biome=value;}),()=>doc.biome);
  bindValue($('#worldWidth'), value => change(p => { p.world.width = value; }), () => doc.world.width); bindValue($('#worldHeight'), value => change(p => { p.world.height = value; }), () => doc.world.height);
  $('#undoBtn').onclick = () => restoreHistory('undo'); $('#redoBtn').onclick = () => restoreHistory('redo');
  for (const [id, value] of [['selectTool','select'],['placeTool','place'],['panTool','pan']]) $(`#${id}`).onclick = () => setMode(value);
  $('#gridBtn').onclick = () => { showGrid = !showGrid; $('#gridBtn').classList.toggle('active', showGrid); };
  $('#collisionBtn').onclick = () => { showCollisions = !showCollisions; $('#collisionBtn').classList.toggle('active', showCollisions); };
  $('#fitBtn').onclick = () => { view.zoom = Math.max(.02, Math.min(stage.clientWidth / doc.world.width, stage.clientHeight / doc.world.height) * .9); view.x = (doc.world.width - stage.clientWidth / view.zoom) / 2; view.y = (doc.world.height - stage.clientHeight / view.zoom) / 2; };
  $('#homeBtn').onclick = () => { view = { x: -32, y: -32, zoom: 1 }; }; $('#zoomIn').onclick = () => zoomAt(1.25); $('#zoomOut').onclick = () => zoomAt(.8);
  $('#playBtn').onclick = () => { playing = !playing; $('#playBtn').textContent = playing ? 'Pause' : 'Preview'; }; $('#resetPreview').onclick = () => { timeMs = 0; }; $('#scrub').oninput = e => { timeMs = Number(e.target.value); };
  for (const node of document.querySelectorAll('[data-tab]')) node.onclick = () => { tab = node.dataset.tab; renderInspector(); };
  stage.onwheel = e => { e.preventDefault(); const r = stage.getBoundingClientRect(); if (e.shiftKey) view.x += e.deltaY / view.zoom; else zoomAt(Math.exp(-e.deltaY * .001), e.clientX - r.left, e.clientY - r.top); };
  stage.onpointerdown = e => {
    if (e.button === 2) return; const point = worldPoint(e); stage.setPointerCapture(e.pointerId);
    const selected=selectedPlacement();
    if(selected&&e.button===0&&!spaceHeld&&(mode==='select'||(mode==='place'&&selectedDef===selected.definitionId))){
      const state=getPreviewState(doc,selected,timeMs),bounds=stage.getBoundingClientRect();
      const handle=hitTestHandles(getTransformHandles(state,view),{x:e.clientX-bounds.left,y:e.clientY-bounds.top});
      if(handle){playing=false;$('#playBtn').textContent='Preview';pointer={type:handle.type,handle:handle.id,id:selected.id,state,point,x:selected.x,y:selected.y,before:clone(doc)};return;}
    }
    if (e.button === 1 || spaceHeld || e.shiftKey || mode === 'pan') { pointer = { type: 'pan', clientX: e.clientX, clientY: e.clientY, start: { ...view } }; stage.classList.add('panning'); e.preventDefault(); return; }
    if (mode === 'place') { if (!selectedDef) { toast('Choose an asset first.'); return; } change(project => { const p = createPlacement(project, selectedDef, snap(point.x), snap(point.y)); project.placements.push(p); selectedId = p.id; }); return; }
    const hit = [...doc.placements].sort((a, b) => b.layer - a.layer || doc.placements.indexOf(b) - doc.placements.indexOf(a)).find(p => containsPlacement(getPreviewState(doc,p,timeMs),point));
    selectedId = hit?.id || null;
    if (hit) { selectedDef = hit.definitionId; playing = false; $('#playBtn').textContent = 'Preview'; pointer = { type: 'move', id: hit.id, point, x: hit.x, y: hit.y, before: clone(doc) }; }
    renderInspector(); renderObjects(); renderPalette();
  };
  stage.onpointermove = e => {
    const point = worldPoint(e); $('#cursorLabel').textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
    if (pointer?.type === 'pan') { view.x = pointer.start.x - (e.clientX - pointer.clientX) / view.zoom; view.y = pointer.start.y - (e.clientY - pointer.clientY) / view.zoom; }
    if (pointer?.type === 'move') { const p = doc.placements.find(p => p.id === pointer.id); p.x = snap(pointer.x + point.x - pointer.point.x); p.y = snap(pointer.y + point.y - pointer.point.y); }
    if(pointer?.type==='resize'){
      const p=doc.placements.find(p=>p.id===pointer.id),result=resizePlacement(pointer.state,pointer.handle,point,{lockAspect:e.shiftKey});
      Object.assign(p,result,{x:result.x-(pointer.state.x-pointer.x),y:result.y-(pointer.state.y-pointer.y)});
    }
    if(pointer?.type==='rotate')doc.placements.find(p=>p.id===pointer.id).rotation=rotationForPointer(pointer.state,point,e.shiftKey?15:0);
  };
  stage.onpointerup = () => { const before = pointer?.before; pointer = null; stage.classList.remove('panning'); if (before) finishChange(before); }; stage.onpointercancel = cancelPointer;
  window.addEventListener('blur', () => { spaceHeld = false; if (pointer) cancelPointer(); }); document.addEventListener('visibilitychange', () => { lastFrame = 0; });
  window.addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });
  window.addEventListener('keydown', e => {
    if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    if (e.code === 'Space') { spaceHeld = true; e.preventDefault(); } if (e.key === 'Escape') { if (pointer) cancelPointer(); setMode('select'); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restoreHistory(e.shiftKey ? 'redo' : 'undo'); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restoreHistory('redo'); }
  });
}
async function start() {
  try {
    const catalog = await loadForestCatalog(); warnings = catalog.warnings || []; doc = createDocument(catalog);
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) doc = parseDocument(saved); } catch (error) { toast(`Saved project could not be restored: ${error.message}`, true); }
    images = await loadImages(doc.assets); history = new History(doc);
    assetEditor=mountAssetEditor({getDocument:()=>doc,getImages:()=>images,change,onMessage:toast,onSelectDefinition:id=>{selectedDef=id;render();},onExportManifest:saveTilesetManifest,onExportLibrary:saveAssetMetadata});
    bind();updateImportControls();render();save();
    requestAnimationFrame(function frame(now) { if (playing && !document.hidden && lastFrame) timeMs = (timeMs + Math.min(250, now - lastFrame)) % 600000; lastFrame = now; draw(); requestAnimationFrame(frame); });
  } catch (error) { const node = element('pre', null, `Editor could not start: ${error.message}`, 'error'); document.body.replaceChildren(node); }
}
start();
