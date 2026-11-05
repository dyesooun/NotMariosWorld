import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameAudio, MUSIC_TRACKS, VICTORY_TRACKS, EFFECT_PALETTES } from '../public/game/audio.js';

class Param { constructor(value = 0) { this.value = value; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
class Node { constructor() { this.gain = new Param(); this.frequency = new Param(); this.started = false; this.stopped = false; } connect() {} disconnect() {} start(when=0,offset=0) { this.started = true; this.offset=offset; } stop(when) { if(when!=null)return;this.stopped = true; this.onended?.(); } }
class BufferSource extends Node { constructor() { super(); this.loop = false; this.buffer = null; } }
class Context { static instances = []; constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = new Node(); this.sources = []; this.oscillators=[];Context.instances.push(this); } createGain() { return new Node(); } createBufferSource() { const n = new BufferSource(); this.sources.push(n); return n; } createOscillator(){const node=new Node();this.oscillators.push(node);return node;} decodeAudioData() { return Promise.resolve({ duration: 30 }); } async resume() { this.state = 'running'; } close() { this.state = 'closed'; } }
const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const timers = () => ({ setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const wavDuration = path => { const data = fs.readFileSync(`public${path}`); return data.readUInt32LE(40) / (data.readUInt32LE(24) * data.readUInt16LE(22) * data.readUInt16LE(34) / 8); };

test('shipped WAV maps and durations are exact', () => {
  assert.deepEqual(Object.keys(MUSIC_TRACKS), ['lobby', 'forest', 'ocean', 'hell', 'results']);
  assert.equal(VICTORY_TRACKS.forest.durationSeconds, 4.3); assert.equal(VICTORY_TRACKS.ocean.durationSeconds, 4.4); assert.equal(VICTORY_TRACKS.hell.durationSeconds, 4.4);
  for (const track of Object.values(MUSIC_TRACKS)) { assert.equal(fs.existsSync(`public${track.src}`), true, track.src); assert.equal(wavDuration(track.src), 30); }
  for (const track of Object.values(VICTORY_TRACKS)) { assert.equal(fs.existsSync(`public${track.src}`), true, track.src); assert.equal(wavDuration(track.src), track.durationSeconds); }
});
test('unlock starts one looping WAV source and repeated unlock does not duplicate', async () => {
  const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, ...timers() }); assert.equal(await audio.unlock(), true); await flush(); await flush();
  assert.equal(Context.instances.at(-1).sources.length, 1); assert.equal(Context.instances.at(-1).sources[0].loop, true); await audio.unlock(); await Promise.resolve(); assert.equal(Context.instances.at(-1).sources.length, 1); audio.dispose();
});
test('victory stops background, resolves on source end, and does not duplicate loads', async () => {
  const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, ...timers() }); await audio.unlock(); await flush(); await flush(); const promise = audio.playVictory('forest');
  await flush(); await flush(); await flush(); assert.equal(audio._musicSource, null); const context = Context.instances.at(-1); assert.equal(context.sources.length, 2); context.sources[1].onended(); assert.equal(await promise, true); audio.dispose();
});
test('scene change cancels an active victory and allows new music', async () => { const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, ...timers() }); await audio.unlock(); const pending = audio.playVictory('forest'); audio.setScene('results'); assert.equal(await pending, false); audio.dispose(); });
test('mute/hidden pauses timeline and never traps completion', async () => { let now = 0; const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, clock: () => now, ...timers() }); await audio.unlock(); const pending = audio.playVictory('hell'); await Promise.resolve(); await Promise.resolve(); now = 5000; audio.setHidden(true); assert.equal(await pending, true); audio.dispose(); });
test('FX palettes remain available and biome-specific', () => { for (const biome of ['forest', 'ocean', 'hell']) for (const cue of ['coin', 'death', 'finish', 'checkpoint', 'teleport']) assert.ok(EFFECT_PALETTES[biome][cue]); });

// Controlled wall time lets fallback/race tests run without waiting for audio.
function fixture(t,options={}){
  let now=0,id=0;const pending=new Map(),loads=[];
  const clock={
    now:()=>now,
    setTimeout(fn,delay){const key=++id;pending.set(key,{at:now+delay,fn});return key;},
    clearTimeout(key){pending.delete(key);},
    advance(ms){now+=ms;for(const [key,item] of [...pending])if(item.at<=now){pending.delete(key);item.fn();}},
    get size(){return pending.size;},
  };
  const audio=new GameAudio({AudioContext:Context,clock:clock.now,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,fetch:async src=>{loads.push(src);return fakeFetch(src);},...options});
  t.after(()=>audio.dispose());return{audio,clock,loads};
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

test('buffer cache and scene switches prevent duplicate or stale background sources',async t=>{
  const slow=deferred();let oceanLoads=0;
  const {audio}=fixture(t,{fetch:src=>{if(src===MUSIC_TRACKS.ocean.src){oceanLoads++;return slow.promise;}return fakeFetch(src);}});
  await audio.unlock();await flush();
  const lobby=audio._musicSource;
  audio.playEffect('coin');const fx=[...audio._fxVoices];
  audio.setScene('ocean');audio.setScene('ocean');await audio.unlock();
  audio.setScene('hell');await flush();
  assert.equal(lobby.stopped,true);assert.ok(fx.every(voice=>!voice.oscillator.stopped));
  const inferno=audio._musicSource;
  slow.resolve(await fakeFetch());await flush();
  assert.equal(audio._musicSource,inferno);assert.equal(oceanLoads,1);
  assert.equal(audio.context.sources.filter(source=>!source.stopped).length,1);
});

test('late background loads cannot overlap a loading victory cue',async t=>{
  const background=deferred(),victory=deferred();
  const {audio}=fixture(t,{fetch:src=>src===MUSIC_TRACKS.forest.src?background.promise:src===VICTORY_TRACKS.forest.src?victory.promise:fakeFetch(src)});
  await audio.unlock();await flush();audio.setScene('forest');
  const done=audio.playVictory('forest');await flush();
  background.resolve(await fakeFetch());await flush();
  assert.equal(audio._musicSource,null);
  victory.resolve(await fakeFetch());await flush();
  const source=audio._victorySource;assert.ok(source);assert.equal(source.loop,false);
  await audio.unlock();audio.setScene('forest');await audio.unlock();await flush();
  assert.equal(audio.context.sources.filter(source=>!source.stopped).length,1);
  source.onended();assert.equal(await done,true);
  audio.setScene('forest');await flush();assert.equal(audio._musicSource?.loop,true);
});

test('a ready stinger does not wait for a hanging background download',async t=>{
  const {audio}=fixture(t,{fetch:src=>src===MUSIC_TRACKS.forest.src?new Promise(()=>{}):fakeFetch(src)});
  await audio.unlock();audio.setScene('forest');const done=audio.playVictory('forest');await flush();
  assert.ok(audio._victorySource);audio._victorySource.onended();assert.equal(await done,true);
});

test('stalled victory loads finish on the silent deadline and cannot play late',async t=>{
  const slow=deferred();const {audio,clock}=fixture(t,{fetch:src=>src===VICTORY_TRACKS.forest.src?slow.promise:fakeFetch(src)});
  await audio.unlock();await flush();audio.setScene('forest');
  let finished=false;const done=audio.playVictory('forest').then(value=>{finished=true;return value;});
  await flush();clock.advance(4299);await flush();assert.equal(finished,false);
  clock.advance(1);assert.equal(await done,true);assert.equal(clock.size,0);
  const count=audio.context.sources.length;slow.resolve(await fakeFetch());await flush();
  assert.equal(audio.context.sources.length,count);assert.equal(audio._victorySource,null);
});

test('decode latency preserves the entire first audible stinger',async t=>{
  const slow=deferred();const {audio,clock}=fixture(t,{fetch:src=>src===VICTORY_TRACKS.forest.src?slow.promise:fakeFetch(src)});
  await audio.unlock();await flush();audio.setScene('forest');const done=audio.playVictory('forest');
  clock.advance(1000);slow.resolve(await fakeFetch());await flush();
  assert.equal(audio._victorySource.offset,0);assert.equal(audio._victoryDeadline,5300);
  clock.advance(3299);assert.ok(audio._victorySource);
  audio._victorySource.onended();assert.equal(await done,true);assert.equal(clock.size,0);
});

for(const mode of ['muted','hidden']){
  const setUnavailable=(audio,value)=>mode==='muted'?audio.setEnabled(!value):audio.setHidden(value);
  test(`${mode} stingers finish silently and repeated state changes keep their original deadline`,async t=>{
    const {audio,clock}=fixture(t);await audio.unlock();await flush();audio.setScene('forest');
    setUnavailable(audio,true);const done=audio.playVictory('forest');await flush();
    clock.advance(1000);setUnavailable(audio,true);setUnavailable(audio,true);
    assert.equal(audio._victoryDeadline,4300);
    clock.advance(3300);assert.equal(await done,true);assert.equal(audio._victorySource,null);
  });
  test(`${mode} stingers resume only the remaining portion without duplicate sources`,async t=>{
    const {audio,clock}=fixture(t);await audio.unlock();await flush();audio.setScene('forest');
    setUnavailable(audio,true);const done=audio.playVictory('forest');await flush();clock.advance(1000);
    setUnavailable(audio,false);setUnavailable(audio,false);await audio.unlock();await flush();
    assert.equal(audio._victoryDeadline,4300);assert.equal(audio._victorySource.offset,1);
    assert.equal(audio.context.sources.filter(source=>!source.stopped).length,1);
    clock.advance(1000);setUnavailable(audio,true);setUnavailable(audio,true);
    setUnavailable(audio,false);await flush();
    assert.equal(audio._victorySource.offset,2);assert.equal(audio._victoryDeadline,4300);
    setUnavailable(audio,true);clock.advance(2300);assert.equal(await done,true);
  });
}

test('unavailable playback or failed downloads use a bounded silent victory',async t=>{
  for(const options of [{AudioContext:null},{fetch:()=>{throw new Error('offline');}}]){
    const {audio,clock}=fixture(t,options);await audio.unlock();
    const done=audio.playVictory('hell');await flush();clock.advance(4400);assert.equal(await done,true);
    assert.equal(audio._victorySource,null);assert.equal(clock.size,0);
  }
});

test('cancellation and disposal ignore late loads and old ended handlers',async t=>{
  const {audio}=fixture(t);await audio.unlock();await flush();audio.setScene('forest');
  const first=audio.playVictory('forest');await flush();const oldEnded=audio._victorySource.onended;
  audio.setScene('hell');assert.equal(await first,false);
  const second=audio.playVictory('hell');await flush();const current=audio._victorySource;
  oldEnded();assert.equal(audio._victorySource,current);
  audio.dispose();assert.equal(await second,false);assert.equal(await audio.unlock(),false);
  assert.equal(await audio.playVictory('forest'),false);
});

test('default-on audio stays lazy and all biome FX stop on mute and hide',async t=>{
  const {audio}=fixture(t);assert.equal(audio.enabled,true);assert.equal(audio.context,null);
  audio.setEnabled(false);assert.equal(await audio.unlock(),false);assert.equal(audio.context,null);
  audio.setEnabled(true);await audio.unlock();
  for(const scene of ['lobby','forest','ocean','hell','results']){
    const before=audio.context.oscillators.length;assert.equal(audio.playEffect('coin',scene),true);
    assert.equal(audio.context.oscillators.length-before,EFFECT_PALETTES[scene].coin.notes.length);
  }
  assert.ok(audio._fxVoices.size>0);audio.setEnabled(false);
  assert.equal(audio._fxVoices.size,0);assert.ok(audio.context.oscillators.every(node=>node.stopped));
  audio.setEnabled(true);audio.playEffect('jump','forest');audio.setHidden(true);
  assert.equal(audio._fxVoices.size,0);assert.equal(audio.playEffect('jump','forest'),false);
});
