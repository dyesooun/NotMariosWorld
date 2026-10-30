// Forest-only raster atlas. The atlas manifest is intentionally explicit so
// non-uniform generated sprite bounds can be adjusted without touching the
// renderer or the shared avatar atlas.
export const FOREST_SPRITES = Object.freeze({
  vine_hanging:{x:0,y:0,w:314,h:320}, vine_climbing:{x:314,y:0,w:314,h:320},
  flower_pink:{x:628,y:0,w:313,h:320}, flower_bluebell:{x:941,y:0,w:313,h:320},
  flower_gold:{x:0,y:320,w:314,h:300}, flower_daisy:{x:314,y:320,w:314,h:300},
  mushrooms_red:{x:628,y:320,w:313,h:300}, mushrooms_glow:{x:941,y:320,w:313,h:300},
  forest_chest:{x:0,y:620,w:336,h:272}, glow_moth:{x:336,y:620,w:292,h:272},
  mushling:{x:628,y:620,w:313,h:272}, acorn_beetle:{x:941,y:620,w:313,h:272},
  forest_totem:{x:0,y:892,w:304,h:362}, tiki:{x:304,y:892,w:324,h:362},
  wood_mask:{x:628,y:892,w:238,h:362}, root_platform:{x:866,y:892,w:388,h:362}
});
let image, ready=false, loading=false;
const trimCache=new Map();
const pixelCache=new Map();
export const FOREST_PIXEL_GRID=Object.freeze({sprite:2,scenery:3});
export function forestPixelDimensions(width,height){
  const grid=Math.max(width,height)>80?FOREST_PIXEL_GRID.scenery:FOREST_PIXEL_GRID.sprite;
  return {width:Math.max(1,Math.ceil(width/grid)),height:Math.max(1,Math.ceil(height/grid)),grid};
}
function pixelSurface(key,source,sx,sy,sw,sh,width,height){
  const size=forestPixelDimensions(width,height),cacheKey=`${key}:${size.width}:${size.height}`;
  if(pixelCache.has(cacheKey))return pixelCache.get(cacheKey);
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
  // Nearest-neighbor sampling retains the existing colors without blending,
  // recoloring, or modifying the original atlas.
  context.drawImage(source,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  pixelCache.set(cacheKey,canvas);return canvas;
}
// Cell-local anchors measured from the actual root-platform artwork. Leaves
// above this shelf are decoration; the solid grass shelf is the walk surface.
export const FOREST_TERRAIN = Object.freeze({
  surfaceY:103, surfaceLeft:29, surfaceRight:361, backingY:145,
  crop:Object.freeze({x:7,y:67,w:369,h:268}),
  interior:Object.freeze({x:45,y:67,w:296,h:268}), tileWidth:160
});
export function forestPlatformLayout(platform){
  const ground=platform.kind==='ground',s=ground?FOREST_TERRAIN.interior:FOREST_TERRAIN.crop;
  const scale=ground?FOREST_TERRAIN.tileWidth/s.w:platform.w/(FOREST_TERRAIN.surfaceRight-FOREST_TERRAIN.surfaceLeft);
  return {ground,source:s,scale,surfaceY:platform.y,
    x:ground?platform.x:platform.x-(FOREST_TERRAIN.surfaceLeft-s.x)*scale,
    y:platform.y-(FOREST_TERRAIN.surfaceY-s.y)*scale,
    width:s.w*scale,height:s.h*scale,
    backingY:platform.y+(FOREST_TERRAIN.backingY-FOREST_TERRAIN.surfaceY)*scale};
}
function drawTerrainTile(ctx,layout,x){
  const cell=FOREST_SPRITES.root_platform,s=layout.source;
  const above=FOREST_TERRAIN.surfaceY-s.y;
  // Sample foliage and soil separately so coarse pixels never move the grass
  // shelf away from the collision height fixed by the terrain anchors.
  const layers=[{name:'foliage',offset:0,rows:above,y:layout.y},{name:'soil',offset:above,rows:s.h-above,y:layout.surfaceY}];
  for(const layer of layers){
    const height=layer.rows*layout.scale;
    const source=pixelSurface(`terrain:${layout.ground?'ground':'ledge'}:${layer.name}`,image,cell.x+s.x,cell.y+s.y+layer.offset,s.w,layer.rows,layout.width,height);
    ctx.drawImage(source,x,layer.y,layout.width,height);
  }
}
export function drawForestPlatform(ctx,platform,{earth='#5e4937'}={}){
  loadForestAtlas();if(!ready||!image)return false;
  const layout=forestPlatformLayout(platform);
  ctx.save();ctx.imageSmoothingEnabled=false;
  if(layout.ground){
    // Keep every tile at one scale, including the clipped final partial tile.
    // The backing starts inside opaque soil, never at the grassy collision lip.
    ctx.beginPath();ctx.rect(platform.x,layout.y,platform.w,Math.max(layout.height,platform.y+Math.max(100,platform.h)-layout.y));ctx.clip();
    ctx.fillStyle=earth;ctx.fillRect(platform.x,layout.backingY,platform.w,Math.max(0,platform.y+Math.max(100,platform.h)-layout.backingY));
    for(let x=platform.x;x<platform.x+platform.w;x+=layout.width)drawTerrainTile(ctx,layout,x);
  }else drawTerrainTile(ctx,layout,layout.x);
  ctx.restore();return true;
}
export function loadForestAtlas(){
  if (typeof Image==='undefined'||image||loading) return;
  loading=true; image=new Image(); image.onload=()=>{ready=true;}; image.onerror=()=>{loading=false;image=null;}; image.src='/assets/forest-sprites.png';
}
function trimmed(name){
  if (!ready||!image||typeof document==='undefined') return null;
  if (trimCache.has(name)) return trimCache.get(name);
  const s=FOREST_SPRITES[name]; if(!s)return null;
  const c=document.createElement('canvas'); c.width=s.w;c.height=s.h; const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
  const pixels=ctx.getImageData(0,0,s.w,s.h).data;
  let left=s.w,top=s.h,right=-1,bottom=-1;
  for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(pixels[(y*s.w+x)*4+3]>70){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(right<left){trimCache.set(name,null);return null;}
  const clipped=document.createElement('canvas');clipped.width=right-left+1;clipped.height=bottom-top+1;
  clipped.getContext('2d').drawImage(c,left,top,clipped.width,clipped.height,0,0,clipped.width,clipped.height);
  trimCache.set(name,{canvas:clipped,w:clipped.width,h:clipped.height});return trimCache.get(name);
}
export function drawForestSprite(ctx,name,x,y,width=32,height=width,{flip=false,alpha=1}={}){
  loadForestAtlas(); const source=trimmed(name); if(!source)return false;
  const scale=Math.min(width/source.w,height/source.h),dw=Math.round(source.w*scale),dh=Math.round(source.h*scale),dx=Math.round(x+(width-dw)/2),dy=Math.round(y+height-dh);
  const pixels=pixelSurface(`sprite:${name}`,source.canvas,0,0,source.w,source.h,dw,dh);
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=alpha;
  if(flip){ctx.translate(dx+dw,dy);ctx.scale(-1,1);ctx.drawImage(pixels,0,0,dw,dh);} else ctx.drawImage(pixels,dx,dy,dw,dh);
  ctx.restore(); return true;
}
