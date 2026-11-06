import {resolveGameplay} from './gameplay.js';

// Shared between the main inspector and image import/metadata review.
export function renderVfxControls(parent, {definition, placement, onChange}) {
  const local = (placement ? placement.vfx : definition.vfx) || {};
  const resolved = {...definition.vfx, ...placement?.vfx};
  const role = resolveGameplay(definition, placement || {}).role;
  const node = (tag, text) => { const n = document.createElement(tag); if (text != null) n.textContent = text; return n; };
  function update(key, value) { const next = {...local}; if (value == null) delete next[key]; else next[key] = value; onChange(next); }
  function field(label, value, callback, choices) {
    const wrap = node('label'); wrap.className = 'field'; wrap.append(node('span', label));
    const input = node(choices ? 'select' : 'input'); input.setAttribute('aria-label', label);
    if (choices) for (const [key, text] of choices) input.append(new Option(text, key));
    else input.type = 'color';
    input.value = value; input.onchange = () => callback(input.value); wrap.append(input); parent.append(wrap);
  }
  field('Prop effects', local.enabled == null ? 'inherit' : String(local.enabled), value => update('enabled', value === 'inherit' ? null : value === 'true'), [
    ['inherit', placement ? 'Use asset defaults' : 'Automatic'], ['true', 'Enabled'], ['false', 'Disabled'],
  ]);
  if (definition.kind === 'hazard' || (definition.physics?.lethal && !['enemy', 'projectile', 'beam'].includes(definition.kind))) {
    field('Hazard VFX type', local.hazardType ?? 'inherit', value => update('hazardType', value === 'inherit' ? null : value), [
      ['inherit', placement ? 'Use asset defaults' : 'Automatic from name/tags'], ['auto', 'Automatic from name/tags'],
      ['mushroom', 'Mushroom · spores'], ['thorns', 'Thorns · drifting motes'], ['spike', 'Spike · sharp glints'], ['generic', 'Generic · danger motes'],
    ]);
  }
  if (definition.kind === 'beam' || role === 'exit') {
    field('Glow color source', local.color ? 'custom' : 'inherit', value => update('color', value === 'custom' ? resolved.color || '#aaeeff' : null), [
      ['inherit', placement ? 'Use asset defaults' : 'Default color'], ['custom', 'Custom color'],
    ]);
    if (local.color) field(role === 'exit' ? 'Exit portal glow color' : 'Beam glow color', local.color, value => update('color', value));
  }
  const hint = node('p', placement ? 'Cosmetic overrides affect this placement. Collision, triggers and movement stay authored.' : 'Effects follow gameplay roles and platform behavior. These defaults apply to every placement.');
  hint.className = 'muted'; parent.append(hint);
  if(definition.kind==='platform'){
    const note=node('p','Moving and vanishing platforms have floating motes automatically. Choose Enabled to add motes to a stationary floating platform.');note.className='muted';parent.append(note);
  }
}
