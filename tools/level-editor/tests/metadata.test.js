import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDocument, createPlacement, parseDocument, serializeDocument,validateDocument,History,clone } from '../document.js';
import { updateSourceFrame, setDefinitionGeometry, addSourceFrame, removeSourceFrame, exportTilesetManifest, exportAssetLibrary, importAssetLibrary,deleteAssetDefinition,replaceAtlasImage } from '../metadata.js';
import { validateTilesetManifest } from '../manifest-validation.js';

const schema = JSON.parse(readFileSync(new URL('../../../public/assets/sprites/schema.json', import.meta.url)));
const manifest = { format:'platformer-tileset-manifest', version:1, name:'Test', units:'source-image-pixels', coordinateSystem:'top-left-x-right-y-down', atlas:{ image:'test.png', width:64, height:32, transparent:true, layout:'irregular', rendering:{filter:'nearest',defaultFacing:'not_applicable'} }, frames:{ floor:{name:'Floor',category:'platform',sourceRectPx:{x:0,y:0,w:32,h:16},measurementStatus:'measured',notes:[],contentBoundsPx:null,pivotPx:null,anchorRole:'walking_surface',walkSurfacesPx:null,solidShapesPx:null,hazardShapesPx:null,interactionShapesPx:null,components:null,terrain:{repeatX:'unverified',leftJoinPx:null,rightJoinPx:null,leftCapPx:null,repeatRegionPx:null,rightCapPx:null,compatibleLeftFrameIds:null,compatibleRightFrameIds:null}}, off:{name:'Off',category:'beam',sourceRectPx:{x:32,y:0,w:16,h:16},measurementStatus:'measured',notes:[],contentBoundsPx:null,pivotPx:null,anchorRole:'center',walkSurfacesPx:null,solidShapesPx:null,hazardShapesPx:[],interactionShapesPx:null,components:null,beam:{state:'off',topEmitterPx:null,bottomReceiverPx:null,corePx:null,repeatCorePx:null,topMountPx:null,bottomMountPx:null,coreRepeatY:'unverified'}}}, measurement:{method:'manual_pixel_measurement',notes:[]}, beamPairs:null };
function doc() { const frames=JSON.parse(JSON.stringify(manifest.frames)); for (const f of Object.values(frames)) Object.assign(f,f.sourceRectPx); return createDocument({ assets:{ atlas:{id:'atlas',name:'Atlas',src:'/assets/sprites/test.png',width:64,height:32,frames,manifest:JSON.parse(JSON.stringify(manifest))} }, definitions:{ floor:{id:'floor',name:'Floor',kind:'platform',visual:{assetId:'atlas',frameId:'floor'},size:{width:32,height:16},physics:{mode:'solid',collider:[0,0,1,1],hitbox:null,lethal:false,gravity:false,calibration:'manifest',solidShapes:null,hazardShapes:null,interactionShapes:null},behavior:{type:'static'}}, off:{id:'off',name:'Off',kind:'beam',visual:{assetId:'atlas',frameId:'off'},size:{width:16,height:16},physics:{mode:'trigger',collider:null,hitbox:null,lethal:false,gravity:false,calibration:'manifest',solidShapes:null,hazardShapes:null,interactionShapes:null},behavior:{type:'beam',onMs:100,offMs:100,phaseMs:0,startState:'off'}} } }); }

test('crop and authored geometry synchronize generic metadata without moving placements', () => { const d=doc(); const a=createPlacement(d,'floor',20,40), b=createPlacement(d,'floor',100,40); d.placements.push(a,b); updateSourceFrame(d,'atlas','floor',{x:1,y:1,w:30,h:15}); assert.equal(a.x,20); setDefinitionGeometry(d,'floor','body',[.1,.2,.5,.5]); assert.deepEqual(d.assets.atlas.frames.floor.solidShapesPx[0].rectPx,{x:3,y:3,w:15,h:8}); const out=exportTilesetManifest(d,'atlas',schema); assert.equal(validateTilesetManifest(out,schema).length,0); });
test('off beam crop keeps confirmed empty hazard geometry', () => { const d=doc(); updateSourceFrame(d,'atlas','off',{x:30,y:0,w:16,h:16}); assert.deepEqual(d.assets.atlas.manifest.frames.off.hazardShapesPx,[]); assert.equal(validateTilesetManifest(exportTilesetManifest(d,'atlas',schema),schema).length,0); });
test('new cuts and unused definitions can be removed', () => { const d=doc(); const id=addSourceFrame(d,'atlas',{x:40,y:16,w:12,h:12},{name:'Cut',kind:'prop'}); assert.ok(d.definitions[id]); assert.equal(validateTilesetManifest(exportTilesetManifest(d,'atlas',schema),schema).length,0); removeSourceFrame(d,'atlas','cut-1'); assert.equal(d.definitions[id],undefined); });
test('asset library roundtrip applies corrected shared definitions to placements', () => { const d=doc(); d.placements.push(createPlacement(d,'floor',1,2),createPlacement(d,'floor',3,4)); setDefinitionGeometry(d,'floor','body',[0,0,.5,1]); const lib=exportAssetLibrary(d,['atlas']); const copy=importAssetLibrary(doc(),lib,schema); assert.deepEqual(copy.definitions.floor.physics, d.definitions.floor.physics); assert.equal(copy.placements.length,0); });
test('version one documents migrate while preserving fields and IDs', () => { const d=doc(); const p=createPlacement(d,'floor',4,5); p.settings={phaseMs:9}; d.placements.push(p); const raw=JSON.parse(serializeDocument(d)); raw.version=1; delete raw.placements[0].rotation; const migrated=parseDocument(JSON.stringify(raw)); assert.equal(migrated.version,2); assert.equal(migrated.placements[0].rotation,0); assert.equal(migrated.placements[0].id,p.id); assert.equal(migrated.placements[0].settings.phaseMs,9); });

test('deleting a shared asset removes its placements and broken support links with undo',()=>{
  const d=doc(),floor=createPlacement(d,'floor',20,40),other=createPlacement(d,'off',60,40);
  other.settings.supportId=floor.id;d.placements.push(floor,other);const history=new History(d);
  deleteAssetDefinition(d,'floor');history.commit(d);
  assert.equal(d.definitions.floor,undefined);assert.equal(d.placements.length,1);assert.equal(other.settings.supportId,undefined);
  assert.ok(d.assets.atlas);assert.deepEqual(validateDocument(d),[]);
  const restored=history.undo();assert.ok(restored.definitions.floor);assert.equal(restored.placements.length,2);
  deleteAssetDefinition(d,'off');assert.deepEqual(d.assets,{});assert.deepEqual(exportAssetLibrary(d).definitions,{});
});

test('replacing an atlas keeps cuts, definitions, and placement transforms',()=>{
  const d=doc(),p=createPlacement(d,'floor',123,456);p.rotation=17;p.flipX=true;p.settings={motion:{axis:'x',distance:20}};d.placements.push(p);
  const before={placement:JSON.stringify(p),definition:JSON.stringify(d.definitions.floor),frameIds:Object.keys(d.assets.atlas.frames)};
  replaceAtlasImage(d,'atlas',{src:'data:image/png;base64,replacement',name:'new-atlas.png',width:64,height:32},'keep');
  assert.equal(d.assets.atlas.src,'data:image/png;base64,replacement');
  assert.deepEqual(Object.keys(d.assets.atlas.frames),before.frameIds);assert.equal(JSON.stringify(d.placements[0]),before.placement);assert.equal(JSON.stringify(d.definitions.floor),before.definition);
});

test('replacement rejects out-of-bounds cuts atomically and scale mode preserves logical geometry',()=>{
  const d=doc(),placement=createPlacement(d,'floor',10,20);d.placements.push(placement);const snapshot=JSON.stringify(d);
  assert.throws(()=>replaceAtlasImage(d,'atlas',{src:'data:image/png;base64,small',name:'small.png',width:8,height:8},'keep'),/too small/);assert.equal(JSON.stringify(d),snapshot);
  const physics=JSON.stringify(d.definitions.floor.physics),position=[d.placements[0].x,d.placements[0].y];
  replaceAtlasImage(d,'atlas',{src:'data:image/png;base64,scaled',name:'scaled.png',width:128,height:64},'scale');
  assert.deepEqual(d.assets.atlas.frames.floor.sourceRectPx,{x:0,y:0,w:64,h:32});assert.equal(JSON.stringify(d.definitions.floor.physics),physics);assert.deepEqual([d.placements[0].x,d.placements[0].y],position);
});

test('replacement serializes through History undo and redo',()=>{
  const d=doc(),history=new History(d),old=d.assets.atlas.src;
  replaceAtlasImage(d,'atlas',{src:'data:image/png;base64,next',name:'next.png',width:64,height:32},'keep');history.commit(d);
  const undone=history.undo();assert.equal(undone.assets.atlas.src,old);const redone=history.redo();assert.equal(redone.assets.atlas.src,'data:image/png;base64,next');
});

test('replacement preserves every crop and world reference while invalidating old source measurements',()=>{
  const d=doc(),first=createPlacement(d,'floor',10,20),second=createPlacement(d,'off',200,300);
  first.flipY=true;first.rotation=37;second.settings.supportId=first.id;d.placements.push(first,second);
  const before={placements:clone(d.placements),definitions:clone(d.definitions),cuts:Object.fromEntries(Object.entries(d.assets.atlas.frames).map(([id,f])=>[id,clone(f.sourceRectPx)]))};
  replaceAtlasImage(d,'atlas',{src:'data:image/png;base64,updated',width:100,height:80},'keep');
  assert.deepEqual(d.placements,before.placements);assert.deepEqual(d.definitions,before.definitions);
  for(const[id,f]of Object.entries(d.assets.atlas.frames)){
    assert.deepEqual(f.sourceRectPx,before.cuts[id]);assert.equal(f.measurementStatus,'unresolved');
  }
  assert.deepEqual(validateDocument(d),[]);
  assert.equal(validateTilesetManifest(exportTilesetManifest(d,'atlas',schema),schema).length,0);
});

test('nonuniform atlas resize scales beam offsets and keeps small edge cuts in bounds',()=>{
  const d=doc();addSourceFrame(d,'atlas',{x:63,y:31,w:1,h:1});
  d.definitions.off.visual.beamAlignment={onOffsetPx:{x:-4,y:8},offOffsetPx:{x:12,y:-2}};
  const placements=clone(d.placements),physics=clone(d.definitions.off.physics);
  replaceAtlasImage(d,'atlas',{src:'data:image/png;base64,smaller',width:5,height:3},'scale');
  for(const f of Object.values(d.assets.atlas.frames)){
    assert.ok(f.x>=0&&f.y>=0&&f.w>=1&&f.h>=1);assert.ok(f.x+f.w<=5&&f.y+f.h<=3);
  }
  assert.deepEqual(d.definitions.off.visual.beamAlignment,{onOffsetPx:{x:-4*5/64,y:8*3/32},offOffsetPx:{x:12*5/64,y:-2*3/32}});
  assert.deepEqual(d.definitions.off.physics,physics);assert.deepEqual(d.placements,placements);
  assert.deepEqual(validateDocument(d),[]);
  assert.equal(validateTilesetManifest(exportTilesetManifest(d,'atlas',schema),schema).length,0);
});
