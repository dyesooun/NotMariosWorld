import { LEVELS } from '../public/game/levels.js';

// The procedural ocean course was retired from production when authored tide
// JSON became live. Adapt the remaining legacy inferno course for regressions
// that target legacy collision, combat, and chest behavior.
export function legacyOceanFixture() {
  const level = structuredClone(LEVELS[3]);
  level.id = 'ocean';
  level.theme = 'ocean';
  level.flavor = 'A tidepool trail where crabs have strong opinions.';
  for (const collection of [level.hazards, level.enemies, level.coins, level.checkpoints, level.powerChests]) {
    for (const item of collection) if (typeof item.id === 'string') item.id = item.id.replaceAll('hell', 'ocean');
  }
  for (const enemy of level.enemies) enemy.kind = enemy.kind === 'imp' ? 'crab' : enemy.kind;
  return level;
}
