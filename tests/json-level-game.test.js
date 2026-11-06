import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEVELS, createState, startRun, step, score, getJsonRuntime } from '../public/game/engine.js';
import { documentToLevel } from '../public/game/level-catalog.js';
import { LocalRunRuntime } from '../public/game/local-run.js';
import { summarizeRun, validateRunSummary } from '../public/game/run-protocol.js';

function fixture() {
  const definition = (id, kind, gameplay = {}) => ({
    id, name: id, kind, size: { width: 20, height: 36 },
    visual: { assetId: 'atlas', frameId: 'pixel' },
    physics: { mode: kind === 'platform' ? 'solid' : 'none', collider: [0, 0, 1, 1], hitbox: null, lethal: false, gravity: false, calibration: 'authored' },
    behavior: { type: 'static' }, gameplay,
  });
  const place = (id, definitionId, x, y, width = 20, height = 36) => ({ id, definitionId, x, y, width, height, layer: 0, flipX: false, rotation: 0, settings: {} });
  return {
    format: 'not-marios-world-level', version: 2, id: 'json-fixture', name: 'Any theme', biome: 'unrecognized',
    world: { width: 1000, height: 600, backgroundColor: '#182838', spawn: { x: 40, y: 164 } },
    assets: { atlas: { id: 'atlas', width: 1, height: 1, src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', frames: { pixel: { x: 0, y: 0, w: 1, h: 1 } } } },
    definitions: {
      floor: definition('floor', 'platform'),
      coin: definition('coin', 'prop', { role: 'coin', nonblocking: true, coinValue: 2 }),
      checkpoint: definition('checkpoint', 'prop', { role: 'checkpoint', nonblocking: true, anchor: [.5, 1] }),
      chest: definition('chest', 'prop', { role: 'power-chest', nonblocking: true, triggerVolume: [0, 0, 1, 1] }),
      exit: definition('exit', 'prop', { role: 'exit', nonblocking: true }),
    },
    placements: [place('floor', 'floor', 0, 200, 1000, 30), place('coin-a', 'coin', 75, 164), place('flag-a', 'checkpoint', 125, 164), place('coin-b', 'coin', 175, 164), place('chest-a', 'chest', 225, 164), place('exit-a', 'exit', 900, 164)],
  };
}

function useFixture(t) {
  const previous = LEVELS[1];
  LEVELS[1] = documentToLevel(fixture(), 1, { theme: 'forest', name: 'Fixture' });
  t.after(() => { LEVELS[1] = previous; });
  return startRun(createState());
}

function contact(state, x, y = 200, config = {}) {
  const runtime = getJsonRuntime(state);
  Object.assign(runtime.player, { x: x - 14, y: y - 36, vx: 0, vy: 0, grounded: true, standingId: null });
  Object.assign(state, { x, y, vx: 0, vy: 0 });
  return step(state, {}, 1 / 60, config);
}

test('authored spawn is initialized before the first frame and snapshots stay compact', () => {
  const state = startRun(createState());
  const runtime = getJsonRuntime(state);
  assert.ok(runtime);
  assert.equal(state.x, runtime.spawn.x + 14);
  assert.equal(state.y, runtime.spawn.y + 36);
  assert.ok(JSON.stringify(state).length < 6000);
  assert.doesNotThrow(() => structuredClone(state));
  assert.ok(validateRunSummary(summarizeRun(state), state.worldOrder));
});

test('JSON coins and points survive death while checkpoint rollback restores traversal state', t => {
  const state = useFixture(t), config = { coinPoints: 17, distancePoints: 3 };
  contact(state, 85, 200, config);
  assert.equal(state.coins, 2); assert.equal(state.current, 34);
  contact(state, 135, 200, config);
  assert.equal(state.checkpoint.id, 'flag-a');
  assert.equal(state.checkpoint.current, 34);
  assert.ok(validateRunSummary(summarizeRun(state), state.worldOrder));
  const saved = { score: score(state, config), collected: [...state.collected], distance: state.distanceMax };
  contact(state, 185, 200, config);
  assert.equal(state.current, 68);
  const death = contact(state, 300, 800, config);
  assert.ok(death.some(event => event.type === 'death' && event.respawnIn === 3));
  assert.ok(score(state, config) > saved.score, 'post-checkpoint coin points remain after death');
  assert.equal(state.distanceMax, saved.distance);
  assert.deepEqual(state.collected, [...saved.collected, 'coin-b']);
  assert.equal(state.deaths, 1);
  for (let i = 0; i < 181; i++) step(state, {}, 1 / 60, config);
  assert.equal(state.respawnRemaining, 0);
  assert.equal(state.checkpoint.id, 'flag-a');
  assert.equal(state.current, 68);
  contact(state, 185, 200, config);
  assert.equal(state.current, 68, 'collected coins do not respawn after rollback');
});

test('JSON exit contact banks once, reports a valid cue hold, and advances through the existing lifecycle', t => {
  const state = useFixture(t), config = { coinPoints: 17, distancePoints: 3, deferStageTransition: true };
  contact(state, 85, 200, config);
  const events = contact(state, 910, 200, config);
  assert.ok(events.some(event => event.type === 'levelComplete' && event.level === 1));
  assert.deepEqual(state.completedWorlds, [1]);
  assert.equal(state.current, 0); assert.equal(state.distanceMax, 0);
  assert.ok(state.banked >= 34);
  assert.deepEqual(state.stageTransition, { from: 1, to: 2 });
  assert.ok(validateRunSummary(summarizeRun(state), state.worldOrder));
  const banked = state.banked;
  step(state, { right: true }, 1 / 60, config);
  assert.equal(state.banked, banked);
  const local = new LocalRunRuntime({ state, settings: config });
  assert.equal(local.advanceStage(), true);
  assert.equal(state.level, 2); assert.equal(state.banked, banked);
  assert.equal(state.checkpoint, null);
});

test('JSON movement honors reversed, slowed, and slippery latched strengths', t => {
  useFixture(t);
  const run = effects => {
    const state = startRun(createState());
    for (let i = 0; i < 50; i++) step(state, { right: true }, 1 / 60, { powerEffects: effects });
    const moving = state.vx;
    for (let i = 0; i < 8; i++) step(state, {}, 1 / 60, { powerEffects: effects });
    return { state, moving };
  };
  const normal = run({}), slow = run({ slow: { strength: { speedPercent: 25 } } }), ice = run({ slippery: { strength: { speedPercent: 200, gripPercent: 5 } } });
  assert.ok(slow.moving > 0 && slow.moving < normal.moving * .4);
  assert.ok(ice.moving > normal.moving * 1.5);
  assert.ok(ice.state.vx / ice.moving > normal.state.vx / normal.moving);
  const reverse = startRun(createState());
  contact(reverse, 500);
  step(reverse, { right: true }, 1 / 60, { powerEffects: { reverse: { strength: { speedPercent: 150 } } } });
  assert.ok(reverse.vx < 0);
});

test('authored chest contact reaches compact reports without a legacy collision box', t => {
  const state = useFixture(t), reports = [];
  const local = new LocalRunRuntime({ state, roundId: 'round', runId: 'run', sendReport: report => reports.push(report) });
  contact(state, 235);
  local.tick(1 / 60);
  assert.equal(reports.at(-1)?.chestId, 'chest-a');
  assert.equal(reports.at(-1).summary.level, 1);
  assert.ok(JSON.stringify(reports.at(-1)).length < 1000);
});

test('a JSON-only catalog with five nonconsecutive IDs completes all stages without code changes', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nmw-json-catalog-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.cp(new URL('../public/game/', import.meta.url), path.join(directory, 'game'), { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  const ids = [7, 4, 9, 2, 1];
  await fs.writeFile(path.join(directory, 'game/fixture.json'), JSON.stringify(fixture()));
  await fs.writeFile(path.join(directory, 'game/level-catalog.json'), JSON.stringify({ format: 'not-marios-world-level-catalog', version: 1, levels: ids.map(id => ({ id, name: `Custom ${id}`, theme: 'forest', src: './fixture.json' })) }));
  const engine = await import(pathToFileURL(path.join(directory, 'game/engine.js')));
  const protocol = await import(pathToFileURL(path.join(directory, 'game/run-protocol.js')));
  const state = engine.startRun(engine.createState());
  assert.deepEqual(state.worldOrder, ids);
  for (const [index, id] of ids.entries()) {
    assert.equal(state.level, id);
    const runtime = engine.getJsonRuntime(state);
    Object.assign(runtime.player, { x: 896, y: 164 });
    const events = engine.step(state, {}, 1 / 60);
    assert.ok(events.some(event => event.type === 'levelComplete' && event.level === id));
    assert.deepEqual(state.completedWorlds, ids.slice(0, index + 1));
    assert.equal(state.finished, index === ids.length - 1);
    const summary = protocol.summarizeRun(state, { finishedAt: state.finished ? 12345 : null });
    assert.ok(protocol.validateRunSummary(summary, ids));
  }
  assert.equal(engine.score(state), state.banked);
});
