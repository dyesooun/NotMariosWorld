import {drawPlacement,loadImages} from './preview.js';
import {placementBounds,localToWorld} from './transforms.js';
import {shapePolygons} from './runtime-geometry.js';
import {gameplayTriggerPolygons} from './gameplay.js';

export {loadImages};
export function drawLevelScene(c,document,states,images,{camera={x:0,y:0,zoom:1},width=document.world.width,height=document.world.height,collisions=false}={}){
  const v=camera;
    for(const {placement,state}of states.sort((a,b)=>a.state.layer-b.state.layer)){
      const box=placementBounds(state);if(box.x+box.width<v.x||box.x>v.x+width||box.y+box.height<v.y||box.y>v.y+height)continue;
      drawPlacement(c,document,placement,images,{state,collisions});
      if(collisions)for(const polygon of shapePolygons(state,'vanish')){c.beginPath();polygon.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle='#70c8ff18';c.strokeStyle='#70c8ff';c.lineWidth=1/v.zoom;c.fill();c.stroke();}
      if(collisions)for(const polygon of gameplayTriggerPolygons(state)){c.beginPath();polygon.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.strokeStyle='#f5d778';c.lineWidth=1/v.zoom;c.stroke();}
      if(state.checkpointReached&&!state.vanished){const point=localToWorld(state,{x:state.width/2,y:0});c.fillStyle='#ffd166';c.beginPath();c.arc(point.x,point.y-5,4,0,Math.PI*2);c.fill();}
    }
}


// This renderer knows only the exported document and evaluated runtime state.
// Biome names, source filenames and course positions have no rendering role.
export class LevelRenderer {
  constructor(canvas,document,images){this.canvas=canvas;this.document=document;this.images=images;this.context=canvas.getContext('2d');this.camera={x:0,y:0,zoom:1};}
  fit(){const {width,height}=this.canvas.getBoundingClientRect(),world=this.document.world;this.camera.zoom=Math.max(.01,Math.min(width/world.width,height/world.height));this.camera.x=(world.width-width/this.camera.zoom)/2;this.camera.y=(world.height-height/this.camera.zoom)/2;}
  follow(player){
    const {width,height}=this.canvas.getBoundingClientRect(),world=this.document.world;
    this.camera.zoom=height/Math.min(world.height,600);const vw=width/this.camera.zoom,vh=height/this.camera.zoom;
    if(player.x<this.camera.x+vw*.2)this.camera.x=player.x-vw*.2;
    if(player.x+player.width>this.camera.x+vw*.8)this.camera.x=player.x+player.width-vw*.8;
    if(player.y<this.camera.y+vh*.2)this.camera.y=player.y-vh*.2;
    if(player.y+player.height>this.camera.y+vh*.8)this.camera.y=player.y+player.height-vh*.8;
    this.camera.x=Math.max(0,Math.min(Math.max(0,world.width-vw),this.camera.x));
    this.camera.y=Math.max(0,Math.min(Math.max(0,world.height-vh),this.camera.y));
  }
  worldPoint(clientX,clientY){const b=this.canvas.getBoundingClientRect();return{x:this.camera.x+(clientX-b.left)/this.camera.zoom,y:this.camera.y+(clientY-b.top)/this.camera.zoom};}
  zoomAt(factor,clientX,clientY){const point=this.worldPoint(clientX,clientY),b=this.canvas.getBoundingClientRect();this.camera.zoom=Math.max(.01,Math.min(8,this.camera.zoom*factor));this.camera.x=point.x-(clientX-b.left)/this.camera.zoom;this.camera.y=point.y-(clientY-b.top)/this.camera.zoom;}
  draw(runtime,{collisions=false}={}){
    const {canvas,context:c,camera:v}=this,b=canvas.getBoundingClientRect(),dpr=globalThis.devicePixelRatio||1,w=Math.max(1,Math.round(b.width*dpr)),h=Math.max(1,Math.round(b.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#10191c';c.fillRect(0,0,b.width,b.height);c.save();c.scale(v.zoom,v.zoom);c.translate(-v.x,-v.y);c.imageSmoothingEnabled=false;
    const world=this.document.world;c.fillStyle=world.backgroundColor;c.fillRect(0,0,world.width,world.height);
    drawLevelScene(c,this.document,runtime.getStates(),this.images,{camera:v,width:b.width/v.zoom,height:b.height/v.zoom,collisions});
    this.drawPlayer(runtime);
    c.strokeStyle='#86b6a6';c.lineWidth=1/v.zoom;c.strokeRect(0,0,world.width,world.height);c.restore();
  }
  drawPlayer(runtime){
    const c=this.context,p=runtime.player;
    if(runtime.deadRemainingMs>0){const age=Math.max(0,(runtime.respawnMs-runtime.deadRemainingMs)/1000);c.fillStyle='#b7ef51';for(let i=0;i<24;i++){const angle=i*2.399963,velocity=35+(i%5)*17;c.globalAlpha=Math.max(0,1-age/2);c.fillRect(p.x+p.width/2+Math.cos(angle)*velocity*age,p.y+p.height/2+Math.sin(angle)*velocity*age+160*age*age,4,4);}c.globalAlpha=1;return;}
    const x=Math.round(p.x),y=Math.round(p.y),w=p.width,h=p.height,step=p.grounded?Math.sin(runtime.timeMs*.018)*Math.min(3,Math.abs(p.vx)/80):0;
    c.fillStyle='#1b2630';c.fillRect(x+3,y+h-7,w-6,7);c.fillStyle='#b7ef51';c.fillRect(x+3,y+12,w-6,h-18);c.fillStyle='#edc69c';c.fillRect(x+5,y+2,w-10,12);c.fillStyle='#3b4b38';c.fillRect(x+3,y,w-6,5);c.fillStyle='#14212c';c.fillRect(x+7,y+7,3,3);c.fillRect(x+w-10,y+7,3,3);c.fillRect(x+4,y+h-5,w/3,5+step);c.fillRect(x+w*.6,y+h-5,w/3,5-step);
  }
}
