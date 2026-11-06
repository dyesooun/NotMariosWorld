import { createState, startRun, step, advanceStage, getJsonRuntime } from './engine.js';
import { LEVELS } from './levels.js';
import { summarizeRun } from './run-protocol.js';

// The browser owns the responsive simulation.  The server receives compact
// summaries and remains authoritative for room/quiz/power coordination.
export const FIXED_STEP_SECONDS = 1 / 60;
export const MAX_CATCHUP_STEPS = 5;
const REPORT_INTERVAL_MS = 100;

const copy = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export const runSummary = (state, options = {}) => summarizeRun(state, options);

function chestAt(state) {
  if (!state || state.deadUntil > 0 || state.finished || state.stageTransition) return null;
  const runtime = getJsonRuntime(state);
  const active = runtime?._roleContacts;
  if (active?.size) {
    const entry = runtime.getStates().find(item => active.has(item.placement.id) && item.state.gameplay?.role === 'power-chest');
    if (entry) return entry.state.gameplay.chestId || entry.placement.id;
  }
  const level = LEVELS[state?.level];
  if (level?.authored) return null;
  if (!level?.powerChests) return null;
  return level.powerChests.find(chest => {
    const avatar = { x: (state.x || 0) - 14, y: (state.y || 0) - 36, w: 28, h: 36 };
    const box = { x: chest.x, y: chest.y - 34, w: chest.w || 40, h: chest.h || 34 };
    return avatar.x < box.x + box.w && avatar.x + avatar.w > box.x && avatar.y < box.y + box.h && avatar.y + avatar.h > box.y;
  })?.id || null;
}

export class LocalRunRuntime {
  constructor({ state = null, profile = {}, settings = {}, roundId = null, runId = null,
    sendReport = null, onEvent = null, deferStageTransition = false, now = () => Date.now() } = {}) {
    this.state = state || createState(profile);
    this.settings = settings;
    this.roundId = roundId;
    this.runId = runId;
    this.sendReport = sendReport;
    this.onEvent = onEvent;
    this.deferStageTransition = deferStageTransition;
    this.now = now;
    this.input = { left: false, right: false, jump: false };
    this.accumulator = 0;
    this.paused = false;
    this.frozen = false;
    this.seq = 0;
    this.lastReportAt = -Infinity;
    this.lastProgressBucket = Math.floor((this.state.progress || 0) * 20);
    this.lastChestId = null;
    this.lastReport = null;
    this.history = [];
    this.finishedAt = null;
    this.lastLocalUpdateAt = this.now();
    this.historyBaseline = { at: this.lastLocalUpdateAt, summary: copy(runSummary(this.state)), chestId: null };
    this.pendingCoinDirtyAt = null;
    this.respawnWallDeadline = null;
    this.finalReportValue = null;
    this.finalCutoffAt = null;
    this.finalSummary = null;
    this.finalChestId = null;
  }

  reset({ profile = {}, settings = this.settings, roundId = null, runId = null, lobby = false } = {}) {
    this.settings = settings || {};
    this.roundId = roundId;
    this.runId = runId;
    this.state = createState({ ...profile, level: lobby ? 0 : undefined });
    this.input = { left: false, right: false, jump: false };
    this.accumulator = 0;
    this.paused = false;
    this.frozen = false;
    this.seq = 0;
    this.lastReportAt = -Infinity;
    this.lastProgressBucket = 0;
    this.lastChestId = null;
    this.lastReport = null;
    this.history = [];
    this.finishedAt = null;
    this.lastLocalUpdateAt = this.now();
    this.historyBaseline = { at: this.lastLocalUpdateAt, summary: copy(runSummary(this.state)), chestId: null };
    this.pendingCoinDirtyAt = null;
    this.respawnWallDeadline = null;
    this.finalReportValue = null;
    this.finalCutoffAt = null;
    this.finalSummary = null;
    this.finalChestId = null;
  }

  begin(worldOrder = this.settings.worldOrder) {
    startRun(this.state, { worldOrder });
    this.paused = false;
    if (this.state.started) this.report('start', true);
  }

  setInput(input = {}) {
    this.input = { left: !!input.left, right: !!input.right, jump: !!input.jump };
  }

  pause(value = true) { this.paused = !!value; if (value) this.setInput({}); }
  setFrozen(value = true) { this.frozen = !!value; if (value) { this.state.vx = 0; const runtime=getJsonRuntime(this.state); if(runtime)runtime.player.vx=0; } }

  advanceStage({ serverNow = this.now() } = {}) {
    if (this.paused || this.finalReportValue || !this.state.stageTransition) return false;
    const before = runSummary(this.state);
    if (!advanceStage(this.state)) return false;
    this.accumulator = 0;
    this.setInput({});
    this.lastProgressBucket = 0;
    this._events(before, [{ type: 'stageStarted', level: this.state.level }], serverNow);
    return true;
  }

  // Restore a wall-clock respawn that expired between local simulation slices.
  advanceLifecycle(deltaSeconds, { serverNow = this.now() } = {}) {
    const delta = Math.max(0, Number(deltaSeconds) || 0);
    if (!delta || this.state.finished) return;
    this.state.elapsed += delta;
    if (this.state.deadUntil > 0) {
      this.state.respawnRemaining = Math.max(0, this.state.deadUntil - this.state.elapsed);
      if (!this.state.respawnRemaining) {
        step(this.state, {}, 0, this.settings);
        this.onEvent?.({ type: 'respawn' }, this.state);
        this._recordLocalSummary(serverNow);
        this.report('respawn', true, serverNow);
      }
    }
  }

  tick(deltaSeconds, { serverNow = this.now() } = {}) {
    if (this.paused || this.state.finished) return [];
    this.accumulator += Math.max(0, Math.min(Number(deltaSeconds) || 0, .25));
    if (this.state.deadUntil > 0 && this.respawnWallDeadline != null && serverNow >= this.respawnWallDeadline) {
      this.advanceLifecycle(Math.max(0, this.state.deadUntil - this.state.elapsed), { serverNow });
      this.respawnWallDeadline = null;
    }
    const events = [];
    const plannedSteps = Math.min(Math.floor(this.accumulator / FIXED_STEP_SECONDS), MAX_CATCHUP_STEPS);
    const unconsumed = this.accumulator - plannedSteps * FIXED_STEP_SECONDS;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP_SECONDS && steps++ < MAX_CATCHUP_STEPS) {
      const stepAt = serverNow - (unconsumed + (plannedSteps - steps) * FIXED_STEP_SECONDS) * 1000;
      const before = runSummary(this.state);
      const result = step(this.state, this.frozen ? {} : this.input, FIXED_STEP_SECONDS, { ...this.settings, deferStageTransition: this.deferStageTransition });
      events.push(...result);
      this.accumulator -= FIXED_STEP_SECONDS;
      this._events(before, result, stepAt);
    }
    if (steps >= MAX_CATCHUP_STEPS) this.accumulator = 0;
    this._chest(serverNow);
    if (this.pendingCoinDirtyAt != null && serverNow - this.pendingCoinDirtyAt >= REPORT_INTERVAL_MS) {
      this.pendingCoinDirtyAt = null;
      this.report('coin', true, serverNow);
    }
    return events;
  }

  _events(before, events, at) {
    const state = this.state;
    for (const event of events) {
      if (event.type === 'finished') this.finishedAt = at;
      if (event.type === 'death') this.respawnWallDeadline = at + (event.respawnIn || 3) * 1000;
      this.onEvent?.(event, state);
    }
    const after = runSummary(state);
    const bucket = Math.floor(after.progress * 20);
    const changed = after.coins !== before.coins;
    const eventType = events[0]?.type;
    const respawned = before.respawnRemaining > 0 && after.respawnRemaining <= 0;
    if (changed && after.coins > before.coins) this.onEvent?.({ type: 'coin', count: after.coins - before.coins }, state);
    if (respawned) this.onEvent?.({ type: 'respawn' }, state);
    const previousChest=this.lastChestId;
    this._chest(at, false);
    this._recordLocalSummary(at);
    if (eventType || respawned || this.lastChestId!==previousChest || after.deaths !== before.deaths || after.checkpoint?.id !== before.checkpoint?.id || after.level !== before.level || (after.finished && !before.finished)) {
      this.lastProgressBucket = bucket;
      this.report(eventType || 'state', true, at);
    } else if (bucket > this.lastProgressBucket) {
      this.lastProgressBucket = bucket;
      this.report('progress', true, at);
    } else if (changed) {
      this.pendingCoinDirtyAt ??= at;
      if (at - this.pendingCoinDirtyAt >= REPORT_INTERVAL_MS) { this.pendingCoinDirtyAt = null; this.report('coin', true, at); }
    }
  }

  _recordLocalSummary(at) {
    this.lastLocalUpdateAt = at;
    const summary = runSummary(this.state, { finishedAt: this.finishedAt });
    const prior = this.history.at(-1);
    if (!prior || JSON.stringify(prior.summary) !== JSON.stringify(summary) || prior.chestId !== this.lastChestId) {
      this.history.push({ at, summary: copy(summary), chestId: this.lastChestId });
      while (this.history.length > 1 && at - this.history[1].at > 10000) this.history.shift();
    }
  }

  _chest(at, emit = true) {
    const chestId = chestAt(this.state);
    if (chestId === this.lastChestId) return;
    this.lastChestId = chestId;
    if (emit) this.report(chestId ? 'chest-enter' : 'chest-leave', true, at, chestId);
  }

  report(reason = 'state', force = false, at = this.now(), chestId = this.lastChestId) {
    if (!this.state.started || !this.runId || !this.roundId) return null;
    if (!force && at - this.lastReportAt < REPORT_INTERVAL_MS) return null;
    const summary = runSummary(this.state, { finishedAt: this.finishedAt });
    const report = { roundId: this.roundId, runId: this.runId, seq: ++this.seq, at, summary, chestId: chestId || null, final: false };
    this.lastReportAt = at;
    this.lastReport = report;
    this._recordLocalSummary(at);
    this.sendReport?.(report);
    return report;
  }

  finalReport(cutoffAt = this.now(), { retry = false } = {}) {
    if (this.finalReportValue && !retry) return this.finalReportValue;
    if (this.finalReportValue && retry) {
      const report={...this.finalReportValue,seq:++this.seq};
      this.lastReport=report;this.finalReportValue=report;this.sendReport?.(report);return report;
    }
    const prior = [...this.history].reverse().find(entry => entry.at <= cutoffAt) || this.historyBaseline;
    const summary = this.finalSummary || (cutoffAt >= this.lastLocalUpdateAt ? runSummary(this.state, { finishedAt: this.finishedAt }) : prior.summary);
    const chestId = this.finalChestId ?? (cutoffAt >= this.lastLocalUpdateAt ? this.lastChestId : prior.chestId);
    const report = { roundId: this.roundId, runId: this.runId, seq: ++this.seq, at: Math.min(cutoffAt, this.now()), summary, chestId, final: true };
    this.lastReport = report;
    this.finalReportValue = report;
    this.finalCutoffAt = cutoffAt;
    this.finalSummary = summary;
    this.finalChestId = chestId;
    this.sendReport?.(report);
    return report;
  }

  snapshot() { return copy(this.state); }
}

export function createLocalRun(options) { return new LocalRunRuntime(options); }
