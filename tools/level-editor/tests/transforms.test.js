import test from 'node:test';
import assert from 'node:assert/strict';
import { localToWorld,worldToLocal,placementBounds,containsPlacement,getTransformHandles,hitTestHandles,resizePlacement,rotationForPointer } from '../transforms.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('rotated and flipped coordinates round trip',()=>{
  for(const rotation of [0,90,37,-125])for(const flipX of [true,false]){
    const state={x:20,y:40,width:100,height:60,rotation,flipX}, point={x:17,y:43};
    const world=localToWorld(state,point), local=worldToLocal(state,world);
    near(local.x,point.x);near(local.y,point.y);assert.equal(containsPlacement(state,world),true);
  }
});
test('rotated bounds cover corners',()=>{
  const bounds=placementBounds({x:10,y:20,width:100,height:40,rotation:90});
  near(bounds.width,40);near(bounds.height,100);near(bounds.x,40);near(bounds.y,-10);
});
test('resize keeps opposite rotated anchor fixed',()=>{
  const state={x:100,y:200,width:80,height:40,rotation:35};
  const anchor=localToWorld(state,{x:0,y:0}), point=localToWorld(state,{x:160,y:90});
  const resized=resizePlacement(state,'se',point), after=localToWorld(resized,{x:0,y:0});
  near(after.x,anchor.x);near(after.y,anchor.y);near(resized.width,160);near(resized.height,90);
});
test('handle hit regions remain in screen pixels at different zooms',()=>{
  const state={x:10,y:20,width:100,height:50,rotation:30};
  for(const zoom of [.2,1,4]){
    const handles=getTransformHandles(state,{x:-50,y:0,zoom}), rotate=handles.find(h=>h.id==='rotate');
    assert.equal(hitTestHandles(handles,{x:rotate.screenX+3,y:rotate.screenY+3}).id,'rotate');
  }
});
test('rotation is center based with optional angle snapping',()=>{
  const state={x:0,y:0,width:100,height:100};
  near(rotationForPointer(state,{x:100,y:50}),90);
  near(rotationForPointer(state,{x:50,y:0}),0);
  assert.equal(rotationForPointer(state,{x:95,y:10},15),45);
});
