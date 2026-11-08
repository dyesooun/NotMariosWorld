import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IrisTransition } from '../public/game/iris-transition.js';

class FakeElement extends EventTarget {
  constructor(width = 320, height = 180) {
    super(); this.children = []; this.style = { values: {}, setProperty: (key, value) => { this.style.values[key] = value; } };
    this.dataset = {}; this.hidden = false; this.width = width; this.height = height; this.parentElement = null;
  }
  append(child) { child.parentElement?.removeChild(child); child.parentElement = this; child.width = this.width; child.height = this.height; child.isConnected = true; this.children.push(child); }
  removeChild(child) { this.children = this.children.filter(item => item !== child); child.isConnected = false; }
  setAttribute() {}
  remove() { this.parentElement?.removeChild(this); }
  getBoundingClientRect() { return { width: this.width, height: this.height }; }
}

let frames;
let time;
beforeEach(() => {
  frames = [];
  time = 0;
  globalThis.document = { createElement: () => new FakeElement() };
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  globalThis.performance = { now: () => time };
});
afterEach(() => { delete globalThis.document; delete globalThis.requestAnimationFrame; });

function frame(at) { time = at; const pending = frames.splice(0); pending.forEach(callback => callback(at)); }
function drain(start = 0, duration = 10) {
  for (let i = 1; i <= 8 && frames.length; i++) frame(start + (duration * i) / 8);
}
async function settle(promise, start = time) {
  for (let i = 0; i < 80; i++) { if (frames.length) frame(start + (i + 1) * 2); await Promise.resolve(); }
  return promise;
}

test('iris close paints solid black before scene callback and opens afterward', async () => {
  const viewport = new FakeElement();
  const iris = new IrisTransition(viewport, { duration: 10 });
  let switched = false;
  const running = iris.run(() => { switched = true; assert.equal(iris.overlay.style.background, '#000'); });
  await Promise.resolve();
  frame(0); frame(10); await Promise.resolve();
  assert.equal(switched, false, 'handoff waits for a separate black paint frame');
  frame(11);
  for (let i = 0; i < 4 && !switched; i++) { await Promise.resolve(); if (frames.length) frame(12 + i); }
  assert.equal(switched, true);
  await settle(running, 12);
  assert.equal(iris.active, false);
  assert.equal(viewport.children.length, 0);
});

test('radius follows viewport corners and resize updates the active overlay', async () => {
  const viewport = new FakeElement(600, 300);
  const iris = new IrisTransition(viewport, { duration: 10 });
  const opening = iris.open();
  await Promise.resolve();
  frame(0);
  assert.equal(iris.overlay.style.values['--iris-radius'], '0px');
  frame(10);
  assert.ok(Math.abs(parseFloat(iris.overlay.style.values['--iris-radius']) - 335.410) < 2);
  viewport.width = 800; viewport.height = 400;
  iris._resize();
  assert.ok(Math.abs(parseFloat(iris.overlay.style.values['--iris-radius']) - 448.214) < 2);
  await settle(opening, 12);
});

test('overlapping runs are refused and cancellation prevents stale completion', async () => {
  const viewport = new FakeElement();
  const iris = new IrisTransition(viewport, { duration: 10 });
  let called = false;
  const first = iris.run(() => { called = true; });
  await Promise.resolve();
  assert.equal(await iris.run(() => {}), false);
  iris.cancel();
  await settle(first, 20);
  assert.equal(called, false);
  assert.equal(viewport.children.length, 0);
});

test('transition captures input while active and releases it on destroy', async () => {
  const viewport = new FakeElement();
  const iris = new IrisTransition(viewport, { duration: 10 });
  let prevented = false;
  const closing = iris.close();
  await Promise.resolve();
  const event = new Event('keydown', { cancelable: true }); viewport.dispatchEvent(event);
  prevented = event.defaultPrevented;
  assert.equal(prevented, true);
  iris.destroy();
  const after = new Event('keydown', { cancelable: true }); viewport.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false);
  await settle(closing, 10);
});

test('async scene loading stays black and retargets the cover before opening', async () => {
  const oldViewport=new FakeElement(), newViewport=new FakeElement(900,500);
  const iris=new IrisTransition(oldViewport,{duration:10});
  let release, loading=false;
  const run=iris.run(async()=>{
    loading=true;
    iris.retarget(newViewport);
    await new Promise(resolve=>{release=resolve;});
  });
  for(let i=0;i<10&&!loading;i++){frame(i*10);await Promise.resolve();}
  assert.equal(loading,true);
  assert.equal(iris.overlay.style.background,'#000');
  assert.equal(newViewport.children[0],iris.overlay);
  assert.equal(oldViewport.children.length,0);
  frame(200);await Promise.resolve();
  assert.equal(iris.overlay.style.background,'#000');
  release();await settle(run,200);
  assert.equal(iris.active,false);
  assert.equal(newViewport.children.length,0);
});
