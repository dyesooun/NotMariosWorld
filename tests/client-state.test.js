import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePlayerPatch, runtimeMismatch, worldProgressModel } from '../public/game/client-state.js';
import { DEFAULT_QUESTIONS } from '../public/game/default-questions.js';
import { powerUIModel, activePowerEffects, renderPowerUI } from '../public/game/power-ui.js';
import { powerChestOfferModel } from '../public/game/power-chest-ui.js';

test('compact leaderboard patches preserve host detail and the active local checkpoint', () => {
  const state={x:7142,checkpoint:{id:'forest-checkpoint-2',coins:2,current:20}};
  const player={id:'me',state,summary:{level:1,deaths:2,coins:7,checkpoint:{id:'forest-checkpoint-2'}}};
  const patched=mergePlayerPatch(player,{id:'me',rank:2,score:400,summary:{level:1,finished:false},state:{x:90,checkpoint:null}});
  assert.equal(patched.state,state);
  assert.equal(patched.summary.deaths,2);assert.equal(patched.summary.coins,7);
  assert.equal(patched.summary.checkpoint.id,'forest-checkpoint-2');
  assert.equal(patched.rank,2);assert.equal(patched.score,400);
});
test('runtime guard catches legacy servers and changed simulation files', () => {
  assert.match(runtimeMismatch({ok:true}),/older game build/);
  assert.match(runtimeMismatch({runtimeVersion:'a',diskVersion:'b'}),/Restart/);
  assert.equal(runtimeMismatch({runtimeVersion:'a',diskVersion:'a',needsRestart:false}),null);
  assert.match(runtimeMismatch({runtimeVersion:'new',diskVersion:'new'},'old'),/Refresh this page/);
});

test('progress indicators follow the selected route rather than increasing world identity',()=>{
  assert.deepEqual(worldProgressModel({level:0,worldOrder:[1,2]},[2,1]).order,[2,1]);
  const state={worldOrder:[2,1],level:2,completedWorlds:[]};
  assert.deepEqual(worldProgressModel(state),{order:[2,1],ordinal:1,done:[false,false]});
  state.level=1;state.completedWorlds=[2];assert.equal(worldProgressModel(state).ordinal,2);assert.deepEqual(worldProgressModel(state).done,[true,false]);
  state.finished=true;assert.deepEqual(worldProgressModel(state).done,[true,true]);
});
test('five editable default icebreakers preserve the executive choices and valid custom prompts', () => {
  assert.equal(DEFAULT_QUESTIONS.length,5);
  for(const question of DEFAULT_QUESTIONS){assert.equal(question.choices.length,2);assert.ok(question.prompt.length<=240);}
  assert.deepEqual(DEFAULT_QUESTIONS[0].choices,['Madam Elena','Tita Ambe']);
});
test('power UI reflects server-held/spent state, expiry, and death restrictions', () => {
  const player={connected:true,spawned:true,state:{level:1,respawnRemaining:0},power:{level:1,claimed:true,used:false,power:{name:'Ink Cloud',target:'all'}},effects:{fog:{endsAt:5100},slow:{endsAt:100}}};
  const model=powerUIModel(player,{now:101});
  assert.equal(model.canUse,true);assert.equal(model.fog,true);assert.equal(model.effects.length,1);
  assert.match(model.detail,/Everyone else/);
  player.state.respawnRemaining=3;
  assert.equal(powerUIModel(player,{now:101}).canUse,false);
  assert.equal(powerUIModel(player,{now:101}).held,true);
  player.power.used=true;
  assert.equal(powerUIModel(player,{now:101}).heading,'POWER USED / FIND ANOTHER');
  player.state.level=2;
  assert.equal(powerUIModel(player,{now:101}).heading,'FIND A POWER CHEST');
  assert.deepEqual(activePowerEffects(player,5100),{});
  assert.equal(powerUIModel(player,{now:101,isHost:true}).canUse,false);
});

test('a queued power shows its position and cannot be requested a second time',()=>{
  const player={connected:true,spawned:true,state:{level:1},power:{level:1,claimed:true,used:false,queued:true,queuePosition:2,power:{name:'Sticky Boots',target:'all'}}};
  const model=powerUIModel(player,{now:0});
  assert.equal(model.canUse,false);assert.equal(model.queued,true);assert.equal(model.held,true);
  assert.match(model.heading,/QUEUED/);assert.match(model.detail,/#2/);
  player.power.queued=false;player.power.used=true;
  assert.equal(powerUIModel(player,{now:0}).heading,'POWER USED / FIND ANOTHER');
});

test('queued inventory stays visible after changing worlds and chests count independently',()=>{
  const p={connected:true,spawned:true,state:{level:2},powerChestClaims:['ocean-power-chest-1','ocean-power-chest-2'],power:{level:1,claimed:true,queued:true,queuePosition:3,power:{name:'Ink Cloud'}}};
  assert.equal(powerUIModel(p).queued,true);assert.equal(powerUIModel(p).canUse,false);
  p.power=null;assert.match(powerUIModel(p).detail,/2\/3/);
});

test('chest choices are hidden during private questions, death, and world changes',()=>{
  const p={connected:true,spawned:true,state:{level:1},power:{power:{name:'Sticky Boots'}},powerOffer:{id:'offer',itemId:'held',level:1,power:{name:'Ink Cloud'},canAttack:true,canReplace:true}};
  const model=powerChestOfferModel(p);assert.equal(model.heldName,'Sticky Boots');assert.equal(model.nextName,'Ink Cloud');
  assert.equal(powerChestOfferModel(p,{isHost:true}),null);
  p.powerQuiz={answered:false};assert.equal(powerChestOfferModel(p),null);
  p.powerQuiz.answered=true;assert.ok(powerChestOfferModel(p));
  p.state.respawnRemaining=3;assert.equal(powerChestOfferModel(p),null);
  p.state.respawnRemaining=0;p.state.level=2;assert.equal(powerChestOfferModel(p),null);
});

test('ink defaults to 88 percent darkness before drawing the HUD',()=>{
  const calls=[],ctx={save(){},restore(){},setTransform(){},fillRect(...rect){calls.push({color:this.fillStyle,rect});},strokeRect(){},fillText(){}};
  const p={connected:true,spawned:true,state:{level:1},effects:{fog:{endsAt:5000}}};
  renderPowerUI({width:960,height:540,getContext:()=>ctx},p,{now:0});
  const darkness=calls.findIndex(call=>call.color==='rgba(0,0,0,0.88)');
  assert.ok(darkness>0);assert.deepEqual(calls[darkness].rect,[0,0,960,540]);
  assert.equal(calls[darkness+1].color,'#08161288');
});

test('a quiz participant cannot activate another power while answering',()=>{
  const p={connected:true,spawned:true,state:{level:1},power:{level:1,claimed:true,used:false,power:{name:'Ink Cloud',target:'all'}},powerQuiz:{id:'quiz'}};
  assert.equal(powerUIModel(p).canUse,false);
  p.power.testing=true;p.power.used=true;
  assert.equal(powerUIModel(p).heading,'POWER QUIZ');
});
