import {GAMEPLAY_ROLES,resolveGameplay,setGameplayRole} from './gameplay.js';

// Same small form in import review, shared definitions and placement overrides.
export function renderGameplayControls(parent,{definition,placement,onChange}){
  const resolved=resolveGameplay(definition,placement||{}),local=placement?placement.gameplay||{}:definition.gameplay||{};
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  function field(label,value,callback,{type='text',choices}={}){
    const wrap=node('label');wrap.className='field';wrap.append(node('span',label));const input=node(choices?'select':'input');input.setAttribute('aria-label',label);wrap.append(input);parent.append(wrap);
    if(choices){for(const [key,name]of choices)input.append(new Option(name,key));input.value=value??'';}else{input.type=type;input.step='any';if(type==='checkbox')input.checked=!!value;else input.value=value??'';}
    let committed=String(type==='checkbox'?input.checked:input.value);
    const apply=()=>{const raw=type==='checkbox'?input.checked:input.value;if(String(raw)===committed)return;committed=String(raw);callback(type==='number'&&raw!==''?Number(raw):raw);};
    input.onchange=apply;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();apply();}};return input;
  }
  function update(key,value){const next={...local};if(value==null||value==='')delete next[key];else next[key]=value;onChange(next);}
  function number(label,key,value){field(label,value,v=>update(key,v),{type:'number'});}
  const hint=node('p','Gameplay role activates behavior; custom tags are search labels. Shared defaults update every placement; placement overrides affect only that object.');hint.className='muted';parent.append(hint);
  field('Gameplay role',placement?(local.role??'inherit'):(local.role||'none'),value=>onChange(value==='inherit'?{}:setGameplayRole(local,value)),{choices:[...(placement?[['inherit','Use asset defaults']]:[]),...GAMEPLAY_ROLES]});
  field(placement?'Extra gameplay tags':'Gameplay tags',(local.tags||[]).join(', '),value=>update('tags',[...new Set(value.split(',').map(t=>t.trim()).filter(Boolean))]));
  if(resolved.role==='none')return;
  field('Nonblocking marker',resolved.nonblocking,value=>update('nonblocking',value),{type:'checkbox'});
  if(resolved.nonblocking){const p=node('p','This gameplay marker uses its trigger volume without blocking the player. Stored artwork and physical geometry are preserved.');p.className='muted';parent.append(p);}
  if(resolved.role!=='spawnpoint')field('Gameplay trigger',resolved.triggerVolume.join(', '),value=>update('triggerVolume',value.split(',').map(v=>Number(v.trim()))));
  if(resolved.role==='coin')number('Coin units','coinValue',resolved.coinValue);
  if(resolved.role==='checkpoint')number('Checkpoint order','order',resolved.order??'');
  if(['checkpoint','spawnpoint'].includes(resolved.role)){
    resolved.anchor.forEach((value,index)=>field(index?'Foot anchor Y':'Foot anchor X',value,v=>{const anchor=[...resolved.anchor];anchor[index]=v;update('anchor',anchor);},{type:'number'}));
    if(resolved.role==='checkpoint'){const p=node('p','Leave order blank to order checkpoints by their authored X position. Foot anchors use fractions of placement width/height.');p.className='muted';parent.append(p);}
  }
  if(resolved.role==='spawnpoint')number('Spawn priority','priority',resolved.priority);
  if(resolved.role==='exit')field('Target level ID',resolved.targetLevelId||'',value=>update('targetLevelId',value));
  if(['power-chest','decoy-chest'].includes(resolved.role)&&placement)field('Chest ID override',local.chestId||'',value=>update('chestId',value));
  if(resolved.role==='decoy-chest')field('Decoy trap',resolved.decoyKind,value=>update('decoyKind',value),{choices:[['spikes','Spikes'],['bomb','Bomb']]});
  const details=node('p',placement?`Stable object ID: ${placement.id}`:'New placements inherit this metadata. Leave instance-specific chest IDs and checkpoint orders to placement overrides.');details.className='muted';parent.append(details);
}
