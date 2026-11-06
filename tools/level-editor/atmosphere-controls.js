import {resolveAtmosphere, forestFogCards} from '../../public/game/json-level/atmosphere.js';

export function renderAtmosphereControls(parent, {project, onChange, center}) {
  const node = (tag, text) => { const n = document.createElement(tag); if (text != null) n.textContent = text; return n; };
  const resolved = resolveAtmosphere(project);
  const update = callback => { const next = structuredClone(resolved); callback(next); onChange(next); };
  function field(parent, label, value, callback, {type = 'number', choices} = {}) {
    const wrap = node('label'); wrap.className = 'field'; wrap.append(node('span', label));
    const input = node(choices ? 'select' : 'input'); input.setAttribute('aria-label', label);
    if (choices) for (const [key, text] of choices) input.append(new Option(text, key));
    else { input.type = type; input.step = 'any'; }
    input.value = value; input.onchange = () => callback(type === 'number' && !choices ? Number(input.value) : input.value);
    wrap.append(input); parent.append(wrap);
  }
  function button(parent, text, callback) { const b = node('button', text); b.onclick = callback; parent.append(b); }
  parent.append(node('h3', 'Atmosphere · fog cards'));
  const hint = node('p', 'Soft drifting mist stays in individual world-space pockets. Forest levels have sparse automatic cards; use custom cards to position mist exactly.'); hint.className = 'muted'; parent.append(hint);
  field(parent, 'Atmosphere mode', project.world.atmosphere == null ? 'auto' : resolved.enabled ? 'custom' : 'off', value => {
    if (value === 'auto') onChange(null);
    else update(next => { next.enabled = value === 'custom'; });
  }, {choices: [['auto', 'Automatic for biome'], ['custom', 'Custom fog cards'], ['off', 'Off']]});
  if (!resolved.enabled) return;
  field(parent, 'Mist color', resolved.color, value => update(next => { next.color = value; }), {type: 'color'});
  field(parent, 'Mist opacity percent', resolved.opacity * 100, value => update(next => { next.opacity = value / 100; }));
  button(parent, 'Add fog card at view center', () => update(next => {
    next.enabled = true; next.cards.push({x: Math.round(center.x - 220), y: Math.round(center.y - 40), width: 440, height: 80, drift: 32, speed: 6});
  }));
  button(parent, 'Use sparse forest pockets', () => update(next => { next.enabled = true; next.cards = forestFogCards(project.world); }));
  button(parent, 'Clear fog cards', () => update(next => { next.cards = []; }));
  for (const [i, card] of resolved.cards.entries()) {
    const group = node('details'); group.className = 'section'; group.append(node('summary', `Fog card ${i + 1} · ${Math.round(card.x)}, ${Math.round(card.y)}`)); parent.append(group);
    for (const [key, label, fallback] of [['x', 'X', 0], ['y', 'Y', 0], ['width', 'Width', 440], ['height', 'Height', 80], ['drift', 'Drift pixels', 32], ['speed', 'Drift speed', 6]]) {
      field(group, `Fog ${i + 1} ${label}`, card[key] ?? fallback, value => update(next => { next.cards[i][key] = value; }));
    }
    button(group, 'Remove fog card', () => update(next => { next.cards.splice(i, 1); }));
  }
}
