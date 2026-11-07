/* Shipped WAV music and shared one-shot sound effects. */
import { MUSIC_TRACKS, VICTORY_TRACKS } from './audio-tracks.js';
export { MUSIC_TRACKS, VICTORY_TRACKS } from './audio-tracks.js';
export const EFFECT_SOUNDS = Object.freeze({ coin: 'coin_pickup', death: 'death', clear: 'score_popup', start: 'countdown_go', jump: 'jump', finish: 'score_popup', respawn: 'respawn', checkpoint: 'checkpoint', broadcast: 'ui_select', countdown: 'countdown_tick', teleport: 'power_activate', stomp: 'enemy_defeat', powerup: 'powerup' });
export const EFFECT_SFX = Object.freeze(Object.fromEntries([...new Set(Object.values(EFFECT_SOUNDS))].map(name => [name, `/assets/audio/sfx/${name}.wav`])));

export class GameAudio {
  constructor({ AudioContext, fetch: fetchImpl = globalThis.fetch, setTimeout: timeout = globalThis.setTimeout, clearTimeout: clearTimeoutImpl = globalThis.clearTimeout, clock = () => Date.now() } = {}) {
    this._AudioContext = AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
    this._fetch = typeof fetchImpl === 'function' ? fetchImpl.bind(globalThis) : fetchImpl; this._setTimeout = timeout.bind(globalThis); this._clearTimeout = clearTimeoutImpl.bind(globalThis); this._clock = clock;
    this.enabled = true; this.scene = 'lobby'; this.hidden = false; this.context = null; this._master = this._musicGain = this._fxGain = null;
    this._musicSource = null; this._victorySource = null; this._victoryTimer = null; this._victoryToken = 0; this._victoryDeadline = 0; this._victoryRemaining = 0; this._victoryScene = null; this._victoryHasStarted = false; this._victorySilent = false;
    this._bufferPromises = new Map(); this._fxVoices = new Set(); this._fxToken = 0; this._disposed = false;
  }
  async unlock() {
    if (this._disposed || !this._AudioContext || !this.enabled || this.hidden) return false;
    if (!this.context) try {
      this.context = new this._AudioContext(); this._master = this.context.createGain(); this._musicGain = this.context.createGain(); this._fxGain = this.context.createGain();
      this._musicGain.gain.value = .62; this._fxGain.gain.value = .3; this._master.gain.value = .72; this._musicGain.connect(this._master); this._fxGain.connect(this._master); this._master.connect(this.context.destination);
    } catch (_) { this.context = null; return false; }
    try { if (this.context.state === 'suspended' && this.context.resume) await this.context.resume(); } catch (_) { return false; }
    if (this._disposed || !this.enabled || this.hidden || (this.context.state && this.context.state !== 'running')) return false;
    this._startMusic(this.scene); this._resumeVictory(); this._preloadScene(this.scene); this._preloadEffects(); return true;
  }
  setEnabled(enabled) { this.enabled = Boolean(enabled); const gain = this._master?.gain; if (gain) { gain.value = this.enabled ? .72 : 0; } if (!this.enabled) { this._fxToken++; this._stopMusic(); this._pauseVictory(); this._cancelSet(this._fxVoices); } else if (this._canPlay()) { this._startMusic(this.scene); this._resumeVictory(); this._preloadEffects(); } return this.enabled; }
  setScene(scene) {
    if (!Object.hasOwn(MUSIC_TRACKS, scene)) return false;
    if (this.scene === scene) { if (!this._victoryResolve && !this._musicSource) this._startMusic(scene); return true; }
    this.scene = scene; this.cancelVictory(); this._stopMusic(); this._startMusic(scene); this._preloadScene(scene); return true;
  }
  playVictory(scene = this.scene) {
    const track = VICTORY_TRACKS[scene]; if (!track || this._disposed) return Promise.resolve(false);
    this.cancelVictory(); this._stopMusic(); const token = ++this._victoryToken; this._victoryScene = scene; this._victoryDeadline = this._clock() + track.durationSeconds * 1000; this._victoryRemaining = track.durationSeconds; this._victoryHasStarted = false; this._victorySilent = !this._canPlay();
    const done = new Promise(resolve => { this._victoryResolve = resolve; });
    this._loadBuffer(track.src).then(() => { if (token === this._victoryToken) this._startVictorySource(track, token); }).catch(() => { if (token === this._victoryToken) this._armVictoryFallback(token); });
    this._armVictoryFallback(token); return done;
  }
  cancelVictory() { if (!this._victoryResolve && !this._victorySource && this._victoryTimer === null) return; const resolve = this._victoryResolve; this._victoryToken++; this._stopVictorySource(); this._clearVictoryTimer(); this._victoryResolve = null; this._victoryRemaining = 0; this._victoryDeadline = 0; this._victoryScene = null; resolve?.(false); }
  playEffect(name, _scene = this.scene) {
    const stem = EFFECT_SOUNDS[name] || (Object.hasOwn(EFFECT_SFX, name) ? name : null);
    const src = stem && EFFECT_SFX[stem];
    if (!src || !this._canPlay()) return false;
    const token = this._fxToken;
    this._loadBuffer(src).then(buffer => {
      if (!buffer || token !== this._fxToken || !this._canPlay()) return;
      let source;
      try {
        source = this.context.createBufferSource(); source.buffer = buffer;
        source.connect(this._fxGain || this._master); this._fxVoices.add(source);
        source.onended = () => { this._fxVoices.delete(source); try { source.disconnect?.(); } catch (_) {} };
        source.start();
      } catch (_) { this._fxVoices.delete(source); try { source?.disconnect?.(); } catch (_) {} }
    });
    return true;
  }
  setHidden(hidden) { this.hidden = Boolean(hidden); if (this.hidden) { this._fxToken++; this._stopMusic(); this._pauseVictory(); this._cancelSet(this._fxVoices); } else if (this.context && this.enabled) { Promise.resolve(this.context.state === 'suspended' && this.context.resume ? this.context.resume() : null).then(() => { if (this._canPlay()) { this._startMusic(this.scene); this._resumeVictory(); this._preloadEffects(); } }).catch(() => {}); } }
  dispose() { this._disposed = true; this._fxToken++; this.cancelVictory(); this._stopMusic(); this._cancelSet(this._fxVoices); try { this._master?.disconnect(); this._musicGain?.disconnect(); this._fxGain?.disconnect(); Promise.resolve(this.context?.close?.()).catch(() => {}); } catch (_) {} this.context = null; }
  _canPlay() { return Boolean(!this._disposed && this.context && this.enabled && !this.hidden && (!this.context.state || this.context.state === 'running')); }
  _preloadScene(scene) { const loop = MUSIC_TRACKS[scene], victory = VICTORY_TRACKS[scene]; return Promise.all([this._loadBuffer(loop?.src), victory && this._loadBuffer(victory.src)]); }
  _preloadEffects() { return Promise.all(Object.values(EFFECT_SFX).map(src => this._loadBuffer(src))); }
  _loadBuffer(src) { const context = this.context; if (!src || !context || !this._fetch || !context.decodeAudioData) return Promise.resolve(null); if (!this._bufferPromises.has(src)) this._bufferPromises.set(src, Promise.resolve().then(() => this._fetch(src)).then(r => { if (!r?.ok && r?.ok !== undefined) throw new Error('audio fetch failed'); return r.arrayBuffer(); }).then(data => context.decodeAudioData(data)).catch(() => null)); return this._bufferPromises.get(src); }
  _startMusic(scene) { if (!this._canPlay() || this._musicSource || this._victorySource || this._victoryRemaining > 0) return; const track = MUSIC_TRACKS[scene]; this._loadBuffer(track.src).then(buffer => { if (!buffer || this.scene !== scene || !this._canPlay() || this._musicSource || this._victorySource || this._victoryRemaining > 0) return; try { const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(this._musicGain || this._master); source.start(); this._musicSource = source; source.onended = () => { if (this._musicSource === source) this._musicSource = null; }; } catch (_) {} }); }
  _stopMusic() { const source = this._musicSource; this._musicSource = null; if (source) try { source.stop(); source.disconnect?.(); } catch (_) {} }
  _startVictorySource(track, token) {
    if (!track || !this._canPlay() || token !== this._victoryToken || this._victorySource || !this._victoryResolve) return;
    this._loadBuffer(track.src).then(buffer => {
      if (token !== this._victoryToken || this._victorySource || !this._victoryResolve || !buffer || !this._canPlay()) return;
      const remaining = Math.max(0, this._victoryDeadline - this._clock()) / 1000;
      if (!remaining) { this._finishVictory(token); return; }
      // Allow a first, audible cue its entire duration after decoding. Once
      // muted/hidden, the silent timeline owns the remaining duration instead.
      const playFullCue = !this._victoryHasStarted && !this._victorySilent;
      this._victoryRemaining = playFullCue ? track.durationSeconds : remaining;
      let source;
      try {
        source = this.context.createBufferSource(); source.buffer = buffer;
        source.connect(this._musicGain || this._master);
        source.onended = () => { if (this._victorySource === source) this._finishVictory(token); };
        source.start(0, Math.max(0, track.durationSeconds - this._victoryRemaining));
        this._victorySource = source;
        if (playFullCue) this._victoryDeadline = this._clock() + track.durationSeconds * 1000;
        this._victoryHasStarted = true;
        this._armVictoryFallback(token);
      } catch (_) { try { source?.disconnect(); } catch (_) {} }
    });
  }
  _pauseVictory() { if (!this._victoryResolve) return; this._victorySilent = true; this._victoryRemaining = Math.max(0, this._victoryDeadline - this._clock()) / 1000; this._stopVictorySource(); this._clearVictoryTimer(); this._armVictoryFallback(this._victoryToken); }
  _resumeVictory() { if (!this._victoryResolve) return; this._victoryRemaining = Math.max(0, this._victoryDeadline - this._clock()) / 1000; if (this._victoryRemaining <= 0) return this._finishVictory(this._victoryToken); this._startVictorySource(VICTORY_TRACKS[this._victoryScene], this._victoryToken); this._armVictoryFallback(this._victoryToken); }
  _armVictoryFallback(token) { this._clearVictoryTimer(); if (!this._victoryResolve) return; const delay = Math.max(0, this._victoryDeadline - this._clock()); if (delay <= 0) return this._finishVictory(token); this._victoryTimer = this._setTimeout(() => this._finishVictory(token), delay + (this._victorySource ? 250 : 0)); }
  _finishVictory(token) { if (token !== this._victoryToken || !this._victoryResolve) return; this._stopVictorySource(); this._clearVictoryTimer(); this._victoryRemaining = 0; this._victoryDeadline = 0; const resolve = this._victoryResolve; this._victoryResolve = null; this._victoryToken++; resolve(true); }
  _stopVictorySource() { const source = this._victorySource; this._victorySource = null; if (source) try { source.onended = null; source.stop(); source.disconnect?.(); } catch (_) {} }
  _clearVictoryTimer() { if (this._victoryTimer !== null) { this._clearTimeout(this._victoryTimer); this._victoryTimer = null; } }
  _cancelSet(voices) { for (const voice of voices) { try { voice.onended = null; voice.stop(); voice.disconnect?.(); } catch (_) {} } voices.clear(); }
}
export default GameAudio;
