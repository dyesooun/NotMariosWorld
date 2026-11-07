import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { LocalRunRuntime } from '../public/game/local-run.js';
import { locationFromState } from '../public/game/run-protocol.js';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const sendSource=source.slice(source.indexOf('function send(type,'),source.indexOf('function ensureLocalRun('));
const ensureSource=source.slice(source.indexOf('function ensureLocalRun('),source.indexOf('const serverNow='));

test('lobby location initializes once per run and existing player actions piggyback current pose',()=>{
  const sent=[],me={id:'p',runId:'u1',name:'Runner',avatar:'cat',color:'#ffb4df',spawned:true};
  const context=createContext({
    ws:{readyState:1,send:raw=>sent.push(JSON.parse(raw))},WebSocket:{OPEN:1},
    room:{roundId:'r1',status:'lobby',settings:{},players:[me]},role:'player',you:'p',
    localRun:null,lobbyLocationRunKey:null,profile:{name:'Runner',avatar:'cat',color:'#ffb4df'},
    localFinalizing:false,finalPending:false,finalSentRound:null,simulationCursor:null,
    LocalRunRuntime,locationFromState,serverNow:()=>1000,
    cancelStageVictory(){},activePowerEffects:()=>({}),sendRaw(type,data){sent.push({type,...data});},
    playTone(){},playStageVictory(){},sceneForLevel(){},toast(){},DEFAULTS:{},
  });
  runInContext(sendSource+ensureSource,context);
  for(let i=0;i<5;i++)context.ensureLocalRun(me);
  assert.equal(sent.length,1);assert.equal(sent[0].type,'playerLocation');
  assert.deepEqual(sent[0].location,{level:0,x:90,y:500});assert.equal(sent[0].runId,'u1');
  context.localRun.state.x=350;
  context.ensureLocalRun(me);assert.equal(sent.length,1,'walking alone does not create another snapshot');
  for(const type of ['profile','spawn','vote','usePower','powerChestChoice','powerAnswer','coinAttack','leave']){
    context.send(type,{sample:true});assert.equal(sent.at(-1).location.x,350);assert.equal(sent.at(-1).roundId,'r1');
  }
  context.send('timeSync',{clientTime:1000});assert.equal(Object.hasOwn(sent.at(-1),'location'),false);
  me.runId='u2';context.ensureLocalRun(me);
  assert.equal(sent.at(-1).type,'playerLocation');assert.equal(sent.at(-1).runId,'u2');
  const count=sent.length;context.ensureLocalRun(me);assert.equal(sent.length,count);
});
