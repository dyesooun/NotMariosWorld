/* Shipped WAV music; FX palettes remain procedural below. */
import { MUSIC_TRACKS, VICTORY_TRACKS } from './audio-tracks.js';
export { MUSIC_TRACKS, VICTORY_TRACKS } from './audio-tracks.js';
const freezePalette = palette => Object.freeze(Object.fromEntries(Object.entries(palette).map(([name, effect]) => [name, Object.freeze({ ...effect, notes: Object.freeze(effect.notes) })])));

// Each level has its own small, original Web Audio vocabulary.  The musical
// tracks remain separate; these palettes only describe one-shot FX cues.
export const EFFECT_PALETTES = Object.freeze({
  lobby: freezePalette({
    coin: { notes: [740, 1110], step: .065, length: .15, type: 'square' }, death: { notes: [260, 190, 130], step: .11, length: .34, type: 'sawtooth' }, clear: { notes: [440, 554, 659], step: .1, length: .2, type: 'triangle' }, start: { notes: [262, 392, 523], step: .1, length: .22, type: 'square' }, jump: { notes: [294, 440], step: .065, length: .13, type: 'square' }, finish: { notes: [330, 440, 554, 659], step: .085, length: .28, type: 'triangle' }, respawn: { notes: [175, 220, 330], step: .11, length: .23, type: 'sine' }, checkpoint: { notes: [392, 523], step: .11, length: .2, type: 'triangle' }, broadcast: { notes: [330, 392], step: .12, length: .2, type: 'square' }, countdown: { notes: [220], step: 0, length: .13, type: 'square' }, teleport: { notes: [330, 660], step: .06, length: .18, type: 'sine', glide: [520, 980] }, stomp: { notes: [440, 220], step: .055, length: .12, type: 'square' }
  }),
  forest: freezePalette({
    coin: { notes: [587, 880, 1175], step: .085, length: .19, type: 'triangle' }, death: { notes: [294, 247, 196], step: .16, length: .46, type: 'triangle' }, clear: { notes: [392, 494, 659, 784], step: .12, length: .25, type: 'triangle' }, start: { notes: [262, 330, 392], step: .14, length: .29, type: 'triangle' }, jump: { notes: [330, 494], step: .09, length: .16, type: 'sine' }, finish: { notes: [392, 494, 587, 784], step: .11, length: .34, type: 'triangle' }, respawn: { notes: [220, 277, 370], step: .15, length: .3, type: 'sine' }, checkpoint: { notes: [523, 659, 784], step: .14, length: .24, type: 'triangle' }, broadcast: { notes: [392, 523, 659], step: .16, length: .25, type: 'sine' }, countdown: { notes: [262], step: 0, length: .18, type: 'triangle' }, teleport: { notes: [294, 440, 659], step: .09, length: .25, type: 'sine', glide: [360, 570, 840] }, stomp: { notes: [494, 262], step: .06, length: .14, type: 'triangle' }
  }),
  ocean: freezePalette({
    coin: { notes: [523, 784, 1047], step: .12, length: .3, type: 'sine', glide: [610, 900, 1200] }, death: { notes: [330, 247, 185], step: .2, length: .55, type: 'sine', glide: [270, 205, 150] }, clear: { notes: [392, 523, 659], step: .16, length: .38, type: 'sine', glide: [470, 620, 760] }, start: { notes: [262, 330, 440], step: .18, length: .4, type: 'sine', glide: [290, 370, 490] }, jump: { notes: [294, 392], step: .13, length: .24, type: 'sine', glide: [370, 500] }, finish: { notes: [330, 440, 554, 659], step: .15, length: .44, type: 'sine', glide: [390, 510, 640, 760] }, respawn: { notes: [196, 247, 330], step: .18, length: .38, type: 'sine', glide: [180, 230, 310] }, checkpoint: { notes: [440, 554, 740], step: .2, length: .4, type: 'sine', glide: [500, 620, 820] }, broadcast: { notes: [262, 392], step: .22, length: .35, type: 'sine', glide: [310, 470] }, countdown: { notes: [196], step: 0, length: .24, type: 'sine', glide: [170] }, teleport: { notes: [220, 330, 523], step: .14, length: .42, type: 'sine', glide: [300, 450, 740] }, stomp: { notes: [440, 247], step: .07, length: .2, type: 'sine', glide: [520, 300] }
  }),
  hell: freezePalette({
    coin: { notes: [180, 145, 110], step: .045, length: .11, type: 'sawtooth' }, death: { notes: [190, 145, 105, 72], step: .09, length: .28, type: 'sawtooth' }, clear: { notes: [220, 277, 185, 247], step: .07, length: .16, type: 'square' }, start: { notes: [110, 147, 196], step: .08, length: .18, type: 'sawtooth' }, jump: { notes: [147, 220], step: .045, length: .1, type: 'square' }, finish: { notes: [165, 220, 277, 330], step: .06, length: .2, type: 'sawtooth' }, respawn: { notes: [98, 123, 165], step: .08, length: .17, type: 'triangle' }, checkpoint: { notes: [147, 196, 247], step: .07, length: .16, type: 'square' }, broadcast: { notes: [110, 147], step: .08, length: .15, type: 'sawtooth' }, countdown: { notes: [82], step: 0, length: .1, type: 'square' }, teleport: { notes: [110, 165, 247], step: .045, length: .14, type: 'sawtooth', glide: [90, 140, 210] }, stomp: { notes: [196, 98], step: .05, length: .11, type: 'square' }
  }),
  results: freezePalette({
    coin: { notes: [659, 988], step: .075, length: .18, type: 'triangle' }, death: { notes: [247, 185, 123], step: .13, length: .38, type: 'triangle' }, clear: { notes: [523, 659, 784], step: .1, length: .24, type: 'triangle' }, start: { notes: [330, 440, 659], step: .11, length: .26, type: 'square' }, jump: { notes: [392, 587], step: .07, length: .14, type: 'triangle' }, finish: { notes: [523, 659, 784, 1047], step: .09, length: .32, type: 'triangle' }, respawn: { notes: [220, 330, 440], step: .12, length: .27, type: 'sine' }, checkpoint: { notes: [440, 659], step: .12, length: .22, type: 'triangle' }, broadcast: { notes: [392, 523], step: .14, length: .22, type: 'square' }, countdown: { notes: [247], step: 0, length: .15, type: 'triangle' }, teleport: { notes: [392, 784], step: .07, length: .22, type: 'sine', glide: [580, 1040] }, stomp: { notes: [523, 294], step: .06, length: .13, type: 'triangle' }
  })
});

export class GameAudio {
  constructor({ AudioContext, fetch: fetchImpl = globalThis.fetch, setTimeout: timeout = globalThis.setTimeout, clearTimeout: clearTimeoutImpl = globalThis.clearTimeout, clock = () => Date.now() } = {}) {
    this._AudioContext = AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
    this._fetch = typeof fetchImpl === 'function' ? fetchImpl.bind(globalThis) : fetchImpl; this._setTimeout = timeout.bind(globalThis); this._clearTimeout = clearTimeoutImpl.bind(globalThis); this._clock = clock;
    this.enabled = true; this.scene = 'lobby'; this.hidden = false; this.context = null; this._master = this._musicGain = this._fxGain = null;
    this._musicSource = null; this._victorySource = null; this._victoryTimer = null; this._victoryToken = 0; this._victoryDeadline = 0; this._victoryRemaining = 0; this._victoryScene = null; this._victoryHasStarted = false; this._victorySilent = false;
    this._bufferPromises = new Map(); this._fxVoices = new Set(); this._disposed = false;
  }
  async unlock() {
    if (this._disposed || !this._AudioContext || !this.enabled || this.hidden) return false;
    if (!this.context) try {
      this.context = new this._AudioContext(); this._master = this.context.createGain(); this._musicGain = this.context.createGain(); this._fxGain = this.context.createGain();
      this._musicGain.gain.value = .62; this._fxGain.gain.value = 1; this._master.gain.value = .72; this._musicGain.connect(this._master); this._fxGain.connect(this._master); this._master.connect(this.context.destination);
    } catch (_) { this.context = null; return false; }
    try { if (this.context.state === 'suspended' && this.context.resume) await this.context.resume(); } catch (_) { return false; }
    if (this._disposed || !this.enabled || this.hidden || (this.context.state && this.context.state !== 'running')) return false;
    this._startMusic(this.scene); this._resumeVictory(); this._preloadScene(this.scene); return true;
  }
  setEnabled(enabled) { this.enabled = Boolean(enabled); const gain = this._master?.gain; if (gain) { gain.value = this.enabled ? .72 : 0; } if (!this.enabled) { this._stopMusic(); this._pauseVictory(); this._cancelSet(this._fxVoices); } else if (this._canPlay()) { this._startMusic(this.scene); this._resumeVictory(); } return this.enabled; }
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
  playEffect(name, scene = this.scene) { const effect = EFFECT_PALETTES[scene]?.[name]; if (!effect || !this._canPlay()) return false; const start = this.context.currentTime + .005; effect.notes.forEach((frequency, index) => this._tone(frequency, start + index * effect.step, effect.length, effect.type, .18, { frequencyEnd: effect.glide?.[index] })); return true; }
  setHidden(hidden) { this.hidden = Boolean(hidden); if (this.hidden) { this._stopMusic(); this._pauseVictory(); this._cancelSet(this._fxVoices); } else if (this.context && this.enabled) { Promise.resolve(this.context.state === 'suspended' && this.context.resume ? this.context.resume() : null).then(() => { if (this._canPlay()) { this._startMusic(this.scene); this._resumeVictory(); } }).catch(() => {}); } }
  dispose() { this._disposed = true; this.cancelVictory(); this._stopMusic(); this._cancelSet(this._fxVoices); try { this._master?.disconnect(); this._musicGain?.disconnect(); this._fxGain?.disconnect(); Promise.resolve(this.context?.close?.()).catch(() => {}); } catch (_) {} this.context = null; }
  _canPlay() { return Boolean(!this._disposed && this.context && this.enabled && !this.hidden && (!this.context.state || this.context.state === 'running')); }
  _preloadScene(scene) { const loop = MUSIC_TRACKS[scene], victory = VICTORY_TRACKS[scene]; return Promise.all([this._loadBuffer(loop?.src), victory && this._loadBuffer(victory.src)]); }
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
  _tone(frequency, when, duration, type, volume, options = {}) { try { const oscillator = this.context.createOscillator(), gain = this.context.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime?.(frequency, when); oscillator.frequency.value = frequency; if (options.frequencyEnd != null) oscillator.frequency.linearRampToValueAtTime?.(options.frequencyEnd, when + duration * .8); gain.gain.setValueAtTime?.(0, when); gain.gain.linearRampToValueAtTime?.(volume, when + .008); gain.gain.exponentialRampToValueAtTime?.(.0001, when + duration); oscillator.connect(gain); gain.connect(this._fxGain || this._master); const voice = { oscillator, gain }; this._fxVoices.add(voice); oscillator.onended = () => { this._fxVoices.delete(voice); try { oscillator.disconnect(); gain.disconnect(); } catch (_) {} }; oscillator.start(when); oscillator.stop(when + duration + .01); } catch (_) {} }
  _cancelSet(voices) { for (const voice of voices) { try { voice.oscillator.stop(); voice.oscillator.disconnect(); voice.gain.disconnect(); } catch (_) {} } voices.clear(); }
}
export default GameAudio;
