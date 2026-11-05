import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';
import {buildAutomaticManifest}from'../auto-tileset.js';import{validateTilesetManifest}from'../manifest-validation.js';
const schema=JSON.parse(await readFile(new URL('../../../public/assets/sprites/schema.json',import.meta.url),'utf8'));
test('automatic source manifests conform to the generic schema for different categories',()=>{
  const image={width:40,height:30,data:new Uint8ClampedArray(40*30*4)};
  for(let y=5;y<20;y++)for(let x=3;x<18;x++)image.data[(y*40+x)*4+3]=255;
  for(const category of ['platform','prop','chest','hazard','background']){
    const {manifest}=buildAutomaticManifest(image,{category,imageName:'arbitrary.webp'});
    assert.deepEqual(validateTilesetManifest(manifest,schema),[]);
    assert.equal(Object.keys(manifest.frames).length,1);
  }
});
test('grid source geometry preserves margins and omits empty cells',()=>{
  const image={width:24,height:14,data:new Uint8ClampedArray(24*14*4)};
  for(let y=2;y<12;y++)for(let x=2;x<12;x++)image.data[(y*24+x)*4+3]=255;
  const {manifest}=buildAutomaticManifest(image,{method:'grid',cellWidthPx:10,cellHeightPx:10,gridPaddingPx:2,spacingPx:0});
  assert.deepEqual(validateTilesetManifest(manifest,schema),[]);
  assert.equal(Object.keys(manifest.frames).length,1);assert.equal(manifest.atlas.grid.columns,2);
});
