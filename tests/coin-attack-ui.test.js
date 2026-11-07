import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoinAttackControls } from '../public/game/coin-attack-ui.js';
import { POWER_DEFINITIONS } from '../public/game/powers.js';

// A small DOM adapter, like the existing quiz-control tests, drives delegated
// button events and focus without introducing a browser dependency.
class Element {
  constructor(tag, doc) {
    this.tagName=tag; this.ownerDocument=doc; this.children=[]; this.dataset={}; this.listeners={}; this.className='';
    this.style={setProperty(key,value){this[key]=value;}};
    this.classList={toggle:(name,value)=>{const set=new Set(this.className.split(' ').filter(Boolean));value?set.add(name):set.delete(name);this.className=[...set].join(' ');}};
  }
  append(child){child.parentElement=this;this.children.push(child);}
  remove(){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(type,handler){this.listeners[type]=handler;}
  contains(element){return !!element&&(element===this||this.children.some(child=>child.contains(element)));}
  focus(){this.ownerDocument.activeElement=this;}
  closest(selector){return selector==='button'&&this.tagName==='button'?this:null;}
  getBoundingClientRect(){return this.rect||{left:0,top:0,width:960,height:540};}
  set innerHTML(value){
    this.markup=value;
    for(const child of this.children)child.parentElement=null;
    this.children=[];
    for(const match of value.matchAll(/<button\b([^>]*)>/g)){
      const button=new Element('button',this.ownerDocument);
      for(const attribute of match[1].matchAll(/data-([\w-]+)="([^"]*)"/g))button.dataset[attribute[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=attribute[2];
      button.disabled=/\bdisabled\b/.test(match[1]);this.append(button);
    }
  }
  get innerHTML(){return this.markup||'';}
  querySelectorAll(selector){return this.children.filter(child=>selector.split(',').some(part=>{const data=part.trim().match(/^\[data-([\w-]+)\]$/);return part.trim()==='button'||data&&data[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()) in child.dataset;}));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function fixture(options={}){
  const doc={activeElement:null,createElement(tag){return new Element(tag,this);}};
  const viewport=doc.createElement('div');viewport.rect={left:10,top:20,width:1200,height:700};
  const canvas=doc.createElement('canvas');canvas.rect={left:110,top:70,width:960,height:540};viewport.append(canvas);
  const calls=[],controls=createCoinAttackControls(viewport,{onAttack:payload=>{calls.push(payload);return true;},...options});
  let model={visible:true,canAfford:true,canActivate:true,cost:30,available:90,now:1000,cooldownEndsAt:0,pending:false,powers:POWER_DEFINITIONS,targets:[{id:'target',name:'A rival',worldLabel:'World 2'},{id:'other',name:'Another rival'}]};
  const update=patch=>{model={...model,...patch};controls.update(model,{canvas});};update({});
  const click=key=>{const button=controls.root.querySelector(`[data-${key}]`);assert.ok(button,`${key} exists`);button.focus();controls.root.listeners.click({target:button});};
  return {doc,viewport,canvas,controls,calls,update,click};
}

test('power then target selection survives live updates and submits the exact chosen power once',()=>{
  const f=fixture(); f.click('attack-open'); f.click('attack-power');
  f.update({available:92,now:2000});
  assert.equal(f.controls.isOpen,true); assert.match(f.controls.root.innerHTML,/Sticky Boots/);
  f.click('attack-target');
  assert.deepEqual(f.calls,[{powerType:'slow',targetId:'target'}]);
  assert.equal(f.controls.isOpen,false); assert.match(f.controls.root.innerHTML,/REQUESTING/);
  assert.equal(f.controls.root.querySelector('[data-attack-open]'),null);
});

test('unaffordable board hides while an issued cooldown remains visible and counts down',()=>{
  const f=fixture(); f.update({visible:false,canAfford:false,available:5});assert.equal(f.controls.root.hidden,true);
  f.update({visible:true,cooldownEndsAt:61000,now:1000});assert.equal(f.controls.root.hidden,false);assert.match(f.controls.root.innerHTML,/60s/);
  f.update({now:2000});assert.match(f.controls.root.innerHTML,/59s/);
  assert.equal(f.controls.root.querySelector('[data-attack-open]'),null);
  f.update({visible:false,now:62000});assert.equal(f.controls.root.hidden,true);
});

test('back returns to powers, Escape closes and keyboard focus stays inside the selector',()=>{
  const f=fixture();f.click('attack-open');
  assert.equal(f.doc.activeElement.dataset.attackPower,'slow');
  f.click('attack-power');f.click('attack-back');assert.match(f.controls.root.innerHTML,/CHOOSE A POWER/);
  const buttons=f.controls.root.querySelectorAll('button');buttons.at(-1).focus();let prevented=false;
  f.controls.root.listeners.keydown({key:'Tab',preventDefault(){prevented=true;},stopPropagation(){}});
  assert.equal(prevented,true);assert.equal(f.doc.activeElement,buttons[0]);
  f.controls.root.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(f.controls.isOpen,false);assert.equal(f.doc.activeElement.dataset.attackOpen,'1');
});

test('target roster updates preserve focused target and eligibility changes close the selector',()=>{
  const f=fixture();f.click('attack-open');f.click('attack-power');
  f.update({targets:[{id:'target',name:'Updated rival'},{id:'new',name:'New rival'}]});
  assert.equal(f.doc.activeElement.dataset.attackTarget,'target');
  f.update({canActivate:false});assert.equal(f.controls.isOpen,false);
  f.update({visible:false});assert.equal(f.controls.root.hidden,true);
});

test('attack card aligns below the Power slot through letterboxing, fullscreen and active effects',()=>{
  const f=fixture();
  assert.equal(f.controls.root.style.left,'114px');assert.equal(f.controls.root.style.top,'119px');
  assert.equal(f.controls.root.style['--coin-attack-scale'],'0.5625');
  f.viewport.rect={left:0,top:0,width:1920,height:1080};f.canvas.rect={left:0,top:0,width:1920,height:1080};f.update({});
  assert.equal(f.controls.root.style.left,'28px');assert.equal(f.controls.root.style.top,'138px');
  assert.equal(f.controls.root.style['--coin-attack-scale'],'1.125');
  f.update({effectCount:1});assert.equal(f.controls.root.style.top,'175.125px');
});

test('1–4 select their displayed power and preserve the selected type until a target is chosen',()=>{
  for(let i=0;i<4;i++){
    const f=fixture();f.click('attack-open');let prevented=false,stopped=false;
    assert.equal(f.controls.handleKeydown({key:String(i+1),preventDefault(){prevented=true;},stopPropagation(){stopped=true;}}),true);
    assert.equal(prevented,true);assert.equal(stopped,true);
    f.update({now:2000});f.click('attack-target');
    assert.equal(f.calls[0].powerType,POWER_DEFINITIONS[i].type);
  }
});

test('number shortcuts are scoped to the power chooser and ignore modified or held keys',()=>{
  const f=fixture();
  assert.equal(f.controls.handleKeydown({key:'1'}),false);
  f.click('attack-open');
  for(const patch of [{ctrlKey:true},{altKey:true},{metaKey:true},{repeat:true}])assert.equal(f.controls.handleKeydown({key:'1',...patch}),false);
  f.click('attack-power');assert.equal(f.controls.handleKeydown({key:'2'}),false);
  assert.equal(f.calls.length,0);
});

test('failed transport can retry and server pending state never exposes another purchase',()=>{
  const f=fixture({onAttack:()=>false});f.click('attack-open');f.click('attack-power');f.click('attack-target');
  assert.equal(f.controls.isOpen,true);
  f.update({pending:true,queuePosition:3});assert.equal(f.controls.isOpen,false);assert.match(f.controls.root.innerHTML,/QUEUED · #3/);
  assert.equal(f.controls.root.querySelector('[data-attack-open]'),null);
});
