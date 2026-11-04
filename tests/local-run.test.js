import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRunRuntime, FIXED_STEP_SECONDS, MAX_CATCHUP_STEPS } from '../public/game/local-run.js';
import { LEVELS } from '../public/game/levels.js';

const make = (extra = {}) => {
  const reports = [];
  const runtime = new LocalRunRuntime({
    roundId: 'round-1', runId: 'run-1', profile: { name: 'Runner' },
    settings: { worldOrder: [1, 2, 3], coinPoints: 10, distancePoints: 1 },
    sendReport: report => reports.push(report), ...extra,
  });
  runtime.begin([1, 2, 3]);
  return { runtime, reports };
};

test('local input advances without input packets or snapshot waits', () => {
  const { runtime, reports } = make();
  runtime.setInput({ right: true });
  runtime.tick(FIXED_STEP_SECONDS * 3, { serverNow: 100 });
  assert.ok(runtime.state.x > 90);
  assert.equal(reports.length, 1, 'start only: sub-5% movement is not a progress milestone');
});

test('fixed-step catchup is bounded', () => {
  const { runtime } = make();
  runtime.tick(1, { serverNow: 100 });
  assert.ok(runtime.state.elapsed <= MAX_CATCHUP_STEPS * FIXED_STEP_SECONDS + 1e-6);
});

test('fixed-step reports carry chronological simulation timestamps', () => {
  const reports = [];
  const runtime = new LocalRunRuntime({ roundId: 'r', runId: 'u', now: () => 0, profile: { name: 'Runner' }, settings: { worldOrder: [1, 2, 3] }, sendReport: r => reports.push(r) });
  runtime.begin([1, 2, 3]);
  runtime.setInput({ right: true });
  runtime.tick(.1, { serverNow: 100 });
  const times = reports.map(r => r.at);
  assert.ok(times.every((at, i) => i === 0 || at >= times[i - 1]));
});

test('final report selects the last summary at or before cutoff', () => {
  const { runtime, reports } = make();
  runtime.setInput({ right: true });
  runtime.tick(.1, { serverNow: 100 });
  runtime.tick(.1, { serverNow: 400 });
  const final = runtime.finalReport(250);
  assert.equal(final.final, true);
  assert.ok(final.at <= 250);
  assert.equal(reports.at(-1), final);
});

test('final report uses live state for a natural cutoff and history for an earlier cutoff', () => {
  const { runtime } = make();
  runtime.state.current = 17;
  runtime.tick(FIXED_STEP_SECONDS, { serverNow: 100 });
  runtime.state.current = 42;
  runtime.tick(FIXED_STEP_SECONDS, { serverNow: 200 });
  assert.equal(runtime.finalReport(150).summary.current, 17);
  runtime.state.current = 99;
  assert.equal(runtime.finalReport(999, { retry: true }).summary.current, 17);
  const natural = make().runtime;
  natural.state.current = 42;
  natural.tick(FIXED_STEP_SECONDS, { serverNow: 200 });
  assert.equal(natural.finalReport(200).summary.current, 42);
});

test('chest contact uses avatar/chest AABBs and is suppressed while dead or finished', () => {
  const { runtime } = make();
  const chest = LEVELS[1].powerChests[0];
  runtime.state.level = 1; runtime.state.x = chest.x; runtime.state.y = chest.y;
  runtime.tick(FIXED_STEP_SECONDS, { serverNow: 100 });
  assert.equal(runtime.lastChestId, chest.id);
  runtime.state.deadUntil = 10; runtime.tick(FIXED_STEP_SECONDS, { serverNow: 200 });
  assert.equal(runtime.lastChestId, null);
  runtime.state.deadUntil = 0; runtime.state.finished = true; runtime.tick(FIXED_STEP_SECONDS, { serverNow: 300 });
  assert.equal(runtime.lastChestId, null);
});

test('lobby does not emit race reports and respawn emits a lifecycle report', () => {
  const reports = [];
  const lobby = new LocalRunRuntime({ roundId: 'r', runId: 'u', sendReport: r => reports.push(r) });
  lobby.tick(.2); assert.equal(reports.length, 0);
  const { runtime } = make();
  runtime.state.deadUntil = runtime.state.elapsed + 1; runtime.state.respawnRemaining = 1;
  runtime.respawnWallDeadline = 1000;
  runtime.tick(.01, { serverNow: 1000 });
  assert.ok(runtime.lastReport && runtime.lastReport.summary.respawnRemaining === 0);
});

test('quiz freeze holds horizontal velocity while preserving local state', () => {
  const { runtime } = make();
  runtime.setInput({ right: true });
  runtime.tick(.2, { serverNow: 100 });
  const x = runtime.state.x;
  runtime.setFrozen(true);
  runtime.tick(.2, { serverNow: 300 });
  assert.equal(runtime.state.vx, 0);
  assert.equal(runtime.state.x,x);
});

test('coin pickup batches flush even when the player stops collecting',()=>{
  let clock=0;const {runtime,reports}=make({now:()=>clock});
  runtime.state.x=750;clock=50;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});
  const before=reports.length;
  const coin=LEVELS[1].coins[0];runtime.state.x=coin.x;runtime.state.y=coin.y;runtime.state.grounded=false;
  clock=100;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});
  assert.equal(runtime.state.coins,1);assert.equal(reports.length,before);
  clock=250;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});
  assert.equal(reports.length,before+1);assert.equal(reports.at(-1).summary.coins,1);
  clock=500;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});assert.equal(reports.length,before+1);
});

test('a long idle period retains the latest predecessor before a manual cutoff',()=>{
  let clock=0;const {runtime}=make({now:()=>clock});
  runtime.state.current=17;clock=100;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});
  clock=50000;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});
  runtime.state.current=42;clock=50100;runtime.tick(FIXED_STEP_SECONDS,{serverNow:clock});
  const final=runtime.finalReport(50050);assert.equal(final.summary.current,17);assert.equal(final.chestId,null);
  runtime.state.current=99;runtime.lastChestId=LEVELS[1].powerChests[0].id;
  const retry=runtime.finalReport(60000,{retry:true});assert.equal(retry.summary.current,17);assert.equal(retry.chestId,null);assert.ok(retry.seq>final.seq);
});

test('a cutoff between catchup steps captures intermediate progress with millisecond timestamps',()=>{
  const {runtime}=make({now:()=>0});runtime.setInput({right:true});
  runtime.tick(5/60,{serverNow:100});
  const entries=runtime.history.filter(item=>item.at>0);
  assert.ok(entries.length>=4);assert.ok(Math.abs(entries[1].at-entries[0].at-1000/60)<.01);
  const end=runtime.state.progress,final=runtime.finalReport(70);
  assert.ok(final.summary.progress>90/14000);assert.ok(final.summary.progress<end);
});

test('death sends checkpoint replacement totals and clears chest contact in the same report',()=>{
  const events=[];const {runtime,reports}=make({now:()=>0,onEvent:event=>events.push(event)});
  const cp=LEVELS[1].checkpoints[0];runtime.state.checkpoint={...cp,current:20,coins:2,collected:['saved-coin'],distanceMax:cp.x-90,progress:.25};
  Object.assign(runtime.state,{current:50,coins:5,collected:['saved-coin','later-coin'],x:3940,y:620,distanceMax:4000,progress:.3});
  runtime.lastChestId=LEVELS[1].powerChests[0].id;runtime.tick(FIXED_STEP_SECONDS,{serverNow:100});
  const report=reports.at(-1);assert.equal(report.chestId,null);assert.equal(report.summary.current,20);assert.equal(report.summary.coins,2);assert.equal(report.summary.deaths,1);
  assert.deepEqual(runtime.state.collected,['saved-coin']);assert.equal(events.some(e=>e.type==='coin'),false);
});

test('local runtime follows the shared engine through all ordered worlds', () => {
  const { runtime } = make();
  for (const level of [1, 2, 3]) {
    runtime.state.level = level;
    runtime.state.x = 14000;
    runtime.state.y = 500;
    runtime.state.grounded = true;
    runtime.state.finished = false;
    runtime.state._enemyLevel = null;
    runtime.tick(FIXED_STEP_SECONDS, { serverNow: level * 1000 });
  }
  assert.equal(runtime.state.finished, true);
  assert.deepEqual(runtime.state.completedWorlds, [1, 2, 3]);
});
