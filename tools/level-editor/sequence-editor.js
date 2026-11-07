import { drawThumbnail } from './preview.js';
import { maskedFrameSource } from '../../public/game/json-level/frame-outline.js';

export function remapRuntimeSequenceReferences(behavior, oldName, nextName = null) {
  if (!behavior || typeof behavior !== 'object') return behavior;
  if (behavior.states) for (const key of Object.keys(behavior.states)) if (behavior.states[key] === oldName) behavior.states[key] = nextName;
  if (behavior.flightAnimation === oldName) behavior.flightAnimation = nextName;
  if (behavior.impactAnimation === oldName) behavior.impactAnimation = nextName;
  return behavior;
}

/**
 * Set whether an ordered animation frame is an authored melee damage window.
 * Keep an explicit empty array when the last window is cleared: an absent or
 * empty list is intentionally harmless at runtime.
 */
export function setDamageFrameActive(animation, index, active) {
  if (!animation || !Number.isInteger(index) || index < 0 || (Array.isArray(animation.frames) && index >= animation.frames.length)) return animation;
  const indices = new Set(Array.isArray(animation.damage_active_indices)
    ? animation.damage_active_indices.filter(Number.isInteger)
    : []);
  if (active) indices.add(index);
  else indices.delete(index);
  animation.damage_active_indices = [...indices].sort((a, b) => a - b);
  return animation;
}

export function remapAnimationEventIndices(animation, mapping) {
  if (!animation || !Array.isArray(mapping)) return animation;
  for (const key of ['damage_active_indices', 'spawn_projectile_at_indices']) {
    if (Array.isArray(animation[key])) animation[key] = animation[key].map(index => mapping[index]).filter(index => index != null).sort((a, b) => a - b);
  }
  if (Number.isInteger(animation.spawn_projectile_at_index)) {
    animation.spawn_projectile_at_index = mapping[animation.spawn_projectile_at_index];
    if (animation.spawn_projectile_at_index == null) delete animation.spawn_projectile_at_index;
  }
  return animation;
}

/**
 * Character sequence editor. Functional mappings choose states at runtime.
 * The selected preview state and
 * preview clock are intentionally kept outside the document.
 */
export function mountSequenceEditor({ getDocument, getImages, change, onMessage }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'asset-editor sequence-editor';
  dialog.setAttribute('aria-label', 'Character states and sequences');
  dialog.style.cssText = 'width:min(980px,96vw);height:min(760px,92vh);overflow:auto;';
  document.body.append(dialog);

  const header = el('div', dialog, null, 'asset-editor-header');
  const title = el('strong', header, 'Character states and sequences');
  const close = button(header, 'Close', () => dialog.close());
  const note = el('p', dialog,
    'Map gameplay animations in Shared Definition → Runtime behavior. This preview does not change the actor’s current gameplay state.', 'hint');
  const controls = el('div', dialog, null, 'sequence-controls');
  const preview = el('div', dialog, null, 'sequence-preview');
  const canvas = el('canvas', preview); canvas.width = 420; canvas.height = 300;
  canvas.setAttribute('aria-label', 'Character state preview');
  const previewBar = el('div', preview, null, 'sequence-preview-bar');
  const playButton = button(previewBar, 'Pause', () => { playing = !playing; playButton.textContent = playing ? 'Pause' : 'Preview'; last = 0; });
  button(previewBar, 'Restart', () => { elapsed = 0; last = 0; draw(); });
  const previewLabel = el('span', previewBar, '');
  const statesPanel = el('div', dialog, null, 'sequence-states');
  const statesList = el('div', statesPanel, null, 'asset-frame-list'); statesList.setAttribute('role', 'listbox');
  const addStateButton = button(statesPanel, 'Add state', () => addState());
  const stateEditor = el('div', statesPanel, null, 'sequence-state-editor');
  const sourcePanel = el('div', dialog, null, 'sequence-source');
  const sourceList = el('div', sourcePanel, null, 'asset-frame-list');
  const status = el('p', dialog, '', 'hint');

  let definitionId = null, stateName = null, playing = true, elapsed = 0, last = 0, raf = 0;
  const doc = () => getDocument();
  const definition = () => doc().definitions?.[definitionId];
  const animationMap = () => definition()?.visual?.animations || {};
  const frames = () => {
    const d = definition(), asset = d && doc().assets[d.visual.assetId];
    return asset ? Object.entries(asset.frames) : [];
  };
  const state = () => animationMap()[stateName];

  function el(tag, parent, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    parent?.append(node);
    return node;
  }
  function button(parent, text, callback) { const b = el('button', parent, text); b.onclick = callback; return b; }
  function field(parent, label, value, type, callback) {
    const wrapper = el('label', parent, null, 'field'); el('span', wrapper, label);
    const input = el('input', wrapper); input.type = type || 'text'; input.value = value ?? ''; input.setAttribute('aria-label', label);
    if (type === 'number') { input.min = '0.01'; input.max = '120'; input.step = '0.01'; }
    if (type === 'checkbox') input.checked = !!value;
    const apply = () => callback(type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value);
    input.onchange = apply; input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } };
    return input;
  }
  function select(parent, label, options, value, callback) {
    const wrapper = el('label', parent, null, 'field'); el('span', wrapper, label);
    const input = el('select', wrapper); input.setAttribute('aria-label', label);
    for (const [key, text] of options) input.append(new Option(text, key));
    input.value = value || options[0]?.[0] || ''; input.onchange = () => callback(input.value); return input;
  }
  function ensureState() {
    const names = Object.keys(animationMap());
    if (!names.length) return;
    if (!names.includes(stateName)) stateName = definition().visual.defaultAnimation || names[0];
  }
  function mutate(callback) {
    try { const result = change(callback); if (result === false) return false; ensureState(); refresh(); draw(); return true; }
    catch (error) { onMessage?.(error.message, true); return false; }
  }
  function remapEventIndices(animation, mapping) {
    remapAnimationEventIndices(animation, mapping);
  }
  function addState() {
    const base = 'state'; let name = base, i = 2;
    while (animationMap()[name]) name = `${base}-${i++}`;
    const first = frames()[0]?.[0]; if (!first) return onMessage?.('Add a source frame before creating a state.', true);
    if (mutate(project => {
      const d = project.definitions[definitionId]; d.visual.animations ||= {};
      d.visual.animations[name] = { frames: [first], fps: 8, loop: true }; d.visual.defaultAnimation ||= name;
    })) { stateName = name; elapsed = 0; last = 0; refresh(); draw(); }
  }
  function animationFrames(name = stateName) { return animationMap()[name]?.frames || []; }
  function draw() {
    if (!dialog.open || !definition()) return;
    const d = definition();
    drawThumbnail(canvas, doc(), d.id, getImages(), { timeMs: elapsed, animation: stateName });
    previewLabel.textContent = `${stateName || 'No state'} · ${(elapsed / 1000).toFixed(2)}s`;
  }
  function renderStateList() {
    statesList.replaceChildren();
    for (const name of Object.keys(animationMap())) {
      const item = button(statesList, name, () => { stateName = name; elapsed = 0; last = 0; refresh(); draw(); });
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(name === stateName));
      if (name === stateName) item.classList.add('selected');
    }
    addStateButton.disabled = !frames().length;
  }
  function renderEditor() {
    stateEditor.replaceChildren(); sourcePanel.querySelector('h4')?.remove(); sourceList.replaceChildren();
    ensureState(); const current = state(); if (!current) return;
    field(stateEditor, 'State name', stateName, 'text', value => {
      const next = String(value).trim(); if (!next || next === stateName) return;
      if (animationMap()[next]) return onMessage?.('State names must be unique.', true);
      const old = stateName; stateName = next;
      if (!mutate(project => {
        const animations = project.definitions[definitionId].visual.animations;
        animations[next] = animations[old]; delete animations[old];
        if (project.definitions[definitionId].visual.defaultAnimation === old) project.definitions[definitionId].visual.defaultAnimation = next;
        remapRuntimeSequenceReferences(project.definitions[definitionId].behavior, old, next);
        for (const placement of project.placements || []) if (placement.definitionId === definitionId) {
          if (placement.animation === old) placement.animation = next;
          remapRuntimeSequenceReferences(placement.settings, old, next);
        }
      })) stateName = old;
      else { elapsed = 0; last = 0; }
    });
    field(stateEditor, 'FPS', current.fps ?? 8, 'number', value => {
      if (!Number.isFinite(value) || value <= 0 || value > 120) return onMessage?.('FPS must be between 0 and 120.', true);
      mutate(project => { project.definitions[definitionId].visual.animations[stateName].fps = value; });
    });
    field(stateEditor, 'Loop', current.loop !== false, 'checkbox', value => mutate(project => { project.definitions[definitionId].visual.animations[stateName].loop = value; }));
    select(stateEditor, 'Default state', Object.keys(animationMap()).map(name => [name, name]), definition().visual.defaultAnimation || stateName, value => mutate(project => { project.definitions[definitionId].visual.defaultAnimation = value; }));
    const actions = el('div', stateEditor, null, 'sequence-actions');
    button(actions, 'Delete state', () => {
      if (Object.keys(animationMap()).length <= 1) return onMessage?.('A character must keep at least one state.', true);
      const names = Object.keys(animationMap()), next = names.find(name => name !== stateName);
      const old = stateName; stateName = next;
      if (!mutate(project => { const d = project.definitions[definitionId]; delete d.visual.animations[old]; if (d.visual.defaultAnimation === old) d.visual.defaultAnimation = next; remapRuntimeSequenceReferences(d.behavior, old, null); for (const placement of project.placements || []) if (placement.definitionId === definitionId) { if (placement.animation === old) delete placement.animation; remapRuntimeSequenceReferences(placement.settings, old, null); } })) stateName = old;
      else { elapsed = 0; last = 0; }
    });
    el('h4', stateEditor, 'Ordered frames');
    el('p', stateEditor,
      'Mark the frames that can deal melee damage in a mapped runtime sequence. Draw its attack region under Asset metadata → Edit mode → Damage hitbox. Body contact stays harmless.',
      'hint');
    const ordered = el('div', stateEditor, null, 'asset-frame-list');
    animationFrames().forEach((frameId, index) => {
      const row = el('div', ordered, null, 'sequence-frame-row'); el('span', row, `${index + 1}. ${frameId}`);
      const damageLabel = el('label', row, null, 'sequence-damage-toggle');
      const damageInput = el('input', damageLabel);
      damageInput.type = 'checkbox';
      damageInput.checked = Array.isArray(current.damage_active_indices) && current.damage_active_indices.includes(index);
      damageInput.setAttribute('aria-label', `Damage active frame ${index + 1} (${frameId})`);
      el('span', damageLabel, 'Damage active');
      damageInput.onchange = () => mutate(project => {
        setDamageFrameActive(project.definitions[definitionId].visual.animations[stateName], index, damageInput.checked);
        const d = project.definitions[definitionId];
        if (damageInput.checked && d.kind === 'enemy' && d.behavior?.actorType === 'creature') {
          d.physics.lethal = true; d.physics.calibration = 'authored';
        }
      });
      button(row, '↑', () => { if (index) mutate(project => { const a = project.definitions[definitionId].visual.animations[stateName].frames; [a[index - 1], a[index]] = [a[index], a[index - 1]]; const mapping = a.map((_, i) => i); [mapping[index - 1], mapping[index]] = [mapping[index], mapping[index - 1]]; remapEventIndices(project.definitions[definitionId].visual.animations[stateName], mapping); }); });
      button(row, '↓', () => { if (index < animationFrames().length - 1) mutate(project => { const a = project.definitions[definitionId].visual.animations[stateName].frames; [a[index + 1], a[index]] = [a[index], a[index + 1]]; const mapping = a.map((_, i) => i); [mapping[index], mapping[index + 1]] = [mapping[index + 1], mapping[index]]; remapEventIndices(project.definitions[definitionId].visual.animations[stateName], mapping); }); });
      button(row, 'Remove', () => { if (animationFrames().length <= 1) return onMessage?.('A state must keep at least one frame.', true); mutate(project => { const a = project.definitions[definitionId].visual.animations[stateName].frames, mapping = a.map((_, i) => i === index ? null : i < index ? i : i - 1); a.splice(index, 1); remapEventIndices(project.definitions[definitionId].visual.animations[stateName], mapping); }); });
    });
    sourcePanel.prepend(el('h4', null, 'Source frames'));
    for (const [id, frame] of frames()) {
      const row = el('div', sourceList, null, 'sequence-frame-row');
      const thumb = el('canvas', row); thumb.width = 52; thumb.height = 40; thumb.setAttribute('aria-label', `Preview source frame ${frame.name || id}`);
      const img = getImages().get(definition().visual.assetId); if (img) { const c = thumb.getContext('2d'); c.imageSmoothingEnabled = false; const scale = Math.min(48 / frame.w, 36 / frame.h), source = frame.clipPolygon ? maskedFrameSource(img, frame, frame.clipPolygon) : img; c.drawImage(source, frame.clipPolygon ? 0 : frame.x, frame.clipPolygon ? 0 : frame.y, frame.w, frame.h, (52 - frame.w * scale) / 2, (40 - frame.h * scale) / 2, frame.w * scale, frame.h * scale); }
      el('span', row, frame.name || id);
      button(row, 'Add frame', () => mutate(project => { project.definitions[definitionId].visual.animations[stateName].frames.push(id); }));
    }
    status.textContent = `Engine uses mappings · preview selection stays local · ${Object.keys(animationMap()).length} sequence${Object.keys(animationMap()).length === 1 ? '' : 's'} · ${animationFrames().length} frame${animationFrames().length === 1 ? '' : 's'} in ${stateName}.`;
  }
  function refresh() { if (!dialog.open) return; renderStateList(); renderEditor(); draw(); }
  function tick(now) {
    if (dialog.open) {
      if (playing && last) elapsed += Math.min(250, now - last);
      last = now; draw(); raf = requestAnimationFrame(tick);
    } else { raf = 0; last = 0; }
  }
  dialog.addEventListener('close', () => { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
  });
  return {
    open(id) {
      const d = doc().definitions?.[id];
      if (!d || !['character', 'enemy', 'projectile'].includes(d.kind)) return onMessage?.('Choose a character, enemy, or projectile asset first.', true);
      definitionId = id; stateName = d.visual.defaultAnimation || Object.keys(d.visual.animations || {})[0];
      if (!stateName) return onMessage?.('This character has no states yet.', true);
      playing = true; elapsed = 0; last = 0; if (!dialog.open) dialog.showModal(); refresh(); if (!raf) raf = requestAnimationFrame(tick);
    },
    refresh,
  };
}
