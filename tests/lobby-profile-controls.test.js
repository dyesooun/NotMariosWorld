import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobbyProfileControls } from '../public/game/lobby-profile-controls.js';
import { AVATARS, COLORS } from '../public/game/engine.js';

class Element {
  constructor(tagName, ownerDocument) {
    Object.assign(this, { tagName, ownerDocument, children: [], style: {}, attributes: {}, listeners: {}, value: '' });
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  fire(type, event = {}) { this.listeners[type]?.(event); }
  blur() { this.ownerDocument.activeElement = null; }
  remove() { this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); }
  getBoundingClientRect() { return this.bounds; }
}

function fixture() {
  const doc = { createElement: tag => new Element(tag, doc), activeElement: null };
  const viewport = doc.createElement('div'); viewport.bounds = { left: 0, top: 0, width: 1200, height: 800 };
  const canvas = doc.createElement('canvas'); canvas.bounds = { left: 0, top: 0, width: 1200, height: 800 };
  const changes = [], previews = []; let plays = 0, focusClears = 0;
  const controls = createLobbyProfileControls(viewport, {
    onChange: patch => changes.push(patch), onPlay: () => plays++, onFocus: () => focusClears++,
    drawAvatar: (portrait, avatar, color) => previews.push({ avatar, color }),
  });
  const profile = { name: 'Runner', avatar: AVATARS[0], color: COLORS[0] };
  const update = (extra = {}) => controls.update({ profile, status: 'lobby', ...extra }, { canvas });
  const [title, label, avatars, colors] = controls.root.children;
  return { doc, viewport, canvas, controls, profile, update, changes, previews, name: label.children[0],
    avatars: avatars.children, colors: colors.children, plays: () => plays, focusClears: () => focusClears };
}

test('avatar and color clicks immediately change the profile and return control to play', () => {
  const f = fixture(); f.update();
  f.avatars[1].fire('click'); f.colors[2].fire('click');
  assert.deepEqual(f.changes, [{ avatar: AVATARS[1] }, { color: COLORS[2] }]);
  assert.equal(f.plays(), 2);
  Object.assign(f.profile, { avatar: AVATARS[1], color: COLORS[2] }); f.update();
  assert.equal(f.avatars[1].attributes['aria-pressed'], 'true');
  assert.equal(f.avatars[0].attributes['aria-pressed'], 'false');
  assert.equal(f.colors[2].attributes['aria-pressed'], 'true');
  assert.ok(f.previews.slice(-4).every(preview => preview.color === COLORS[2]));
});

test('lobby snapshots preserve an active name draft and typing clears held movement', () => {
  const f = fixture(); f.update();
  f.doc.activeElement = f.name; f.controls.root.fire('focusin');
  f.name.value = 'Changing my name'; f.name.fire('input'); f.update();
  assert.equal(f.focusClears(), 1);
  assert.equal(f.name.value, 'Changing my name');
  assert.deepEqual(f.changes[0], { name: 'Changing my name' });
  f.name.value = '  '; f.name.fire('change');
  assert.deepEqual(f.changes[1], { name: 'Player' });
  let prevented = false;
  f.name.fire('keydown', { key: 'Enter', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(f.plays(), 1); assert.equal(f.doc.activeElement, null);
});

test('race start and disconnect disable identity changes; icebreakers hide the card', () => {
  const f = fixture(); f.update({ status: 'running' });
  assert.equal(f.controls.root.hidden, true);
  f.avatars[0].fire('click'); f.colors[0].fire('click'); f.name.fire('input');
  assert.deepEqual(f.changes, []);
  f.update({ connected: false }); assert.equal(f.name.disabled, true);
  f.update({ obscured: true }); assert.equal(f.controls.root.hidden, true);
  f.update(); assert.equal(f.controls.root.hidden, false); assert.equal(f.name.disabled, false);
});

test('profile controls follow the letterboxed viewport and are removed on teardown', () => {
  const f = fixture(); f.update();
  assert.equal(f.controls.root.style.transform, 'scale(0.703125)');
  assert.equal(f.controls.root.style.left, '17.5px');
  assert.equal(f.controls.root.style.top, '80px');
  f.controls.destroy(); assert.equal(f.viewport.children.length, 0);
});
