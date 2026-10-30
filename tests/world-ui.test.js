import test from 'node:test';
import assert from 'node:assert/strict';
import {worldUIModel,countdownSeconds,powerQuizNotice} from '../public/game/world-ui.js';
import {podiumSlots} from '../public/game/podium.js';
import { POWER_HUD_RECT } from '../public/game/power-ui.js';

test('final countdown uses the original deadline and leaves the last ten seconds playable',()=>{
  const room={status:'running',endsAt:60000};
  assert.equal(countdownSeconds(room,49999),null);
  assert.equal(countdownSeconds(room,50000),10);
  assert.equal(countdownSeconds(room,59001),1);
  assert.equal(countdownSeconds(room,60000),0);
  assert.equal(countdownSeconds({...room,status:'ended'},60000),null);
});
test('world voting layout fits 25 named votes and exposes both choices inside the viewport',()=>{
  const players=Array.from({length:25},(_,i)=>({id:`p${i}`,name:`Player ${String(i).padStart(2,'0')} abcdefghijklmn`}));
  const room={status:'lobby',players,question:{index:0,prompt:'A'.repeat(240),choices:['B'.repeat(100),'C'.repeat(100)],votes:Object.fromEntries(players.map(p=>[p.id,0])),endsAt:15000,closed:false}};
  const q=worldUIModel(room,{now:1000,viewerId:'p0'}).question;
  assert.equal(q.total,25);assert.equal(q.choices[0].names.length,25);assert.equal(q.choices[0].selected,true);
  assert.ok(q.panel.y>=0 && q.panel.y+q.panel.h<=540);
  for(const choice of q.choices){assert.ok(choice.rect.y+choice.rect.h<q.dismiss.y);assert.ok(choice.rect.x>=0&&choice.rect.x+choice.rect.w<=960);}
  assert.equal(worldUIModel(room,{now:15000}).question.closed,true);
});
test('world announcements expire at two seconds and do not overlap the final countdown',()=>{
  const room={status:'running',players:[],endsAt:10000,announcement:{id:'a',text:'Ada escaped Whimsical Woods!',endsAt:2000}};
  const model=worldUIModel(room,{now:1000});
  assert.ok(model.announcement.rect.x>POWER_HUD_RECT.x+POWER_HUD_RECT.w);
  assert.ok(model.announcement.rect.x+model.announcement.rect.w<758);
  assert.equal(worldUIModel(room,{now:2000}).announcement,null);
});

test('power broadcast stays for all five seconds and reports remaining queue count',()=>{
  const room={status:'running',players:[],endsAt:60000,powerQueue:[{id:'next'}],announcement:{id:'power',kind:'power',text:'Ada unleashed Sticky Boots!',startedAt:1000,endsAt:6000,durationMs:5000}};
  assert.equal(worldUIModel(room,{now:1000}).announcement.remainingSeconds,5);
  assert.equal(worldUIModel(room,{now:3000}).announcement.remainingSeconds,3);
  assert.equal(worldUIModel(room,{now:5999}).announcement.remainingSeconds,1);
  assert.equal(worldUIModel(room,{now:5999}).announcement.queuedPowerCount,1);
  assert.equal(worldUIModel(room,{now:6000}).announcement,null);
});

test('quiz broadcasts distinguish participants, answered players, and untargeted bystanders',()=>{
  const room={players:[{id:'target',powerQuiz:{answered:false}}],powerDuel:{phase:'attack',casterId:'caster',targetIds:[]}};
  assert.equal(powerQuizNotice(room,'caster'),'YOUR ATTACK QUESTION');
  assert.equal(powerQuizNotice(room,'bystander'),'WAITING FOR ATTACKER');
  room.powerDuel.phase='defense';room.powerDuel.targetIds=['target'];
  assert.equal(powerQuizNotice(room,'target'),'YOUR DEFENSE QUESTION');
  assert.equal(powerQuizNotice(room,'caster'),'WAITING FOR DEFENDERS');
  assert.equal(powerQuizNotice(room,'bystander'),'YOU ARE NOT TARGETED');
  room.players[0].powerQuiz.answered=true;
  assert.equal(powerQuizNotice(room,'target'),'DEFENSE ANSWER LOCKED');
});
test('the podium gives all 25 ranked avatars unique visible positions and highlights the top three',()=>{
  const results=Array.from({length:25},(_,i)=>({id:`p${i}`,rank:i+1,name:`Player ${i}`,score:100-i}));
  const slots=podiumSlots(results);
  assert.equal(slots.filter(p=>p.featured).length,3);
  assert.equal(new Set(slots.map(p=>`${p.x}:${p.y}`)).size,25);
  assert.ok(slots.every(p=>p.x>40&&p.x<1160&&p.y>=0&&p.y+42<=720));
  assert.ok(slots[0].y<slots[1].y&&slots[1].y<slots[2].y);
});
