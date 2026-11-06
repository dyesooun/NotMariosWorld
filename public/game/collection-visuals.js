// Render-only timestamps. Confirmed chest claims never alter inventory or score.
const runs = new WeakMap();
export function collectionVisuals(state, chestClaims, timeMs) {
  let run = runs.get(state);
  if (!run || run.level !== state.level || state.elapsed < run.elapsed) {
    run = { level: state.level, elapsed: state.elapsed, coins: new Map(), chests: new Map() };
    runs.set(state, run);
  }
  run.elapsed = state.elapsed;
  for (const id of state.collected || []) if (!run.coins.has(id)) run.coins.set(id, timeMs);
  for (const id of chestClaims) if (!run.chests.has(id)) run.chests.set(id, timeMs);
  return run;
}
