// Shared projectile tuning for simulation and renderer hitbox alignment.
export const PROJECTILE_RULES = Object.freeze({
  speed: 120,
  fireInterval: 4.8,
  width: 16,
  height: 16,
  lifetime: 3
});

// Offsets are normalized deltas from the authored pivot. Without an override,
// fire from the forward edge at half height rather than the foot pivot.
export function projectileSpawnOffset(visual, behavior = {}) {
  if (behavior.spawnOffset) return behavior.spawnOffset;
  const pivot = visual?.pivot || [.5, 1];
  return [1 - pivot[0], .5 - pivot[1]];
}

export function projectileHeadTarget(player) {
  // Center of the head region in the upper quarter of the player body.
  return { x: player.x + player.width / 2, y: player.y + player.height / 4 };
}
