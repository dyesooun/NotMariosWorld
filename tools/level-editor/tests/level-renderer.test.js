import test from 'node:test';
import assert from 'node:assert/strict';
import {LevelRenderer} from '../level-renderer.js';
import {LevelRuntime} from '../level-runtime.js';
import {createDocument,createPlacement} from '../document.js';

test('renderer consumes evaluated state in layer order and culls distant art without biome rules',()=>{
  const draws=[],matrix=[];const context=new Proxy({drawImage:(...args)=>draws.push(args),transform:(...args)=>matrix.push(args)},{get:(o,k)=>k in o?o[k]:()=>{}});
  const canvas={width:800,height:400,getContext:()=>context,getBoundingClientRect:()=>({width:800,height:400,left:0,top:0})};
  const assets={atlas:{id:'atlas',src:'/assets/sprites/test.png',width:2,height:1,frames:{a:{x:0,y:0,w:1,h:1},b:{x:1,y:0,w:1,h:1}}}};
  const definition={id:'art',name:'Any art',kind:'prop',size:{width:20,height:20},visual:{assetId:'atlas',frameId:'a',animations:{idle:{frames:['a'],fps:2,loop:true},active:{frames:['b'],fps:2,loop:true}},defaultAnimation:'idle'},physics:{mode:'none',collider:null,hitbox:null,lethal:false,gravity:false,calibration:'authored'},behavior:{type:'static'}};
  const doc=createDocument({assets,definitions:{art:definition}});doc.biome='unknown-theme';doc.world.width=2000;doc.world.height=400;
  const front=createPlacement(doc,'art',100,80),back=createPlacement(doc,'art',20,30),distant=createPlacement(doc,'art',1500,100);front.layer=4;front.rotation=90;front.flipX=true;back.layer=-2;doc.placements.push(front,distant,back);
  const runtime=new LevelRuntime(doc,{spawn:{x:0,y:0},gravity:0});runtime.setEntityState(front.id,'active');
  const before=JSON.stringify(doc),renderer=new LevelRenderer(canvas,doc,new Map([['atlas',{}]]));renderer.draw(runtime);
  assert.equal(draws.length,2);assert.equal(draws[0][1],0);assert.equal(draws[1][1],1);
  assert.equal(matrix.length,2);assert.ok(Math.abs(matrix[1][1]+1)<1e-8);assert.equal(JSON.stringify(doc),before);
});

test('follow scrolls at viewport edges in both directions and clamps to world bounds',()=>{
  const canvas={getContext:()=>({}),getBoundingClientRect:()=>({width:800,height:400})};
  const renderer=new LevelRenderer(canvas,{world:{width:2400,height:400}},new Map());
  const player={x:300,y:200,width:28,height:36};renderer.follow(player);assert.equal(renderer.camera.x,0);
  player.x=650;renderer.follow(player);assert.equal(renderer.camera.x,38);
  player.x=1400;renderer.follow(player);assert.equal(renderer.camera.x,788);
  player.x=850;renderer.follow(player);assert.equal(renderer.camera.x,690);
  player.x=2372;renderer.follow(player);assert.equal(renderer.camera.x,1600);
  player.x=0;renderer.follow(player);assert.equal(renderer.camera.x,0);
});

test('follow scrolls vertically and restores a useful view after manual inspection',()=>{
  const canvas={getContext:()=>({}),getBoundingClientRect:()=>({width:800,height:600})};
  const renderer=new LevelRenderer(canvas,{world:{width:2400,height:1600}},new Map());
  renderer.camera={x:-900,y:-500,zoom:.02};renderer.follow({x:900,y:1000,width:28,height:36});
  assert.equal(renderer.camera.zoom,1);assert.equal(renderer.camera.x,288);assert.equal(renderer.camera.y,556);
  renderer.follow({x:0,y:0,width:28,height:36});assert.equal(renderer.camera.x,0);assert.equal(renderer.camera.y,0);
});
