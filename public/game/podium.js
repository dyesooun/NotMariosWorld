import {drawSprite} from './renderer.js';
const WIDTH=1200,HEIGHT=720;
const rect=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const text=(c,value,x,y,size=14,color='#e5efd7',align='center')=>{c.font=`bold ${size}px monospace`;c.fillStyle=color;c.textAlign=align;c.fillText(String(value),Math.round(x),Math.round(y));c.textAlign='left';};
const short=(s,n)=>Array.from(String(s)).length>n?Array.from(String(s)).slice(0,n-1).join('')+'…':s;
export function podiumSlots(results) {
  return results.map((player,index)=>{
    const rank=player.rank||index+1;
    if(rank<=3)return {...player,rank,x:rank===1?600:rank===2?410:790,y:rank===1?255:rank===2?310:335,featured:true};
    const i=rank-4;return {...player,rank,x:100+(i%11)*100,y:515+Math.floor(i/11)*135,featured:false};
  });
}
export function renderPodium(canvasOrContext,results,{time=0,viewerId=null,arrivalAge=10}={}) {
  const ctx=canvasOrContext.canvas?canvasOrContext:canvasOrContext.getContext('2d'),canvas=ctx.canvas;
  ctx.save();ctx.setTransform(canvas.width/WIDTH,0,0,canvas.height/HEIGHT,0,0);ctx.imageSmoothingEnabled=false;
  rect(ctx,'#20283d',0,0,WIDTH,HEIGHT);rect(ctx,'#2d3c4b',0,150,WIDTH,300);
  rect(ctx,'#40564e',0,400,WIDTH,320);rect(ctx,'#779367',0,400,WIDTH,8);
  for(let i=0;i<44;i++){const x=(i*137)%WIDTH,y=(i*67)%345;rect(ctx,'#b8d7c2',x,y,2,2);}
  // Pixel columns and pennants frame the shared ceremony world.
  for(const x of [35,1125]){
    rect(ctx,'#172c34',x-8,115,70,292);rect(ctx,'#627866',x,120,48,280);rect(ctx,'#9fba80',x-8,113,64,12);
    for(let y=144;y<395;y+=24)rect(ctx,'#42594e',x+9,y,29,3);
    rect(ctx,'#c4d3ac',x+20,44,5,80);rect(ctx,'#b7ef51',x+25,44,53,28);
  }
  for(let i=0;i<18;i++){const x=90+i*60,y=55+Math.sin(i*.43)*13;rect(ctx,'#617e6c',x,y,60,2);rect(ctx,['#9fcf70','#72bfc5','#d6b175'][i%3],x+16,y+4,13,19);}
  text(ctx,'WORLD 04 / THE PODIUM',600,44,12,'#a7c5b1');
  text(ctx,'GAME DAY CHAMPIONS',600,106,31,'#e2edbc');
  text(ctx,'FINAL SCORES LOCKED / EVERY ADVENTURE COUNTED',600,132,11,'#9ab8a3');
  for(const [rank,x,y] of [[2,410,310],[1,600,255],[3,790,335]]){
    const top=rank===1?'#f3d98b':rank===2?'#c3d4cf':'#c69a76',base=rank===1?'#9d8251':rank===2?'#718d85':'#896a59';
    rect(ctx,'#132a3088',x-73,y+8,156,402-y);rect(ctx,base,x-78,y,156,400-y);rect(ctx,top,x-78,y,156,9);
    rect(ctx,'#ffffff10',x-69,y+13,138,387-y);text(ctx,rank,x,y+Math.min(50,Math.round((400-y)*.5)),rank===3?25:31,top);
  }
  const slots=podiumSlots(results);
  for(const p of slots){
    const own=p.id===viewerId;
    if(p.featured){
      text(ctx,short(p.name,22),p.x,p.y-91,14,own?'#8ce4ee':'#edf2d7');
      if(p.rank===1){rect(ctx,'#ffe7a0',p.x-13,p.y-82,26,5);rect(ctx,'#ffe7a0',p.x-13,p.y-88,5,7);rect(ctx,'#ffe7a0',p.x-2,p.y-90,5,9);rect(ctx,'#ffe7a0',p.x+8,p.y-88,5,7);}
      drawSprite(ctx,p.avatar||'explorer',p.x-31,p.y-78+Math.sin(time*3+p.rank)*2,62,78,{color:p.color});
      text(ctx,`${Math.round(p.score).toLocaleString()} PTS`,p.x,387,14,'#f8edc5');
      if(own){text(ctx,'YOU',p.x+50,p.y-48,10,'#8ce4ee');}
    }else{
      const x=p.x,y=p.y;
      rect(ctx,own?'#8ce4ee':'#7f9f80',x-43,y,86,42);rect(ctx,'#2b4840',x-40,y+3,80,36);
      text(ctx,short(p.name,14),x,y-47,10,own?'#8ce4ee':'#d0e0c0');
      drawSprite(ctx,p.avatar||'explorer',x-17,y-41+Math.sin(time*3+p.rank)*1,34,41,{color:p.color});
      text(ctx,`#${p.rank}`,x,y+18,13,own?'#8ce4ee':'#c5dba8');
      text(ctx,`${Math.round(p.score).toLocaleString()} PTS`,x,y+33,10,'#e0eacb');
      if(own){rect(ctx,'#8ce4ee',x-5,y-67,10,4);}
    }
  }
  if(!results.length)text(ctx,'NO RUNNERS THIS ROUND',600,225,18,'#b9cfad');
  // Confetti and teleport pixels keep the ceremony alive.
  for(let i=0;i<65;i++){const x=(i*109+Math.sin(time*.5+i)*20)%WIDTH,y=((time*(18+i%7)+i*71)%HEIGHT);rect(ctx,['#d7e7a2','#8fd3ce','#e3b78a','#b9a0ce'][i%4],x,y,3+(i%2)*2,4);}
  if(arrivalAge<1){
    ctx.globalAlpha=Math.max(0,1-arrivalAge)*.5;rect(ctx,'#dbf6d4',0,0,WIDTH,HEIGHT);ctx.globalAlpha=1;
    for(const p of slots){ctx.globalAlpha=Math.max(0,1-arrivalAge);rect(ctx,'#a9efdb',p.x-3,p.y-110,6,110);ctx.globalAlpha=1;}
  }
  ctx.restore();
}
