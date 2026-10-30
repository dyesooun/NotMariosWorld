// Broadcasts are drawn into the same logical viewport as the world.
import { POWER_HUD_RECT } from './power-ui.js';
const WIDTH = 960, HEIGHT = 540;
const box = (x,y,w,h) => ({x,y,w,h});
function lines(text, length) {
  const result=[];let line='';
  for (let word of String(text ?? '').trim().split(/\s+/)) {
    while (word.length > length) {
      if(line){result.push(line);line='';}
      result.push(word.slice(0,length));word=word.slice(length);
    }
    if(!word)continue;
    if(line && line.length+word.length+1>length){result.push(line);line='';}
    line+=(line?' ':'')+word;
  }
  if(line)result.push(line);
  return result.length?result:[''];
}
export function countdownSeconds(room, now) {
  if(room?.status!=='running'||!Number.isFinite(room.endsAt))return null;
  const remaining=room.endsAt-now;
  return remaining>10000?null:Math.max(0,Math.ceil(remaining/1000));
}
export function powerQuizNotice(room,viewerId,isHost=false){
  const duel=room?.powerDuel;if(!duel||duel.phase==='effect')return null;
  if(isHost)return duel.phase==='attack'?'ATTACK QUESTION':'DEFENSE QUESTIONS';
  if(duel.phase==='attack')return duel.casterId===viewerId?'YOUR ATTACK QUESTION':'WAITING FOR ATTACKER';
  if(duel.casterId===viewerId)return 'WAITING FOR DEFENDERS';
  if(!duel.targetIds?.includes(viewerId))return 'YOU ARE NOT TARGETED';
  return room.players?.find(p=>p.id===viewerId)?.powerQuiz?.answered?'DEFENSE ANSWER LOCKED':'YOUR DEFENSE QUESTION';
}
export function worldUIModel(room,{now=Date.now(),viewerId=null,isHost=false}={}) {
  const countdown=countdownSeconds(room,now);
  let question=null;
  if(room?.question && room.status==='lobby') {
    const q=room.question,people=new Map(room.players.map(p=>[p.id,p]));
    const votes=Object.entries(q.votes||{}).filter(([id,choice])=>people.has(id)&&(choice===0||choice===1));
    const promptLines=lines(q.prompt,73);
    const choices=q.choices.map((label,index)=>{
      const names=votes.filter(([,choice])=>choice===index).map(([id])=>people.get(id).name);
      return {index,label,labelLines:lines(label,37),names,nameLines:lines(names.length?names.join(', '):'No votes yet',55),count:names.length,selected:q.votes?.[viewerId]===index};
    });
    const titleHeight=Math.max(...choices.map(c=>c.labelLines.length))*17;
    const namesHeight=Math.max(...choices.map(c=>c.nameLines.length))*12;
    const optionHeight=titleHeight+namesHeight+47;
    const panelHeight=80+promptLines.length*20+optionHeight+43;
    const panel=box(60,Math.max(12,(HEIGHT-panelHeight)/2),840,panelHeight);
    const optionY=panel.y+67+promptLines.length*20;
    const remaining=Math.max(0,Math.ceil((q.endsAt-now)/1000));
    choices.forEach((c,i)=>c.rect=box(panel.x+22+i*405,optionY,391,optionHeight));
    question={index:q.index,prompt:q.prompt,promptLines,choices,panel,titleHeight,total:votes.length,playerCount:room.players.length,remaining,closed:!!q.closed||remaining===0,isHost,
      dismiss:box(panel.x+panel.w-174,panel.y+panel.h-33,151,24)};
  }
  const a=room?.announcement;
  const announcementX=room?.status==='running'?POWER_HUD_RECT.x+POWER_HUD_RECT.w+16:130;
  const announcementRight=countdown!==null?740:946;
  const announcement=!question&&a&&a.endsAt>now?{...a,remainingSeconds:Math.max(0,Math.ceil((a.endsAt-now)/1000)),queuedPowerCount:room.powerQueue?.length||0,rect:box(announcementX,18,announcementRight-announcementX,68)}:null;
  return {question,announcement,countdown};
}
const rect=(ctx,color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function panel(ctx,r,fill='#152a29f5',edge='#b7ef51') {
  rect(ctx,'#08161288',r.x+5,r.y+5,r.w,r.h);
  rect(ctx,edge,r.x,r.y,r.w,r.h);rect(ctx,fill,r.x+2,r.y+2,r.w-4,r.h-4);
  for(const [x,y] of [[r.x,r.y],[r.x+r.w-5,r.y],[r.x,r.y+r.h-5],[r.x+r.w-5,r.y+r.h-5]])rect(ctx,edge,x,y,5,5);
}
function text(ctx,value,x,y,size=12,color='#ecf4d6',align='left') {
  ctx.font=`${size>=15?'bold ':''}${size}px monospace`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value),Math.round(x),Math.round(y));ctx.textAlign='left';
}
export function renderWorldUI(canvasOrContext,room,options={}) {
  const model=worldUIModel(room,options);
  const ctx=canvasOrContext.canvas?canvasOrContext:canvasOrContext.getContext('2d');
  ctx.save();ctx.setTransform(ctx.canvas.width/WIDTH,0,0,ctx.canvas.height/HEIGHT,0,0);ctx.imageSmoothingEnabled=false;
  const q=model.question;
  if(q) {
    rect(ctx,'#0a201d63',0,0,WIDTH,HEIGHT);
    panel(ctx,q.panel,'#172b29fa','#b7ef51');
    const x=q.panel.x+22,y=q.panel.y;
    text(ctx,`WORLD BROADCAST / ICEBREAKER ${q.index+1}`,x,y+23,11,'#b7ef51');
    text(ctx,q.closed?'VOTING CLOSED':`${q.remaining}s TO PICK A SIDE`,q.panel.x+q.panel.w-22,y+23,11,q.closed?'#ffdb81':'#8ce4ee','right');
    rect(ctx,'#36504a',x,y+33,q.panel.w-44,3);
    rect(ctx,'#b7ef51',x,y+33,(q.panel.w-44)*Math.max(0,Math.min(1,(room.question.endsAt-(options.now??Date.now()))/15000)),3);
    q.promptLines.forEach((line,i)=>text(ctx,line,x,y+60+i*20,17));
    for(const choice of q.choices) {
      const r=choice.rect;
      panel(ctx,r,choice.selected?'#314732':'#1c3430',choice.selected?'#b7ef51':'#5f8171');
      rect(ctx,'#2a443b',r.x+12,r.y+q.titleHeight+21,r.w-24,5);
      rect(ctx,'#a3cf67',r.x+12,r.y+q.titleHeight+21,(r.w-24)*(q.total?choice.count/q.total:0),5);
      choice.labelLines.forEach((line,i)=>text(ctx,line,r.x+13,r.y+23+i*17,14));
      text(ctx,`${choice.count} VOTE${choice.count===1?'':'S'}${choice.selected?' / YOUR PICK':''}`,r.x+13,r.y+q.titleHeight+16,10,'#cbe99c');
      choice.nameLines.forEach((line,i)=>text(ctx,line,r.x+13,r.y+q.titleHeight+43+i*12,10,'#bbd0b5'));
      text(ctx,q.isHost?'':`[${choice.index+1}]`,r.x+r.w-13,r.y+r.h-10,10,'#8ce4ee','right');
    }
    const footerY=q.panel.y+q.panel.h-16;
    text(ctx,`${q.total}/${q.playerCount} VOTED / ${q.closed?'THE TEAM HAS SPOKEN':q.isHost?'LIVE NAMED VOTES':'CLICK A CHOICE OR PRESS 1 / 2'}`,x,footerY,10,'#9cbba5');
    if(q.isHost){panel(ctx,q.dismiss,'#304c36','#a3cf67');text(ctx,q.closed?'DISMISS QUESTION >':'SKIP QUESTION >',q.dismiss.x+9,q.dismiss.y+16,10,'#d9edb7');}
  }
  if(model.announcement) {
    const a=model.announcement,r=a.rect;
    panel(ctx,r,'#172c25f5','#b7ef51');
    text(ctx,a.kind==='power-quiz'?(powerQuizNotice(room,options.viewerId,options.isHost)||(a.phase==='attack'?'ATTACK QUESTION':'DEFENSE QUESTIONS')):a.kind==='power'?(room.powerDuel?.outcome==='blocked'?'ATTACK BLOCKED':room.powerDuel?.outcome==='attackerFailed'?'POWER BACKFIRED':'POWER ACTIVE'):'WORLD BROADCAST',r.x+16,r.y+20,10,'#b7ef51');
    if(a.kind==='power'||a.kind==='power-quiz'){
      text(ctx,`${a.remainingSeconds}s${a.queuedPowerCount?` / ${a.queuedPowerCount} QUEUED`:''}`,r.x+r.w-16,r.y+20,10,'#8ce4ee','right');
      rect(ctx,'#355449',r.x+16,r.y+r.h-6,r.w-32,3);
      rect(ctx,'#b7ef51',r.x+16,r.y+r.h-6,(r.w-32)*Math.max(0,Math.min(1,(a.endsAt-(options.now??Date.now()))/(a.durationMs||5000))),3);
    }
    const messageLines=lines(a.text,Math.floor((r.w-32)/8.4));
    messageLines.slice(0,2).forEach((line,i)=>text(ctx,line,r.x+16,r.y+40+i*16,14));
  }
  if(model.countdown!==null) {
    if(model.countdown>0){
      const r=box(758,14,188,104);panel(ctx,r,'#342b2bf2','#ffcf87');
      text(ctx,'FINAL SECONDS',r.x+r.w/2,r.y+20,11,'#ffcf87','center');
      text(ctx,model.countdown,r.x+r.w/2,r.y+67,43,'#fff2cf','center');
      text(ctx,'KEEP GOING! SCORE IS LIVE',r.x+r.w/2,r.y+90,9,'#e8c99a','center');
    } else {
      rect(ctx,'#102c2566',0,0,WIDTH,HEIGHT);
      panel(ctx,box(280,175,400,150),'#152b27f5','#ffcf87');
      text(ctx,'TIME!',480,241,48,'#ffdf97','center');
      text(ctx,'TELEPORTING TO THE PODIUM',480,285,14,'#daebbf','center');
    }
  }
  ctx.restore();return model;
}
