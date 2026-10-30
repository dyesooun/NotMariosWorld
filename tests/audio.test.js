import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, MUSIC_TRACKS, EFFECT_PALETTES } from '../public/game/audio.js';
class Param { constructor(value = 0) { this.value = value; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
class FakeNode { constructor() { this.gain = new Param(); this.frequency = new Param(); this.startedAt = null; this.stopAt = null; this.stopped = false; this.disconnected = false; } connect() {} disconnect() { this.disconnected = true; } start(t) { this.startedAt = t; } stop(t) { if (t === undefined) this.stopped = true; else this.stopAt = t; } advanceTo(t) { if (this.stopAt !== null && t >= this.stopAt) { this.stopped = true; this.onended?.(); } } }
class FakeContext { static instances = []; constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = new FakeNode(); this.oscillators = []; this.resumeFailures = 0; FakeContext.instances.push(this); } createGain() { return new FakeNode(); } createOscillator() { const n = new FakeNode(); this.oscillators.push(n); return n; } async resume() { if (this.resumeFailures-- > 0) throw new Error('blocked'); this.state = 'running'; } close() { this.state = 'closed'; } advanceTo(t) { this.currentTime = t; this.oscillators.forEach(n => n.advanceTo(t)); } }
function timers() { const callbacks = new Map(); let id = 0; return { setInterval(fn) { callbacks.set(++id, fn); return id; }, clearInterval(i) { callbacks.delete(i); }, tick() { callbacks.forEach(fn => fn()); }, get size() { return callbacks.size; } }; }

test('default enabled, lazy unlock, distinct 16-beat tracks', async () => { const t = timers(); const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) }); assert.equal(a.enabled, true); assert.equal(FakeContext.instances.length, 0); assert.deepEqual(Object.keys(MUSIC_TRACKS), ['lobby', 'forest', 'ocean', 'hell', 'results']); assert.ok(Object.values(MUSIC_TRACKS).every(x => x.melody.reduce((s, n) => s + n.beats, 0) >= 16)); assert.equal(await a.unlock(), true); assert.ok(a.context.oscillators.length > 0); a.dispose(); });
test('repeated unlock does not stack; scene switch stops music but preserves FX', async () => { const t = timers(); const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) }); await a.unlock(); const c = a.context; const oldMusic = [...a._musicVoices]; assert.equal(a.playEffect('clear'), true); const fx = [...a._fxVoices]; await a.unlock(); assert.equal(t.size, 1); a.setScene('forest'); oldMusic.forEach(v => assert.equal(v.oscillator.stopped, true)); fx.forEach(v => assert.equal(v.oscillator.stopped, false)); a.dispose(); });
test('mute cancels future music and FX; unmute resumes', async () => { const t = timers(); const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) }); await a.unlock(); a.playEffect('coin'); const c = a.context; a.setEnabled(false); assert.equal(t.size, 0); assert.ok(c.oscillators.every(n => n.stopped)); assert.equal(a.playEffect('coin'), false); a.setEnabled(true); assert.equal(t.size, 1); a.dispose(); });
test('hidden pauses and rejected resume can retry on unlock', async () => { const t = timers(); const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) }); await a.unlock(); const c = a.context; a.setHidden(true); assert.equal(t.size, 0); c.state = 'suspended'; c.resumeFailures = 1; a.setHidden(false); await Promise.resolve(); await Promise.resolve(); assert.equal(t.size, 0); assert.equal(await a.unlock(), true); assert.equal(t.size, 1); a.dispose(); });
test('throttled scheduler rebases without starting notes in the past', async () => { const t = timers(); const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) }); await a.unlock(); const c = a.context; const before = c.oscillators.length; c.advanceTo(10); t.tick(); assert.ok(c.oscillators.slice(before).every(n => n.startedAt >= 10)); a.dispose(); });

test('music keeps looping and a muted scene change starts the new arrangement', async () => {
  const t = timers();
  const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) });
  await a.unlock();
  for (let i = 1; i <= 1000; i++) { a.context.advanceTo(i * .025); t.tick(); }
  assert.ok(a._noteIndex > MUSIC_TRACKS.lobby.melody.length * 2);
  assert.ok(a._bassIndex > MUSIC_TRACKS.lobby.bass.length * 2);
  a.setEnabled(false);
  a.setScene('ocean');
  const count = a.context.oscillators.length;
  a.setEnabled(true);
  assert.equal(a.context.oscillators[count].frequency.value, MUSIC_TRACKS.ocean.melody[0].frequency);
  assert.equal(t.size, 1);
  a.dispose();
});

test('hidden tabs cancel effects too, and muting before unlock creates no context', async () => {
  const t = timers();
  const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) });
  a.setEnabled(false);
  assert.equal(await a.unlock(), false);
  assert.equal(a.context, null);
  a.setEnabled(true);
  await a.unlock();
  a.playEffect('finish');
  const effects = [...a._fxVoices];
  assert.ok(effects.length > 0);
  a.setHidden(true);
  assert.ok(effects.every(voice => voice.oscillator.stopped && voice.oscillator.disconnected));
  assert.equal(a.playEffect('coin'), false);
  a.dispose();
});

test('browser timer functions receive their required global receiver', async () => {
  const a = new GameAudio({
    AudioContext: FakeContext,
    setInterval() { assert.equal(this, globalThis); return 99; },
    clearInterval(id) { assert.equal(this, globalThis); assert.equal(id, 99); },
  });
  assert.equal(await a.unlock(), true);
  a.setEnabled(false);
  a.dispose();
});

test('each theme has a different melody and both parts loop on the same bar', () => {
  const tracks = Object.values(MUSIC_TRACKS);
  assert.equal(new Set(tracks.map(track => JSON.stringify(track.melody))).size, tracks.length);
  for (const track of tracks) {
    const beats = part => part.reduce((sum, note) => sum + note.beats, 0);
    assert.equal(beats(track.melody), beats(track.bass));
  }
});

test('the forest arrangement loops its melody, plucked harmony, and bass together',async()=>{
  const track=MUSIC_TRACKS.forest,total=part=>part.reduce((sum,note)=>sum+note.beats,0);
  assert.equal(total(track.melody),32);assert.equal(total(track.harmony),32);assert.equal(total(track.bass),32);
  assert.ok(track.bellOvertone);assert.ok([...track.melody,...track.harmony,...track.bass].every(note=>Number.isFinite(note.frequency)&&note.frequency>0));
  const timer=timers(),audio=new GameAudio({AudioContext:FakeContext,setInterval:timer.setInterval,clearInterval:timer.clearInterval});
  await audio.unlock();audio.setScene('forest');
  for(let i=1;i<=1600;i++){audio.context.advanceTo(i*.025);timer.tick();}
  assert.ok(audio._harmonyIndex>track.harmony.length);assert.ok(audio._noteIndex>track.melody.length);
  audio.setHidden(true);assert.equal(timer.size,0);assert.equal(audio._musicVoices.size,0);audio.dispose();
});

test('biome palettes contain every core cue and differ in musical character', () => {
  const biomes = ['forest', 'ocean', 'hell'];
  const events = ['coin', 'death', 'clear', 'start', 'jump', 'finish', 'respawn', 'checkpoint', 'broadcast', 'countdown', 'teleport'];
  for (const biome of biomes) {
    assert.ok(Object.isFrozen(EFFECT_PALETTES[biome]));
    for (const event of events) {
      const effect = EFFECT_PALETTES[biome][event];
      assert.ok(effect, `${biome} is missing ${event}`);
      assert.ok(effect.notes.length > 0);
      assert.ok(Object.isFrozen(effect.notes));
    }
  }
  for (const event of events) {
    const signatures = biomes.map(biome => {
      const effect = EFFECT_PALETTES[biome][event];
      return JSON.stringify([effect.notes, effect.step, effect.length, effect.type, effect.glide]);
    });
    assert.equal(new Set(signatures).size, biomes.length, `${event} should have three biome signatures`);
  }
});

test('scene override chooses biome FX without changing the music scene', async () => {
  const t = timers();
  const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) });
  await a.unlock();
  a.setScene('forest');
  const beforeMusic = [...a._musicVoices];
  const counts = [];
  for (const biome of ['forest', 'ocean', 'hell']) {
    const before = a.context.oscillators.length;
    assert.equal(a.playEffect('coin', biome), true);
    const cue = a.context.oscillators.slice(before);
    counts.push(cue.length);
    assert.equal(cue.length, EFFECT_PALETTES[biome].coin.notes.length);
    assert.equal(cue[0].type, EFFECT_PALETTES[biome].coin.type);
  }
  assert.deepEqual(counts, [3, 3, 3]);
  assert.equal(a.scene, 'forest');
  assert.ok(beforeMusic.some(voice => !voice.oscillator.stopped));
  a.dispose();
});

test('new one-shot cues schedule bounded voices, while mute and hidden block every biome', async () => {
  const t = timers();
  const a = new GameAudio({ AudioContext: FakeContext, setInterval: t.setInterval.bind(t), clearInterval: t.clearInterval.bind(t) });
  await a.unlock();
  for (const biome of ['forest', 'ocean', 'hell']) {
    for (const event of ['checkpoint', 'broadcast', 'countdown', 'teleport']) {
      const before = a._fxVoices.size;
      assert.equal(a.playEffect(event, biome), true);
      assert.ok(a._fxVoices.size > before, `${biome}/${event} did not create a cue`);
    }
  }
  a.setEnabled(false);
  for (const biome of ['forest', 'ocean', 'hell']) for (const event of ['coin', 'checkpoint', 'broadcast', 'countdown', 'teleport']) assert.equal(a.playEffect(event, biome), false);
  a.setEnabled(true);
  a.setHidden(true);
  for (const biome of ['forest', 'ocean', 'hell']) for (const event of ['coin', 'checkpoint', 'broadcast', 'countdown', 'teleport']) assert.equal(a.playEffect(event, biome), false);
  a.dispose();
});
