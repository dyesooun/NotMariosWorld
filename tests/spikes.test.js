import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, createState, step } from '../public/game/engine.js';

function withHazard(levelIndex,predicate,check){
  const level=LEVELS[levelIndex],hazard=level.hazards.find(predicate);
  assert.ok(hazard,`expected hazard in ${level.theme}`);
  const original={hazards:level.hazards,enemies:level.enemies,coins:level.coins};
  level.hazards=[hazard];level.enemies=[];level.coins=[];
  const probe=(x,y)=>{
    const state=createState({level:levelIndex});Object.assign(state,{started:true,x,y,grounded:false});
    const events=step(state,{},0);return {state,dead:events.some(event=>event.type==='death')};
  };
  try{check(hazard,probe);}finally{Object.assign(level,original);}
}

test('visible and decoy spikes in every world allow the outer 7.5% on each side',()=>{
  for(let level=1;level<=3;level++)for(const kind of ['spikes','decoy'])withHazard(level,h=>h.kind===kind&&h.actualKind==='spikes',(h,probe)=>{
    const inset=h.w*.075,y=h.y+h.h/2+18;
    assert.equal(probe(h.x+inset/2-14,y).dead,false,'grazing the left art edge is safe');
    assert.equal(probe(h.x+inset+.1-14,y).dead,true,'crossing the inset left edge is lethal');
    assert.equal(probe(h.x+h.w-inset/2+14,y).dead,false,'grazing the right art edge is safe');
    assert.equal(probe(h.x+h.w-inset-.1+14,y).dead,true,'crossing the inset right edge is lethal');
    assert.equal(probe(h.x+h.w/2,y).dead,true,'the center still kills instantly');
  });
});

test('spike vertical collision is also 15% smaller in every world',()=>{
  for(let level=1;level<=3;level++)withHazard(level,h=>h.kind==='spikes',(h,probe)=>{
    const inset=h.h*.075,x=h.x+h.w/2;
    assert.equal(probe(x,h.y+inset/2).dead,false,'slightly grazing the spike tip is safe');
    assert.equal(probe(x,h.y+inset+.1).dead,true,'landing inside the spike body is lethal');
    assert.equal(probe(x,h.y+h.h-inset/2+36).dead,false,'the lower inset is also respected');
    assert.equal(probe(x,h.y+h.h-inset-.1+36).dead,true);
  });
});

test('a decoy spike death reveals the original trap position rather than its inset hitbox',()=>{
  for(let level=1;level<=3;level++)withHazard(level,h=>h.kind==='decoy'&&h.actualKind==='spikes',(h,probe)=>{
    const {state,dead}=probe(h.x+h.w/2,h.y+h.h/2+18);
    assert.equal(dead,true);assert.equal(state.deathCause.actualKind,'spikes');
    assert.equal(state.reveal.x,h.x);assert.equal(state.reveal.y,h.y);
  });
});

test('bomb decoys retain their original collision boundaries',()=>{
  for(let level=1;level<=3;level++)withHazard(level,h=>h.kind==='decoy'&&h.actualKind==='bomb',(h,probe)=>{
    const {dead,state}=probe(h.x+1-14,h.y+h.h/2+18);
    assert.equal(dead,true);assert.equal(state.deathCause.actualKind,'bomb');
  });
});
