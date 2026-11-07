import { LEVELS } from './levels.js';
import { normalizeWorldOrder } from './world-order.js';

// Gameplay lives in the browser. Only this compact projection crosses the wire.
export const PROTOCOL_VERSION = 4;
export const FINAL_REPORT_WINDOW_MS = 2000;
export const PROGRESS_REPORT_STEP = .05;

export function emptyRunSummary(level = 0) {
  return {
    level, completedWorlds: [], coins: 0, earnedCoins: 0, current: 0, banked: 0,
    distanceMax: 0, progress: 0, checkpoint: null, deaths: 0,
    respawnRemaining: 0, finished: false, finishedAt: null,
  };
}

export function summarizeRun(state, { finishedAt = null } = {}) {
  return {
    level: state.level,
    completedWorlds: [...(state.completedWorlds || [])],
    coins: state.coins,
    earnedCoins: state.earnedCoins ?? state.coins,
    current: state.current,
    banked: state.banked,
    distanceMax: state.distanceMax,
    progress: state.progress,
    checkpoint: state.checkpoint ? { id: state.checkpoint.id } : null,
    deaths: state.deaths,
    respawnRemaining: state.respawnRemaining,
    finished: !!state.finished,
    finishedAt: state.finished ? finishedAt : null,
  };
}

const nonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

// These are protocol/lifecycle checks, not a replay or anti-cheat simulation.
// Distance and progress may decrease on death; collected coin points persist.
export function validateRunSummary(value, worldOrder) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const order = normalizeWorldOrder(worldOrder);
  if (!Number.isInteger(value.level) || (value.level !== 0 && !order.includes(value.level))) return null;
  if (!Array.isArray(value.completedWorlds) || value.completedWorlds.length > order.length) return null;
  const completed = value.completedWorlds;
  if (!order.slice(0, completed.length).every((level, i) => completed[i] === level)) return null;
  if (typeof value.finished !== 'boolean') return null;
  if (value.finished !== (completed.length === order.length)) return null;
  if (value.level === 0) {
    if (completed.length || value.finished) return null;
  } else if (value.level !== order[Math.min(completed.length, order.length - 1)]) {
    // A cleared world remains visible until its victory stinger ends. Its
    // points have already been banked, so no current points remain to count.
    const clearing = !value.finished && completed.length > 0 && value.level === completed.at(-1)
      && value.progress === 1 && value.current === 0 && value.distanceMax === 0 && value.respawnRemaining === 0;
    if (!clearing) return null;
  }
  for (const key of ['coins', 'current', 'banked', 'distanceMax', 'progress', 'deaths', 'respawnRemaining']) {
    if (!nonnegative(value[key])) return null;
  }
  if (!Number.isSafeInteger(value.coins) || !Number.isSafeInteger(value.deaths) || value.progress > 1 || value.respawnRemaining > 3) return null;
  if (value.earnedCoins != null && (!nonnegative(value.earnedCoins) || !Number.isSafeInteger(value.earnedCoins))) return null;
  if (value.finished && !nonnegative(value.finishedAt)) return null;
  if (!value.finished && value.finishedAt != null) return null;
  if (value.checkpoint != null && (!value.checkpoint || typeof value.checkpoint !== 'object' || !LEVELS[value.level]?.checkpoints?.some(cp => cp.id === value.checkpoint.id))) return null;
  return summarizeRun(value, { finishedAt: value.finishedAt });
}

export function summaryScore(summary, settings = {}) {
  return summary.banked + summary.current + Math.floor(summary.distanceMax / 32) * (settings.distancePoints ?? 1);
}
