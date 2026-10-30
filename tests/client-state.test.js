import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointRenderState, runtimeMismatch } from '../public/game/client-state.js';
import { DEFAULT_QUESTIONS } from '../public/game/default-questions.js';
import { powerUIModel, activePowerEffects } from '../public/game/power-ui.js';

test('predicted checkpoint never shows a save before server confirmation', () => {
  const predicted={x:7142,checkpoint:{id:'forest-checkpoint-1'}},server={x:7130,checkpoint:null};
  assert.equal(checkpointRenderState(predicted,server).checkpoint,null);
  assert.equal(checkpointRenderState(predicted,server).x,7142);
  server.checkpoint={id:'forest-checkpoint-1',coins:2,current:20};
  assert.deepEqual(checkpointRenderState({...predicted,checkpoint:null},server).checkpoint,server.checkpoint);
  assert.equal(predicted.checkpoint.id,'forest-checkpoint-1');
});
test('runtime guard catches legacy servers and changed simulation files', () => {
  assert.match(runtimeMismatch({ok:true}),/older game build/);
  assert.match(runtimeMismatch({runtimeVersion:'a',diskVersion:'b'}),/Restart/);
  assert.equal(runtimeMismatch({runtimeVersion:'a',diskVersion:'a',needsRestart:false}),null);
  assert.match(runtimeMismatch({runtimeVersion:'new',diskVersion:'new'},'old'),/Refresh this page/);
});
test('five editable default icebreakers contain both supplied choices', () => {
  assert.equal(DEFAULT_QUESTIONS.length,5);
  for(const question of DEFAULT_QUESTIONS){assert.equal(question.choices.length,2);assert.ok(question.prompt.length<=240);}
  assert.deepEqual(DEFAULT_QUESTIONS[0].choices,['Madam Elena','Tita Ambe']);
  assert.deepEqual(DEFAULT_QUESTIONS[1].choices,['Pillows','Blankets']);
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
  assert.equal(powerUIModel(player,{now:101}).heading,'POWER SPENT');
  player.state.level=2;
  assert.equal(powerUIModel(player,{now:101}).heading,'FIND THE POWER CHEST');
  assert.deepEqual(activePowerEffects(player,5100),{});
  assert.equal(powerUIModel(player,{now:101,isHost:true}).canUse,false);
});

test('a queued power shows its position and cannot be requested a second time',()=>{
  const player={connected:true,spawned:true,state:{level:1},power:{level:1,claimed:true,used:false,queued:true,queuePosition:2,power:{name:'Sticky Boots',target:'all'}}};
  const model=powerUIModel(player,{now:0});
  assert.equal(model.canUse,false);assert.equal(model.queued,true);assert.equal(model.held,true);
  assert.match(model.heading,/QUEUED/);assert.match(model.detail,/#2/);
  player.power.queued=false;player.power.used=true;
  assert.equal(powerUIModel(player,{now:0}).heading,'POWER SPENT');
});

test('a quiz participant cannot activate another power while answering',()=>{
  const p={connected:true,spawned:true,state:{level:1},power:{level:1,claimed:true,used:false,power:{name:'Ink Cloud',target:'all'}},powerQuiz:{id:'quiz'}};
  assert.equal(powerUIModel(p).canUse,false);
  p.power.testing=true;p.power.used=true;
  assert.equal(powerUIModel(p).heading,'POWER QUIZ');
});
