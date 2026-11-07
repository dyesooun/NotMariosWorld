import test from 'node:test';
import assert from 'node:assert/strict';
import { frameClipPolygonError, insertFrameOutlinePoint, projectPointToFrameEdge, nearestFrameOutlineEdge } from '../public/game/json-level/frame-outline.js';
import { setSourceFrameOutline, updateSourceFrame, replaceAtlasImage, exportAssetLibrary, importAssetLibrary } from '../tools/level-editor/metadata.js';
import { createGameDocument, serializeGameDocument } from '../public/game/json-level/game-export.js';

test('validates concave outlines and permits adjacent collinear vertices', () => {
  assert.equal(frameClipPolygonError([[0,0],[1,0],[1,.4],[.5,.4],[.5,1],[0,1]]), null);
  assert.equal(frameClipPolygonError([[0,0],[.5,0],[1,0],[1,1],[0,1]]), null);
  assert.ok(frameClipPolygonError([[0,0],[1,1],[0,1],[1,0]]));
  assert.match(frameClipPolygonError([[0,0],[.5,0],[1,0],[1,1],[0,1],[0,0]]), /distinct/);
  assert.ok(frameClipPolygonError([[0,0],[1.1,0],[1,1]]));
  assert.ok(frameClipPolygonError([[0,0],[Number.NaN,1],[1,1]]));
  assert.ok(frameClipPolygonError([[0,0],[1,0],[1,1],[.5,0],[0,1]]));
});

test('library and serialized export round-trip outlines', () => {
  const doc = minimalDoc(); setSourceFrameOutline(doc,'a','f',[[0,0],[1,0],[.6,1],[0,1]]);
  const library = exportAssetLibrary(doc); const imported = importAssetLibrary(minimalDoc(), library);
  assert.deepEqual(imported.assets.a.frames.f.clipPolygon, doc.assets.a.frames.f.clipPolygon);
  assert.match(serializeGameDocument(doc), /clipPolygon/);
  setSourceFrameOutline(doc,'a','f',null); assert.equal(doc.assets.a.frames.f.clipPolygon, undefined);
});

test('atlas replacement modes preserve mask and physics/placements', () => {
  for (const mode of ['keep','scale']) { const doc=minimalDoc(); setSourceFrameOutline(doc,'a','f',[[0,0],[1,0],[.7,1],[0,1]]); const physics=structuredClone(doc.definitions.d.physics), placements=structuredClone(doc.placements); replaceAtlasImage(doc,'a',{src:'data:image/png;base64,x',width:mode==='scale'?20:10,height:mode==='scale'?20:10},mode); assert.deepEqual(doc.assets.a.frames.f.clipPolygon,[[0,0],[1,0],[.7,1],[0,1]]); assert.deepEqual(doc.definitions.d.physics,physics); assert.deepEqual(doc.placements,placements); }
});

test('creature manifest sync adds and clears outline', () => {
  const doc=minimalDoc(); doc.assets.a.manifest={format:'creature-sprite-atlas/v1',frames:{f:{sourceRectPx:{x:0,y:0,w:4,h:4}}}}; setSourceFrameOutline(doc,'a','f',[[0,0],[1,0],[1,1],[0,1]]); assert.deepEqual(doc.assets.a.manifest.frames.f.clipPolygon,[[0,0],[1,0],[1,1],[0,1]]); setSourceFrameOutline(doc,'a','f',null); assert.equal(doc.assets.a.manifest.frames.f.clipPolygon,undefined);
});

function minimalDoc(){ return { format:'not-marios-world-level', version:2, id:'x', name:'x', biome:'custom', world:{width:10,height:10,backgroundColor:'#000000'}, assets:{a:{id:'a',src:'/assets/sprites/a.png',width:10,height:10,frames:{f:{x:0,y:0,w:4,h:4}}}}, definitions:{d:{id:'d',name:'d',kind:'prop',size:{width:4,height:4},visual:{assetId:'a',frameId:'f'},physics:{mode:'none',collider:null,hitbox:null,lethal:false,gravity:false},behavior:{type:'static'}}}, placements:[{id:'p',definitionId:'d',x:1,y:2,width:4,height:4,layer:0,flipX:false,rotation:0,settings:{}}] }; }

test('projects and inserts a point on the nearest crop edge', () => {
  assert.deepEqual(projectPointToFrameEdge([.48, -.1]), [.48, 0]);
  assert.deepEqual(insertFrameOutlinePoint(null, [.5, 0]), [[0,0],[.5,0],[1,0],[1,1],[0,1]]);
});
test('inserts against an existing concave polygon edge', () => {
  const polygon = [[0,0],[1,0],[1,1],[.5,.5],[0,1]];
  const result = insertFrameOutlinePoint(polygon, [.75,.75]);
  assert.deepEqual(result[3], [.75,.75]);
});
test('edge picking measures distance in source pixels for non-square cuts',()=>{
  const edge=nearestFrameOutlineEdge(null,[.5,.05],[1000,20]);
  assert.equal(edge.index,1);assert.equal(edge.distance,1);assert.deepEqual(edge.point,[.5,0]);
});

test('outline survives crop movement and game export without changing geometry', () => {
  const doc = { format:'not-marios-world-level', version:2, id:'x', name:'x', biome:'custom', world:{width:10,height:10,backgroundColor:'#000000'}, assets:{a:{id:'a',src:'/assets/sprites/a.png',width:10,height:10,frames:{f:{x:0,y:0,w:4,h:4}}}}, definitions:{d:{id:'d',name:'d',kind:'prop',size:{width:4,height:4},visual:{assetId:'a',frameId:'f'},physics:{mode:'none',collider:null,hitbox:null,lethal:false,gravity:false},behavior:{type:'static'}}}, placements:[{id:'p',definitionId:'d',x:1,y:2,width:4,height:4,layer:0,flipX:false,rotation:0,settings:{}}] };
  setSourceFrameOutline(doc,'a','f',[[0,0],[1,0],[.7,1],[0,1]]);
  const before = structuredClone(doc.definitions.d.physics);
  updateSourceFrame(doc,'a','f',{x:1,y:1,w:4,h:4});
  assert.deepEqual(doc.assets.a.frames.f.clipPolygon, [[0,0],[1,0],[.7,1],[0,1]]);
  assert.deepEqual(doc.definitions.d.physics, before);
  const out = createGameDocument(doc); assert.deepEqual(out.assets.a.frames.f.clipPolygon, doc.assets.a.frames.f.clipPolygon);
});
