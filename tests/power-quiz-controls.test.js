import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerQuizControls } from '../public/game/power-quiz-controls.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument;
    this.className = '';
    this.children = []; this.style = {}; this.attributes = {}; this.hidden = false;
    this.value = ''; this.disabled = false; this.listeners = {};
  }
  append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
  remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  removeEventListener(type) { delete this.listeners[type]; }
  dispatchEvent(event) { event.target = this; return this.listeners[event.type]?.(event); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 960, height: 540 }; }
  querySelector(selector) {
    const match = node => selector.startsWith('.') ? node.className.split(' ').includes(selector.slice(1)) : node.tagName === selector.toUpperCase();
    for (const child of this.children) { if (match(child)) return child; const nested = child.querySelector(selector); if (nested) return nested; }
    return null;
  }
}

class FakeDocument { constructor() { this.activeElement = null; } createElement(tag) { return new FakeElement(tag, this); } }

function fixture() {
  const doc = new FakeDocument();
  const viewport = doc.createElement('div'); viewport.rect = { left: 10, top: 20, width: 1200, height: 700 };
  const canvas = doc.createElement('canvas'); canvas.rect = { left: 110, top: 70, width: 960, height: 540 }; canvas.focus = () => { doc.activeElement = canvas; };
  viewport.append(canvas);
  const model = (overrides = {}) => ({ id: 'question', transactionId: 'turn-1', title: 'ANSWER', prompt: 'What is 2 + 2?', hint: 'Be quick.', panel: { x: 180, y: 100, w: 600, h: 240 }, input: { x: 204, y: 190, w: 424, h: 42 }, submit: { x: 644, y: 190, w: 112, h: 42 }, canAnswer: true, answered: false, remaining: 8, ...overrides });
  return { doc, viewport, canvas, model };
}

test('renders a real DOM question card and positions it in canvas logical space', () => {
  const f = fixture(); const controls = createPowerQuizControls(f.viewport);
  controls.update(f.model(), { canvas: f.canvas });
  const panel = controls.root.querySelector('.power-quiz-panel');
  assert.equal(controls.root.hidden, false);
  assert.equal(panel.style.left, '280px');
  assert.equal(panel.style.top, '150px');
  assert.equal(panel.style.transform, 'scale(1)');
  assert.equal(controls.root.querySelector('.power-quiz-prompt').textContent, 'What is 2 + 2?');
});

test('preserves typed text for the same challenge and resets for a new transaction', () => {
  const f = fixture(); const controls = createPowerQuizControls(f.viewport); controls.update(f.model(), { canvas: f.canvas });
  const input = controls.root.querySelector('.power-quiz-answer'); input.value = 'typed answer';
  controls.update(f.model({ remaining: 7 })); assert.equal(input.value, 'typed answer');
  controls.update(f.model({ transactionId: 'turn-2' })); assert.equal(input.value, '');
});

test('preserves text and does not refocus on a same-key resume unless requested', () => {
  const f = fixture(); let focusCount = 0;
  const originalFocus = f.canvas.focus;
  f.canvas.focus = () => { focusCount++; originalFocus(); };
  const controls = createPowerQuizControls(f.viewport); controls.update(f.model(), { canvas: f.canvas });
  const input = controls.root.querySelector('.power-quiz-answer'); input.value = 'resume me';
  controls.update(null); controls.update(f.model(), { canvas: f.canvas });
  assert.equal(input.value, '');
  input.value = 'preserved'; controls.update(f.model({ remaining: 6 }));
  assert.equal(input.value, 'preserved'); assert.equal(focusCount, 1);
  controls.update(f.model({ remaining: 5 }), { focus: true }); assert.equal(focusCount, 1);
  assert.equal(input.ownerDocument.activeElement, input);
});

test('centers a letterboxed logical canvas in a fullscreen-style viewport', () => {
  const f = fixture(); f.viewport.rect = { left: 0, top: 0, width: 1920, height: 1080 };
  f.canvas.rect = { left: 0, top: 0, width: 1600, height: 900 };
  const controls = createPowerQuizControls(f.viewport); controls.update(f.model(), { canvas: f.canvas });
  const panel = controls.root.querySelector('.power-quiz-panel');
  assert.equal(panel.style.transform, 'scale(1.6666666666666667)');
  assert.equal(panel.style.left, '300px');
  assert.ok(Math.abs(parseFloat(panel.style.top) - 166.66666666666666) < 0.000001);
});

test('a hidden challenge is closable and the same key is treated as new when it reappears', () => {
  const f = fixture(); let opens = 0; let closes = 0;
  const controls = createPowerQuizControls(f.viewport, { onOpen: () => opens++, onClose: () => closes++ });
  controls.update(f.model()); controls.update(null); controls.update(f.model());
  assert.equal(opens, 2); assert.equal(closes, 1); assert.equal(controls.root.hidden, false);
});

test('expired questions stay visible while their controls are hidden', () => {
  const f = fixture(); const controls = createPowerQuizControls(f.viewport); controls.update(f.model({ canAnswer: false, remaining: 0 }));
  assert.equal(controls.root.hidden, false);
  assert.equal(controls.root.querySelector('.power-quiz-answer').hidden, true);
  assert.equal(controls.root.querySelector('.power-quiz-status').textContent, 'TIME UP');
});

test('submission is one-shot per key and can be explicitly retried', async () => {
  const f = fixture(); let calls = 0;
  const controls = createPowerQuizControls(f.viewport, { onSubmit: () => { calls++; return true; } });
  controls.update(f.model()); const input = controls.root.querySelector('.power-quiz-answer'); input.value = '4';
  controls.root.dispatchEvent({ type: 'submit', preventDefault() {} });
  await Promise.resolve();
  assert.equal(calls, 1); assert.equal(input.disabled, true);
  controls.root.dispatchEvent({ type: 'submit', preventDefault() {} }); assert.equal(calls, 1);
  controls.resetSubmission(); input.value = '4'; controls.root.dispatchEvent({ type: 'submit', preventDefault() {} });
  await Promise.resolve(); assert.equal(calls, 2);
});

test('a failed synchronous submission remains enabled for retry', () => {
  const f = fixture(); let calls = 0;
  const controls = createPowerQuizControls(f.viewport, { onSubmit: () => { calls++; return false; } });
  controls.update(f.model()); const input = controls.root.querySelector('.power-quiz-answer'); input.value = 'wrong transport';
  controls.root.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(calls, 1); assert.equal(input.disabled, false);
  controls.root.dispatchEvent({ type: 'submit', preventDefault() {} }); assert.equal(calls, 2);
});
