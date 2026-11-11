import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameAudio, MUSIC_TRACKS, VICTORY_TRACKS, EFFECT_SOUNDS, EFFECT_SFX, normalizeDecodedAudioBuffer, AUDIO_MASTER_GAIN, AUDIO_TARGET_RMS } from '../public/game/audio.js';

class Param { constructor(value = 0) { this.value = value; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } exponentialRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
class Node { constructor() { this.gain = new Param(); this.frequency = new Param(); this.started = false; this.stopped = false; } connect(destination) { this.destination = destination; } disconnect() {} start(when=0,offset=0) { this.started = true; this.offset=offset; } stop(when) { if(when!=null)return;this.stopped = true; this.onended?.(); } }
class BufferSource extends Node { constructor() { super(); this.loop = false; this.buffer = null; } }
class Context { static instances = []; constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = new Node(); this.sources = []; this.oscillators=[];Context.instances.push(this); } createGain() { return new Node(); } createBufferSource() { const n = new BufferSource(); this.sources.push(n); return n; } createOscillator(){const node=new Node();this.oscillators.push(node);return node;} decodeAudioData() { return Promise.resolve({ duration: 30 }); } async resume() { this.state = 'running'; } close() { this.state = 'closed'; } }
const fakeFetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const timers = () => ({ setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const flacStreamInfo = path => { const data = fs.readFileSync(`public${path}`); assert.equal(data.subarray(0,4).toString(), 'fLaC'); const blockLength=data.readUIntBE(5,3); assert.ok(blockLength>=34); const stream=data.subarray(8,8+blockLength); const packed=BigInt('0x'+stream.subarray(10,18).toString('hex')); return { sampleRate:Number(packed>>44n), channels:Number((packed>>41n)&7n)+1, bitsPerSample:Number((packed>>36n)&31n)+1, totalSamples:Number(packed&0xfffffffffn) }; };
const wavStreamInfo = path => { const data=fs.readFileSync(`public${path}`); assert.equal(data.subarray(0,4).toString(),'RIFF'); const sampleRate=data.readUInt32LE(24), channels=data.readUInt16LE(22), bitsPerSample=data.readUInt16LE(34), dataBytes=data.readUInt32LE(40); return {sampleRate,channels,bitsPerSample,totalSamples:dataBytes/(channels*bitsPerSample/8)}; };

test('a refreshed victory resumes only its remaining duration and audio offset',async()=>{
  let now=1000;
  const audio=new GameAudio({AudioContext:Context,fetch:fakeFetch,clock:()=>now,...timers()});
  await audio.unlock();
  const done=audio.playVictory('forest',{remainingMs:1200});
  await flush();await flush();
  assert.equal(audio.victoryRemainingMs(),1200);
  assert.equal(audio._victorySource.offset,VICTORY_TRACKS.forest.durationSeconds-1.2);
  now+=500;
  assert.equal(audio.victoryRemainingMs(),700);
  audio.cancelVictory();await done;audio.dispose();
});

test('shipped compressed tracks preserve exact WAV stream metadata', () => {
  assert.deepEqual(Object.keys(MUSIC_TRACKS), ['lobby', 'forest', 'ocean', 'hell', 'results']);
  assert.equal(VICTORY_TRACKS.forest.durationSeconds, 4.3); assert.equal(VICTORY_TRACKS.ocean.durationSeconds, 4.4); assert.equal(VICTORY_TRACKS.hell.durationSeconds, 4.4);
  for (const track of [...Object.values(MUSIC_TRACKS),...Object.values(VICTORY_TRACKS)]) { assert.equal(fs.existsSync(`public${track.src}`), true, track.src); const original=track.src.replace('.compressed.flac','.wav'); assert.deepEqual(flacStreamInfo(track.src),wavStreamInfo(original),track.src); }
});
test('all compressed audio copies preserve exact stream metadata', () => {
  const files=[]; const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=`${dir}/${entry.name}`;if(entry.isDirectory())walk(full);else if(entry.name.endsWith('.compressed.flac'))files.push(full.replaceAll('\\','/'));}};
  walk('public/assets/audio'); assert.equal(files.length,35);
  for(const file of files){const relative=file.slice('public'.length);const original=relative.replace('.compressed.flac','.wav'); assert.deepEqual(flacStreamInfo(relative),wavStreamInfo(original),relative);}
});
test('decoded buffers are matched after their role bus and remain peak-safe', () => {
  const channel = Float32Array.from([.02, -.04, .08, -.12, .2, -.3]);
  const buffer = { numberOfChannels: 1, length: channel.length, getChannelData: () => channel };
  normalizeDecodedAudioBuffer(buffer, .62);
  const rms = Math.sqrt(channel.reduce((sum, value) => sum + value * value, 0) / channel.length);
  assert.ok(Math.abs(rms * .62 * AUDIO_MASTER_GAIN - AUDIO_TARGET_RMS) < .001);
  assert.ok(Math.max(...channel.map(Math.abs)) * .62 * AUDIO_MASTER_GAIN <= .98);
});
test('silence-gated normalization leaves silent decoded buffers untouched', () => {
  const channel = new Float32Array([0, .0001, -.0002, 0]);
  const before = [...channel];
  const buffer = { numberOfChannels: 1, length: channel.length, getChannelData: () => channel };
  normalizeDecodedAudioBuffer(buffer, .3);
  assert.deepEqual([...channel], before);
});
test('transient-heavy buffers hit the peak-safe cap instead of clipping', () => {
  const channel = Float32Array.from([...Array(999).fill(.0035), 1]);
  const buffer = { numberOfChannels: 1, length: channel.length, getChannelData: () => channel };
  normalizeDecodedAudioBuffer(buffer, .62);
  const peak = Math.max(...channel.map(Math.abs));
  const rms = Math.sqrt(channel.reduce((sum, value) => sum + value * value, 0) / channel.length);
  assert.ok(Math.abs(peak * .62 * AUDIO_MASTER_GAIN - .98) < .001);
  assert.ok(rms * .62 * AUDIO_MASTER_GAIN < AUDIO_TARGET_RMS);
});
test('music and effects buses produce the same post-bus RMS for the same input', () => {
  const values = Float32Array.from([.04, -.08, .12, -.16, .2, -.24]);
  const makeBuffer = () => {
    const channel = new Float32Array(values);
    return { channel, buffer: { numberOfChannels: 1, length: channel.length, getChannelData: () => channel } };
  };
  const music = makeBuffer(); const effects = makeBuffer();
  normalizeDecodedAudioBuffer(music.buffer, .62); normalizeDecodedAudioBuffer(effects.buffer, .3);
  const rms = channel => Math.sqrt(channel.reduce((sum, value) => sum + value * value, 0) / channel.length);
  assert.ok(Math.abs(rms(music.channel) * .62 * AUDIO_MASTER_GAIN - rms(effects.channel) * .3 * AUDIO_MASTER_GAIN) < .001);
});
test('stereo normalization preserves the channel ratio', () => {
  const left = Float32Array.from([.04, -.08, .12]); const right = Float32Array.from([.02, -.04, .06]);
  const before = left.map((value, index) => value / right[index]);
  const buffer = { numberOfChannels: 2, length: left.length, getChannelData: channel => channel ? right : left };
  normalizeDecodedAudioBuffer(buffer, .62);
  assert.deepEqual(left.map((value, index) => value / right[index]), before);
});
test('fallback buffer is decoded and normalized once across repeated requests', async () => {
  let compressedFetches = 0; let wavFetches = 0; let decodes = 0;
  const channel = Float32Array.from([.04, -.08, .12, -.16]);
  const context = new Context();
  context.decodeAudioData = async () => { decodes++; return { numberOfChannels: 1, length: channel.length, getChannelData: () => channel }; };
  const audio = new GameAudio({ AudioContext: Context, fetch: async src => {
    if (src.endsWith('.compressed.flac')) { compressedFetches++; throw new Error('compressed unavailable'); }
    wavFetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  }, ...timers() });
  audio.context = context;
  const first = await audio._loadBuffer(MUSIC_TRACKS.lobby.src, .62);
  const afterFirst = [...channel];
  const second = await audio._loadBuffer(MUSIC_TRACKS.lobby.src, .62);
  assert.equal(first, second); assert.deepEqual([...channel], afterFirst);
  assert.equal(compressedFetches, 1); assert.equal(wavFetches, 1); assert.equal(decodes, 1);
  audio.dispose();
});
test('unlock starts one looping compressed source and repeated unlock does not duplicate', async () => {
  const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, ...timers() }); assert.equal(await audio.unlock(), true); await flush(); await flush();
  assert.equal(Context.instances.at(-1).sources.length, 1); assert.equal(Context.instances.at(-1).sources[0].loop, true); await audio.unlock(); await Promise.resolve(); assert.equal(Context.instances.at(-1).sources.length, 1); audio.dispose();
});

test('background loops play at fifty percent after normalization while victory and effects retain their mix',async t=>{
  const {audio}=fixture(t);await audio.unlock();await flush();
  assert.equal(audio._backgroundGain.gain.value,.5);
  assert.equal(audio._backgroundGain.destination,audio._musicGain);
  for(const scene of Object.keys(MUSIC_TRACKS)){
    audio.setScene(scene);await flush();
    assert.equal(audio._musicSource.destination,audio._backgroundGain);
  }
  const done=audio.playVictory('forest');await flush();
  assert.equal(audio._victorySource.destination,audio._musicGain);
  audio._victorySource.onended();await done;
  audio.playEffect('coin');await flush();
  assert.equal([...audio._fxVoices][0].destination,audio._fxGain);
});
test('victory stops background, resolves on source end, and does not duplicate loads', async () => {
  const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, ...timers() }); await audio.unlock(); await flush(); await flush(); const promise = audio.playVictory('forest');
  await flush(); await flush(); await flush(); assert.equal(audio._musicSource, null); const context = Context.instances.at(-1); assert.equal(context.sources.length, 2); context.sources[1].onended(); assert.equal(await promise, true); audio.dispose();
});
test('scene change cancels an active victory and allows new music', async () => { const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, ...timers() }); await audio.unlock(); const pending = audio.playVictory('forest'); audio.setScene('results'); assert.equal(await pending, false); audio.dispose(); });
test('mute/hidden pauses timeline and never traps completion', async () => { let now = 0; const audio = new GameAudio({ AudioContext: Context, fetch: fakeFetch, clock: () => now, ...timers() }); await audio.unlock(); const pending = audio.playVictory('hell'); await Promise.resolve(); await Promise.resolve(); now = 5000; audio.setHidden(true); assert.equal(await pending, true); audio.dispose(); });
test('FX map uses supplied compressed audio for every cue', () => { assert.equal(EFFECT_SOUNDS.powerup, 'powerup'); for (const stem of Object.values(EFFECT_SOUNDS)) { assert.match(EFFECT_SFX[stem], /\.compressed\.flac$/); assert.equal(fs.existsSync(`public${EFFECT_SFX[stem]}`), true, stem); } });

test('compressed audio falls back to the original WAV when fetch or decode fails', async () => {
  const loads=[]; const audio = new GameAudio({ AudioContext: Context, fetch: async src => { loads.push(src); if (src.endsWith('.compressed.flac')) throw new Error('compressed unavailable'); return { ok:true, arrayBuffer:async()=>new ArrayBuffer(8) }; }, ...timers() });
  await audio.unlock(); const buffer=await audio._loadBuffer(MUSIC_TRACKS.lobby.src); assert.ok(buffer); const index=loads.indexOf(MUSIC_TRACKS.lobby.src); const fallback=MUSIC_TRACKS.lobby.src.replace('.compressed.flac','.wav'); assert.equal(loads.slice(index).includes(fallback),true); assert.equal(loads.indexOf(fallback)>index,true); audio.dispose();
});
test('decode rejection retries the original WAV and successful FLAC never requests WAV', async () => {
  class DecodeRejectContext extends Context { decodeAudioData(data) { if (data.byteLength===1) return Promise.reject(new Error('unsupported FLAC')); return Promise.resolve({duration:30}); } }
  const fallbackLoads=[]; const fallbackAudio=new GameAudio({AudioContext:DecodeRejectContext,fetch:async src=>{fallbackLoads.push(src);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(src.endsWith('.flac')?1:8)};},...timers()});
  await fallbackAudio.unlock(); assert.ok(await fallbackAudio._loadBuffer(MUSIC_TRACKS.lobby.src)); const wav=MUSIC_TRACKS.lobby.src.replace('.compressed.flac','.wav'); const primaryIndex=fallbackLoads.indexOf(MUSIC_TRACKS.lobby.src); assert.equal(primaryIndex>=0,true);assert.equal(fallbackLoads.indexOf(wav)>primaryIndex,true); fallbackAudio.dispose();
  const successLoads=[]; const successAudio=new GameAudio({AudioContext:Context,fetch:async src=>{successLoads.push(src);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};},...timers()}); await successAudio.unlock(); assert.ok(await successAudio._loadBuffer(MUSIC_TRACKS.lobby.src)); assert.equal(successLoads.includes(MUSIC_TRACKS.lobby.src.replace('.compressed.flac','.wav')),false); successAudio.dispose();
});
test('both compressed and WAV failures resolve null and cache both requests', async () => {
  const loads=[]; const audio=new GameAudio({AudioContext:Context,fetch:async src=>{loads.push(src);throw new Error('missing audio');},...timers()}); await audio.unlock(); const first=await audio._loadBuffer(MUSIC_TRACKS.lobby.src),second=await audio._loadBuffer(MUSIC_TRACKS.lobby.src); assert.equal(first,null);assert.equal(second,null); const fallback=MUSIC_TRACKS.lobby.src.replace('.compressed.flac','.wav'); assert.equal(loads.filter(src=>src===MUSIC_TRACKS.lobby.src).length,1);assert.equal(loads.filter(src=>src===fallback).length,1);audio.dispose();
});

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
  audio.playEffect('coin'); await flush(); const fx=[...audio._fxVoices];
  audio.setScene('ocean');audio.setScene('ocean');await audio.unlock();
  audio.setScene('hell');await flush();
  assert.equal(lobby.stopped,true);assert.ok(fx.every(voice=>!voice.stopped));
  const inferno=audio._musicSource;
  slow.resolve(await fakeFetch());await flush();
  assert.equal(audio._musicSource,inferno);assert.equal(oceanLoads,1);
  assert.equal(audio.context.sources.filter(source=>!source.stopped && source.loop).length,1);
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

test('default-on audio stays lazy and shared FX stop on mute and hide',async t=>{
  const {audio}=fixture(t);assert.equal(audio.enabled,true);assert.equal(audio.context,null);
  audio.setEnabled(false);assert.equal(await audio.unlock(),false);assert.equal(audio.context,null);
  audio.setEnabled(true);await audio.unlock();
  for(const scene of ['lobby','forest','ocean','hell','results']) assert.equal(audio.playEffect('coin',scene),true);
  await flush(); assert.equal(audio.context.oscillators.length, 0); assert.equal(audio._fxVoices.size, 5);
  audio.setEnabled(false); assert.equal(audio._fxVoices.size,0);
  audio.setEnabled(true);audio.playEffect('jump','forest');audio.setHidden(true);
  assert.equal(audio._fxVoices.size,0);assert.equal(audio.playEffect('jump','forest'),false);
});

test('volume API clamps, works before unlock, and restores independently of mute', async t => {
  const { audio } = fixture(t);
  assert.equal(audio.getVolume(), 1);
  assert.equal(audio.setVolume(2), 1); assert.equal(audio.getVolume(), 1);
  assert.equal(audio.setVolume(-1), 0); assert.equal(audio.setVolume(Number.NaN), 0); assert.equal(audio.setVolume(Number.POSITIVE_INFINITY), 0);
  assert.equal(audio.setVolume(.4), .4);
  await audio.unlock();
  assert.equal(audio._master.gain.value, .72 * .4);
  audio.setEnabled(false); assert.equal(audio._master.gain.value, 0); assert.equal(audio.getVolume(), .4);
  audio.setEnabled(true); assert.equal(audio._master.gain.value, .72 * .4);
  audio.setVolume(0); assert.equal(audio._master.gain.value, 0);
});
test('all themes reuse cached WAV buffers and one-shots clean up independently',async t=>{
  const {audio,loads}=fixture(t);await audio.unlock();await flush();
  const buffer=await audio._bufferPromises.get(EFFECT_SFX.coin_pickup);
  for(const scene of ['lobby','forest','ocean','hell','results','future-theme']) assert.equal(audio.playEffect('coin',scene),true);
  await flush();const voices=[...audio._fxVoices];assert.equal(voices.length,6);
  assert.ok(voices.every(source=>source.buffer===buffer && !source.loop && source.started));
  assert.equal(loads.filter(src=>src===EFFECT_SFX.coin_pickup).length,1);
  voices[0].onended();assert.equal(audio._fxVoices.size,5);
  audio.setEnabled(false);assert.ok(voices.slice(1).every(source=>source.stopped));
  assert.equal(audio._fxVoices.size,0);
});

for(const mode of ['muted','hidden','disposed']){
  test(`pending FX cannot play late after being ${mode}`,async t=>{
    const slow=deferred();const {audio}=fixture(t,{fetch:src=>src===EFFECT_SFX.jump?slow.promise:fakeFetch(src)});
    await audio.unlock();await flush();assert.equal(audio.playEffect('jump'),true);
    if(mode==='muted'){audio.setEnabled(false);audio.setEnabled(true);}
    else if(mode==='hidden'){audio.setHidden(true);audio.setHidden(false);}
    else audio.dispose();
    slow.resolve(await fakeFetch());await flush();
    assert.equal(audio._fxVoices.size,0);
    if(mode!=='disposed'){
      assert.equal(audio.playEffect('jump'),true);await flush();assert.equal(audio._fxVoices.size,1);
    }
  });
}

test('missing effect downloads stay silent without synthesizing substitutes',async t=>{
  const {audio}=fixture(t,{fetch:src=>src.startsWith('/assets/audio/sfx/')?Promise.reject(new Error('missing WAV')):fakeFetch(src)});
  await audio.unlock();await flush();assert.equal(audio.playEffect('coin'),true);await flush();
  assert.equal(audio._fxVoices.size,0);assert.equal(audio.context.oscillators.length,0);
  assert.equal(audio.playEffect('unknown-effect'),false);
});
