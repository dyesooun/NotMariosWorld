function wrap(value,width=56){const output=[];let line='';for(const word of String(value||'').split(/\s+/)){if(line&&line.length+word.length+1>width){output.push(line);line='';}line+=(line?' ':'')+word;}if(line)output.push(line);return output;}
export function powerQuizModel(player,{now=Date.now(),isHost=false}={}){
  const quiz=player?.powerQuiz;if(!quiz||quiz.answered&&!isHost)return null;
  const promptLines=wrap(quiz.prompt),h=186+promptLines.length*22,panel={x:180,y:Math.round((540-h)/2),w:600,h};
  const inputY=panel.y+76+promptLines.length*22;
  const durationMs=Number(quiz.durationMs)>0?Number(quiz.durationMs):10000;
  return {...quiz,promptLines,panel,durationMs,progress:Math.max(0,Math.min(1,(quiz.endsAt-now)/durationMs)),remaining:Math.max(0,Math.ceil((quiz.endsAt-now)/1000)),
    canAnswer:!isHost&&!quiz.answered&&now<quiz.endsAt,
    input:{x:panel.x+24,y:inputY,w:424,h:42},submit:{x:panel.x+464,y:inputY,w:112,h:42},
    title:quiz.role==='attack'?'ANSWER TO ATTACK':'ANSWER TO DEFEND',
    hint:quiz.role==='attack'?'Wrong or no answer: this power hits you.':'Correct: block this attack. Wrong or no answer: it hits you.'};
}
export function renderPowerQuiz(canvas,player,options={}){
  const model=powerQuizModel(player,options);if(!model)return null;
  const ctx=canvas.getContext('2d'),r=model.panel;
  const rect=(color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
  const text=(value,x,y,size=12,color='#eaf5dc')=>{ctx.fillStyle=color;ctx.font=`${size>=16?'bold ':''}${size}px monospace`;ctx.fillText(value,x,y);};
  ctx.save();ctx.setTransform(canvas.width/960,0,0,canvas.height/540,0,0);
  rect('#10272366',0,0,960,540);rect('#08151299',r.x+6,r.y+6,r.w,r.h);
  rect('#b7ef51',r.x,r.y,r.w,r.h);rect('#172e2bfc',r.x+2,r.y+2,r.w-4,r.h-4);
  text(model.title,r.x+24,r.y+27,12,'#b7ef51');
  const countdown=model.answered?'ANSWER LOCKED':`${model.remaining}s LEFT`;
  ctx.textAlign='right';text(countdown,r.x+r.w-24,r.y+27,12,'#8ce4ee');ctx.textAlign='left';
  rect('#38544a',r.x+24,r.y+39,r.w-48,3);rect('#b7ef51',r.x+24,r.y+39,(r.w-48)*model.progress,3);
  model.promptLines.forEach((line,i)=>text(line,r.x+24,r.y+70+i*22,16));
  if(!model.canAnswer){
    const message=model.answered?(model.result==='correct'?(model.role==='attack'?'Correct! Preparing the defense questions.':'BLOCKED! This attack cannot affect you.'):'Answer recorded. Waiting for the result.'):options.isHost?'PLAYER IS ANSWERING…':'TIME’S UP / WAITING FOR THE RESULT';
    text(message,model.input.x,model.input.y+27,13,model.result==='correct'?'#b7ef51':'#ffcf87');
  }
  text(model.hint,r.x+24,r.y+r.h-42,11,'#ccddbd');
  text('ONE ATTEMPT / ANSWERS ARE CASE-INSENSITIVE',r.x+24,r.y+r.h-21,10,'#9ebcae');
  ctx.restore();return model;
}
