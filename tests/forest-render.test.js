import test from 'node:test';
import assert from 'node:assert/strict';
import { FOREST_TERRAIN, forestPlatformLayout, forestPixelDimensions } from '../public/game/forest-sprites.js';
import { LEVELS, platformAt } from '../public/game/levels.js';

test('forest grass shelf matches the collision height at every raised platform width and phase',()=>{
  for(const base of LEVELS[1].platforms.filter(p=>p.kind!=='ground'))for(const time of [0,.75,2.5,7]){
    const p=platformAt(base,time),draw=forestPlatformLayout(p);
    const grassY=draw.y+(FOREST_TERRAIN.surfaceY-draw.source.y)*draw.scale;
    assert.ok(Math.abs(grassY-p.y)<1e-8);
    assert.ok(Math.abs(draw.x+(FOREST_TERRAIN.surfaceLeft-draw.source.x)*draw.scale-p.x)<1e-8);
    assert.ok(Math.abs(draw.x+(FOREST_TERRAIN.surfaceRight-draw.source.x)*draw.scale-(p.x+p.w))<1e-8);
  }
});

test('partial ground tiles keep the same shelf height and buried backing as full tiles',()=>{
  const full=forestPlatformLayout({x:0,y:500,w:160,h:100,kind:'ground'});
  for(const width of [35,135,160,185,330,680,900]){
    const p={x:760,y:500,w:width,h:100,kind:'ground'},draw=forestPlatformLayout(p);
    assert.equal(draw.width,160);assert.equal(draw.scale,full.scale);assert.equal(draw.y,full.y);
    assert.ok(draw.backingY>p.y+20,'plain fill must stay below the opaque grass and soil');
    assert.equal(draw.y+(FOREST_TERRAIN.surfaceY-draw.source.y)*draw.scale,p.y);
  }
});

test('forest critter feet meet their assigned platform visual shelf',()=>{
  for(const enemy of LEVELS[1].enemies){
    const p=LEVELS[1].platforms[enemy.platformIndex],draw=forestPlatformLayout(p);
    const feet=(p.y-enemy.h)+enemy.h;
    assert.equal(feet,p.y);assert.ok(Math.abs(draw.y+(FOREST_TERRAIN.surfaceY-draw.source.y)*draw.scale-feet)<1e-8);
  }
});

test('forest artwork uses coarse display pixels at both creature and scenery sizes',()=>{
  assert.deepEqual(forestPixelDimensions(32,30),{width:16,height:15,grid:2});
  assert.deepEqual(forestPixelDimensions(40,34),{width:20,height:17,grid:2});
  assert.deepEqual(forestPixelDimensions(120,240),{width:40,height:80,grid:3});
  assert.deepEqual(forestPixelDimensions(180,145),{width:60,height:49,grid:3});
});

test('pixelated terrain layers retain an exact grass-shelf split',()=>{
  for(const p of LEVELS[1].platforms){
    const draw=forestPlatformLayout(p),above=(FOREST_TERRAIN.surfaceY-draw.source.y)*draw.scale;
    assert.equal(draw.surfaceY,p.y);assert.ok(Math.abs(draw.y+above-draw.surfaceY)<1e-8);
  }
});
