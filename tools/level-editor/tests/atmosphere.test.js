import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument, createPlacement, validateDocument, serializeDocument, parseDocument, resolvePlacement} from '../document.js';
import {exportAssetLibrary, importAssetLibrary} from '../metadata.js';
import {resolveAtmosphere, forestFogCards, fogCardBounds, drawAtmosphere} from '../../../public/game/json-level/atmosphere.js';
import {LevelRenderer} from '../../../public/game/json-level/level-renderer.js';
import {LevelRuntime} from '../../../public/game/json-level/level-runtime.js';

function fixture() {
  return createDocument({assets:{atlas:{id:'atlas',src:'/assets/sprites/test.png',width:1,height:1,frames:{a:{x:0,y:0,w:1,h:1}}}},definitions:{prop:{id:'prop',name:'Mushroom',kind:'hazard',size:{width:30,height:30},visual:{assetId:'atlas',frameId:'a'},physics:{mode:'none',collider:null,hitbox:[0,0,1,1],lethal:true,gravity:false,calibration:'authored'},behavior:{type:'static'}}}});
}

test('VFX inheritance and asset-library/level roundtrips retain per-object overrides', () => {
  const d=fixture(), p=createPlacement(d,'prop',30,40); d.placements.push(p);
  d.definitions.prop.vfx={enabled:true,hazardType:'mushroom',color:'#abcdef'};
  p.vfx={enabled:false,hazardType:'thorns'};
  const before=serializeDocument(d), state=resolvePlacement(d,p);
  assert.deepEqual(state.vfx,{enabled:false,hazardType:'thorns',color:'#abcdef'});
  state.vfx.color='#123456'; assert.equal(serializeDocument(d),before);
  assert.deepEqual(parseDocument(before).placements[0].vfx,p.vfx);
  const imported=importAssetLibrary(fixture(),exportAssetLibrary(d));
  assert.deepEqual(imported.definitions.prop.vfx,d.definitions.prop.vfx);
  assert.deepEqual(state.physics,d.definitions.prop.physics);
});

test('VFX and fog metadata reject invalid values and excessive card budgets', () => {
  const d=fixture(),p=createPlacement(d,'prop',0,0);d.placements.push(p);
  d.definitions.prop.vfx={enabled:'yes',hazardType:'laser',color:'red'};p.vfx=[];
  d.world.atmosphere={opacity:2,color:'rgba(0,0,0)',cards:[{x:0,y:0,width:0,height:20,drift:-1,speed:200}]};
  const errors=validateDocument(d);
  for(const field of ['vfx.enabled','vfx.hazardType','vfx.color','placements[0].vfx','atmosphere.opacity','atmosphere.color','cards[0].width','cards[0].drift','cards[0].speed']) assert.ok(errors.some(e=>e.includes(field)),field);
  d.world.atmosphere.cards=Array.from({length:101},()=>({x:0,y:0,width:10,height:10}));
  assert.ok(validateDocument(d).some(e=>e.includes('at most 100')));
});

test('forest mist uses sparse bounded pockets without mutating authored worlds', () => {
  const d=fixture();d.biome='forest';d.world.width=5993;
  const before=serializeDocument(d), a=resolveAtmosphere(d);
  assert.equal(a.enabled,true);assert.equal(a.cards.length,7);
  assert.ok(a.cards.every((c,i)=>c.width<600&&c.height<100&&(!i||c.x>a.cards[i-1].x+a.cards[i-1].width+200)));
  assert.deepEqual(a.cards,forestFogCards(d.world));assert.equal(serializeDocument(d),before);
  d.biome='custom';assert.equal(resolveAtmosphere(d).enabled,false);
  assert.ok(forestFogCards({width:1000000,height:600}).length<=100);
});

test('explicit empty cards and disabled atmosphere suppress automatic forest fog', () => {
  const d=fixture();d.biome='forest';d.world.atmosphere={enabled:true,color:'#ffffff',opacity:.1,cards:[]};
  assert.deepEqual(resolveAtmosphere(d).cards,[]);
  const copy=parseDocument(serializeDocument(d));assert.deepEqual(copy.world.atmosphere,d.world.atmosphere);
  d.world.atmosphere={enabled:false};assert.equal(resolveAtmosphere(d).enabled,false);
  drawAtmosphere({save(){throw Error('Disabled mist must not draw');}},d);
});

test('fog cards drift within local bounds and visible cards alone are rendered', () => {
  const d=fixture();const card={x:100,y:200,width:300,height:70,drift:30,speed:6};
  for(const time of [0,1000,1000000]) {const b=fogCardBounds(card,time);assert.ok(Math.abs(b.x-card.x)<=30);assert.ok(Math.abs(b.y-card.y)<=5);assert.equal(b.width,300);}
  const previous=globalThis.OffscreenCanvas,draws=[];
  globalThis.OffscreenCanvas=class {getContext(){return{createImageData:()=>({data:new Uint8ClampedArray(128*32*4)}),putImageData(){}};}};
  try {
    const context={globalAlpha:1,save(){},restore(){},drawImage(...args){draws.push(args);}};
    drawAtmosphere(context,d,{timeMs:1200,camera:{x:0,y:0},width:800,height:600,atmosphere:{enabled:true,color:'#abcedf',opacity:.15,cards:[card,{...card,x:2000}]}});
    assert.equal(draws.length,1);assert.ok(context.globalAlpha<=.15);
  } finally {if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});

test('fog overlays even high-layer backgrounds with normal blending, before the player',()=>{
  const d=fixture();d.definitions.prop.kind='background';d.definitions.prop.physics.lethal=false;
  const p=createPlacement(d,'prop',0,0);p.layer=1000;d.placements.push(p);
  d.world.atmosphere={enabled:true,color:'#d6e5da',opacity:.24,cards:[{x:0,y:0,width:200,height:80,drift:0}]};
  const previous=globalThis.OffscreenCanvas,events=[],sprite={};
  globalThis.OffscreenCanvas=class {getContext(){return{createImageData:()=>({data:new Uint8ClampedArray(128*32*4)}),putImageData(){}};}};
  try{
    const c=new Proxy({globalAlpha:1,globalCompositeOperation:'destination-over',drawImage(image){events.push({kind:image===sprite?'background':'fog',blend:this.globalCompositeOperation});}},{get:(o,k)=>k in o?o[k]:()=>{}});
    const canvas={width:800,height:400,getContext:()=>c,getBoundingClientRect:()=>({width:800,height:400})};
    const renderer=new LevelRenderer(canvas,d,new Map([['atlas',sprite]]));renderer.drawPlayer=()=>events.push({kind:'player'});
    renderer.draw(new LevelRuntime(d,{spawn:{x:200,y:100},gravity:0}));
    assert.deepEqual(events.map(e=>e.kind),['background','fog','player']);
    assert.equal(events[1].blend,'source-over');
  }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});
