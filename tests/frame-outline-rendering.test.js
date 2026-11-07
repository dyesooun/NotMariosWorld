import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPlacement } from '../public/game/json-level/preview.js';
import { drawPlacementVfx } from '../public/game/json-level/vfx.js';
import { maskedFrameSource } from '../public/game/json-level/frame-outline.js';

function recordingContext() {
  const calls=[],stack=[];let clipped=false;
  const ctx={globalAlpha:1,calls};
  for(const name of ['transform','translate','beginPath','moveTo','lineTo','closePath','rect','fillRect','strokeRect','fill','stroke','drawImage'])ctx[name]=(...args)=>calls.push({name,args,clipped});
  ctx.save=()=>{stack.push(clipped);calls.push({name:'save'});};
  ctx.restore=()=>{clipped=stack.pop();calls.push({name:'restore'});};
  ctx.clip=()=>{clipped=true;calls.push({name:'clip'});};
  return ctx;
}
function canvasFixture(t) {
  const original=globalThis.OffscreenCanvas;
  class Canvas {
    constructor(w,h){this.width=w;this.height=h;this.ctx=recordingContext();}
    getContext(){return this.ctx;}
  }
  globalThis.OffscreenCanvas=Canvas;
  t.after(()=>{if(original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=original;});
  return Canvas;
}

test('artwork clips within its visual transform and restores before collision overlays',()=>{
  for(const masked of [false,true]){
    const frame={x:10,y:20,w:12,h:8};if(masked)frame.clipPolygon=[[0,0],[1,0],[.5,1]];
    const definition={id:'d',kind:'prop',visual:{assetId:'a',frameId:'f',offset:[.2,.1],scale:[.8,.7]},physics:{mode:'solid',collider:[0,0,1,1],lethal:false},behavior:{type:'static'},vfx:{enabled:false}};
    const document={assets:{a:{frames:{f:frame}}},definitions:{d:definition}};
    const placement={id:'p',definitionId:'d',x:30,y:40,width:100,height:80,rotation:90,flipX:true,layer:0,settings:{}};
    const ctx=recordingContext(),image={};
    drawPlacement(ctx,document,placement,new Map([['a',image]]),{timeMs:0,collisions:true});
    const art=ctx.calls.find(c=>c.name==='drawImage');assert.equal(art.clipped,masked);
    assert.deepEqual(art.args,[image,10,20,12,8,20,8,80,56]);
    const outlines=ctx.calls.filter(c=>c.name==='stroke');assert.ok(outlines.length);assert.ok(outlines.every(c=>!c.clipped));
    assert.equal(ctx.calls.filter(c=>c.name==='clip').length,masked?1:0);
    if(masked){assert.ok(ctx.calls.some(c=>c.name==='translate'&&c.args[0]===20&&c.args[1]===8));assert.ok(ctx.calls.some(c=>c.name==='lineTo'&&c.args[0]===40&&c.args[1]===56));}
  }
});

test('masked frame cache tracks image, crop and outline content',t=>{
  canvasFixture(t);const image={},frame={x:10,y:20,w:12,h:8},points=[[0,0],[1,0],[.5,1]];
  const first=maskedFrameSource(image,frame,points);
  assert.equal(maskedFrameSource(image,frame,structuredClone(points)),first);
  assert.notEqual(maskedFrameSource(image,frame,[[0,0],[1,0],[.4,1]]),first);
  assert.notEqual(maskedFrameSource(image,{...frame,x:11},points),first);
  assert.deepEqual(first.ctx.calls.find(c=>c.name==='drawImage').args,[image,10,20,12,8,0,0,12,8]);
  globalThis.OffscreenCanvas=class {getContext(){return null;}};
  assert.equal(maskedFrameSource({},frame,points),null);
});

test('vanish fragments sample masked pixels in crop-local coordinates',t=>{
  canvasFixture(t);const image={},frame={x:10,y:20,w:12,h:8,clipPolygon:[[0,0],[1,0],[.5,1]]};
  const state={id:'p',assetId:'a',x:0,y:0,width:120,height:80,rotation:0,flipX:false,definition:{kind:'platform'},visual:{offset:[0,0],scale:[1,1]},gameplay:{role:'none'},vfx:{enabled:true},behavior:{vanish:{countdownMs:3000,restoreMode:'onDeath'}},vanished:true,vanishElapsedMs:3100};
  const ctx=recordingContext();drawPlacementVfx(ctx,state,{timeMs:3100,images:new Map([['a',image]]),frame});
  const pieces=ctx.calls.filter(c=>c.name==='drawImage');assert.equal(pieces.length,12);
  const masked=maskedFrameSource(image,frame,frame.clipPolygon);
  assert.ok(pieces.every(piece=>piece.args[0]===masked));
  assert.deepEqual(pieces[0].args.slice(1,5),[0,0,2,4]);
  assert.deepEqual(pieces.at(-1).args.slice(1,5),[10,4,2,4]);
});
