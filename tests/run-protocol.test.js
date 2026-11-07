import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, startRun, LEVELS } from '../public/game/engine.js';
import { emptyRunSummary, summarizeRun, validateRunSummary, summaryScore } from '../public/game/run-protocol.js';

// This file validates legacy physics summary/checkpoint contracts; use the
// ocean fixture where the old forest slot is referenced.
import { legacyOceanFixture } from './legacy-level-fixtures.js';
LEVELS[1] = legacyOceanFixture();

test('run reports contain only summary data, even when the local world has detailed state', () => {
  const local = startRun(createState({ name: 'Local player' }));
  local.collected = ['coin-a', 'coin-b']; local._particles = [{ x: 12, y: 45 }];
  local.checkpoint = { ...LEVELS[1].checkpoints[0], collected: [...local.collected], current: 20 };
  const summary = summarizeRun(local);
  assert.deepEqual(summary.checkpoint, { id: local.checkpoint.id });
  for (const key of ['x', 'y', 'vx', 'vy', 'enemies', 'projectiles', '_particles', 'collected', 'name']) assert.equal(key in summary, false);
  assert.ok(JSON.stringify(summary).length < 400);
  assert.deepEqual(validateRunSummary({ ...summary, enemies: local.enemies, x: local.x }, [1, 2, 3]), summary);
});

test('summary validation follows each configured world order while allowing death rollback', () => {
  for (const order of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) {
    const start = emptyRunSummary(order[0]);
    assert.deepEqual(validateRunSummary(start, order), start);
    const checkpoint = { ...start, coins: 2, current: 20, progress: .25, distanceMax: 3500, checkpoint: { id: LEVELS[order[0]].checkpoints[0].id } };
    assert.ok(validateRunSummary(checkpoint, order));
    assert.ok(validateRunSummary({ ...checkpoint, deaths: 1, respawnRemaining: 3 }, order));
    const next = { ...emptyRunSummary(order[1]), completedWorlds: [order[0]], banked: 500 };
    assert.ok(validateRunSummary(next, order));
    const final = { ...emptyRunSummary(order[2]), completedWorlds: [...order], banked: 1500, finished: true, finishedAt: 123456 };
    assert.ok(validateRunSummary(final, order));
    assert.equal(validateRunSummary({ ...next, level: order[0] }, order), null);
    assert.equal(validateRunSummary({ ...next, completedWorlds: [order[1]] }, order), null);
  }
});

test('invalid reports fail shape checks without reconstructing physics', () => {
  const initial = emptyRunSummary(1);
  for (const patch of [
    { current: Infinity }, { banked: NaN }, { coins: '2' }, { coins: .5 },
    { deaths: -1 }, { progress: 1.1 }, { respawnRemaining: 4 },
    { earnedCoins: -1 }, { earnedCoins: 1.5 }, { earnedCoins: '30' }, { earnedCoins: Infinity },
    { checkpoint: { id: 'unknown' } }, { finished: true },
    { completedWorlds: [, 2] }, { finishedAt: 100 },
  ]) assert.equal(validateRunSummary({ ...initial, ...patch }, [1, 2, 3]), null);
  // Teleported distances and client-computed totals are trusted in this casual game.
  assert.ok(validateRunSummary({ ...initial, distanceMax: 10000, current: 777 }, [1, 2, 3]));
  assert.equal(validateRunSummary(null, [1, 2, 3]), null);
});

test('a banked victory hold accepts only the just-cleared biome with no unbanked points', () => {
  const clearing={...emptyRunSummary(3),completedWorlds:[3],banked:500,progress:1};
  assert.ok(validateRunSummary(clearing,[3,1,2]));
  for(const patch of [{level:2},{progress:.99},{current:1},{distanceMax:32},{respawnRemaining:1}]){
    assert.equal(validateRunSummary({...clearing,...patch},[3,1,2]),null);
  }
});

test('leaderboard totals include unbanked points and the last partial reporting milestone', () => {
  const summary = { ...emptyRunSummary(2), banked: 900, current: 70, distanceMax: 337 };
  assert.equal(summaryScore(summary, { distancePoints: 3 }), 1000);
  assert.equal(summaryScore({ ...summary, current: 0, distanceMax: 0 }, { distancePoints: 3 }), 900);
});
