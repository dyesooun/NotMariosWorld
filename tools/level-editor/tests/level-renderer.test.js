import test from 'node:test';
import assert from 'node:assert/strict';
import {LevelRenderer,drawLevelScene} from '../level-renderer.js';
import {LevelRuntime} from '../level-runtime.js';
import {createDocument,createPlacement} from '../document.js';
import {getPreviewState} from '../preview.js';

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

test('race background art follows the camera at 12% while foreground stays world-locked',()=>{
  const translations=[],draws=[];
  const context={save(){},restore(){},translate:(x,y)=>translations.push([x,y]),transform(){},drawImage:(...args)=>draws.push(args),fillRect:(...args)=>draws.push(args),beginPath(){},closePath(){}};
  const assets={atlas:{id:'atlas',src:'/assets/sprites/test.png',width:1,height:1,frames:{a:{x:0,y:0,w:1,h:1}}}};
  const base={size:{width:20,height:20},visual:{assetId:'atlas',frameId:'a',defaultAnimation:'idle',animations:{idle:{frames:['a'],fps:1,loop:true}}},physics:{mode:'none',collider:null,hitbox:null,lethal:false,gravity:false},behavior:{type:'static'}};
  const doc=createDocument({assets,definitions:{background:{...base,id:'background',kind:'background'},foreground:{...base,id:'foreground',kind:'prop'}}});
  const background=createPlacement(doc,'background',100,20),foreground=createPlacement(doc,'foreground',100,40);doc.placements.push(background,foreground);
  const states=doc.placements.map(placement=>({placement,state:getPreviewState(doc,placement)}));
  drawLevelScene(context,doc,states,new Map(),{camera:{x:100,y:0,zoom:1},width:200,height:100});
  assert.deepEqual(translations.filter(([x])=>x),[[88,0]]);
  assert.equal(draws.length,2);
});

test('background culling uses shifted screen bounds and protects interactive artwork',()=>{
  const makeContext=()=>{const draws=[],images=[];return {draws,images,save(){},restore(){},translate(){},transform(){},drawImage:(...args)=>{images.push(args);draws.push(args);},fillRect:(...args)=>draws.push(args),beginPath(){},closePath(){}};};
  const assets={atlas:{id:'atlas',src:'/assets/sprites/test.png',width:1,height:1,frames:{a:{x:0,y:0,w:1,h:1}}}};
  const base={size:{width:20,height:20},visual:{assetId:'atlas',frameId:'a',defaultAnimation:'idle',animations:{idle:{frames:['a'],fps:1,loop:true}}},physics:{mode:'none',collider:null,hitbox:null,lethal:false,gravity:false},behavior:{type:'static'}};
  const doc=createDocument({assets,definitions:{background:{...base,id:'background',kind:'background'},interactive:{...base,id:'interactive',kind:'background',gameplay:{role:'coin'}},solid:{...base,id:'solid',kind:'background',physics:{...base.physics,mode:'solid'}}}});
  const newlyVisible=createPlacement(doc,'background',0,20),shiftedOut=createPlacement(doc,'background',500,20),interactive=createPlacement(doc,'interactive',0,50),solid=createPlacement(doc,'solid',0,80);
  const states=[newlyVisible,shiftedOut,interactive,solid].map(placement=>({placement,state:getPreviewState(doc,placement)}));
  const images=new Map([['atlas',{}]]);
  const visible=makeContext();drawLevelScene(visible,doc,states,images,{camera:{x:100,y:0,zoom:1},width:100,height:100});
  // The first background is newly visible after its +88px screen offset; the
  // second is shifted out. Safeguarded backgrounds retain ordinary culling.
  assert.equal(visible.images.length,1);
  const moved=makeContext();drawLevelScene(moved,doc,states,images,{camera:{x:0,y:0,zoom:1},width:100,height:100});
  assert.equal(moved.images.length,3);
});

test('parallax preserves adjacent strip seams, authored motion/flips and caller state while props track the full camera',()=>{
  const assets={atlas:{id:'atlas',src:'/assets/sprites/test.png',width:1,height:1,frames:{a:{x:0,y:0,w:1,h:1}}}};
  const base={size:{width:1000,height:600},visual:{assetId:'atlas',frameId:'a',animations:{}},physics:{mode:'none',lethal:false},behavior:{type:'static',motion:{axis:'y',distance:5,periodMs:2000}},vfx:{enabled:false}};
  const doc=createDocument({assets,definitions:{back:{...base,id:'back',kind:'background'},front:{...base,id:'front',kind:'prop',size:{width:20,height:20}}}});
  doc.world.width=3000;
  const left=createPlacement(doc,'back',0,0),right=createPlacement(doc,'back',999,0),prop=createPlacement(doc,'front',600,60);
  left.flipX=true;doc.placements.push(prop,right,left);
  const states=doc.placements.map(placement=>({placement,state:getPreviewState(doc,placement,500)}));
  const originalDocument=JSON.stringify(doc),originalStates=JSON.stringify(states);
  const drawAt=cameraX=>{
    let matrix=[1,0,0,1,-cameraX,0];const stack=[],draws=[];
    const context={
      save(){stack.push([...matrix]);},restore(){matrix=stack.pop();},
      translate(x,y){this.transform(1,0,0,1,x,y);},
      transform(a,b,c,d,e,f){const[A,B,C,D,E,F]=matrix;matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];},
      drawImage(image,sx,sy,sw,sh,x,y,w,h){draws.push({width:w,left:Math.min(matrix[4],matrix[4]+matrix[0]*w),matrix:[...matrix]});},
    };
    drawLevelScene(context,doc,states,new Map([['atlas',{}]]),{camera:{x:cameraX,y:0,zoom:1},width:1800,height:600,timeMs:500});
    return draws.sort((a,b)=>a.width-b.width||a.left-b.left);
  };
  const start=drawAt(0),scrolled=drawAt(100);
  assert.equal(start.length,3);assert.equal(scrolled.length,3);
  assert.equal(scrolled[0].left-start[0].left,-100);
  for(let i=1;i<3;i++){
    assert.equal(scrolled[i].left-start[i].left,-12);
    assert.deepEqual(scrolled[i].matrix.slice(0,4),start[i].matrix.slice(0,4));
    assert.equal(scrolled[i].matrix[5],start[i].matrix[5]);
  }
  assert.equal(scrolled[2].left-scrolled[1].left,999);
  assert.equal(scrolled[1].matrix[0],-1);
  assert.equal(scrolled[1].matrix[5],5);
  assert.equal(JSON.stringify(doc),originalDocument);assert.equal(JSON.stringify(states),originalStates);
});
