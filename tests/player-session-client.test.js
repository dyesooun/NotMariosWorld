import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const ensure=source.slice(source.indexOf('function ensureLocalRun(me) {'),source.indexOf('\nconst serverNow='));

function fixture({savedRun='run-1',restore=true,version='build-1'}={}) {
  const calls=[];
  const context=createContext({
    role:'player',you:'player-1',room:{code:'ABC123',roundId:'round-1',status:'running',settings:{worldOrder:[1,2]}},
    profile:{name:'Runner'},localRun:null,playerRecoveryFailed:false,restoredVictoryEndsAt:null,
    localFinalizing:false,finalPending:false,finalSentRound:null,simulationCursor:0,lobbyLocationRunKey:null,
    checkedRuntime:'build-1',
    playerResumeInfo:{resumed:true,lastSeq:12,runId:'run-1'},
    playerSession:{id:'player-1',code:'ABC123',runtimeVersion:version,roundId:'round-1',runId:savedRun,snapshot:{roundId:'round-1',runId:savedRun}},
    cancelStageVictory(){},serverNow:()=>1000,activePowerEffects:()=>({}),locationFromState:()=>null,
    LocalRunRuntime:class {
      constructor(){this.state={started:false,level:0};this.seq=0;}
      restoreSession(snapshot,options){calls.push(['restore',options.minimumSeq]);if(restore){this.state={started:true,level:2,banked:120};this.seq=options.minimumSeq;}return restore;}
      begin(){calls.push(['begin']);this.state.started=true;}
    },
  });
  runInContext(ensure,context);
  runInContext('ensureLocalRun({id:"player-1",runId:"run-1",name:"Runner",spawned:true});',context);
  return {context,calls};
}

test('authenticated refresh hydrates before start and respects the server sequence floor',()=>{
  const {context,calls}=fixture();
  assert.deepEqual(calls,[['restore',12]]);
  assert.equal(context.localRun.state.level,2);
  assert.equal(context.localRun.state.banked,120);
  assert.equal(context.playerRecoveryFailed,false);
});

test('a new server run ignores the old local save and starts fresh',()=>{
  const {context,calls}=fixture({savedRun:'previous-run'});
  assert.deepEqual(calls,[['begin']]);
  assert.equal(context.playerRecoveryFailed,false);
});

test('corrupt and incompatible matching saves cannot silently start over',()=>{
  for(const options of [{restore:false},{version:'old-build'}]){
    const {context,calls}=fixture(options);
    assert.equal(context.playerRecoveryFailed,true);
    assert.equal(context.localRun.state.started,false);
    assert.equal(calls.some(([kind])=>kind==='begin'),false);
  }
});
