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
function beamFixture({ startState = 'off', onMs = 500, offMs = 500, startMs = 0, phaseMs = 0 } = {}) {
  const doc = createDocument({ assets: { atlas: { id: 'atlas', src: '/assets/sprites/test.png', width: 4, height: 2, frames: { sprite: { x: 0, y: 0, w: 4, h: 2 } } } }, definitions: {
    beam: { id: 'beam', name: 'Beam', kind: 'beam', size: { width: 20, height: 40 }, visual: { assetId: 'atlas', frameId: 'sprite', onFrameId: 'sprite', offFrameId: 'sprite' }, physics: physics(), behavior: { type: 'beam', onMs, offMs, startMs, phaseMs, startState }, gameplay: {} },
  } });
  return { doc, placement: createPlacement(doc, 'beam', 40, 100) };
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

test('beam warning countdown covers ordering, phase, delay, and exact activation boundaries', () => {
  const off = beamFixture({ startState: 'off' });
  assert.equal(getPreviewState(off.doc, off.placement, 0).beamWarningRemainingMs, 500);
  assert.equal(getPreviewState(off.doc, off.placement, 499).beamWarningRemainingMs, 1);
  assert.equal(getPreviewState(off.doc, off.placement, 500).beamOn, true);
  assert.equal(getPreviewState(off.doc, off.placement, 500).beamWarningRemainingMs, null);
  assert.equal(getPreviewState(off.doc, off.placement, 501).beamWarningRemainingMs, null);

  const on = beamFixture({ startState: 'on' });
  assert.equal(getPreviewState(on.doc, on.placement, 500).beamOn, false);
  assert.equal(getPreviewState(on.doc, on.placement, 500).beamWarningRemainingMs, 500);
  assert.equal(getPreviewState(on.doc, on.placement, 999).beamWarningRemainingMs, 1);
  assert.equal(getPreviewState(on.doc, on.placement, 1000).beamOn, true);

  const delayed = beamFixture({ startState: 'off', startMs: 1000, phaseMs: 250 });
  assert.equal(getPreviewState(delayed.doc, delayed.placement, 750).beamWarningRemainingMs, 500);
  assert.equal(getPreviewState(delayed.doc, delayed.placement, 1000).beamWarningRemainingMs, 250);
  assert.equal(getPreviewState(delayed.doc, delayed.placement, 1250).beamOn, true);
  const delayedActive = beamFixture({ startState: 'off', startMs: 1000, phaseMs: 750 });
  assert.equal(getPreviewState(delayedActive.doc, delayedActive.placement, 500).beamWarningRemainingMs, 500);
  assert.equal(getPreviewState(delayedActive.doc, delayedActive.placement, 999).beamWarningRemainingMs, 1);
  assert.equal(getPreviewState(delayedActive.doc, delayedActive.placement, 1000).beamOn, true);
  const negative = beamFixture({ startState: 'on', phaseMs: -250 });
  assert.equal(getPreviewState(negative.doc, negative.placement, 0).beamWarningRemainingMs, 250);
  const negativeActive = beamFixture({ startState: 'off', startMs: 1000, phaseMs: -250 });
  assert.equal(getPreviewState(negativeActive.doc, negativeActive.placement, 500).beamWarningRemainingMs, 500);
  assert.equal(getPreviewState(negativeActive.doc, negativeActive.placement, 1000).beamOn, true);
  const shortOff = beamFixture({ startState: 'on', onMs: 1000, offMs: 50 });
  assert.equal(getPreviewState(shortOff.doc, shortOff.placement, 1000).beamWarningRemainingMs, 50);
  assert.equal(getPreviewState(shortOff.doc, shortOff.placement, 1050).beamOn, true);
  const outsideWindow = beamFixture({ startState: 'off', onMs: 500, offMs: 1000 });
  assert.equal(getPreviewState(outsideWindow.doc, outsideWindow.placement, 499).beamWarningRemainingMs, null);
  assert.equal(getPreviewState(outsideWindow.doc, outsideWindow.placement, 500).beamWarningRemainingMs, 500);
});

test('beam warning stays cosmetic and requires the evaluated countdown field', () => {
  const { doc, placement } = beamFixture();
  const state = getPreviewState(doc, placement, 499), physicsBefore = JSON.stringify(state.physics);
  const c = context(); drawPlacementVfx(c, state, { timeMs: 0 });
  assert.ok(c.calls.length > 0);
  assert.equal(JSON.stringify(state.physics), physicsBefore);
  const disabled = context(); drawPlacementVfx(disabled, { ...state, vfx: { enabled: false } }, { timeMs: 0 });
  assert.equal(disabled.calls.length, 0);
  const unevaluated = context(); drawPlacementVfx(unevaluated, { ...state, beamWarningRemainingMs: undefined }, { timeMs: 0 });
  assert.equal(unevaluated.calls.length, 0);
  const blinkOn = context(); drawPlacementVfx(blinkOn, { ...state, beamWarningRemainingMs: 200 }, { timeMs: 0 });
  const blinkOff = context(); drawPlacementVfx(blinkOff, { ...state, beamWarningRemainingMs: 150 }, { timeMs: 0 });
  assert.ok(blinkOn.calls.length > 0);
  assert.equal(blinkOff.calls.length, 0);
});

test('beam warnings follow the respawn epoch rather than the continuing run clock', () => {
  const {doc,placement}=beamFixture();doc.placements.push(placement);
  const runtime=new LevelRuntime(doc,{spawn:{x:200,y:200},gravity:0,respawnMs:0});
  for(let i=0;i<6;i++)runtime.advance(.1);
  runtime._kill({placement:{id:'test'},state:{definition:{name:'Test'}}});
  const at=runtime.timeMs+250;
  const warning=runtime.getStatesAt(at).find(e=>e.placement.id===placement.id).state;
  assert.equal(warning.timeMs,at);assert.ok(at>500);
  assert.equal(warning.beamOn,false);assert.ok(Math.abs(warning.beamWarningRemainingMs-250)<1e-6);
  const now=context(),later=context();
  drawPlacementVfx(now,warning);drawPlacementVfx(later,warning,{timeMs:12345});
  assert.ok(now.calls.length>0);assert.deepEqual(now.calls,later.calls);
  const firing=runtime.getStatesAt(runtime.timeMs+501).find(e=>e.placement.id===placement.id).state;
  assert.equal(firing.beamOn,true);assert.equal(firing.beamWarningRemainingMs,null);
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
