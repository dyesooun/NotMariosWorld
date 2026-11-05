import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createPlacement, parseDocument, serializeDocument, validateDocument } from '../document.js';
import { getPreviewState } from '../preview.js';

const assets = { atlas: { id: 'atlas', name: 'Timing atlas', src: '/assets/sprites/forest/test.png', width: 32, height: 16, frames: { on: { x: 0, y: 0, w: 16, h: 16 }, off: { x: 16, y: 0, w: 16, h: 16 } } } };
const definitions = {
  beam: { id: 'beam', name: 'Beam', kind: 'beam', visual: { assetId: 'atlas', frameId: 'on', onFrameId: 'on', offFrameId: 'off' }, size: { width: 16, height: 16 }, physics: { mode: 'trigger', collider: null, hitbox: [0, 0, 1, 1], lethal: true, gravity: false, calibration: 'authored' }, behavior: { type: 'beam', onMs: 100, offMs: 50, startMs: 200, phaseMs: 0, startState: 'on' } },
  platform: { id: 'platform', name: 'Platform', kind: 'platform', visual: { assetId: 'atlas', frameId: 'on' }, size: { width: 80, height: 16 }, physics: { mode: 'solid', collider: [0, 0, 1, 1], hitbox: null, lethal: false, gravity: false, calibration: 'authored' }, behavior: { type: 'static', vanish: { triggerVolume: [-0.25, -1, 1.5, 2], countdownMs: 500 } } },
};

function doc() { return createDocument({ assets, definitions }); }

test('beam start delay precedes phase offset cycle', () => {
  const d = doc(); const p = createPlacement(d, 'beam', 0, 0); d.placements.push(p);
  assert.equal(getPreviewState(d, p, 199).beamOn, false);
  assert.equal(getPreviewState(d, p, 200).beamOn, true);
  assert.equal(getPreviewState(d, p, 299).beamOn, true);
  assert.equal(getPreviewState(d, p, 300).beamOn, false);
  assert.equal(getPreviewState(d, p, 350).beamOn, true);
  p.settings.phaseMs=100;
  assert.equal(getPreviewState(d,p,199).beamOn,false);
  assert.equal(getPreviewState(d,p,200).beamOn,false);
  assert.equal(getPreviewState(d,p,250).beamOn,true);
});

test('vanishing preview uses trigger countdown and exposes remaining time', () => {
  const d = doc(); const p = createPlacement(d, 'platform', 0, 0); d.placements.push(p);
  assert.equal(getPreviewState(d, p, 1000).vanished, false);
  assert.equal(getPreviewState(d, p, 1200, { triggeredAtMs: 1000 }).vanishRemainingMs, 300);
  assert.equal(getPreviewState(d, p, 1500, { triggeredAtMs: 1000 }).vanished, true);
  assert.equal(getPreviewState(d, p, 1600, { triggeredAtMs: 1000 }).vanishRemainingMs, 0);
  p.settings.vanish=null;
  assert.equal(getPreviewState(d,p,1600,{triggeredAtMs:1000}).vanished,false);
  p.settings.vanish={triggerVolume:[0,0,1,1],countdownMs:0};
  assert.equal(getPreviewState(d,p,999,{triggeredAtMs:1000}).vanished,false);
  assert.equal(getPreviewState(d,p,1000,{triggeredAtMs:1000}).vanished,true);
});

test('timed vanishing preview restores after its hidden interval', () => {
  const d = doc(); d.definitions.platform.behavior.vanish = { triggerVolume: [-0.25, -1, 1.5, 2], countdownMs: 500, restoreMode: 'timed', restoreMs: 700 };
  const p = createPlacement(d, 'platform', 0, 0); d.placements.push(p);
  const hidden = getPreviewState(d, p, 1600, { triggeredAtMs: 1000 });
  assert.equal(hidden.vanished, true); assert.equal(hidden.restoreRemainingMs, 600);
  const restored = getPreviewState(d, p, 2200, { triggeredAtMs: 1000 });
  assert.equal(restored.vanished, false); assert.equal(restored.vanishRestored, true); assert.equal(restored.restoreRemainingMs, 0);
});

test('timing metadata roundtrips and invalid vanish config is rejected', () => {
  const d = doc(); const p = createPlacement(d, 'platform', 0, 0); p.settings = { vanish: { triggerVolume: [0, 0, 1, 1], countdownMs: 1200 } }; d.placements.push(p);
  const copy = parseDocument(serializeDocument(d));
  assert.equal(copy.placements[0].settings.vanish.countdownMs, 1200);
  copy.definitions.platform.behavior.vanish.triggerVolume = [0, 0, 0, 1];
  assert.ok(validateDocument(copy).some(error => error.includes('triggerVolume')));
  copy.definitions.platform.behavior.vanish = { triggerVolume: [0, 0, 1, 1], countdownMs: 1, restoreMode: 'timed' };
  assert.ok(validateDocument(copy).some(error => error.includes('restoreMs')));
  copy.definitions.platform.behavior.vanish.restoreMs = 3600001;
  assert.ok(validateDocument(copy).some(error => error.includes('restoreMs')));
  copy.definitions.platform.behavior.vanish.restoreMode = 'unknown';
  assert.ok(validateDocument(copy).some(error => error.includes('restoreMode')));
});

test('state selection and one-shot restart stay outside saved placements',()=>{
  const d=doc();d.definitions.platform.kind='character';
  d.definitions.platform.visual.animations={idle:{frames:['on','off'],fps:10,loop:true},death:{frames:['off','on'],fps:10,loop:false}};
  d.definitions.platform.visual.defaultAnimation='idle';
  const p=createPlacement(d,'platform',0,0);d.placements.push(p);const before=serializeDocument(d);
  assert.equal(getPreviewState(d,p,50000,{animation:'death',animationTimeMs:0}).frameId,'off');
  assert.equal(getPreviewState(d,p,50000,{animation:'death',animationTimeMs:1000}).frameId,'on');
  assert.equal(getPreviewState(d,p,50000,{animation:'death',animationTimeMs:0}).frameId,'off');
  assert.equal(serializeDocument(d),before);
  assert.equal(Object.hasOwn(parseDocument(before).placements[0],'animation'),false);
});

test('any asset can move independently of beam timing',()=>{
  const d=doc();d.definitions.beam.behavior.motion={axis:'x',distance:40,periodMs:400,phaseMs:0};
  const p=createPlacement(d,'beam',100,20);d.placements.push(p);
  assert.equal(getPreviewState(d,p,0).x,100);
  assert.equal(Math.round(getPreviewState(d,p,100).x),140);
  assert.equal(getPreviewState(d,p,200).beamOn,true);
  assert.equal(getPreviewState(d,p,300).beamOn,false);
});

test('animated character can move while its preview state animates',()=>{
  const d=doc();const def=d.definitions.platform;def.kind='character';def.visual.animations={idle:{frames:['on','off'],fps:10,loop:true}};def.visual.defaultAnimation='idle';def.behavior={type:'static',motion:{axis:'y',distance:20,periodMs:400,phaseMs:0}};
  const p=createPlacement(d,'platform',10,20);d.placements.push(p);
  assert.equal(getPreviewState(d,p,100,{animation:'idle'}).frameId,'off');
  assert.equal(Math.round(getPreviewState(d,p,100,{animation:'idle'}).y),40);
});

test('explicit null motion disables legacy moving behavior',()=>{
  const d=doc(),p=createPlacement(d,'platform',10,20);p.settings={motion:null,type:'moving',axis:'x',distance:80,periodMs:400,phaseMs:0};d.placements.push(p);
  assert.equal(getPreviewState(d,p,100).x,10);
});

test('independent motion roundtrips and malformed motion is rejected',()=>{
  const d=doc(),p=createPlacement(d,'beam',0,0);p.settings={motion:{axis:'y',distance:12,periodMs:500,phaseMs:-20}};d.placements.push(p);
  const copy=parseDocument(serializeDocument(d));assert.deepEqual(copy.placements[0].settings.motion,p.settings.motion);
  copy.placements[0].settings.motion.periodMs=0;assert.ok(validateDocument(copy).some(error=>error.includes('motion.periodMs')));
});
