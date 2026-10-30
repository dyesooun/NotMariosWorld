/* Dependency-free original Web Audio soundtrack and effects. */
const NOTE = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392, A: 440, B: 493.88 };
const n = (name, beats, octave = 4) => ({ frequency: NOTE[name] * 2 ** (octave - 4), beats });
export const MUSIC_TRACKS = Object.freeze({
  lobby: Object.freeze({ id: 'lobby', tempo: 112, waveform: 'square', melody: [n('C', .5), n('E', .5), n('G', 1), n('E', 1), n('A', .5), n('G', .5), n('E', 1), n('D', 1), n('G', 2), n('F', 1), n('A', .5), n('C', .5, 5), n('B', .5), n('A', .5), n('G', 1), n('E', 1), n('D', 1), n('C', 2)], bass: [n('C', 4, 3), n('F', 4, 3), n('G', 4, 3), n('C', 4, 3)] }),
  forest: Object.freeze({ id: 'forest', tempo: 124, waveform: 'triangle', melody: [n('G', .5), n('B', .5), n('D', .5, 5), n('B', .5), n('A', 1), n('G', 1), n('E', 1), n('G', 1), n('A', 2), n('C', .5, 5), n('B', .5), n('A', 1), n('G', 1), n('B', .5), n('A', .5), n('G', 1), n('D', 1), n('G', 2)], bass: [n('G', 4, 3), n('E', 4, 3), n('C', 4, 3), n('D', 4, 3)] }),
  ocean: Object.freeze({ id: 'ocean', tempo: 92, waveform: 'sine', melody: [n('E', 1), n('G', 1), n('A', 2), n('G', 1), n('E', 1), n('D', 2), n('C', 1), n('E', 1), n('G', 2), n('B', 1), n('A', 1), n('G', 2)], bass: [n('C', 4, 3), n('A', 4, 3), n('F', 4, 3), n('G', 4, 3)] }),
  hell: Object.freeze({ id: 'hell', tempo: 146, waveform: 'sawtooth', melody: [n('E', .5), n('F', .5), n('E', 1), n('B', 1, 3), n('E', 1), n('G', 1), n('F', 1), n('E', 2), n('D', 1), n('C', .5), n('B', .5, 3), n('E', 1), n('F', 1), n('G', 1), n('F', 1), n('E', 2)], bass: [n('E', 4, 3), n('C', 4, 3), n('F', 4, 3), n('B', 4, 2)] }),
  results: Object.freeze({ id: 'results', tempo: 118, waveform: 'square', melody: [n('C', .5), n('E', .5), n('G', 1), n('C', 2, 5), n('B', 1), n('A', 1), n('G', 2), n('E', 1), n('G', 1), n('A', 1), n('G', 1), n('F', .5), n('E', .5), n('D', 1), n('C', 2)], bass: [n('C', 4, 3), n('G', 4, 3), n('F', 4, 3), n('C', 4, 3)] })
});
const CORE_EFFECTS = ['coin', 'death', 'clear', 'start', 'jump', 'finish', 'respawn', 'checkpoint', 'broadcast', 'countdown', 'teleport'];
const freezePalette = palette => Object.freeze(Object.fromEntries(Object.entries(palette).map(([name, effect]) => [name, Object.freeze({ ...effect, notes: Object.freeze(effect.notes) })])));

// Each level has its own small, original Web Audio vocabulary.  The musical
// tracks remain separate; these palettes only describe one-shot FX cues.
export const EFFECT_PALETTES = Object.freeze({
  lobby: freezePalette({
    coin: { notes: [740, 1110], step: .065, length: .15, type: 'square' }, death: { notes: [260, 190, 130], step: .11, length: .34, type: 'sawtooth' }, clear: { notes: [440, 554, 659], step: .1, length: .2, type: 'triangle' }, start: { notes: [262, 392, 523], step: .1, length: .22, type: 'square' }, jump: { notes: [294, 440], step: .065, length: .13, type: 'square' }, finish: { notes: [330, 440, 554, 659], step: .085, length: .28, type: 'triangle' }, respawn: { notes: [175, 220, 330], step: .11, length: .23, type: 'sine' }, checkpoint: { notes: [392, 523], step: .11, length: .2, type: 'triangle' }, broadcast: { notes: [330, 392], step: .12, length: .2, type: 'square' }, countdown: { notes: [220], step: 0, length: .13, type: 'square' }, teleport: { notes: [330, 660], step: .06, length: .18, type: 'sine', glide: [520, 980] }
  }),
  forest: freezePalette({
    coin: { notes: [587, 880, 1175], step: .085, length: .19, type: 'triangle' }, death: { notes: [294, 247, 196], step: .16, length: .46, type: 'triangle' }, clear: { notes: [392, 494, 659, 784], step: .12, length: .25, type: 'triangle' }, start: { notes: [262, 330, 392], step: .14, length: .29, type: 'triangle' }, jump: { notes: [330, 494], step: .09, length: .16, type: 'sine' }, finish: { notes: [392, 494, 587, 784], step: .11, length: .34, type: 'triangle' }, respawn: { notes: [220, 277, 370], step: .15, length: .3, type: 'sine' }, checkpoint: { notes: [523, 659, 784], step: .14, length: .24, type: 'triangle' }, broadcast: { notes: [392, 523, 659], step: .16, length: .25, type: 'sine' }, countdown: { notes: [262], step: 0, length: .18, type: 'triangle' }, teleport: { notes: [294, 440, 659], step: .09, length: .25, type: 'sine', glide: [360, 570, 840] }
  }),
  ocean: freezePalette({
    coin: { notes: [523, 784, 1047], step: .12, length: .3, type: 'sine', glide: [610, 900, 1200] }, death: { notes: [330, 247, 185], step: .2, length: .55, type: 'sine', glide: [270, 205, 150] }, clear: { notes: [392, 523, 659], step: .16, length: .38, type: 'sine', glide: [470, 620, 760] }, start: { notes: [262, 330, 440], step: .18, length: .4, type: 'sine', glide: [290, 370, 490] }, jump: { notes: [294, 392], step: .13, length: .24, type: 'sine', glide: [370, 500] }, finish: { notes: [330, 440, 554, 659], step: .15, length: .44, type: 'sine', glide: [390, 510, 640, 760] }, respawn: { notes: [196, 247, 330], step: .18, length: .38, type: 'sine', glide: [180, 230, 310] }, checkpoint: { notes: [440, 554, 740], step: .2, length: .4, type: 'sine', glide: [500, 620, 820] }, broadcast: { notes: [262, 392], step: .22, length: .35, type: 'sine', glide: [310, 470] }, countdown: { notes: [196], step: 0, length: .24, type: 'sine', glide: [170] }, teleport: { notes: [220, 330, 523], step: .14, length: .42, type: 'sine', glide: [300, 450, 740] }
  }),
  hell: freezePalette({
    coin: { notes: [180, 145, 110], step: .045, length: .11, type: 'sawtooth' }, death: { notes: [190, 145, 105, 72], step: .09, length: .28, type: 'sawtooth' }, clear: { notes: [220, 277, 185, 247], step: .07, length: .16, type: 'square' }, start: { notes: [110, 147, 196], step: .08, length: .18, type: 'sawtooth' }, jump: { notes: [147, 220], step: .045, length: .1, type: 'square' }, finish: { notes: [165, 220, 277, 330], step: .06, length: .2, type: 'sawtooth' }, respawn: { notes: [98, 123, 165], step: .08, length: .17, type: 'triangle' }, checkpoint: { notes: [147, 196, 247], step: .07, length: .16, type: 'square' }, broadcast: { notes: [110, 147], step: .08, length: .15, type: 'sawtooth' }, countdown: { notes: [82], step: 0, length: .1, type: 'square' }, teleport: { notes: [110, 165, 247], step: .045, length: .14, type: 'sawtooth', glide: [90, 140, 210] }
  }),
  results: freezePalette({
    coin: { notes: [659, 988], step: .075, length: .18, type: 'triangle' }, death: { notes: [247, 185, 123], step: .13, length: .38, type: 'triangle' }, clear: { notes: [523, 659, 784], step: .1, length: .24, type: 'triangle' }, start: { notes: [330, 440, 659], step: .11, length: .26, type: 'square' }, jump: { notes: [392, 587], step: .07, length: .14, type: 'triangle' }, finish: { notes: [523, 659, 784, 1047], step: .09, length: .32, type: 'triangle' }, respawn: { notes: [220, 330, 440], step: .12, length: .27, type: 'sine' }, checkpoint: { notes: [440, 659], step: .12, length: .22, type: 'triangle' }, broadcast: { notes: [392, 523], step: .14, length: .22, type: 'square' }, countdown: { notes: [247], step: 0, length: .15, type: 'triangle' }, teleport: { notes: [392, 784], step: .07, length: .22, type: 'sine', glide: [580, 1040] }
  })
});

export class GameAudio {
  constructor({ AudioContext, setInterval: timer = globalThis.setInterval, clearInterval: clearTimer = globalThis.clearInterval } = {}) {
    this._AudioContext = AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
    this._setInterval = timer.bind(globalThis);
    this._clearInterval = clearTimer.bind(globalThis);
    this.enabled = true;
    this.scene = 'lobby';
    this.hidden = false;
    this.context = null;
    this._master = this._musicGain = this._fxGain = null;
    this._timer = null;
    this._musicVoices = new Set();
    this._fxVoices = new Set();
    this._nextMelodyTime = this._nextBassTime = 0;
    this._noteIndex = this._bassIndex = 0;
    this._disposed = false;
  }
  async unlock() {
    if (this._disposed || !this._AudioContext || !this.enabled || this.hidden) return false;
    if (!this.context) {
      try {
        this.context = new this._AudioContext();
        this._master = this.context.createGain();
        this._musicGain = this.context.createGain();
        this._fxGain = this.context.createGain();
        this._musicGain.gain.value = .62;
        this._fxGain.gain.value = 1;
        this._master.gain.value = .72;
        this._musicGain.connect(this._master);
        this._fxGain.connect(this._master);
        this._master.connect(this.context.destination);
      } catch (_) {
        try { Promise.resolve(this.context?.close?.()).catch(() => {}); } catch (_) {}
        this.context = null;
        return false;
      }
    }
    try {
      if (this.context.state === 'suspended' && typeof this.context.resume === 'function') await this.context.resume();
    } catch (_) { return false; }
    if (this.context.state && this.context.state !== 'running') return false;
    this._startScheduler();
    return true;
  }
  setEnabled(enabled) { this.enabled = Boolean(enabled); const gain = this._master?.gain; const now = this.context?.currentTime || 0; if (gain) { gain.cancelScheduledValues?.(now); gain.setValueAtTime?.(this.enabled ? .72 : 0, now); gain.value = this.enabled ? .72 : 0; } if (!this.enabled) { this._stopScheduler(); this._cancelAllVoices(); } else if (this._canSchedule()) this._startScheduler(); return this.enabled; }
  setScene(scene) {
    if (!Object.hasOwn(MUSIC_TRACKS, scene)) return false;
    if (this.scene === scene) return true;
    this.scene = scene;
    this._cancelMusic();
    this._noteIndex = this._bassIndex = 0;
    this._nextMelodyTime = this._nextBassTime = this.context?.currentTime || 0;
    if (this._canSchedule()) { this._schedule(); this._startScheduler(); }
    return true;
  }
  playEffect(name, scene = this.scene) {
    const effect = EFFECT_PALETTES[scene]?.[name];
    if (!effect || !this._canSchedule()) return false;
    const start = this.context.currentTime + .005;
    effect.notes.forEach((frequency, index) => this._tone(frequency, start + index * effect.step, effect.length, effect.type, .18, 'fx', { frequencyEnd: effect.glide?.[index] }));
    return true;
  }
  setHidden(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) { this._stopScheduler(); this._cancelAllVoices(); return; }
    if (this.context && this.enabled) {
      try {
        const resume = this.context.state === 'suspended' && this.context.resume ? this.context.resume() : null;
        Promise.resolve(resume).then(() => { if (this._canSchedule()) this._startScheduler(); }).catch(() => {});
      } catch (_) { /* A later user gesture can retry playback. */ }
    }
  }
  dispose() { this._disposed = true; this._stopScheduler(); this._cancelAllVoices(); try { this._master?.disconnect(); this._musicGain?.disconnect(); this._fxGain?.disconnect(); } catch (_) {} try { Promise.resolve(this.context?.close?.()).catch(() => {}); } catch (_) {} this.context = null; }
  _canSchedule() { return Boolean(this.context && this.enabled && !this.hidden && (!this.context.state || this.context.state === 'running')); }
  _startScheduler() { if (!this._canSchedule() || this._timer !== null) return; const now = this.context.currentTime || 0; this._nextMelodyTime = Math.max(this._nextMelodyTime, now); this._nextBassTime = Math.max(this._nextBassTime, now); this._schedule(); this._timer = this._setInterval(() => this._schedule(), 25); }
  _stopScheduler() { if (this._timer !== null) { try { this._clearInterval(this._timer); } catch (_) {} this._timer = null; } }
  _schedule() {
    if (!this._canSchedule()) return;
    const now = this.context.currentTime || 0;
    if (this._nextMelodyTime < now) this._nextMelodyTime = now;
    if (this._nextBassTime < now) this._nextBassTime = now;
    const track = MUSIC_TRACKS[this.scene], beat = 60 / track.tempo;
    let guard = 0;
    while (this._nextMelodyTime < now + .15 && guard++ < 32) {
      const note = track.melody[this._noteIndex++ % track.melody.length];
      this._tone(note.frequency, this._nextMelodyTime, Math.min(note.beats * beat * .88, 1.2), track.waveform, track.waveform === 'sawtooth' ? .045 : .065);
      this._nextMelodyTime += note.beats * beat;
    }
    while (this._nextBassTime < now + .15 && guard++ < 48) {
      const note = track.bass[this._bassIndex++ % track.bass.length];
      this._tone(note.frequency, this._nextBassTime, Math.min(note.beats * beat * .86, 1.5), 'triangle', .035);
      this._nextBassTime += note.beats * beat;
    }
  }
  _tone(frequency, when, duration, type, volume, bus = 'music', options = {}) { try { const oscillator = this.context.createOscillator(); const gain = this.context.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime?.(frequency, when); oscillator.frequency.value = frequency; if (options.frequencyEnd != null) oscillator.frequency.linearRampToValueAtTime?.(options.frequencyEnd, when + duration * .8); gain.gain.setValueAtTime?.(0, when); gain.gain.linearRampToValueAtTime?.(volume, when + .008); gain.gain.exponentialRampToValueAtTime?.(.0001, when + duration); oscillator.connect(gain); gain.connect(bus === 'fx' ? (this._fxGain || this._master) : (this._musicGain || this._master)); const voices = bus === 'fx' ? this._fxVoices : this._musicVoices; const voice = { oscillator, gain }; voices.add(voice); oscillator.onended = () => { voices.delete(voice); try { oscillator.disconnect(); gain.disconnect(); } catch (_) {} }; oscillator.start(when); oscillator.stop(when + duration + .01); } catch (_) {} }
  _cancelMusic() { this._cancelSet(this._musicVoices); }
  _cancelAllVoices() { this._cancelMusic(); this._cancelSet(this._fxVoices); }
  _cancelSet(voices) { for (const voice of voices) { try { voice.oscillator.stop(); voice.oscillator.disconnect(); voice.gain.disconnect(); } catch (_) {} } voices.clear(); }
}
export default GameAudio;
