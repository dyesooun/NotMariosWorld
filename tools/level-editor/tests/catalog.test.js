import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {existsSync}from'node:fs';
import { createTilesetCatalog, adaptLegacyForestTileset } from '../catalog.js';
import { validateTilesetManifest } from '../manifest-validation.js';
import { validateSchema } from '../manifest-validation.js';
import { loadForestCatalog } from '../catalog.js';
import { createDocument, validateDocument, serializeDocument } from '../document.js';

const schema = JSON.parse(await readFile(new URL('../../../public/assets/sprites/schema.json', import.meta.url), 'utf8'));
const base = {format:'platformer-tileset-manifest',version:1,name:'Pack',units:'source-image-pixels',coordinateSystem:'top-left-x-right-y-down',atlas:{image:'a.png',width:32,height:32,transparent:true,layout:'irregular',rendering:{filter:'nearest',defaultFacing:'right'}},frames:{p:{name:'Platform',category:'platform',sourceRectPx:{x:0,y:0,w:16,h:8},measurementStatus:'measured',notes:[],contentBoundsPx:null,pivotPx:null,anchorRole:'walking_surface',walkSurfacesPx:null,solidShapesPx:null,hazardShapesPx:null,interactionShapesPx:null,components:null,terrain:{repeatX:'unverified',leftJoinPx:null,rightJoinPx:null,leftCapPx:null,repeatRegionPx:null,rightCapPx:null,compatibleLeftFrameIds:null,compatibleRightFrameIds:null}}},measurement:{method:'manual_pixel_measurement',notes:[]},beamPairs:null};

test('generic packs validate and preserve source frames', async () => { const c=await createTilesetCatalog(base,'data:image/png;base64,x',{schema}); assert.equal(Object.keys(c.definitions).length,1); const a=Object.values(c.assets)[0]; assert.equal(a.frames.p.sourceRectPx.w,16); });
test('malformed geometry and beam refs are rejected', () => { const bad=structuredClone(base); bad.frames.p.solidShapesPx=[{kind:'polygon',pointsPx:[{x:0,y:0},{x:0,y:0},{x:1,y:1}]}]; assert.ok(validateTilesetManifest(bad,schema).length>0); });
test('legacy adapter creates generic frames without changing source count', () => { const legacy={theme:'Old',atlas:{width:10,height:10},frames:{a:{x:0,y:0,w:5,h:5}},tile_groups:[]}; const m=adaptLegacyForestTileset(legacy); assert.equal(Object.keys(m.frames).length,1); assert.equal(m.frames.a.sourceRectPx.w,5); });

test('measured rectangles and surfaces normalize into independent interpretations', async () => {
  const input=structuredClone(base);
  input.frames.p.solidShapesPx=[{kind:'rect',rectPx:{x:2,y:1,w:12,h:2}}];
  input.frames.p.walkSurfacesPx=[{kind:'horizontal',x1:2,y1:1,x2:14,y2:1}];
  const original=JSON.stringify(input);
  const pack=await createTilesetCatalog(input,'data:image/png;base64,x',{schema});
  const definition=Object.values(pack.definitions)[0];
  assert.deepEqual(definition.physics.collider,[.125,.125,.75,.25]);
  assert.equal(definition.physics.calibration,'manifest');
  assert.equal(definition.physics.walkSurfaces[0].y1,.125);
  assert.equal(JSON.stringify(input),original);
  definition.physics.collider[0]=.2;
  assert.equal(input.frames.p.solidShapesPx[0].rectPx.x,2);
});

test('unknown geometry has estimates while confirmed empty geometry stays empty', async () => {
  const unknown=await createTilesetCatalog(base,'data:image/png;base64,x',{schema});
  const estimated=Object.values(unknown.definitions)[0];
  assert.equal(estimated.physics.calibration,'estimated');
  assert.deepEqual(estimated.physics.collider,[.08,.18,.84,.22]);
  const input=structuredClone(base);input.frames.p.solidShapesPx=[];
  const empty=Object.values((await createTilesetCatalog(input,'data:image/png;base64,x',{schema})).definitions)[0];
  assert.equal(empty.physics.collider,null);assert.deepEqual(empty.physics.solidShapes,[]);
});

test('new packs reject legacy input and use independent namespaces', async () => {
  await assert.rejects(createTilesetCatalog({format:'legacy'},'data:image/png;base64,x',{schema}),/Unsupported/);
  const first=await createTilesetCatalog(base,'data:image/png;base64,x',{schema});
  const second=await createTilesetCatalog(base,'data:image/png;base64,x',{schema,existingIds:Object.keys(first.assets)});
  assert.notEqual(Object.keys(first.assets)[0],Object.keys(second.assets)[0]);
  assert.notEqual(Object.keys(first.definitions)[0],Object.keys(second.definitions)[0]);
});

test('semantic checks validate surfaces, edges, joins, and bounds', () => {
  const good=structuredClone(base);good.frames.p.pivotPx={x:16,y:8};
  good.frames.p.solidShapesPx=[{kind:'polygon',pointsPx:[{x:0,y:0},{x:16,y:0},{x:16,y:8},{x:0,y:8}]}];
  assert.deepEqual(validateTilesetManifest(good,schema),[]);
  const bad=structuredClone(good);bad.frames.p.walkSurfacesPx=[{kind:'horizontal',x1:14,y1:2,x2:2,y2:3}];
  assert.ok(validateTilesetManifest(bad,schema).length);
  const join=structuredClone(base);join.frames.p.terrain.compatibleLeftFrameIds=['missing'];
  assert.ok(validateTilesetManifest(join,schema).some(e=>e.includes('not a platform')));
  const crop=structuredClone(base);crop.frames.p.sourceRectPx.x=31;
  assert.ok(validateTilesetManifest(crop,schema).some(e=>e.includes('outside atlas')));
});

test('validator preserves array order and rejects unsupported future constraints', () => {
  assert.deepEqual(validateSchema([[1,2],[2,1]],{type:'array',uniqueItems:true}),[]);
  assert.ok(validateSchema([{x:1,y:2},{y:2,x:1}],{type:'array',uniqueItems:true}).length);
  assert.ok(validateSchema({}, {type:'object',properties:{unused:{pattern:'x'}}}).some(e=>e.includes('unsupported')));
});

test('real bundled forest catalog is browser-loadable and exports valid definitions', {skip:!existsSync(new URL('../../../public/assets/sprites/forest/tileset/manifest.json',import.meta.url))}, async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(new URL('../../../public'+url,import.meta.url),'utf8'))});
  try {
    const catalog=await loadForestCatalog(), document=createDocument(catalog);
    assert.deepEqual(validateDocument(document),[]);
    assert.equal(Object.values(catalog.definitions).filter(d=>d.kind==='enemy').length,4);
    assert.equal(Object.values(catalog.definitions).filter(d=>d.kind==='beam').length,9);
    assert.ok(Object.values(catalog.definitions).some(d=>d.kind==='projectile'));
    for(const d of Object.values(catalog.definitions)) assert.ok(catalog.assets[d.visual.assetId].frames[d.visual.frameId]);
    assert.ok(serializeDocument(document).includes('brambleback_boar'));
  } finally { globalThis.fetch=originalFetch; }
});

test('a schema-based bundled tileset uses its declared image path', async () => {
  const originalFetch=globalThis.fetch;
  const custom=structuredClone(base);custom.atlas.image='replacement-atlas.webp';
  globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/tileset/manifest.json') ? custom : JSON.parse(await readFile(new URL('../../../public'+url,import.meta.url),'utf8'))});
  try {
    const catalog=await loadForestCatalog();
    assert.ok(Object.values(catalog.assets).some(a=>a.src==='/assets/sprites/forest/tileset/replacement-atlas.webp'));
    assert.deepEqual(validateDocument(createDocument(catalog)),[]);
  } finally {globalThis.fetch=originalFetch;}
});
