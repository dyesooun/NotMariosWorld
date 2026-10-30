import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS } from '../public/game/levels.js';
import { FOREST_SPRITES } from '../public/game/forest-sprites.js';
import { readFileSync } from 'node:fs';

const forest = LEVELS[1];
const ocean = LEVELS[2];
const inferno = LEVELS[3];
const contains = (p, x) => p.x <= x && p.x + p.w >= x;
const overlaps = (p, a, b) => p.x < b && p.x + p.w > a;

test('forest is an authored course distinct from ocean and inferno', () => {
  assert.equal(forest.id, 'forest');
  assert.equal(forest.seed, 19417);
  assert.deepEqual(forest.checkpoints.map(c => c.x), [3500, 7000, 10500]);
  assert.notDeepEqual(forest.platforms.map(p => [p.x, p.y, p.w, p.kind]), ocean.platforms.map(p => [p.x, p.y, p.w, p.kind]));
  assert.notDeepEqual(forest.platforms.map(p => [p.x, p.y, p.w, p.kind]), inferno.platforms.map(p => [p.x, p.y, p.w, p.kind]));
  assert.ok(forest.platforms.some(p => p.kind === 'moving'));
  assert.ok(forest.platforms.some(p => p.kind === 'vanish'));
  assert.ok(forest.decorations?.landmarks.includes('root-terraces'));
});

test('all forest checkpoints and reward chests have full ground support and hazard clearance', () => {
  const protectedXs = [...forest.checkpoints.map(c => c.x), ...forest.powerChests.map(c => c.x)];
  for (const x of protectedXs) {
    assert.ok(forest.platforms.some(p => p.kind === 'ground' && p.y===500 && p.x<=x-14 && p.x+p.w>=x+54), `missing complete ground support at ${x}`);
    assert.ok(!forest.hazards.some(h => overlaps(h, x - 150, x + 150)), `hazard too close to ${x}`);
  }
  assert.deepEqual(forest.powerChests.map(c => c.x), [3940,7460,10940]);
  assert.notDeepEqual(forest.powerChests.map(c=>c.x),ocean.powerChests.map(c=>c.x));
  assert.equal(new Set(forest.powerChests.map(c => c.id)).size, 3);
});

test('forest enemies never occupy checkpoint or chest haven platforms', () => {
  const protectedRanges = [[3350, 4030], [6850, 7530], [10350, 11030]];
  for (const enemy of forest.enemies) {
    const assigned = forest.platforms[enemy.platformIndex];
    assert.ok(assigned, `${enemy.id} has no assigned platform`);
    assert.ok(!protectedRanges.some(([a, b]) => overlaps(assigned, a, b)), `${enemy.id} overlaps a protected haven`);
  }
});

test('forest has two new enemy species and the ambient moth sprite', () => {
  const kinds = new Set(forest.enemies.map(e => e.kind));
  assert.ok(kinds.has('mushling'));
  assert.ok(kinds.has('acorn_beetle'));
  assert.ok(FOREST_SPRITES.glow_moth);
});

test('forest atlas manifest contains all sixteen authored sprites', () => {
  const png=readFileSync(new URL('../public/assets/forest-sprites.png',import.meta.url)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  const names = ['vine_hanging','vine_climbing','flower_pink','flower_bluebell','flower_gold','flower_daisy','mushrooms_red','mushrooms_glow','forest_chest','glow_moth','mushling','acorn_beetle','forest_totem','tiki','wood_mask','root_platform'];
  assert.deepEqual(Object.keys(FOREST_SPRITES), names);
  for (const name of names) {
    const rect = FOREST_SPRITES[name];
    assert.ok(rect.w > 0 && rect.h > 0, `${name} must have positive bounds`);
    assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.w<=width&&rect.y+rect.h<=height,`${name} must fit in the real atlas`);
  }
});

test('forest decorative species are grounded and every requested carving appears',()=>{
  const kinds=new Set(forest.decorations.carvings.map(item=>item.kind));
  for(const name of ['forest_totem','tiki','wood_mask'])assert.ok(kinds.has(name));
  assert.equal(new Set(forest.decorations.flora.filter(item=>item.kind.startsWith('flower_')).map(item=>item.kind)).size,4);
  assert.equal(forest.decorations.ambientCreature,'glow_moth');assert.ok(forest.decorations.vines.length>0);
  for(const item of forest.decorations.flora)assert.ok(forest.platforms.some(p=>p.kind==='ground'&&p.x<=item.x&&p.x+p.w>=item.x+item.w&&p.y===item.y));
});
