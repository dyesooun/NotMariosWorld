import { LEVELS, platformAt, enemyAt } from './levels.js';
import { PROJECTILE_RULES } from './projectiles.js';
import { FOREST_SPRITES, drawForestSprite, drawForestPlatform, loadForestAtlas } from './forest-sprites.js';

const W=960,H=540;
const rect=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const mod=(n,m)=>((n%m)+m)%m;
const palette={
  lobby:{sky:['#95d9d8','#a6e2d8','#bdebd5'],sun:'#f8edb5',far:'#73b7ad',mid:'#579e87',leaf:'#397d5a',leaf2:'#4b9660',bright:'#72ad63',trunk:'#715b43',earth:'#735139',earth2:'#8d6443',top:'#83b74b',edge:'#4f813b'},
  forest:{sky:['#9ecbd7','#b3dcd8','#d0e8cf'],sun:'#f5edb3',far:'#76aaa8',mid:'#4d8f87',leaf:'#285c54',leaf2:'#408758',bright:'#6fa95a',trunk:'#69513d',earth:'#5e4937',earth2:'#806142',top:'#8acb58',edge:'#4b863e'},
  ocean:{sky:['#82c7df','#a3e0e3','#d0eee0'],sun:'#fff1bd',far:'#64a8bd',mid:'#3d8d9e',leaf:'#3c9a8c',leaf2:'#68bca2',bright:'#a2d1a4',trunk:'#b39768',earth:'#a28a68',earth2:'#b9a276',top:'#e3cc91',edge:'#c2a773'},
  hell:{sky:['#28203c','#3b2947','#623848'],sun:'#e97567',far:'#5c3b59',mid:'#643c4c',leaf:'#3b2d45',leaf2:'#483047',bright:'#8a474f',trunk:'#543848',earth:'#453448',earth2:'#594052',top:'#9a5752',edge:'#6e3e48'},
};
let atlas,cells=null;
const cache=new Map();
const spriteNames=['explorer','cat','robot','wizard','slime','crab','imp','bomb','coin','spikes','spring','chest','bird','fish','skull','flag'];
function loadAtlas(){
  if(typeof Image==='undefined'||atlas)return;
  atlas=new Image();atlas.onload=()=>{
    // Trim each authored cell's transparent margins without changing the art.
    const source=document.createElement('canvas');source.width=atlas.width;source.height=atlas.height;
    const c=source.getContext('2d',{willReadFrequently:true});c.drawImage(atlas,0,0);
    const pixels=c.getImageData(0,0,atlas.width,atlas.height).data;
    const rows=[0,.292,.545,.765,1],cols=[0,.25,.5,.75,1];cells={};
    spriteNames.forEach((name,index)=>{
      const col=index%4,row=Math.floor(index/4),x0=Math.floor(cols[col]*atlas.width),x1=Math.floor(cols[col+1]*atlas.width),y0=Math.floor(rows[row]*atlas.height),y1=Math.floor(rows[row+1]*atlas.height);
      let left=x1,top=y1,right=x0,bottom=y0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*atlas.width+x)*4+3]>70){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
      cells[name]={x:left,y:top,w:Math.max(1,right-left+1),h:Math.max(1,bottom-top+1)};
    });
  };atlas.src='/assets/sprites.png';
}
function tinted(name,color){
  const key=name+color;if(cache.has(key))return cache.get(key);
  const s=cells[name],c=document.createElement('canvas');c.width=s.w;c.height=s.h;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(atlas,s.x,s.y,s.w,s.h,0,0,s.w,s.h);
  if(color){const data=ctx.getImageData(0,0,s.w,s.h),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));for(let i=0;i<data.data.length;i+=4){const r=data.data[i],g=data.data[i+1],b=data.data[i+2];const match=name==='explorer'?g>r*1.15&&g>b*1.1:name==='cat'?r>g*2.8&&r>b*2:name==='robot'?g>r*1.2&&b>r*1.2:b>g*1.5&&r>g*1.3;if(match){const l=Math.max(.22,Math.min(1.2,Math.max(r,g,b)/200));for(let k=0;k<3;k++)data.data[i+k]=Math.min(255,rgb[k]*l);}}ctx.putImageData(data,0,0);}
  cache.set(key,c);return c;
}
export function drawSprite(ctx,name,x,y,width=32,height=width,{color=null,flip=false,alpha=1}={}){
  if (Object.hasOwn(FOREST_SPRITES,name)) return drawForestSprite(ctx,name,x,y,width,height,{flip,alpha});
  loadAtlas();if(!cells?.[name])return false;
  const s=cells[name],source=color?tinted(name,color):atlas,scale=Math.min(width/s.w,height/s.h),dw=Math.round(s.w*scale),dh=Math.round(s.h*scale),dx=Math.round(x+(width-dw)/2),dy=Math.round(y+height-dh);
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.globalAlpha=alpha;
  if(flip){ctx.translate(dx+dw,dy);ctx.scale(-1,1);if(color)ctx.drawImage(source,0,0,dw,dh);else ctx.drawImage(source,s.x,s.y,s.w,s.h,0,0,dw,dh);}
  else if(color)ctx.drawImage(source,dx,dy,dw,dh);else ctx.drawImage(source,s.x,s.y,s.w,s.h,dx,dy,dw,dh);
  ctx.restore();return true;
}
export function drawAvatar(canvas,name,color){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);drawSprite(c,name,8,8,canvas.width-16,canvas.height-16,{color});}
function cloud(ctx,x,y,size=1){ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(size,size);rect(ctx,'#edf4db',0,12,88,16);rect(ctx,'#edf4db',13,0,38,27);rect(ctx,'#edf4db',50,7,25,20);rect(ctx,'#ffffff80',15,0,33,7);rect(ctx,'#d2e9d8',8,28,72,5);ctx.restore();}
function mountain(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y+h);const points=[[.08,.8],[.18,.8],[.18,.56],[.3,.56],[.3,.35],[.4,.35],[.4,.14],[.49,.14],[.49,0],[.58,0],[.58,.22],[.69,.22],[.69,.5],[.8,.5],[.8,.72],[.9,.72],[.9,.9],[1,.9]];for(const [px,py] of points)ctx.lineTo(Math.round(x+px*w),Math.round(y+py*h));ctx.lineTo(x+w,y+h);ctx.closePath();ctx.fill();}
function tree(ctx,x,ground,height,p,near=false){
  const trunk=near?22:12,top=ground-height;rect(ctx,p.trunk,x-trunk/2,top+35,trunk,height-35);rect(ctx,'#ffffff0a',x-trunk/2,top+60,4,height-60);
  const wide=height*.67,colors=[p.leaf,p.leaf2,p.bright];
  [[-.43,.2,.85,.32],[-.3,0,.6,.45],[-.52,.37,1.04,.26],[-.37,.56,.75,.2]].forEach(([dx,dy,dw,dh],i)=>rect(ctx,colors[i%3],x+wide*dx,top+height*dy,wide*dw,height*dh));
  if(near){for(let n=0;n<12;n++)rect(ctx,n%2?p.leaf:p.bright,x+Math.sin(n*19)*wide*.4,top+22+mod(n*43,height*.6),12,6);rect(ctx,p.trunk,x+5,ground-90,29,8);}
}
function palm(ctx,x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);for(let i=0;i<9;i++)rect(ctx,i%2?'#a68a60':'#bda071',-5+i*.8,-i*14,10,15);const yy=-130;for(let i=0;i<5;i++){const dx=(i-2)*19;rect(ctx,'#4eaa8a',dx,yy+Math.abs(i-2)*6,30,10);rect(ctx,'#3b9279',dx+8,yy+Math.abs(i-2)*6+8,25,8);}rect(ctx,'#886640',0,yy+13,9,9);ctx.restore();}
function background(ctx,p,theme,camera,time){
  for(let i=0;i<3;i++)rect(ctx,p.sky[i],0,i*180,W,180);
  rect(ctx,p.sun,754,63,58,58);rect(ctx,p.sun,745,73,76,38);
  if(theme==='hell'){
    for(let i=0;i<35;i++)rect(ctx,'#b07e8f',mod(i*137-camera*.03,W),mod(i*41,250),2,2);
    for(let i=-1;i<6;i++)mountain(ctx,i*230-mod(camera*.12,230),195,290,310,p.far);
    for(let i=-1;i<5;i++){const x=i*300-mod(camera*.26,300);mountain(ctx,x,270,250,250,p.mid);rect(ctx,'#b65d56',x+122,284,8,90);rect(ctx,'#e68b5e',x+124,286,3,83);}
    rect(ctx,'#e37148',0,506,W,34);for(let x=0;x<W;x+=32)rect(ctx,'#f5b354',x+Math.sin(time*2+x)*6,510,21,4);
    for(let i=0;i<24;i++)rect(ctx,i%3?'#eea059':'#ffd09b',mod(i*79-camera*.5+time*(i%2?4:-3),W),520-mod(time*(16+i%5*4)+i*67,340),2+i%2,4);
    return;
  }
  for(let i=0;i<5;i++)cloud(ctx,mod(i*255-camera*.09-time*(4+i%3),1300)-150,48+(i%3)*43,.8+(i%2)*.4);
  for(let i=-1;i<6;i++)mountain(ctx,i*240-mod(camera*.11,240),225,330,280,p.far);
  if(theme==='ocean'){
    rect(ctx,'#63b7c7',0,351,W,189);rect(ctx,'#3c97b6',0,397,W,143);rect(ctx,'#357e9e',0,471,W,69);
    for(let i=0;i<22;i++)rect(ctx,i%3?'#9cded6':'#c0ead8',mod(i*67-camera*.17+time*(i%2?5:-4),1030)-50,365+(i%5)*28,20+i%3*12,2);
    for(let i=-1;i<5;i++){const x=i*300-mod(camera*.32,300);rect(ctx,'#9cc5a0',x+20,348,130,8);rect(ctx,'#d4ca9d',x+4,356,158,7);palm(ctx,x+80,348,.78);}
    for(let i=0;i<6;i++)drawSprite(ctx,'fish',mod(i*217-camera*.23+time*20,1150)-100,415+Math.sin(time+i)*14,25,18,{flip:i%2===0,alpha:.7});
  }else{
    for(let i=-2;i<12;i++)tree(ctx,i*115-mod(camera*.25,115),500,160+mod(i*71,95),{...p,trunk:'#4e8d76',leaf:'#68a98b',leaf2:'#72b193',bright:'#80b99b'});
    for(let i=-1;i<7;i++)tree(ctx,i*207-mod(camera*.47,207),500,240+mod(i*47,60),p,true);
    for(let i=0;i<6;i++){ctx.fillStyle='#f4f5bf0b';ctx.beginPath();const x=i*210-mod(camera*.35,210);ctx.moveTo(x,20);ctx.lineTo(x+25,20);ctx.lineTo(x+160,500);ctx.lineTo(x+90,500);ctx.fill();}
  }
  for(let i=0;i<4;i++){const x=mod(i*289-camera*.08+time*(17+i*2),1180)-100,y=125+(i%3)*44+Math.sin(time*2+i)*8;drawSprite(ctx,'bird',x,y,26,20);if(Math.sin(time*8+i)>.3)rect(ctx,'#d4e6da',x+7,y+7,10,2);}
  if(theme==='forest'){
    for(let i=-1;i<8;i++){const x=i*158-mod(camera*.21,158);rect(ctx,'#285c54',x,-18,152,48);rect(ctx,'#34764f',x+22,20,108,16);rect(ctx,'#408758',x+45,31,48,10);}
    for(let i=0;i<6;i++){const x=mod(i*211-camera*.18+time*(11+i),1180)-100,y=166+i%3*37+Math.sin(time*1.8+i)*18;const wing=22+Math.round(Math.sin(time*7+i)*4);drawSprite(ctx,'glow_moth',x,y,wing,23,{alpha:.9,flip:i%2===0});}
  }
}
function platform(ctx,p,theme,pal,time){
  if(theme==='forest'){
    ctx.save();if(p.kind==='vanish')ctx.globalAlpha*=.55+Math.sin(time*10)*.3;
    if(!drawForestPlatform(ctx,p,{earth:pal.earth})){rect(ctx,pal.earth,p.x,p.y,p.w,p.kind==='ground'?Math.max(p.h,90):p.h);}
    if(p.kind==='moving'||p.kind==='vanish')for(let i=0;i<3;i++)rect(ctx,p.kind==='moving'?'#a1edce':'#d6bdff',p.x+p.w*(i+1)/4,p.y+9,3,3);
    ctx.restore();return;
  }
  if(p.kind==='ground'){
    rect(ctx,pal.earth,p.x,p.y,p.w,Math.max(p.h,90));rect(ctx,pal.earth2,p.x,p.y+10,p.w,12);rect(ctx,pal.edge,p.x,p.y+6,p.w,7);rect(ctx,pal.top,p.x,p.y,p.w,7);
    for(let x=Math.ceil(p.x/32)*32;x<p.x+p.w;x+=32){const n=mod(x*7,11);rect(ctx,pal.edge,x+mod(n,7),p.y+5,8,9);rect(ctx,'#2a252d30',x+10,p.y+30+mod(n,18),8,4);rect(ctx,'#efdaab18',x+22,p.y+25+mod(n*3,35),4,4);if(theme!=='hell'){rect(ctx,pal.top,x+8,p.y-4,3,6);rect(ctx,pal.top,x+11,p.y-7,2,6);if(mod(x,96)===0){rect(ctx,theme==='ocean'?'#fff4b4':'#e6d79b',x+18,p.y-8,4,4);rect(ctx,'#69974c',x+19,p.y-4,2,5);}}}
    return;
  }
  const vanish=p.kind==='vanish',moving=p.kind==='moving';ctx.save();if(vanish)ctx.globalAlpha=.55+Math.sin(time*10)*.3;
  const top=moving?'#93d4b1':vanish?'#c1afe8':theme==='hell'?'#b27068':theme==='ocean'?'#e9d6a7':'#8eaa68',base=moving?'#407c76':vanish?'#766493':theme==='hell'?'#624150':theme==='ocean'?'#a28b69':'#614a35';
  rect(ctx,'#152c2e55',p.x+3,p.y+4,p.w,p.h);rect(ctx,base,p.x,p.y,p.w,p.h);rect(ctx,top,p.x,p.y,p.w,5);rect(ctx,'#f9efd83b',p.x+2,p.y+2,p.w-4,2);
  for(let x=p.x+18;x<p.x+p.w;x+=30){rect(ctx,'#23333255',x,p.y+6,2,p.h-6);rect(ctx,top,x-6,p.y+9,2,2);}
  if(moving){rect(ctx,'#b1edd5',p.x+5,p.y+8,4,4);rect(ctx,'#b1edd5',p.x+p.w-9,p.y+8,4,4);}
  if(vanish){ctx.font='bold 10px monospace';ctx.fillStyle='#ede8ff';ctx.fillText('· · ·',p.x+p.w/2-15,p.y+14);}ctx.restore();
}
function forestDecor(ctx,camera,time,level){
  if(level.theme!=='forest')return;
  loadForestAtlas();
  const visible=item=>item.x+item.w>camera-20&&item.x<camera+W+20;
  for(const vine of level.decorations.vines.filter(visible))drawSprite(ctx,vine.kind,vine.x+Math.sin(time*.7+vine.x)*2,vine.y,vine.w,vine.h,{alpha:.82});
  for(const item of [...level.decorations.flora,...level.decorations.carvings].filter(visible)){
    if(item.kind==='wood_mask'){const height=item.y-item.h+16,width=height*.6;drawSprite(ctx,'vine_hanging',item.x+item.w/2-width/2,0,width,height,{alpha:.8});}
    drawSprite(ctx,item.kind,item.x,item.y-item.h,item.w,item.h);
  }
}
function sign(ctx,x,y,title,lines){rect(ctx,'#66513d',x+47,y+62,9,40);rect(ctx,'#594631',x-3,y-3,212,72);rect(ctx,'#f0dfad',x,y,206,66);rect(ctx,'#e3cb91',x+4,y+59,198,3);ctx.fillStyle='#465842';ctx.font='bold 12px monospace';ctx.fillText(title,x+14,y+20);ctx.font='10px monospace';lines.forEach((line,i)=>ctx.fillText(line,x+14,y+38+i*13));}
function checkpointFlag(ctx,checkpoint,active,time,percentage){
  const {x,y}=checkpoint,accent=active?'#ffdb81':'#8ce4ee';
  rect(ctx,active?'#ffdb8110':'#8ce4ee0d',x-2,40,7,y-40);
  rect(ctx,'#20362b',x-40,y-156,95,22);
  ctx.fillStyle=accent;ctx.font='bold 10px monospace';ctx.fillText(`${percentage}% ${active?'SAVED':'CHECKPOINT'}`,x-32,y-141);
  rect(ctx,'#263a37',x-17,y-5,42,5);rect(ctx,'#dbcba1',x,y-120,5,115);
  rect(ctx,'#f6efd0',x-2,y-124,9,8);
  const flutter=Math.round(Math.sin(time*5)*3);
  rect(ctx,active?'#b38c43':'#4a8e9d',x+5,y-115,43,26);
  rect(ctx,accent,x+5,y-118,41+flutter,22);
  rect(ctx,accent,x+36+flutter,y-114,13,14);
  rect(ctx,'#263b3b',x+15,y-109,4,4);rect(ctx,'#263b3b',x+19,y-105,4,4);rect(ctx,'#263b3b',x+23,y-113,4,8);
  if(active)for(let i=0;i<4;i++){const px=x+Math.sin(time*1.7+i*1.5)*31,py=y-40-((time*19+i*23)%90);rect(ctx,accent,px,py,3,3);}
}
function fireball(ctx,shot,time){
  const w=shot.w||PROJECTILE_RULES.width,h=shot.h||PROJECTILE_RULES.height;
  const x=Math.round(shot.x),y=Math.round(shot.y),flicker=Math.floor(time*12+x)%2;
  ctx.save();ctx.translate(x,y);ctx.scale(w/16,h/16);
  // Layered pixel flames surround a rounded, bright fireball body.
  rect(ctx,'#a63238',-8,-3,16,11);rect(ctx,'#e64c2e',-6,-7,12,17);
  rect(ctx,'#f86b2b',-8,-1,16,7);rect(ctx,'#ff8c32',-6,-5,12,13);
  rect(ctx,'#e64c2e',-7,-11-flicker*2,4,9+flicker*2);
  rect(ctx,'#ff8c32',-3,-14+flicker*2,4,14-flicker*2);
  rect(ctx,'#e64c2e',3,-10-flicker*2,3,10+flicker*2);
  rect(ctx,'#ffca54',-4,-3,8,9);rect(ctx,'#ffca54',-2,-7,4,8);
  rect(ctx,'#fff2bd',-2,0,4,5);rect(ctx,'#fffbe5',0,1,2,2);
  rect(ctx,'#ffca54',flicker?4:-6,-17+flicker*2,2,2);
  ctx.restore();
}
export function renderGame(canvasOrContext,state,{time=0,compact=false,showInstructions=false,powerChestClaims=[]}={}){
  if(!canvasOrContext||!state)return;
  const ctx=canvasOrContext.canvas?canvasOrContext:canvasOrContext.getContext('2d'),canvas=ctx.canvas,level=LEVELS[state.level]||LEVELS[0],theme=level.theme,p=palette[theme]||palette.forest,camera=Math.round(Math.max(0,Math.min(Math.max(0,level.width-W),state.x-330))),worldTime=state._levelTime??time;
  ctx.save();ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.imageSmoothingEnabled=false;background(ctx,p,theme,camera,time);ctx.save();ctx.translate(-camera,0);
  for(const base of level.platforms){const plat=platformAt(base,worldTime);if(plat.x+plat.w<camera-30||plat.x>camera+W+30||!plat.visible)continue;platform(ctx,plat,theme,p,worldTime);}
  forestDecor(ctx,camera,time,level);
  for(const h of level.hazards){if(h.x+h.w<camera-20||h.x>camera+W+20||h.kind==='pit')continue;const revealed=state.reveal&&state.respawnRemaining>0&&Math.abs(state.reveal.x-h.x)<5;
    if(h.kind==='decoy'&&!revealed){drawSprite(ctx,theme==='forest'&&h.disguise==='chest'?'forest_chest':(h.disguise||'chest'),h.x,h.y-9,h.w,35);if(Math.sin(time*2)>0)rect(ctx,'#fff2a6',h.x+h.w/2,h.y-19,3,3);}
    else{const actual=revealed?(state.reveal.actualKind||'spikes'):'spikes';if(actual==='bomb')drawSprite(ctx,'bomb',h.x,h.y-8,h.w,36);else drawSprite(ctx,'spikes',h.x,h.y,h.w,h.h);}
  }
  for(const c of level.coins){if(c.x<camera-20||c.x>camera+W+20||state.collected?.includes(c.id))continue;const bob=Math.sin(time*3+c.x)*3;drawSprite(ctx,'coin',c.x-9,c.y-9+bob,18,18);if(Math.sin(time*3+c.x)>.85)rect(ctx,'#fff8c6',c.x+10,c.y-9+bob,2,2);}
  const enemies=Array.isArray(state.enemies)&&state.enemies.length?state.enemies:level.enemies.map(base=>{const p=platformAt(level.platforms[base.platformIndex],worldTime),min=p.x+8,max=p.x+p.w-base.w-8;return {...base,x:Math.max(min,Math.min(max,base.x)),y:p.visible?p.y-base.h:1000,facing:1};});
  for(const e of enemies){if(e.x+e.w<camera-20||e.x>camera+W+20||e.y>700)continue;drawSprite(ctx,e.kind,e.x,e.y,e.w,e.h,{flip:e.facing<0});if(e.shooter&&e.cooldown<.35)rect(ctx,'#ffd166',e.x+e.w/2-2,e.y-6,4,4);}
  for(const shot of (state.projectiles||[])){if(shot.x<camera-20||shot.x>camera+W+20)continue;fireball(ctx,shot,time);}
  const claimed = new Set(powerChestClaims);
  for (const chest of (level.powerChests || [])) if(!claimed.has(chest.id)&&chest.x>camera-60&&chest.x<camera+W+60){drawSprite(ctx,theme==='forest'?'forest_chest':'chest',chest.x,chest.y-chest.h,chest.w,chest.h);rect(ctx,'#b7f5ff',chest.x+chest.w/2-2,chest.y-chest.h-8,4,4);rect(ctx,'#e8fbff',chest.x+chest.w/2-1,chest.y-chest.h-12,2,3);}
  for(const checkpoint of level.checkpoints||[])if(checkpoint.x>camera-70&&checkpoint.x<camera+W+70)checkpointFlag(ctx,checkpoint,!!state.checkpoint&&state.checkpoint.x>=checkpoint.x,time,Math.round(checkpoint.x/level.endX*100));
  if(state.level>0&&level.endX<camera+W+100){rect(ctx,'#172f2855',level.endX-12,495,65,5);rect(ctx,'#e9e7b9',level.endX+17,320,5,180);drawSprite(ctx,'flag',level.endX+14,321,70,95);rect(ctx,'#20362b',level.endX-28,460,95,24);ctx.fillStyle='#d1f59b';ctx.font='bold 10px monospace';ctx.fillText('ESCAPE →',level.endX-18,476);}
  if(showInstructions&&state.level===0){sign(ctx,160,309,'A LITTLE PRACTICE',['A / D or arrows: move','Space / W / Up: jump']);sign(ctx,695,208,'THE IMPORTANT BITS',['Clear world: bank points','Every 25%: checkpoint']);sign(ctx,1110,309,'WAITING FOR YOUR HOST',['Same levels. Separate runs.','Collect coins. Keep moving!']);}
  if(state.respawnRemaining>0){const age=3-state.respawnRemaining;ctx.globalAlpha=Math.max(.1,1-age/2.3);for(const [i,particle] of (state._particles||[]).entries())rect(ctx,i%4===0?'#f8ebc8':i%3===0?'#4b354b':state.color||'#b7ef51',particle.x,particle.y,4+i%3,4+i%2);ctx.globalAlpha=1;if(state.reveal){const kind=state.reveal.actualKind||state.reveal.kind,sx=state.reveal.x,sy=Math.min(470,state.reveal.y);if(kind==='bomb')drawSprite(ctx,'bomb',sx-8,sy-35,42,42);rect(ctx,'#ffac7d',sx-4,sy-42,3,8);rect(ctx,'#ffac7d',sx-4,sy-31,3,3);}}
  else{const bob=state.grounded&&Math.abs(state.vx)>20?Math.sin(time*20)*1.5:0;drawSprite(ctx,state.avatar||'explorer',state.x-17,state.y-40+bob,34,40,{color:state.color,flip:state.vx<-.1});rect(ctx,state.color||'#b7ef51',state.x-3,state.y-48+bob,6,3);}
  ctx.restore();
  if(!compact){rect(ctx,'#18322ad9',14,14,200,46);ctx.fillStyle='#f2f0d8';ctx.font='12px monospace';ctx.fillText(state.name||'Explorer',26,33);ctx.font='10px monospace';ctx.fillStyle='#bcdb99';ctx.fillText(`WORLD ${state.level}   COINS ${state.coins}`,26,49);}
  rect(ctx,'#1223210a',0,0,5,H);rect(ctx,'#1223210a',W-5,0,5,H);ctx.restore();
}
