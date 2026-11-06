import { LevelRuntime } from './level-runtime.js';

/** Viewer-only helpers; live races continue to use the shared runtime directly. */
export class PlaytestRuntime extends LevelRuntime {
  constructor(document, options = {}) {
    super(document, options);
    this.godMode = options.godMode === true;
  }

  setGodMode(enabled) {
    this.godMode = enabled === true;
    if (this.godMode && this.deadRemainingMs > 0) this._respawn();
  }

  _hazardStep(states) {
    // Skipping the hazard channel also lets movement continue through hazards.
    return this.godMode ? false : super._hazardStep(states);
  }

  _roleContactStep(states) {
    // A harmless decoy must not interrupt coin/checkpoint/exit processing.
    return super._roleContactStep(this.godMode
      ? states.filter(entry => entry.state.gameplay?.role !== 'decoy-chest')
      : states);
  }

  _kill(cause) {
    if (!this.godMode) return super._kill(cause);
    if (cause?.placement?.id !== 'world-fall') return;
    const anchor = this.checkpoint || this.spawn;
    Object.assign(this.player, { x: anchor.x, y: anchor.y, vx: 0, vy: 0, grounded: false, standingId: null });
    this._previousStates.clear();
    this._coyoteMs = 0;
    this._jumpBufferRemainingMs = 0;
    this._emit({ type: 'god-mode-return' });
  }
}
