import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const onMessage=source.slice(source.indexOf('function onMessage(msg) {'),source.indexOf('\nfunction header('));

function fixture(){
  const rendered=[];
  const context=createContext({
    role:'player',you:'me',room:{roundId:'round-2',status:'running',players:[{id:'me',runId:'run-2',score:10,rank:1,summary:{level:1},coinAttack:{earned:4,spent:2,cooldownEndsAt:0}}]},
    playerResumeInfo:{runId:'old-run'},renderRoom:()=>rendered.push(true),mergePlayerPatch:(player,patch)=>({...player,...patch,summary:{...player.summary,...(patch.summary||{})}}),
    sceneTransitionApplying:false,sceneTransitionActive:false,$:()=>null,$$:()=>[],localRun:null,
  });
  runInContext(onMessage,context); return {context,rendered};
}

test('stale leaderboard deltas are ignored and compact rank changes preserve local fields',()=>{
  const {context,rendered}=fixture(); const player=context.room.players[0];
  context.onMessage({type:'leaderboard',roundId:'old-round',players:[{id:'me',score:999,rank:9,summary:{level:9}}]});
  assert.equal(player.score,10); assert.equal(player.rank,1); assert.equal(rendered.length,0);
  context.onMessage({type:'leaderboard',roundId:'round-2',players:[{id:'me',score:42,rank:2,summary:{level:1}}]});
  assert.equal(player.score,42); assert.equal(player.rank,2); assert.equal(player.coinAttack.earned,4); assert.equal(rendered.length,1);
});

test('coin wallet patch requires the current run and preserves private spend/cooldown state',()=>{
  const {context,rendered}=fixture(); const player=context.room.players[0];
  for(const identity of [{roundId:'old-round'},{playerId:'someone-else'}]){
    context.onMessage({type:'coinWallet',roundId:'round-2',runId:'run-2',playerId:'me',wallet:{earned:999},...identity});
    assert.equal(player.coinAttack.earned,4); assert.equal(rendered.length,0);
  }
  context.onMessage({type:'coinWallet',roundId:'round-2',runId:'old-run',playerId:'me',wallet:{earned:80,spent:0,reserved:0,available:80,cooldownEndsAt:1,queued:false,queuePosition:null}});
  assert.equal(player.coinAttack.earned,4); assert.equal(rendered.length,0);
  context.onMessage({type:'coinWallet',roundId:'round-2',runId:'run-2',playerId:'me',wallet:{earned:80,spent:2,reserved:0,available:78,cooldownEndsAt:123,queued:false,queuePosition:null}});
  assert.equal(player.coinAttack.earned,80); assert.equal(player.coinAttack.spent,2); assert.equal(player.coinAttack.cooldownEndsAt,123); assert.equal(rendered.length,1);
});
