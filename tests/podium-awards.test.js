import test from 'node:test';
import assert from 'node:assert/strict';
import { podiumAwards } from '../public/game/podium.js';

const player = (id, name, deaths, earnedCoins) => ({ id, name, summary: { deaths, earnedCoins } });

test('podium awards choose separate frozen-result winners', () => {
  const results = [player('a', 'Ash', 4, 12), player('b', 'Bee', 1, 19)];
  const awards = podiumAwards(results);
  assert.equal(awards.deaths.winners[0].name, 'Ash');
  assert.equal(awards.deaths.value, 4);
  assert.equal(awards.earnedCoins.winners[0].name, 'Bee');
  assert.equal(awards.earnedCoins.value, 19);
});

test('joint winners remain in immutable result order', () => {
  const results = [player('a', 'Ash', 3, 9), player('b', 'Bee', 3, 9), player('c', 'Cy', 1, 2)];
  const awards = podiumAwards(results);
  assert.deepEqual(awards.deaths.winners.map(p => p.id), ['a', 'b']);
  assert.deepEqual(awards.earnedCoins.winners.map(p => p.id), ['a', 'b']);
});

test('one runner can win both awards using cumulative coins rather than the remaining wallet or world coins', () => {
  const results=[player('a','Ash',9,150),player('b','Bee',2,80)];
  results[0].summary.coins=1;results[0].coinAttack={available:0,spent:150};
  results[1].summary.coins=70;results[1].coinAttack={available:80,spent:0};
  const awards=podiumAwards(results);
  assert.equal(awards.deaths.winners[0].id,'a');
  assert.equal(awards.earnedCoins.winners[0].id,'a');
  assert.equal(awards.earnedCoins.value,150);
});

test('all twenty-five tied runners remain named in both awards', () => {
  const results=Array.from({length:25},(_,i)=>player(String(i),`Long Named Runner ${i+1}`,4,90));
  const awards=podiumAwards(results);
  for(const award of [awards.deaths,awards.earnedCoins]){
    assert.equal(award.winners.length,25);
    assert.match(award.message,/Long Named Runner 25/);
  }
});

test('zero, missing, and non-array results use neutral messages', () => {
  const awards = podiumAwards([player('a', 'Ash', 0, 0), { id: 'b', name: 'Bee' }]);
  assert.equal(awards.deaths.message, 'No deaths this round');
  assert.equal(awards.earnedCoins.message, 'No coins collected.');
  assert.equal(podiumAwards(null).deaths.winners.length, 0);
});

test('podiumAwards does not mutate its frozen result source', () => {
  const results = Object.freeze([Object.freeze(player('a', 'Ash', 2, 8))]);
  const before = JSON.stringify(results);
  const awards = podiumAwards(results);
  assert.equal(JSON.stringify(results), before);
  assert.notEqual(awards.deaths, results);
});
