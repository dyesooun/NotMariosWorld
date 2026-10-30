import test from 'node:test';
import assert from 'node:assert/strict';
import { powerQuizModel } from '../public/game/power-quiz-ui.js';

test('private attack and defense prompts fit inside the game viewport',()=>{
  for(const role of ['attack','defense']){
    const player={powerQuiz:{id:'challenge',transactionId:'turn',role,prompt:'Which keyboard instrument makes sound with strings struck by small hammers?',endsAt:10000,answered:false,result:null}};
    const q=powerQuizModel(player,{now:1000});assert.equal(q.canAnswer,true);assert.equal(q.remaining,9);
    assert.ok(q.panel.y>=0&&q.panel.y+q.panel.h<=540);
    assert.ok(q.input.x>=q.panel.x&&q.input.y+q.input.h<q.panel.y+q.panel.h-42);
    assert.ok(q.submit.x+q.submit.w<q.panel.x+q.panel.w);
    assert.equal(powerQuizModel(player,{now:10000}).canAnswer,false);
    assert.equal(powerQuizModel(player,{now:1000,isHost:true}).canAnswer,false);
    player.powerQuiz.answered=true;player.powerQuiz.result='correct';assert.equal(powerQuizModel(player,{now:1000}),null);
    assert.equal(powerQuizModel(player,{now:1000,isHost:true}).canAnswer,false);
  }
  assert.equal(powerQuizModel({}),null);
});
