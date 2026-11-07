import {placementBounds, localToWorld, worldToLocal} from './transforms.js';
import { maskedFrameSource } from './frame-outline.js';

const TAU=Math.PI*2;
const VFX_PRESENCE=1.6;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mod=(v,d)=>((v%d)+d)%d;
const hash=value=>{let n=2166136261;for(const char of String(value||'')){n^=char.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0)/4294967296;};
const roleOf=s=>s.gameplay?.role||'none';
const kindOf=s=>s.definition?.kind||'';
const alpha=c=>typeof c.globalAlpha==='number'?c.globalAlpha:1;

export function resolveVfx(state){const v=state?.vfx||{};return{enabled:v.enabled!==false,hazardType:v.hazardType||'auto',color:/^#[0-9a-f]{6}$/i.test(v.color||'')?v.color:null};}
function seed(state,i){return hash(`${state.id||state.definition?.id}:${i}`);}
function pixel(c,x,y,size,color,opacity=1){const before=alpha(c);c.globalAlpha=before*clamp(opacity*VFX_PRESENCE,0,1);c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),size,size);c.globalAlpha=before;}
function glint(c,x,y,color,opacity=1,size=2){pixel(c,x,y,size,color,opacity);pixel(c,x-size,y+size,size,color,opacity*.6);pixel(c,x+size,y+size,size,color,opacity*.6);pixel(c,x,y+size*2,size,color,opacity);}
function haze(c,x,y,w,h,color,opacity){const before=alpha(c);c.globalAlpha=before*clamp(opacity*VFX_PRESENCE,0,1);c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));c.globalAlpha=before;}
function radial(c,s,age,duration,color,count=10){if(!Number.isFinite(age)||age<0||age>=duration)return;const p=age/duration;for(let i=0;i<count;i++){const a=i*TAU/count+seed(s,i)*.4,r=(10+seed(s,i+20)*24)*p*1.25;pixel(c,s.width/2+Math.cos(a)*r,s.height/2+Math.sin(a)*r-10*p,3,color,1-p);}}
function hazardType(s,v){if(v.hazardType!=='auto')return v.hazardType;const text=`${s.definition?.name} ${(s.definition?.tags||[]).join(' ')} ${(s.gameplay?.tags||[]).join(' ')}`.toLowerCase();return /mush|spore/.test(text)?'mushroom':/thorn|bramble/.test(text)?'thorns':/spike/.test(text)?'spike':'generic';}

// The blink is driven by trigger age, so every renderer shows the same warning.
export function vanishArtAlpha(s){
  if(s.vfx?.enabled===false||s.vanished||s.vanishRestored||s.vanishElapsedMs==null||!s.behavior?.vanish)return 1;
  const elapsed=s.vanishElapsedMs,duration=s.behavior.vanish.countdownMs;
  if(duration<=0||elapsed<Math.min(160,duration*.1))return 1;
  const p=clamp(elapsed/duration,0,1),cycles=elapsed/460+5*p*p;
  return Math.floor(cycles)%2?.2:1;
}
function behind(c,s,time,v){
  const role=roleOf(s),kind=kindOf(s);
  if(role==='checkpoint'||role==='spawnpoint'){
    const color=s.checkpointReached?'#ffd166':'#75c8ff',height=clamp(s.height*1.7,100,190),pulse=.85+.15*Math.sin(time*.002+seed(s,0)*TAU);
    for(let band=0;band<4;band++){const w=24-band*5;haze(c,s.width/2-w/2,-height,w,height+s.height*.9,color,(.025+band*.018)*pulse);}
    for(let i=0;i<4;i++){const p=mod(time/2800+seed(s,i),1);pixel(c,s.width/2+Math.sin(seed(s,i)*TAU)*12,s.height*.6-p*(height+s.height*.5),2,color,.45*(1-p));}
  }
  if(role==='exit'){
    const color=v.color||'#a5efca',pulse=.8+.2*Math.sin(time*.003);
    for(let i=0;i<3;i++)haze(c,-10+i*4,-4+i*2,s.width+20-i*8,s.height+8-i*4,color,(.025+i*.012)*pulse);
  }
  if(kind==='beam'&&s.beamOn===true){const color=v.color||'#e4b5ff';for(let i=0;i<3;i++)haze(c,-8+i*3,0,s.width+16-i*6,s.height,color,.035+i*.015);}
}
function coin(c,s,time){
  if(s.collected){radial(c,s,Number.isFinite(s.collectedAtMs)?time-s.collectedAtMs:Infinity,650,'#ffe886',10);return;}
  for(let i=0;i<2;i++){const p=mod(time/1800+seed(s,i),1);if(p<.65)continue;const a=(p-.65)/.35;glint(c,s.width*(.12+seed(s,i+5)*.72),-4+s.height*seed(s,i+8)*.25,'#fff3ad',Math.sin(a*Math.PI),1);}
  const p=mod(time/2700+seed(s,5),1);pixel(c,-4+p*(s.width+8),s.height*.6+Math.sin(p*TAU)*s.height*.6,2,'#ffd469',.55);
}
function treasure(c,s,time){
  radial(c,s,Number.isFinite(s.collectedAtMs)?time-s.collectedAtMs:Infinity,850,'#ffd166',18);
  radial(c,s,Number.isFinite(s.collectedAtMs)?time-s.collectedAtMs:Infinity,650,'#b7f5ff',10);
}
function hazard(c,s,time,v){
  const type=hazardType(s,v),color=v.color||(type==='mushroom'?'#ddafff':type==='thorns'?'#b4e88b':type==='spike'?'#fff2ca':'#ffb98b');
  if(type==='spike'){for(let i=0;i<2;i++){const p=mod(time/2200+seed(s,i),1);if(p>.5)glint(c,s.width*(.2+seed(s,i+3)*.6),s.height*.1-2,color,Math.sin((p-.5)*TAU)*.8,1);}return;}
  for(let i=0;i<(type==='thorns'?5:4);i++){const n=seed(s,i),p=mod(time/(type==='mushroom'?2600:3200)+n,1),x=s.width*(.08+seed(s,i+4)*.84)+Math.sin(p*TAU+n)*8,y=s.height*.25-p*(22+s.height*.4)*1.25;pixel(c,x,y,i%3?2:3,color,Math.sin(p*Math.PI)*.6);}
}
function moving(c,s,time){
  const motion=s.behavior?.motion===undefined?(s.behavior?.type==='moving'?s.behavior:null):s.behavior.motion;
  if((!motion||!motion.distance)&&!s.behavior?.vanish&&s.vfx?.enabled!==true)return;
  for(let i=0;i<5;i++){const p=mod(time/1400+seed(s,i),1),x=s.width*(.08+seed(s,i+8)*.84)+Math.sin(p*TAU)*7,y=s.height*.85+4+p*22;pixel(c,x,y,2,'#c4ead1',(1-p)*.45);}
}
function vanish(c,s,{images,frame}){
  if(!s.vanished||s.vanishElapsedMs==null)return;
  const age=s.vanishElapsedMs-s.behavior.vanish.countdownMs;
  if(age<0||age>=850)return;
  c.save();
  if(s.vanishOrigin){const p=worldToLocal(s,{x:s.vanishOrigin.x+s.width/2,y:s.vanishOrigin.y+s.height/2});c.translate(p.x-s.width/2,p.y-s.height/2);}
  const timed=s.behavior.vanish.restoreMode==='timed',rawImage=images?.get(s.assetId),image=frame?.clipPolygon ? maskedFrameSource(rawImage, frame, frame.clipPolygon) : rawImage;
  if(!timed&&image&&frame){
    const seconds=age/1000,opacity=1-age/850,offset=s.visual?.offset||[0,0],scale=s.visual?.scale||[1,1];
    for(let i=0;i<12;i++){const col=i%6,row=Math.floor(i/6),sx=Math.floor(col*frame.w/6),sy=Math.floor(row*frame.h/2),sw=Math.floor((col+1)*frame.w/6)-sx,sh=Math.floor((row+1)*frame.h/2)-sy;if(!sw||!sh)continue;
      const vx=(col-2.5)*20+(seed(s,i)-.5)*24,vy=-35-seed(s,i+20)*45;
      c.globalAlpha=clamp(opacity*VFX_PRESENCE,0,1);c.drawImage(image, (frame.clipPolygon ? sx : frame.x + sx), (frame.clipPolygon ? sy : frame.y + sy), sw, sh, offset[0]*s.width+sx/frame.w*s.width*scale[0]+vx*seconds*1.25,offset[1]*s.height+sy/frame.h*s.height*scale[1]+vy*seconds*1.25+150*seconds*seconds,sw/frame.w*s.width*scale[0],sh/frame.h*s.height*scale[1]);
    }
    c.globalAlpha=1;
  }
  const duration=timed?650:430;
  if(age<duration){const p=age/duration;for(let i=0;i<12;i++){const n=seed(s,i+30),a=n*TAU,d=p*(12+n*28)*1.25;pixel(c,s.width*(.1+seed(s,i)*.8)+Math.cos(a)*d,s.height*.5+Math.sin(a)*d-p*10,3+i%3,timed?'#d9e9da':'#c1cba4',(1-p)*.8);}}
  c.restore();
}

/** Local-space effects; stateless particles stay bounded and survive skipped frames. */
export function drawPlacementVfx(c,s,{timeMs=s?.timeMs??0,document,images,frame,phase='all'}={}){
  if(!s||s.hidden||!resolveVfx(s).enabled)return;
  const v=resolveVfx(s),role=roleOf(s),kind=kindOf(s);
  c.save();
  if(s.vanished){if(phase!=='behind'){if(s.collected&&role==='coin')coin(c,s,timeMs);else if(s.collected&&role==='power-chest')treasure(c,s,timeMs);else if(kind==='platform'&&s.behavior?.vanish)vanish(c,s,{document,images,frame});}c.restore();return;}
  if(phase!=='front')behind(c,s,timeMs,v);
  if(phase!=='behind'){
    if(role==='coin')coin(c,s,timeMs);
    if(role==='checkpoint'&&s.checkpointReached&&Number.isFinite(s.checkpointReachedAtMs))radial(c,s,timeMs-s.checkpointReachedAtMs,700,'#ffd166',12);
    if(kind==='hazard')hazard(c,s,timeMs,v);
    if(kind==='platform')moving(c,s,timeMs);
    if(kind==='beam'&&s.beamOn===true){const color=v.color||'#efd2ff';for(let i=0;i<5;i++){const p=mod(timeMs/1000+seed(s,i),1);pixel(c,s.width/2+Math.sin(p*TAU+seed(s,i)*TAU)*s.width*.55,p*s.height,2,color,(1-p)*.7);}}
    if(role==='exit'){const color=v.color||'#a5efca';for(let i=0;i<9;i++){const angle=timeMs*.0014+i*TAU/9,x=s.width/2+Math.cos(angle)*s.width*.36,y=s.height*.5+Math.sin(angle)*s.height*.4;pixel(c,x,y,i%3?2:3,color,.55+.2*Math.sin(angle));}c.strokeStyle=color;c.globalAlpha=alpha(c)*.28*VFX_PRESENCE;c.lineWidth=1;c.strokeRect(s.width*.15,s.height*.08,s.width*.7,s.height*.84);}
  }
  c.restore();
}

export function vfxBounds(s){
  let base=placementBounds(s);
  if(!resolveVfx(s).enabled)return base;
  if(s.vanished&&s.vanishOrigin)base=placementBounds({...s,...s.vanishOrigin});
  const role=roleOf(s),marker=role==='checkpoint'||role==='spawnpoint',pad=s.vanished?110:54;
  if(marker){const h=clamp(s.height*1.7,100,190),points=[localToWorld(s,{x:-24,y:-h}),localToWorld(s,{x:s.width+24,y:-h})];const minX=Math.min(base.x,...points.map(p=>p.x)),minY=Math.min(base.y,...points.map(p=>p.y)),maxX=Math.max(base.x+base.width,...points.map(p=>p.x)),maxY=Math.max(base.y+base.height,...points.map(p=>p.y));base={x:minX,y:minY,width:maxX-minX,height:maxY-minY};}
  return{x:base.x-pad,y:base.y-pad,width:base.width+pad*2,height:base.height+pad*2};
}
