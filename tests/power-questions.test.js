import test from 'node:test';
import assert from 'node:assert/strict';
import { POWER_QUESTIONS,POWER_QUIZ_DURATION_MS,choosePowerQuestion,isCorrectPowerAnswer,normalizePowerAnswer } from '../server/power-questions.js';

test('question bank supports a full room with unique prompts and a ten-second deadline',()=>{
  assert.ok(POWER_QUESTIONS.length>=26);assert.equal(POWER_QUIZ_DURATION_MS,10000);
  assert.equal(new Set(POWER_QUESTIONS.map(q=>q.id)).size,POWER_QUESTIONS.length);
  const selected=[];
  for(let i=0;i<26;i++){const q=choosePowerQuestion({random:()=>0,excludedIds:selected});assert.ok(!selected.includes(q.id));selected.push(q.id);}
});
test('answers ignore case, outer spaces, and repeated spaces while rejecting wrong answers',()=>{
  const paris=POWER_QUESTIONS.find(q=>q.id==='capital-france'),mona=POWER_QUESTIONS.find(q=>q.id==='mona-lisa');
  assert.ok(isCorrectPowerAnswer(paris,' pArIs '));assert.ok(isCorrectPowerAnswer(mona,' LEONARDO   DA VINCI '));
  assert.equal(isCorrectPowerAnswer(paris,'Rome'),false);assert.equal(isCorrectPowerAnswer(paris,''),false);
  assert.equal(normalizePowerAnswer(null),'');assert.equal(normalizePowerAnswer(' H₂O '),'h2o');
});
