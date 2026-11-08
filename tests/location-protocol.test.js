import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { locationFromState, normalizePlayerLocation, PROTOCOL_VERSION } from '../public/game/run-protocol.js';
import { LocalRunRuntime } from '../public/game/local-run.js';
import { LEVELS } from '../public/game/engine.js';
import { legacyOceanFixture } from './legacy-level-fixtures.js';

// These protocol tests exercise legacy movement, while production world 2 is
// authored JSON. Keep the fixture local to this test module and restore it.
const authoredWorld2 = LEVELS[2];
LEVELS[2] = legacyOceanFixture();
after(() => { LEVELS[2] = authoredWorld2; });

test('player locations are compact, rounded, catalog-validated, and allow negative Y', () => {
  assert.equal(PROTOCOL_VERSION, 5);
  assert.deepEqual(normalizePlayerLocation({ level: 1, x: 12.6, y: -8.4 }), { level: 1, x: 13, y: -8 });
  assert.deepEqual(locationFromState({ level: 0, x: 4.4, y: -12.6 }), { level: 0, x: 4, y: -13 });
  for (const value of [null, [], {level: 999,x:1,y:1}, {level:1,x:Infinity,y:1}, {level:1,x:null,y:1}, {level:1,x:'1',y:1}, {level:1,x:1,y:10000001}]) assert.equal(normalizePlayerLocation(value), null);
});

test('local reports carry location without adding movement report triggers', () => {
  const reports=[];
  let clock=1000;
  const runtime=new LocalRunRuntime({roundId:'round',runId:'run',profile:{level:2},now:()=>clock,sendReport:report=>reports.push(report)});
  runtime.begin([2,1]);
  const start=reports.at(-1);
  assert.deepEqual(start.location, locationFromState(runtime.state));
  const count=reports.length;
  runtime.setInput({right:true});
  clock+=100;runtime.tick(.1,{serverNow:clock});
  assert.ok(runtime.state.x>90,'real fixed-step movement takes place');
  assert.equal(reports.length,count);
  assert.equal(Object.hasOwn(start.summary,'x'),false);
  assert.equal(Object.hasOwn(start.summary,'location'),false);
});

test('final cutoff location comes from the same history as score and stays frozen on retry',()=>{
  let clock=1000;
  const runtime=new LocalRunRuntime({roundId:'round',runId:'run',now:()=>clock});
  runtime.begin([2,1]);
  Object.assign(runtime.state,{x:200,y:450,current:10});
  clock=2000;runtime.tick(1/60,{serverNow:clock});
  const cutoffLocation=locationFromState(runtime.state);
  Object.assign(runtime.state,{x:400,y:450,current:20});
  clock=3000;runtime.tick(1/60,{serverNow:clock});
  const final=runtime.finalReport(2500);
  assert.deepEqual(final.location,cutoffLocation);
  assert.equal(final.summary.current,10);
  runtime.state.x=9000;clock=4000;
  assert.deepEqual(runtime.finalReport(4000,{retry:true}).location,cutoffLocation);
});
