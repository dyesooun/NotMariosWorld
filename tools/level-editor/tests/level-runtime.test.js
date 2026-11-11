import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LevelRuntime } from '../level-runtime.js';
import { PlaytestRuntime } from '../playtest-runtime.js';
import { validateDocument,parseDocument,serializeDocument } from '../document.js';
import {setLevelSpawn} from '../gameplay.js';
import {boxPolygon,shapePolygons,polygonsOverlap} from '../runtime-geometry.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function documentFixture() {
  const physics = (mode = 'none', extra = {}) => ({ mode, collider: [0, 0, 1, 1], hitbox: [0, 0, 1, 1], solidShapes: null, hazardShapes: null, interactionShapes: null, lethal: false, gravity: false, calibration: 'authored', ...extra });
  const defs = {
    floor: { id: 'floor', name: 'Floor', kind: 'platform', size: { width: 240, height: 20 }, visual: { assetId: 'atlas', frameId: 'pixel' }, physics: physics('solid'), behavior: { type: 'static' } },
    mover: { id: 'mover', name: 'Mover', kind: 'platform', size: { width: 80, height: 20 }, visual: { assetId: 'atlas', frameId: 'pixel' }, physics: physics('solid'), behavior: { type: 'static', motion: { axis: 'x', distance: 30, periodMs: 1000 } } },
    spike: { id: 'spike', name: 'Spike', kind: 'hazard', size: { width: 24, height: 24 }, visual: { assetId: 'atlas', frameId: 'pixel' }, physics: physics('none', { lethal: true }), behavior: { type: 'static' } },
    beam: { id: 'beam', name: 'Beam', kind: 'beam', size: { width: 20, height: 80 }, visual: { assetId: 'atlas', frameId: 'pixel', onFrameId: 'pixel', offFrameId: 'pixel' }, physics: physics('none', { lethal: true }), behavior: { type: 'beam', onMs: 100, offMs: 100, startMs: 100, phaseMs: 0, startState: 'on' } },
    vanish: { id: 'vanish', name: 'Vanishing', kind: 'platform', size: { width: 100, height: 20 }, visual: { assetId: 'atlas', frameId: 'pixel' }, physics: physics('solid'), behavior: { type: 'static', vanish: { triggerVolume: [0, -2, 1, 3], countdownMs: 100 } } },
    interaction: { id: 'interaction', name: 'Chest', kind: 'chest', size: { width: 32, height: 32 }, visual: { assetId: 'atlas', frameId: 'pixel' }, physics: physics('trigger'), behavior: { type: 'static' } },
    character: { id: 'character', name: 'Critter', kind: 'character', size: { width: 20, height: 20 }, visual: { assetId: 'atlas', frameId: 'pixel', animations: { idle: { frames: ['pixel'], fps: 1, loop: true }, run: { frames: ['pixel'], fps: 2, loop: true } }, defaultAnimation: 'idle' }, physics: physics('none'), behavior: { type: 'static' } },
  };
  const p = (id, definitionId, x, y, width, height) => ({ id, definitionId, x, y, width, height, layer: 0, flipX: false, rotation: 0, settings: {} });
  return { format: 'not-marios-world-level', version: 2, id: 'fixture', name: 'Fixture', biome: 'forest', world: { width: 1000, height: 600, backgroundColor: '#183c38' }, assets: { atlas: { id: 'atlas', src: image, width: 1, height: 1, frames: { pixel: { x: 0, y: 0, w: 1, h: 1 } } } }, definitions: defs, placements: [p('floor-1', 'floor', 0, 200, 240, 20), p('mover-1', 'mover', 260, 180, 80, 20), p('spike-1', 'spike', 100, 176, 24, 24), p('beam-1', 'beam', 400, 120, 20, 80), p('vanish-1', 'vanish', 500, 200, 100, 20), p('chest-1', 'interaction', 40, 168, 32, 32), p('critter-1', 'character', 10, 160, 20, 20)] };
}
function advanceFor(runtime, seconds, input = {}) { let left = seconds; while (left > 0) { const dt = Math.min(0.1, left); runtime.advance(dt, input); left -= dt; } }

test('playtest god mode permits movement through spikes and active beams without editing the level', () => {
  const doc = documentFixture(), before = JSON.stringify(doc);
  const runtime = new PlaytestRuntime(doc, { spawn: { x: 100, y: 150 }, godMode: true, gravity: 0 });
  advanceFor(runtime, .2, { right: true });
  assert.ok(runtime.player.x > 140, 'hazard contact must not freeze movement');
  runtime.reset({spawn: {x: 400, y: 130}});
  advanceFor(runtime, .12);
  assert.equal(runtime.getStates().find(entry => entry.placement.id === 'beam-1').state.beamOn, true);
  advanceFor(runtime, .2, { right: true });
  assert.ok(runtime.player.x > 440);
  assert.equal(runtime.deaths, 0);
  assert.equal(runtime.deadRemainingMs, 0);
  assert.equal(JSON.stringify(doc), before);
  runtime.reset();
  assert.equal(runtime.godMode, true);
});

test('playtest god mode ignores decoys while collecting overlapping coins and checkpoints', () => {
  const {doc,add} = coreFixture();
  add('coin', 'coin', 100, {coinValue: 2});
  add('checkpoint', 'checkpoint', 100);
  add('trap', 'decoy-chest', 100, {decoyKind: 'bomb'});
  const runtime = new PlaytestRuntime(doc, { spawn: {x: 100, y: 120}, godMode: true, gravity: 0 });
  runtime.advance(.02);
  assert.equal(runtime.deaths, 0);
  assert.equal(runtime.coins, 2);
  assert.equal(runtime.checkpoint.id, 'checkpoint');
  assert.ok(!runtime.events.some(event => event.type === 'death' || event.type === 'decoy'));
});

test('god mode fall recovery preserves coins and progress at spawn and checkpoint', () => {
  const runtime = new PlaytestRuntime(documentFixture(), { spawn: {x: 30, y: 120}, godMode: true, gravity: 0 });
  for (const checkpoint of [null, {x: 270, y: 120, farthestX: 200, progress: .2}]) {
    runtime.checkpoint = checkpoint;
    runtime.coins = 4; runtime.collected.add('saved-coin');
    runtime.farthestX = 600; runtime.progress = .6;
    Object.assign(runtime.player, {x: 800, y: 800});
    const events = runtime.advance(.01);
    assert.equal(runtime.player.x, checkpoint?.x ?? runtime.spawn.x);
    assert.equal(runtime.player.y, checkpoint?.y ?? runtime.spawn.y);
    assert.equal(runtime.deaths, 0);
    assert.equal(runtime.deadRemainingMs, 0);
    assert.equal(runtime.farthestX, 600);
    assert.equal(runtime.progress, .6);
    assert.equal(runtime.coins, 4);
    assert.ok(runtime.collected.has('saved-coin'));
    assert.ok(events.some(event => event.type === 'god-mode-return'));
  }
});

test('god mode toggle rescues a dead player and restores normal deaths when disabled', () => {
  const runtime = new PlaytestRuntime(documentFixture(), {spawn: {x: 100, y: 150}, gravity: 0});
  assert.equal(runtime.godMode, false);
  runtime.advance(.02);
  assert.equal(runtime.deaths, 1);
  runtime.setGodMode(true);
  assert.equal(runtime.deadRemainingMs, 0);
  assert.equal(runtime.deathCause, null);
  // Melee and projectile collisions both use the runtime's central death hook.
  for (const kind of ['creature', 'projectile']) {
    runtime._kill({placement: {id: kind}, state: {definition: {kind, name: kind}}});
    assert.equal(runtime.deaths, 1);
    assert.equal(runtime.deadRemainingMs, 0);
  }
  runtime.setGodMode(false);
  runtime.advance(.02);
  assert.equal(runtime.deaths, 2);
  assert.ok(runtime.deadRemainingMs > 0);
  const live = new LevelRuntime(documentFixture(), {spawn: {x: 100, y: 150}, gravity: 0});
  live.advance(.02);
  assert.equal(live.deaths, 1);
});

test('runtime keeps document immutable and supports explicit state overrides', () => {
  const document = documentFixture();
  assert.deepEqual(validateDocument(document), []);
  const before = JSON.stringify(document);
  const runtime = new LevelRuntime(document, { spawn: { x: 30, y: 120 } });
  runtime.setEntityState('critter-1', 'run');
  runtime.advance(0.05, { right: true });
  assert.equal(runtime.getStates().find(item => item.placement.id === 'critter-1').state.frameId, 'pixel');
  assert.equal(JSON.stringify(document), before);
});

test('runtime emits interactions, handles solid floor, and updates motion', () => {
  const runtime = new LevelRuntime(documentFixture(), { spawn: { x: 40, y: 120 } });
  const events = runtime.advance(0.2);
  assert.ok(Array.isArray(events));
  const mover0 = runtime.getStates().find(item => item.placement.id === 'mover-1').state.x;
  runtime.advance(0.3);
  const mover1 = runtime.getStates().find(item => item.placement.id === 'mover-1').state.x;
  assert.notEqual(mover0, mover1);
});

test('hazards and beam timing kill, while reset clears cycles', () => {
  const runtime = new LevelRuntime(documentFixture(), { spawn: { x: 100, y: 150 }, respawnMs: 100 });
  const death = runtime.advance(0.2);
  assert.ok(death.some(event => event.type === 'death'));
  assert.equal(runtime.deaths, 1);
  runtime.advance(0.1);
  assert.ok(runtime.events.some(event => event.type === 'respawn'));
  runtime.reset({ spawn: { x: 30, y: 120 } });
  assert.equal(runtime.deaths, 0);
  assert.equal(runtime.triggerTimes.size, 0);
});

test('forest start and checkpoint banners use their authored foot anchors and land safely', () => {
  const samplePath = new URL('../../../public/assets/sprites/forest/tileset/WhimsicalForest.json', import.meta.url);
  if (!fs.existsSync(samplePath)) return;
  const document = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  assert.deepEqual(validateDocument(document), []);
  const runtime = new LevelRuntime(document);
  assert.ok(Number.isFinite(runtime.player.x) && Number.isFinite(runtime.player.y));
  assert.ok(runtime.getStates().length > 0);
  const banners = document.placements.filter(p => ['spawnpoint', 'checkpoint'].includes(p.gameplay?.role));
  const unsafeLandings = [];
  for (const banner of banners) {
    const landingDocument = structuredClone(document);
    setLevelSpawn(landingDocument, banner.id);
    const landing = new LevelRuntime(landingDocument);
    const foot = banner.gameplay.anchor || [.5, .5];
    const anchor = { x: banner.x + banner.width * foot[0] - landing.player.width / 2, y: banner.y + banner.height * foot[1] - landing.player.height };
    assert.deepEqual(landing.spawn, anchor);
    advanceFor(landing, 1);
    if (landing.deaths || !landing.player.grounded) unsafeLandings.push({
      id: banner.id, x: banner.x, deaths: landing.deaths,
      cause: landing.deathCause, grounded: landing.player.grounded,
    });
  }
  assert.deepEqual(unsafeLandings, [], 'Every authored start/checkpoint must land on safe support and survive; report all unsafe banners, including enemy attacks');
});

test('repaired forest checkpoints preserve source settings and remain safe after actual checkpoint respawn', () => {
  const live = JSON.parse(fs.readFileSync(new URL('../../../public/assets/sprites/forest/tileset/WhimsicalForest.json', import.meta.url), 'utf8'));
  const source = JSON.parse(fs.readFileSync(new URL('../levels/WhimsicalForest.json', import.meta.url), 'utf8'));
  const checkpointIds = ['object-564547fe-3d81-4eaf-870e-7eb98657d00c', '535c3c08-9aea-4c4e-8cb2-c4b435ab0d88'];
  const hogId = 'object-8f0213b1-6031-4106-9ddd-526b4a36324a';
  assert.deepEqual(live.placements.find(p => p.id === hogId).settings, source.placements.find(p => p.id === hogId).settings);
  for (const id of checkpointIds) {
    const banner = live.placements.find(p => p.id === id);
    assert.deepEqual(banner.gameplay.anchor, source.placements.find(p => p.id === id).gameplay.anchor);
    const runtime = new LevelRuntime(live);
    const [ax, ay] = banner.gameplay.anchor;
    Object.assign(runtime.player, { x: banner.x + banner.width * ax - runtime.player.width / 2, y: banner.y + banner.height * ay - runtime.player.height });
    runtime._roleContactStep(runtime.getStates());
    assert.equal(runtime.checkpoint?.id, id, 'use the authored checkpoint role, not a replacement spawn');
    runtime._respawn();
    advanceFor(runtime, 10);
    assert.equal(runtime.deaths, 0, `${id}: ${runtime.deathCause || 'unexpected death'} after checkpoint respawn`);
    assert.equal(runtime.player.grounded, true, `${id} must retain safe support across multiple enemy attack cycles`);
  }
});

test('moving platforms carry a standing player and vanish after trigger countdown', () => {
  const runtime = new LevelRuntime(documentFixture(), { spawn: { x: 270, y: 120 } });
  advanceFor(runtime, 0.6);
  const before = runtime.player.x;
  advanceFor(runtime, 0.2);
  assert.ok(runtime.player.x !== before || runtime.player.standingId === 'mover-1');
  const vanishing = new LevelRuntime(documentFixture(), { spawn: { x: 520, y: 160 } });
  advanceFor(vanishing, 0.1);
  assert.ok(vanishing.triggerTimes.has('vanish-1'));
  advanceFor(vanishing, 0.15);
  assert.equal(vanishing.getStates().find(item => item.placement.id === 'vanish-1').state.vanished, true);
});

test('timed vanishing platforms restore once, then rearm only after leaving and reentering', () => {
  const document = documentFixture();
  document.definitions.vanish.behavior.vanish = { triggerVolume: [0, -2, 1, 3], countdownMs: 50, restoreMode: 'timed', restoreMs: 100 };
  const runtime = new LevelRuntime(document, { spawn: { x: 520, y: 160 }, gravity: 0 });
  advanceFor(runtime, 0.1);
  assert.ok(runtime.events.some(event => event.type === 'vanish-trigger' && event.id === 'vanish-1'));
  advanceFor(runtime, 0.04);
  assert.equal(runtime.getStates().find(item => item.placement.id === 'vanish-1').state.vanished, true);
  let restored = false;
  for (let i = 0; i < 15; i++) restored = runtime.advance(0.01).some(event => event.type === 'restore' && event.id === 'vanish-1') || restored;
  assert.equal(restored, true);
  assert.equal(runtime.getStates().find(item => item.placement.id === 'vanish-1').state.vanished, false);
  runtime.player.x = 700; advanceFor(runtime, 0.02);
  runtime.player.x = 520; advanceFor(runtime, 0.02);
  assert.ok(runtime.triggerTimes.has('vanish-1'));
});

test('permanent vanishing platforms survive death and clear on reset', () => {
  const document = documentFixture();
  document.definitions.vanish.behavior.vanish = { triggerVolume: [0, -2, 1, 3], countdownMs: 0, restoreMode: 'permanent' };
  const runtime = new LevelRuntime(document, { spawn: { x: 520, y: 160 }, gravity: 0, respawnMs: 20 });
  advanceFor(runtime, 0.03);
  assert.equal(runtime.getStates().find(item => item.placement.id === 'vanish-1').state.vanished, true);
  runtime.player.x = 100; advanceFor(runtime, 0.02);
  assert.equal(runtime.deaths, 1);
  advanceFor(runtime, 0.05);
  assert.equal(runtime.getStates().find(item => item.placement.id === 'vanish-1').state.vanished, true);
  runtime.reset({ spawn: { x: 520, y: 160 } });
  assert.equal(runtime.permanentGone.size, 0);
  assert.equal(runtime.getStates().find(item => item.placement.id === 'vanish-1').state.vanished, false);
});

test('beam is dormant before start, then damages an overlapping player', () => {
  const runtime = new LevelRuntime(documentFixture(), { spawn: { x: 400, y: 130 }, respawnMs: 1000 });
  advanceFor(runtime, 0.05);
  assert.equal(runtime.deaths, 0);
  advanceFor(runtime, 0.08);
  assert.ok(runtime.deaths > 0);
});

test('falling below the world causes a death', () => {
  const runtime = new LevelRuntime(documentFixture(), { spawn: { x: 800, y: 0 }, respawnMs: 1000 });
  advanceFor(runtime, 1);
  assert.ok(runtime.deaths > 0);
  assert.equal(runtime.deathCause, 'Fall');
});

test('explicit empty solid shapes do not support the player', () => {
  const document = documentFixture();
  document.definitions.floor.physics.solidShapes = [];
  const runtime = new LevelRuntime(document, { spawn: { x: 30, y: 120 }, respawnMs: 1000 });
  advanceFor(runtime, 0.5);
  assert.equal(runtime.player.grounded, false);
});

test('inferred spawn avoids hazards belonging to another placement', () => {
  const document = documentFixture();
  document.placements.find(item => item.id === 'spike-1').x = 0;
  const runtime = new LevelRuntime(document);
  const hazards=runtime.getStates().flatMap(entry=>shapePolygons(entry.state,'hazard'));
  assert.equal(polygonsOverlap([boxPolygon(runtime.player)],hazards),false);
  assert.notEqual(runtime.spawn.x,4);
});

test('standing rider follows the moving solid by the same displacement',()=>{
  const runtime=new LevelRuntime(documentFixture(),{spawn:{x:280,y:144}});
  advanceFor(runtime,.04);assert.equal(runtime.player.standingId,'mover-1');
  const x=runtime.player.x,platform=runtime.getStates().find(e=>e.placement.id==='mover-1').state.x;
  advanceFor(runtime,.08);
  const delta=runtime.getStates().find(e=>e.placement.id==='mover-1').state.x-platform;
  assert.ok(Math.abs(runtime.player.x-x-delta)<1e-6);assert.equal(runtime.player.grounded,true);
});

test('mixed solid and lethal geometry damages before collision can push it away',()=>{
  const doc=documentFixture();doc.placements=doc.placements.filter(p=>p.id==='spike-1');
  const p=doc.placements[0];Object.assign(p,{x:40,y:50,width:20,height:100});doc.definitions.spike.physics.mode='solid';
  const runtime=new LevelRuntime(doc,{spawn:{x:0,y:60},gravity:0});advanceFor(runtime,.1,{right:true});
  assert.equal(runtime.deaths,1);assert.equal(runtime.deathCause,'Spike');
});

test('full solid response blocks walls and ceilings',()=>{
  const doc=documentFixture();doc.definitions.floor.kind='prop';doc.placements=doc.placements.filter(p=>p.id==='floor-1');Object.assign(doc.placements[0],{x:100,y:0,width:20,height:200});
  const wall=new LevelRuntime(doc,{spawn:{x:60,y:50},gravity:0});advanceFor(wall,.3,{right:true});assert.ok(Math.abs(wall.player.x-72)<1e-6);assert.equal(wall.player.grounded,false);
  Object.assign(doc.placements[0],{x:0,y:50,width:200,height:20});
  const ceiling=new LevelRuntime(doc,{spawn:{x:80,y:85},gravity:0});ceiling.player.vy=-300;advanceFor(ceiling,.2);assert.ok(Math.abs(ceiling.player.y-70)<1e-6);assert.equal(ceiling.player.vy,0);
});

test('jump passes through a platform from underneath then lands on top',()=>{
  const doc=documentFixture(); doc.placements=doc.placements.filter(p=>p.id==='floor-1');
  doc.placements.push({...doc.placements[0],id:'lower-floor',y:300});
  const before=JSON.stringify(doc);
  const runtime=new LevelRuntime(doc,{spawn:{x:30,y:264}});
  advanceFor(runtime,.05); assert.equal(runtime.player.standingId,'lower-floor');
  runtime.advance(1/120,{jump:true});
  let clearedTop=false;
  for(let i=0;i<100;i++) {
    runtime.advance(1/120);
    if(runtime.player.y+runtime.player.height<200) clearedTop=true;
  }
  assert.equal(clearedTop,true);
  assert.equal(runtime.player.grounded,true); assert.equal(runtime.player.standingId,'floor-1');
  assert.ok(Math.abs(runtime.player.y-164)<1e-6);
  assert.equal(JSON.stringify(doc),before);
});

test('partial platform edge landings support the feet without a sideways push',()=>{
  const doc=documentFixture(); doc.placements=doc.placements.filter(p=>p.id==='floor-1');
  const runtime=new LevelRuntime(doc,{spawn:{x:235,y:130}});
  advanceFor(runtime,.4);
  assert.equal(runtime.player.standingId,'floor-1'); assert.equal(runtime.player.grounded,true);
  assert.equal(runtime.player.x,235); assert.ok(Math.abs(runtime.player.y-164)<1e-6);
});

test('rotated and flipped platforms retain their authored top surface',()=>{
  const doc=documentFixture(); doc.placements=doc.placements.filter(p=>p.id==='floor-1');
  Object.assign(doc.placements[0],{rotation:15,flipX:true});
  const runtime=new LevelRuntime(doc,{spawn:{x:80,y:80}});
  advanceFor(runtime,.5);
  assert.equal(runtime.player.standingId,'floor-1'); assert.equal(runtime.player.grounded,true);
  const solid=runtime.getStates().flatMap(entry=>shapePolygons(entry.state,'solid'));
  assert.equal(polygonsOverlap([boxPolygon(runtime.player)],solid),false);
});

test('platforms do not snag a side or below approach, while props still block',()=>{
  const doc=documentFixture(); doc.placements=doc.placements.filter(p=>p.id==='floor-1');
  const runtime=new LevelRuntime(doc,{spawn:{x:250,y:190},gravity:0});
  advanceFor(runtime,.2,{left:true});
  assert.equal(runtime.player.grounded,false); assert.ok(runtime.player.x < 250);
  doc.definitions.floor.kind='prop';
  const prop=new LevelRuntime(doc,{spawn:{x:250,y:190},gravity:0});
  advanceFor(prop,.2,{left:true});
  assert.equal(prop.player.x,240);
});

test('vertical moving platforms carry riders and catch players on relative descent',()=>{
  const doc=documentFixture(); doc.placements=doc.placements.filter(p=>p.id==='floor-1');
  doc.definitions.floor.behavior.motion={axis:'y',distance:40,periodMs:1000,phaseMs:250};
  const rider=new LevelRuntime(doc,{spawn:{x:40,y:204},gravity:1700});
  advanceFor(rider,1/120); assert.equal(rider.player.standingId,'floor-1');
  const riderY=rider.player.y; advanceFor(rider,.2); assert.notEqual(rider.player.y,riderY); assert.equal(rider.player.grounded,true);
  const y=rider.player.y; advanceFor(rider,.2); assert.notEqual(rider.player.y,y); assert.equal(rider.player.grounded,true);
  const falling=new LevelRuntime(doc,{spawn:{x:40,y:100},gravity:0});
  falling.player.vy=200; advanceFor(falling,.4); assert.equal(falling.player.standingId,'floor-1'); assert.equal(falling.player.grounded,true);
});

test('respawn resets motion phase, state selection and trigger timestamps',()=>{
  const runtime=new LevelRuntime(documentFixture(),{spawn:{x:100,y:150},respawnMs:100});runtime.setEntityState('critter-1','run');runtime.triggerTimes.set('vanish-1',0);
  let respawned=false;for(let i=0;i<30;i++){if(runtime.advance(1/120).some(event=>event.type==='respawn')){respawned=true;break;}}
  assert.equal(respawned,true);assert.equal(runtime.triggerTimes.size,0);
  assert.ok(Math.abs(runtime.getStates().find(e=>e.placement.id==='mover-1').state.x-260)<1e-6);
  assert.equal(runtime.getStates().find(e=>e.placement.id==='critter-1').state.animation,'idle');assert.equal(runtime.deathCause,null);
});

test('neutral biome metadata and authored spawn require no renderer-specific rules',()=>{
  const doc=documentFixture();doc.biome='unregistered-test-world';doc.world.spawn={x:45,y:110};
  const runtime=new LevelRuntime(doc);assert.deepEqual(runtime.spawn,{x:45,y:110});
  doc.world.spawn.x='bad';assert.ok(validateDocument(doc).some(error=>error.includes('world.spawn')));
});

test('placement restore overrides drive lifecycle events and permanent persistence',()=>{
  const document=documentFixture();
  const platform=document.placements.find(p=>p.id==='vanish-1');
  platform.settings.vanish={triggerVolume:[0,-2,1,3],countdownMs:0,restoreMode:'permanent'};
  const permanent=new LevelRuntime(document,{spawn:{x:520,y:164},gravity:0,respawnMs:20});
  assert.ok(permanent.advance(.02).some(e=>e.type==='vanish'&&e.id==='vanish-1'));
  assert.equal(permanent.permanentGone.has('vanish-1'),true);
  permanent.player.x=100;permanent.player.y=176;advanceFor(permanent,.05);
  assert.equal(permanent.permanentGone.has('vanish-1'),true);
  permanent.reset();assert.equal(permanent.permanentGone.size,0);
  platform.settings.vanish={...platform.settings.vanish,restoreMode:'timed',restoreMs:30};
  const timed=new LevelRuntime(document,{spawn:{x:520,y:164},gravity:0});
  const events=[];for(let i=0;i<10;i++)events.push(...timed.advance(.01));
  assert.ok(events.some(e=>e.type==='vanish'&&e.id==='vanish-1'));assert.ok(events.some(e=>e.type==='restore'&&e.id==='vanish-1'));
  assert.equal(timed.getStates().find(e=>e.placement.id==='vanish-1').state.vanished,false);
});

test('jump requires release before another jump and reset clears motion phase', () => {
  const runtime = new LevelRuntime(documentFixture(), { spawn: { x: 30, y: 120 } });
  advanceFor(runtime, 0.2);
  runtime.advance(0.02, { jump: true });
  const first = runtime.player.vy;
  advanceFor(runtime, 0.08, { jump: true });
  assert.notEqual(runtime.player.vy, -runtime.jumpSpeed);
  runtime.reset({ spawn: { x: 30, y: 120 } });
  assert.equal(runtime.timeMs, 0);
  assert.equal(runtime.triggerTimes.size, 0);
});

function roleFixture(role, id = `${role}-1`, x = 40, y = 120, extra = {}) {
  const doc = documentFixture();
  doc.definitions.marker = { id: 'marker', name: role, kind: 'prop', size: { width: 32, height: 32 }, visual: { assetId: 'atlas', frameId: 'pixel' }, physics: { mode: 'none', collider: [0, 0, 1, 1], hitbox: [0, 0, 1, 1], solidShapes: null, hazardShapes: null, interactionShapes: null, lethal: false, gravity: false, calibration: 'authored' }, behavior: { type: 'static' }, gameplay: { role, nonblocking: true, ...extra } };
  doc.placements.push({ id, definitionId: 'marker', x, y, width: 32, height: 32, layer: 0, flipX: false, rotation: 0, settings: {} });
  return doc;
}

test('gameplay coins are idempotent, hidden, and do not mutate source data', () => {
  const doc = roleFixture('coin'); const before = JSON.stringify(doc); const runtime = new LevelRuntime(doc, { spawn: { x: 40, y: 120 }, gravity: 0 });
  const events = runtime.advance(.02); assert.equal(runtime.coins, 1); assert.ok(events.some(e => e.type === 'coin' && e.id === 'coin-1'));
  runtime.advance(.02); assert.equal(runtime.coins, 1); assert.equal(runtime.getStates().find(e => e.placement.id === 'coin-1').state.collected, true); assert.equal(JSON.stringify(doc), before);
});

test('tagged spawnpoints honor priority and exits freeze with one event', () => {
  const doc = roleFixture('spawnpoint', 'spawn-a', 100, 100, { priority: 1 });
  doc.definitions.exit = { ...doc.definitions.marker, id: 'exit', gameplay: { role: 'exit', nonblocking: true } };
  doc.placements.push({ id: 'exit-1', definitionId: 'exit', x: 100, y: 100, width: 32, height: 32, layer: 0, flipX: false, rotation: 0, settings: {} });
  const runtime = new LevelRuntime(doc, { gravity: 0 }); assert.ok(runtime.spawn.x > 80);
  const events = runtime.advance(.02); assert.equal(runtime.finished, true); assert.equal(events.filter(e => e.type === 'level-exit').length, 1); const x = runtime.player.x; runtime.advance(.2, { right: true }); assert.equal(runtime.player.x, x);
});

test('checkpoint saves progress and decoy chests emit typed contact before death', () => {
  const doc = roleFixture('checkpoint', 'checkpoint-1', 40, 120, { order: 1 });
  doc.definitions.decoy = { ...doc.definitions.marker, id: 'decoy', gameplay: { role: 'decoy-chest', nonblocking: true, chestId: 'stable-chest', decoyKind: 'bomb' } };
  doc.placements.push({ id: 'decoy-1', definitionId: 'decoy', x: 100, y: 120, width: 32, height: 32, layer: 0, flipX: false, rotation: 0, settings: {} });
  const runtime = new LevelRuntime(doc, { spawn: { x: 40, y: 120 }, gravity: 0, respawnMs: 0 }); const events = runtime.advance(.02);
  assert.equal(runtime.checkpoint.id, 'checkpoint-1'); assert.ok(events.some(e => e.type === 'checkpoint'));
  runtime.player.x = 100; runtime.advance(.02); assert.ok(runtime.events.some(e => e.type === 'gameplay-contact' && e.action === 'entered')); assert.ok(runtime.events.some(e => e.type === 'decoy')); assert.equal(runtime.deaths, 1); assert.equal(runtime.player.x, runtime.checkpoint.x);
});

function coreFixture(){
  const doc=roleFixture('none');doc.placements=[];
  const add=(id,role,x,extra={})=>{const p={id,definitionId:'marker',x,y:100,width:32,height:40,layer:0,flipX:false,rotation:0,settings:{},gameplay:{role,...extra}};doc.placements.push(p);return p;};
  return {doc,add};
}
function touch(runtime,doc,id){const p=doc.placements.find(p=>p.id===id);Object.assign(runtime.player,{x:p.x,y:p.y,vx:0,vy:0});return runtime.advance(.02);}

test('checkpoint rollback preserves all collected coins without duplicating gains',()=>{
  const {doc,add}=coreFixture();add('coin-a','coin',40,{coinValue:2});add('cp-a','checkpoint',100);add('coin-b','coin',200,{coinValue:3});add('cp-b','checkpoint',300);add('trap','decoy-chest',500);
  const r=new LevelRuntime(doc,{spawn:{x:0,y:100},gravity:0,respawnMs:20});touch(r,doc,'coin-a');touch(r,doc,'cp-a');assert.equal(r.checkpoint.order,1);assert.equal(r.checkpoint.coins,2);
  touch(r,doc,'coin-b');assert.equal(r.coins,5);touch(r,doc,'trap');advanceFor(r,.04);
  assert.equal(r.coins,5);assert.deepEqual([...r.collected],['coin-a','coin-b']);assert.equal(r.player.x,r.checkpoint.x);
  assert.equal(r.getStates().find(e=>e.placement.id==='coin-b').state.collected,true);
  touch(r,doc,'coin-b');touch(r,doc,'coin-a');assert.equal(r.coins,5);
  touch(r,doc,'cp-b');const saved={...r.checkpoint};touch(r,doc,'cp-a');assert.deepEqual(r.checkpoint,saved);
  assert.equal(r.getStates().find(e=>e.placement.id==='cp-a').state.checkpointReached,true);assert.equal(r.getStates().find(e=>e.placement.id==='cp-b').state.checkpointReached,true);
});

test('death before any checkpoint preserves collection and auto-order uses placement roles and authored X',()=>{
  const {doc,add}=coreFixture();add('later','checkpoint',300);add('earlier','checkpoint',100);add('coin','coin',40);add('trap','decoy-chest',500);
  const r=new LevelRuntime(doc,{spawn:{x:0,y:100},gravity:0,respawnMs:20});touch(r,doc,'coin');touch(r,doc,'trap');advanceFor(r,.04);
  assert.equal(r.coins,1);assert.equal(r.collected.size,1);assert.equal(r.checkpoint,null);
  touch(r,doc,'later');assert.equal(r.checkpoint.order,2);touch(r,doc,'earlier');assert.equal(r.checkpoint.id,'later');assert.equal(r.reachedCheckpoints.has('earlier'),true);
});

test('spawn priority, referenced marker, legacy world spawn and viewer override have deterministic precedence',()=>{
  const {doc,add}=coreFixture();add('low','spawnpoint',100,{priority:1});add('high','spawnpoint',600,{priority:3});
  assert.deepEqual(new LevelRuntime(doc).spawn,{x:602,y:84});doc.world.spawn={x:8,y:9};assert.deepEqual(new LevelRuntime(doc).spawn,{x:602,y:84});doc.world.spawnPlacementId='low';assert.deepEqual(new LevelRuntime(doc).spawn,{x:102,y:84});assert.deepEqual(new LevelRuntime(doc,{spawn:{x:5,y:6}}).spawn,{x:5,y:6});
});

test('power chest contacts are stable enter/leave events and do not grant local inventory',()=>{
  const {doc,add}=coreFixture();add('power','power-chest',100,{chestId:'reward-one'});const r=new LevelRuntime(doc,{spawn:{x:0,y:100},gravity:0});
  let events=touch(r,doc,'power');assert.equal(events.filter(e=>e.type==='gameplay-contact'&&e.action==='entered').length,1);assert.equal(events.find(e=>e.type==='gameplay-contact').chestId,'reward-one');
  assert.equal(r.advance(.05).filter(e=>e.type==='gameplay-contact').length,0);r.player.x=900;events=r.advance(.02);assert.equal(events.find(e=>e.type==='gameplay-contact').action,'left');assert.equal(r.coins,0);assert.equal(r.inventory,undefined);
});

test('overlapping decoy prevents same-step coin and checkpoint commits regardless of placement order',()=>{
  const {doc,add}=coreFixture();add('coin','coin',100);add('checkpoint','checkpoint',100);add('trap','decoy-chest',100,{decoyKind:'bomb'});
  const r=new LevelRuntime(doc,{spawn:{x:100,y:100},gravity:0,respawnMs:100});const events=r.advance(.02);assert.equal(r.deaths,1);assert.equal(r.coins,0);assert.equal(r.checkpoint,null);assert.equal(events.some(e=>e.type==='coin'||e.type==='checkpoint'),false);
});

test('chosen spawn switches assets and follows transformed moving anchors after JSON reload',()=>{
  const {doc,add}=coreFixture();
  const a=add('old','spawnpoint',100,{priority:999});
  const b=add('new','coin',300,{tags:['chosen'],anchor:[.25,.5]});
  doc.world.spawn={x:8,y:9};
  setLevelSpawn(doc,a.id);assert.deepEqual(new LevelRuntime(doc).spawn,{x:102,y:84});
  setLevelSpawn(doc,b.id);assert.deepEqual(new LevelRuntime(doc).spawn,{x:294,y:84});
  Object.assign(b,{x:300,y:160,width:72,height:48,rotation:90,flipX:true});
  b.settings.motion={axis:'x',distance:20,periodMs:1000,phaseMs:250};
  const reloaded=parseDocument(serializeDocument(doc));
  const before=JSON.stringify(reloaded),runtime=new LevelRuntime(reloaded);
  assert.deepEqual(runtime.spawn,{x:342,y:166});
  assert.equal(JSON.stringify(reloaded),before);
  assert.deepEqual(new LevelRuntime(reloaded,{spawn:{x:50,y:60}}).spawn,{x:50,y:60});
});

test('stale spawn references fall back to tagged markers then legacy coordinates',()=>{
  const {doc,add}=coreFixture();const a=add('marker','spawnpoint',100);add('ordinary','coin',600);
  doc.world.spawn={x:8,y:9};doc.world.spawnPlacementId='deleted';
  assert.deepEqual(new LevelRuntime(doc).spawn,{x:102,y:84});
  doc.world.spawnPlacementId='ordinary';
  assert.deepEqual(new LevelRuntime(doc).spawn,{x:102,y:84});
  doc.placements=doc.placements.filter(p=>p.id!==a.id);
  assert.deepEqual(new LevelRuntime(doc).spawn,{x:8,y:9});
});

test('chosen asset provides initial respawn while reached checkpoints take over',()=>{
  const {doc,add}=coreFixture();const start=add('start','spawnpoint',40);add('checkpoint','checkpoint',300);add('trap','decoy-chest',500);
  setLevelSpawn(doc,start.id);
  const runtime=new LevelRuntime(doc,{gravity:0,respawnMs:20});
  touch(runtime,doc,'trap');advanceFor(runtime,.04);
  assert.equal(runtime.player.x,runtime.spawn.x);assert.equal(runtime.checkpoint,null);
  touch(runtime,doc,'checkpoint');const checkpointX=runtime.checkpoint.x;
  touch(runtime,doc,'trap');advanceFor(runtime,.04);
  assert.equal(runtime.player.x,checkpointX);
  runtime.reset();assert.equal(runtime.player.x,runtime.spawn.x);assert.equal(runtime.checkpoint,null);
});

test('confirmed reward claims remove artwork and collision across death, leaving decoys intact',()=>{
  const {doc,add}=coreFixture();
  add('reward','power-chest',100,{chestId:'reward-id'});
  add('decoy','decoy-chest',500,{chestId:'decoy-id'});
  const runtime=new LevelRuntime(doc,{spawn:{x:40,y:100},gravity:0,respawnMs:20});
  assert.deepEqual(runtime.claimPowerChests(['reward-id','decoy-id','unknown']),['reward-id']);
  const reward=()=>runtime.getStates().find(e=>e.placement.id==='reward').state;
  assert.equal(reward().vanished,true);
  assert.equal(reward().collectedAtMs,0);
  assert.equal(reward().physics.mode,'none');
  assert.notEqual(runtime.getStates().find(e=>e.placement.id==='decoy').state.vanished,true);
  touch(runtime,doc,'decoy');advanceFor(runtime,.04);
  assert.equal(runtime.deaths,1);
  assert.equal(reward().vanished,true);
  assert.deepEqual(runtime.claimPowerChests(['reward-id']),[]);
  runtime.reset();
  assert.notEqual(reward().vanished,true);
  assert.equal(runtime.claimedChests.size,0);
});
