import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPlacementVfx, resolveVfx, vfxBounds } from '../../../public/game/json-level/vfx.js';
import { drawPlacement, getPreviewState } from '../../../public/game/json-level/preview.js';
import { LevelRuntime } from '../../../public/game/json-level/level-runtime.js';
import { createDocument, createPlacement } from '../../../public/game/json-level/document.js';

const state = (extra = {}) => ({ id: 'coin-a', x: 10, y: 20, width: 24, height: 24, rotation: 0, flipX: false, definition: { id: 'coin', kind: 'prop', name: 'Coin' }, gameplay: { role: 'coin' }, physics: {}, ...extra });
function context() { const calls = []; return { calls, globalAlpha: 1, fillRect(...args) { calls.push(['fillRect', ...args]); }, strokeRect(...args) { calls.push(['strokeRect', ...args]); }, drawImage(...args) { calls.push(['drawImage', this.globalAlpha, ...args]); }, transform() {}, translate() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, save() {}, restore() {} }; }
const physics = (mode = 'none') => ({ mode, collider: [0, 0, 1, 1], hitbox: [0, 0, 1, 1], solidShapes: null, hazardShapes: null, interactionShapes: null, lethal: false, gravity: false, calibration: 'authored' });
function runtimeFixture() {
  const image = { width: 4, height: 2 }, doc = createDocument({ assets: { atlas: { id: 'atlas', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', width: 4, height: 2, frames: { sprite: { x: 0, y: 0, w: 4, h: 2 } } } }, definitions: {
    coin: { id: 'coin', name: 'Coin', kind: 'prop', size: { width: 20, height: 20 }, visual: { assetId: 'atlas', frameId: 'sprite' }, physics: physics(), behavior: { type: 'static' }, gameplay: { role: 'coin', nonblocking: true } },
    checkpoint: { id: 'checkpoint', name: 'Checkpoint', kind: 'prop', size: { width: 20, height: 20 }, visual: { assetId: 'atlas', frameId: 'sprite' }, physics: physics(), behavior: { type: 'static' }, gameplay: { role: 'checkpoint', nonblocking: true, order: 1 } },
  } });
  doc.world.width = 200; doc.world.height = 200; doc.placements.push(Object.assign(createPlacement(doc, 'coin', 40, 100), { id: 'coin-a' }), Object.assign(createPlacement(doc, 'checkpoint', 40, 100), { id: 'checkpoint-a' }));
  return { doc, image };
}

test('VFX defaults on, supports shallow overrides, and bounds include particles', () => {
  assert.equal(resolveVfx(state()).enabled, true);
  assert.deepEqual(resolveVfx(state({ vfx: { enabled: false, hazardType: 'spike', color: '#ff0000' } })), { enabled: false, hazardType: 'spike', color: '#ff0000' });
  const bounds = vfxBounds(state()); assert.ok(bounds.x < 10 && bounds.width > 24);
});

test('disabled or hidden VFX produces no drawing', () => {
  for (const extra of [{ vfx: { enabled: false } }, { hidden: true }]) {
    const c = context(); drawPlacementVfx(c, state(extra), { timeMs: 100 }); assert.equal(c.calls.length, 0);
  }
});

test('coin burst is time bounded and isolated by placement id', () => {
  const first = context(), second = context();
  drawPlacementVfx(first, state({ collected: true, collectedAtMs: 100 }), { timeMs: 300 });
  drawPlacementVfx(second, state({ id: 'coin-b', collected: true, collectedAtMs: 100 }), { timeMs: 1000 });
  assert.ok(first.calls.length > 0); assert.equal(second.calls.length, 0);
});

test('vanishing platform effect respects the authored deadline', () => {
  const c = context(), platform = state({ id: 'platform-a', definition: { id: 'platform', kind: 'platform', name: 'Moving platform' }, gameplay: {}, behavior: { vanish: { countdownMs: 500 } }, vanishElapsedMs: 250 });
  drawPlacementVfx(c, platform, { timeMs: 300 }); assert.equal(c.calls.filter(call=>call[0]==='drawImage').length,0,'no fragments appear before disappearance');
  const gone = context(); drawPlacementVfx(gone, { ...platform, vanished: true, vanishElapsedMs: 1400 }, { timeMs: 1400 }); assert.equal(gone.calls.length, 0);
});

test('exit glow is active while beams remain quiet when off', () => {
  const exit = context(); drawPlacementVfx(exit, state({ definition: { id: 'exit', kind: 'portal', name: 'Exit' }, gameplay: { role: 'exit' } }), { timeMs: 200 });
  assert.ok(exit.calls.some(call => call[0] === 'strokeRect'));
  const beam = context(); drawPlacementVfx(beam, state({ definition: { id: 'beam', kind: 'beam', name: 'Beam' }, gameplay: {}, beamOn: false }), { timeMs: 200 });
  assert.equal(beam.calls.length, 0);
});

test('timed vanish uses a short poof while respawn mode uses fragments', () => {
  const options={timeMs:220,images:new Map([['atlas',{}]]),frame:{x:0,y:0,w:60,h:20}};
  const platform=state({assetId:'atlas',visual:{},definition:{id:'p',kind:'platform'},gameplay:{},vanished:true,vanishElapsedMs:220});
  const timed=context();drawPlacementVfx(timed,{...platform,behavior:{vanish:{countdownMs:100,restoreMode:'timed'}}},options);
  const respawn=context();drawPlacementVfx(respawn,{...platform,behavior:{vanish:{countdownMs:100,restoreMode:'respawn'}}},options);
  assert.ok(timed.calls.some(c=>c[0]==='fillRect'));assert.equal(timed.calls.filter(c=>c[0]==='drawImage').length,0);
  assert.equal(respawn.calls.filter(c=>c[0]==='drawImage').length,12,'fragments reuse the authored sprite cut');
});

test('runtime timestamps reset visual bursts at the respawn motion epoch while reached checkpoints persist', () => {
  const { doc } = runtimeFixture(), runtime = new LevelRuntime(doc, { spawn: { x: 40, y: 100 }, gravity: 0, respawnMs: 0 });
  runtime.advance(.02); assert.ok(runtime.collectedAtMs.has('coin-a')); assert.ok(runtime.checkpointReachedAtMs.has('checkpoint-a'));
  runtime._kill({ placement: { id: 'test' }, state: { definition: { name: 'test', kind: 'hazard' } } });
  assert.equal(runtime.collectedAtMs.size, 0); assert.ok(runtime.reachedCheckpoints.has('checkpoint-a')); assert.ok(runtime.timeMs >= runtime.getStates()[0].state.timeMs);
  const protectedCoin=runtime.getStates().find(e=>e.placement.id==='coin-a').state,c=context();drawPlacementVfx(c,protectedCoin);assert.equal(c.calls.length,0,'saved coins do not replay collection bursts on respawn');
  runtime.reset(); assert.equal(runtime.collectedAtMs.size, 0); assert.equal(runtime.checkpointReachedAtMs.size, 0);
});

test('countdown blinks authored sprite alpha without changing evaluated physics', () => {
  const { doc, image } = runtimeFixture(), placement = doc.placements[0], images = new Map([['atlas', image]]);
  placement.settings.vanish = { triggerVolume: [0, 0, 1, 1], countdownMs: 1000 };
  const before = getPreviewState(doc, placement, 0, { triggeredAtMs: 0 }), during = getPreviewState(doc, placement, 700, { triggeredAtMs: 0 });
  const a = context(), b = context(); drawPlacement(a, doc, placement, images, { state: before, timeMs: 0 }); drawPlacement(b, doc, placement, images, { state: during, timeMs: 700 });
  assert.equal(JSON.stringify(before.physics), JSON.stringify(during.physics)); assert.ok(a.calls.find(call => call[0] === 'drawImage')[1] > b.calls.find(call => call[0] === 'drawImage')[1]);
});

test('rotated checkpoints retain conservative beam bounds and seeded ambient particles', () => {
  const checkpoint = state({ id: 'checkpoint-rotated', definition: { id: 'checkpoint', kind: 'prop', name: 'Checkpoint' }, gameplay: { role: 'checkpoint' }, rotation: 45 });
  const bounds = vfxBounds(checkpoint); assert.ok(bounds.width > checkpoint.width && bounds.height > checkpoint.height);
  const first = context(), second = context(); drawPlacementVfx(first, checkpoint, { timeMs: 500 }); drawPlacementVfx(second, checkpoint, { timeMs: 500 }); assert.deepEqual(first.calls, second.calls);
  const other=context();drawPlacementVfx(other,{...checkpoint,id:'different-placement'},{timeMs:500});assert.notDeepEqual(other.calls,first.calls);
});

test('moving platform disappearance stays anchored at the disappearance time',()=>{
  const {doc}=runtimeFixture(),p=doc.placements[0];doc.definitions.coin.kind='platform';p.settings={motion:{axis:'x',distance:30,periodMs:4000},vanish:{triggerVolume:[0,0,1,1],countdownMs:3000}};
  const a=getPreviewState(doc,p,3100,{triggeredAtMs:0}),b=getPreviewState(doc,p,3400,{triggeredAtMs:0});
  assert.notEqual(a.x,b.x);assert.deepEqual(a.vanishOrigin,b.vanishOrigin);assert.equal(a.vanishOrigin.x,10);
  assert.deepEqual(vfxBounds(a),vfxBounds(b));
});

test('run clock keeps newly collected coin bursts in sync after respawn',()=>{
  const {doc}=runtimeFixture(),second=createPlacement(doc,'coin',110,100);second.id='second-coin';doc.placements.push(second);
  const runtime=new LevelRuntime(doc,{spawn:{x:40,y:100},gravity:0,respawnMs:20});runtime.advance(.1);
  runtime._kill({placement:{id:'test'},state:{definition:{name:'Test'}}});runtime.advance(.1);
  runtime.player.x=110;runtime.player.y=100;runtime.advance(.02);
  const state=runtime.getStates().find(e=>e.placement.id===second.id).state;
  assert.equal(state.timeMs,runtime.timeMs);assert.ok(state.collectedAtMs>runtime._motionEpochMs);
  const c=context();drawPlacementVfx(c,state);assert.ok(c.calls.length>0);
  const later=context();drawPlacementVfx(later,state,{timeMs:state.collectedAtMs+700});assert.equal(later.calls.length,0);
});

test('cached banner recoloring changes cloth while preserving wood and alpha',()=>{
  const previous=globalThis.OffscreenCanvas,canvases=[];let reads=0;
  globalThis.OffscreenCanvas=class{
    constructor(){this.data=new Uint8ClampedArray(4*4*4);this.data.set([80,40,200,255],16);this.data.set([120,75,32,255],20);this.data.set([80,40,200,0],24);canvases.push(this);}
    getContext(){const self=this;return{drawImage(){},getImageData(){reads++;return{data:self.data};},putImageData(p){self.data=p.data;}};}
  };
  try{
    const {doc,image}=runtimeFixture(),p=doc.placements[1];doc.assets.atlas.width=4;doc.assets.atlas.height=4;doc.assets.atlas.frames.sprite.h=4;
    const base=getPreviewState(doc,p,100),images=new Map([['atlas',image]]);
    drawPlacement(context(),doc,p,images,{state:base});drawPlacement(context(),doc,p,images,{state:{...base,checkpointReached:true}});drawPlacement(context(),doc,p,images,{state:{...base,checkpointReached:true}});
    assert.equal(reads,2,'each banner state is sampled once');
    assert.ok(canvases[0].data[18]>canvases[0].data[16],'unreached cloth is blue');
    assert.ok(canvases[1].data[16]>canvases[1].data[18],'reached cloth is gold');
    assert.deepEqual([...canvases[1].data.slice(20,24)],[120,75,32,255]);assert.equal(canvases[1].data[27],0);
  }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});
