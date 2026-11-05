import { updateSourceFrame,setDefinitionGeometry,addSourceFrame,removeSourceFrame } from './metadata.js';
import { estimateFrameGeometry } from './atlas-analysis.js';
import { readAtlasPixels } from './auto-tileset.js';
import { getTransformHandles,hitTestHandles,resizePlacement } from './transforms.js';
import {renderGameplayControls} from './gameplay-controls.js';

export function mountAssetEditor({getDocument,getImages,change,onMessage,onSelectDefinition,onExportLibrary,onAcceptImport,onCancelImport,onEditSequences}) {
  const dialog=document.createElement('dialog');dialog.className='asset-editor';dialog.setAttribute('aria-label','Shared asset metadata editor');document.body.append(dialog);
  const header=node('div',dialog,null,'asset-editor-header');const title=node('strong',header,'Shared asset metadata');
  const saveButton=action(header,'Save metadata',onExportLibrary);const doneImport=action(header,'Done importing',()=>{importAccepted=true;onAcceptImport?.();dialog.close();});doneImport.hidden=true;action(header,'Close',()=>dialog.close());
  node('p',dialog,'Cuts and geometry are shared: correcting them updates every placement using this asset. Placement move, size and rotation remain independent.','hint');
  const controls=node('div',dialog,null,'asset-editor-controls'),tools=node('div',dialog,null,'asset-editor-tools');
  const canvas=node('canvas',dialog);canvas.tabIndex=0;canvas.setAttribute('aria-label','Asset metadata canvas');const ctx=canvas.getContext('2d');
  const footer=node('div',dialog,null,'asset-editor-footer'),status=node('p',dialog,'','hint');
  let assetId,frameId,definitionId,mode='cuts',adding=false,gesture=null,draft=null,view={x:0,y:0,zoom:1},space=false,importing=false,importAccepted=false,gameplayOpen=false;
  const cache=new WeakMap();
  function node(tag,parent,text,className){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;parent?.append(el);return el;}
  function action(parent,text,callback){const button=node('button',parent,text);button.onclick=callback;return button;}
  function select(parent,label,choices,value,callback){const wrapper=node('label',parent);node('span',wrapper,label);const input=node('select',wrapper);input.setAttribute('aria-label',label);for(const[key,text]of choices)input.append(new Option(text,key));input.value=value||'';input.onchange=()=>callback(input.value);return input;}
  function doc(){return getDocument();}
  function asset(){return doc().assets[assetId];}
  function frame(){return asset()?.frames[frameId];}
  function definition(){return doc().definitions[definitionId];}
  function image(){return getImages().get(assetId);}
  function data(){const source=image();if(!cache.has(source))cache.set(source,readAtlasPixels(source));return cache.get(source);}
  function related(id){return Object.values(doc().definitions).find(d=>d.visual.assetId===assetId&&(d.visual.frameId===id||d.visual.onFrameId===id||d.visual.offFrameId===id||Object.values(d.visual.animations||{}).some(a=>a.frames.includes(id))));}
  function dimensions(){return mode==='cuts'?{width:asset().width,height:asset().height}:{width:frame().w,height:frame().h};}
  function fit(){const size=dimensions();view.zoom=Math.max(.02,Math.min((canvas.clientWidth-40)/size.width,(canvas.clientHeight-40)/size.height));view.x=(size.width-canvas.clientWidth/view.zoom)/2;view.y=(size.height-canvas.clientHeight/view.zoom)/2;draw();}
  function local(event){const bounds=canvas.getBoundingClientRect();return{x:view.x+(event.clientX-bounds.left)/view.zoom,y:view.y+(event.clientY-bounds.top)/view.zoom};}
  function channelRect(){const d=definition();if(!d)return null;const normalized=mode==='damage'?d.physics.hitbox:d.physics.collider;return normalized&&{x:normalized[0]*frame().w,y:normalized[1]*frame().h,w:normalized[2]*frame().w,h:normalized[3]*frame().h};}
  function currentRect(){return draft||(mode==='cuts'?{x:frame().x,y:frame().y,w:frame().w,h:frame().h}:channelRect());}
  function bounded(rect){const size=dimensions();const x=Math.max(0,Math.min(size.width-1,Math.round(rect.x))),y=Math.max(0,Math.min(size.height-1,Math.round(rect.y)));return{x,y,w:Math.max(1,Math.min(size.width-x,Math.round(rect.w))),h:Math.max(1,Math.min(size.height-y,Math.round(rect.h)))};}
  function handles(rect){return rect?getTransformHandles({x:rect.x,y:rect.y,width:rect.w,height:rect.h,rotation:0},view).filter(h=>h.type!=='rotate'):[];}
  function box(rect,color,line=1){if(!rect)return;ctx.strokeStyle=color;ctx.lineWidth=line/view.zoom;ctx.strokeRect(rect.x,rect.y,rect.w,rect.h);}
  function draw(){
    if(!dialog.open||!frame()||!image())return;
    const width=Math.max(1,Math.round(canvas.clientWidth*devicePixelRatio)),height=Math.max(1,Math.round(canvas.clientHeight*devicePixelRatio));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.fillStyle='#172226';ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);
    for(let y=0;y<canvas.clientHeight;y+=16)for(let x=0;x<canvas.clientWidth;x+=16)if((x/16+y/16)%2===0){ctx.fillStyle='#243136';ctx.fillRect(x,y,16,16);}
    ctx.save();ctx.scale(view.zoom,view.zoom);ctx.translate(-view.x,-view.y);ctx.imageSmoothingEnabled=false;
    if(mode==='cuts'){
      ctx.drawImage(image(),0,0);
      for(const[id,f]of Object.entries(asset().frames))if(id!==frameId)box(f,'#79bda877');
    }else{
      const f=frame(),d=definition(),offset=d?.visual.offset||[0,0],scale=d?.visual.scale||[1,1];
      ctx.drawImage(image(),f.x,f.y,f.w,f.h,offset[0]*f.w,offset[1]*f.h,f.w*scale[0],f.h*scale[1]);
      for(const[channel,color]of [['body','#7ee5ba88'],['damage','#ff868a88']]){
        const r=channel==='body'?d?.physics.collider:d?.physics.hitbox;if(r)box({x:r[0]*f.w,y:r[1]*f.h,w:r[2]*f.w,h:r[3]*f.h},color);
      }
    }
    const rect=currentRect(),color=mode==='cuts'?'#ffe093':mode==='damage'?'#ff868a':'#7ee5ba';box(rect,color,2);
    if(rect)for(const h of handles(rect)){ctx.fillStyle=h.type==='move'?'#80dbff':'#fff6cf';ctx.fillRect(h.x-4/view.zoom,h.y-4/view.zoom,8/view.zoom,8/view.zoom);}
    ctx.restore();
  }
  function refresh(){
    if(!asset()){assetId=Object.keys(doc().assets)[0];if(!asset())return;}
    if(!frame())frameId=Object.keys(asset().frames)[0];
    if(!definition())definitionId=related(frameId)?.id;
    controls.replaceChildren();tools.replaceChildren();footer.replaceChildren();
    select(controls,'Atlas',Object.values(doc().assets).map(a=>[a.id,a.name]),assetId,value=>{assetId=value;frameId=Object.keys(asset().frames)[0];definitionId=related(frameId)?.id;mode='cuts';adding=false;refresh();fit();});
    const frames=Object.entries(asset().frames); select(controls,'Source frame',frames.map(([id,f])=>[id,`${f.name||f.display_name||id} · ${id}`]),frameId,value=>{frameId=value;definitionId=related(value)?.id;mode='cuts';adding=false;refresh();fit();});
    const nav=node('div',controls,null,'asset-frame-nav'),index=Math.max(0,frames.findIndex(([id])=>id===frameId));
    const prev=action(nav,'Prev frame',()=>{if(index>0){frameId=frames[index-1][0];definitionId=related(frameId)?.id;refresh();fit();}}),next=action(nav,'Next frame',()=>{if(index<frames.length-1){frameId=frames[index+1][0];definitionId=related(frameId)?.id;refresh();fit();}});prev.disabled=index<=0;next.disabled=index>=frames.length-1;
    const list=node('div',nav,null,'asset-frame-list');list.setAttribute('role','listbox');for(const[id,f]of frames){const b=action(list,`${f.name||id} · ${id}`,()=>{frameId=id;definitionId=related(id)?.id;refresh();fit();});b.setAttribute('role','option');b.setAttribute('aria-selected',String(id===frameId));if(id===frameId)b.classList.add('selected');}
    select(controls,'Edit mode',[['cuts','Atlas cuts'],['body','Body collision'],['damage','Damage hitbox'],['interaction','Interaction trigger']],mode,value=>{
      if(value!=='cuts'&&!definition()){onMessage('This frame has no reusable definition.',true);return;}
      mode=value;adding=false;if(mode!=='cuts')frameId=definition().visual.frameId;refresh();fit();
    });
    action(tools,'Fit',fit);action(tools,'Zoom in',()=>{view.zoom=Math.min(12,view.zoom*1.4);draw();});action(tools,'Zoom out',()=>{view.zoom=Math.max(.02,view.zoom/1.4);draw();});
    if(definition()?.visual.animations||definition()?.kind==='character')action(tools,'States and sequences',()=>onEditSequences?.(definitionId));
    if(mode==='cuts'){
      const add=action(tools,adding?'Draw the new cut…':'Add cut (drag)',()=>{adding=!adding;add.textContent=adding?'Draw the new cut…':'Add cut (drag)';});
      action(tools,'Remove unused cut',()=>{if(change(project=>removeSourceFrame(project,assetId,frameId))){frameId=Object.keys(asset().frames)[0];definitionId=related(frameId)?.id;refresh();draw();}});
      node('span',tools,'Drag an edge/corner or the center square. Wheel zooms; middle/Space-drag pans.','hint');
    }else{
      const d=definition();
      select(tools,'Collision mode',[['none','None'],['solid','Solid'],['trigger','Trigger']],d.physics.mode,value=>{change(project=>{project.definitions[definitionId].physics.mode=value;});refresh();draw();});
      action(tools,'Auto geometry',()=>{
        try{
          const f=frame(),estimate=estimateFrameGeometry(data(),{x:f.x,y:f.y,w:f.w,h:f.h});
          const r=estimate.suggestedRectPx;
          if(!r){onMessage('No visible pixels found in this cut.',true);return;}
          if(change(project=>{
            setDefinitionGeometry(project,definitionId,mode,[r.x/f.w,r.y/f.h,r.w/f.w,r.h/f.h]);
            project.definitions[definitionId].physics.calibration='estimated';
            const target=project.assets[assetId].frames[frameId];target.contentBoundsPx=estimate.contentBoundsPx;target.pivotPx=estimate.pivotPx;
            if(project.definitions[definitionId].kind==='platform')project.definitions[definitionId].physics.walkSurfaces=estimate.walkSurfacesPx.map(s=>({...s,x1:s.x1/f.w,y1:s.y1/f.h,x2:s.x2/f.w,y2:s.y2/f.h}));
          }))onMessage('Automatic geometry applied to this shared definition. Review and adjust the box.');
          refresh();draw();
        }catch(error){onMessage(error.message,true);}
      });
      action(tools,'Clear box',()=>{change(project=>setDefinitionGeometry(project,definitionId,mode,null));refresh();draw();});
      node('span',tools,'Dragging replaces this channel’s imported shapes with a rectangle. Empty space draws a new box.','hint');
    }
    const rect=currentRect(),inputs={};
    for(const[key,label]of [['x','X'],['y','Y'],['w','Width'],['h','Height']]){
      const wrapper=node('label',footer);node('span',wrapper,`${mode==='cuts'?'Crop':'Box'} ${label}`);const input=node('input',wrapper);input.type='number';input.step=1;input.setAttribute('aria-label',`Metadata ${label}`);input.value=rect?.[key]??'';inputs[key]=input;
      const apply=()=>{try{const value=Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,Number(i.value)]));commitRect(value);}catch(error){onMessage(error.message,true);refresh();}};
      input.onchange=apply;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();apply();}};
    }
    if(definition()){
      const d=definition(),meta=node('div',controls,null,'asset-definition-metadata');
      const gameplay=node('details',controls,null,'asset-gameplay-controls');node('summary',gameplay,'Gameplay tags');gameplay.open=gameplayOpen;gameplay.ontoggle=()=>{gameplayOpen=gameplay.open;};renderGameplayControls(gameplay,{definition:d,onChange:value=>change(project=>{project.definitions[definitionId].gameplay=value;})});
      const name=node('label',meta);node('span',name,'Definition name');const nameInput=node('input',name);nameInput.value=d.name||'';nameInput.onchange=()=>change(project=>{project.definitions[definitionId].name=nameInput.value});
      select(meta,'Role',[['character','character'],['platform','platform'],['enemy','enemy'],['chest','chest'],['background','background'],['prop','prop'],['beam','beam'],['hazard','hazard'],['projectile','projectile']],d.kind,value=>change(project=>{const pd=project.definitions[definitionId];pd.kind=value;if(value==='beam'){pd.behavior={type:'beam',onMs:1000,offMs:1000,startMs:0,phaseMs:0,startState:'on'};}else if(value!=='enemy')pd.behavior={...pd.behavior,type:'static'};}));
      const tags=node('label',meta);node('span',tags,'Level tags');const tagInput=node('input',tags);tagInput.value=(d.levels||[]).join(', ');tagInput.onchange=()=>change(project=>{project.definitions[definitionId].levels=tagInput.value.split(',').map(v=>v.trim()).filter(Boolean)});
      for(const[key,label]of [['width','Default width'],['height','Default height']]){const w=node('label',meta);node('span',w,label);const input=node('input',w);input.type='number';input.min='1';input.value=d.size?.[key]||'';input.onchange=()=>change(project=>{project.definitions[definitionId].size[key]=Math.max(1,Number(input.value)||1)});}
    }
    controls.querySelectorAll('input').forEach(input=>{input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();input.onchange?.();refresh();draw();}};});
    const count=doc().placements.filter(p=>p.definitionId===definitionId).length;
    status.textContent=mode==='cuts'?`Shared source cut. Pixel measurements are cleared after a crop correction; existing logical collision and placed transforms stay intact. ${asset().width} × ${asset().height} source pixels.`:`${definition()?.name||''} · ${count} placed instances share this geometry. Green: body; red: damage. Coordinates shown here are source-crop pixels.`;
  }
  function commitRect(input){
    if(!['x','y','w','h'].every(k=>Number.isFinite(input[k]))||input.w<=0||input.h<=0)throw new Error('Enter a valid positive rectangle.');
    const rect={x:Math.round(input.x),y:Math.round(input.y),w:Math.max(1,Math.round(input.w)),h:Math.max(1,Math.round(input.h))};
    const size=dimensions();if(rect.x<0||rect.y<0||rect.x+rect.w>size.width||rect.y+rect.h>size.height)throw new Error('Rectangle must fit the image or selected crop.');
    if(adding&&mode==='cuts'){
      let id;if(change(project=>{
        id=addSourceFrame(project,assetId,rect);
        const estimate=estimateFrameGeometry(data(),rect),r=estimate.suggestedRectPx;
        if(r){setDefinitionGeometry(project,id,'body',[r.x/rect.w,r.y/rect.h,r.w/rect.w,r.h/rect.h]);project.definitions[id].physics.calibration='estimated';}
      })){
        definitionId=id;frameId=doc().definitions[id].visual.frameId;onSelectDefinition(id);adding=false;
      }
    }else if(mode==='cuts'){
      const old=frame();if(old.x!==rect.x||old.y!==rect.y||old.w!==rect.w||old.h!==rect.h)change(project=>updateSourceFrame(project,assetId,frameId,rect));
    }else change(project=>setDefinitionGeometry(project,definitionId,mode,[rect.x/size.width,rect.y/size.height,rect.w/size.width,rect.h/size.height]));
    draft=null;refresh();draw();
  }
  canvas.onpointerdown=event=>{
    if(!frame())return;const point=local(event);canvas.setPointerCapture(event.pointerId);canvas.focus();
    if(event.button===1||space){gesture={type:'pan',x:event.clientX,y:event.clientY,view:{...view}};event.preventDefault();return;}
    if(event.button!==0)return;
    const bounds=canvas.getBoundingClientRect(),hit=adding?null:hitTestHandles(handles(currentRect()),{x:event.clientX-bounds.left,y:event.clientY-bounds.top});
    if(hit){gesture={type:hit.type,handle:hit.id,rect:{...currentRect()},point};return;}
    if(mode==='cuts'&&!adding){
      const found=Object.entries(asset().frames).filter(([,f])=>point.x>=f.x&&point.y>=f.y&&point.x<=f.x+f.w&&point.y<=f.y+f.h).sort(([,a],[,b])=>a.w*a.h-b.w*b.h)[0];
      if(found){frameId=found[0];definitionId=related(frameId)?.id;gesture={type:'move',rect:{x:frame().x,y:frame().y,w:frame().w,h:frame().h},point};refresh();draw();return;}
      return;
    }
    const rect=currentRect();
    if(!adding&&rect&&point.x>=rect.x&&point.y>=rect.y&&point.x<=rect.x+rect.w&&point.y<=rect.y+rect.h)gesture={type:'move',rect:{...rect},point};
    else gesture={type:'draw',point};
  };
  canvas.onpointermove=event=>{
    if(!gesture)return;
    if(gesture.type==='pan'){view.x=gesture.view.x-(event.clientX-gesture.x)/view.zoom;view.y=gesture.view.y-(event.clientY-gesture.y)/view.zoom;draw();return;}
    const point=local(event),start=gesture.rect;
    if(gesture.type==='draw')draft=bounded({x:Math.min(point.x,gesture.point.x),y:Math.min(point.y,gesture.point.y),w:Math.abs(point.x-gesture.point.x),h:Math.abs(point.y-gesture.point.y)});
    else if(gesture.type==='move'){
      const size=dimensions();draft={...start,x:Math.max(0,Math.min(size.width-start.w,Math.round(start.x+point.x-gesture.point.x))),y:Math.max(0,Math.min(size.height-start.h,Math.round(start.y+point.y-gesture.point.y)))};
    }else {const result=resizePlacement({x:start.x,y:start.y,width:start.w,height:start.h,rotation:0},gesture.handle,point);draft=bounded({x:result.x,y:result.y,w:result.width,h:result.height});}
    draw();
  };
  canvas.onpointerup=()=>{const changed=draft;gesture=null;if(changed){try{commitRect(changed);}catch(error){onMessage(error.message,true);draft=null;refresh();draw();}}};
  canvas.onpointercancel=()=>{gesture=null;draft=null;draw();};
  canvas.onwheel=event=>{event.preventDefault();const point=local(event),bounds=canvas.getBoundingClientRect();view.zoom=Math.max(.02,Math.min(20,view.zoom*Math.exp(-event.deltaY*.001)));view.x=point.x-(event.clientX-bounds.left)/view.zoom;view.y=point.y-(event.clientY-bounds.top)/view.zoom;draw();};
  dialog.addEventListener('keydown',event=>{if(event.code==='Space'&&event.target===canvas){space=true;event.preventDefault();}if(event.key==='Escape'){gesture=null;draft=null;dialog.close();}event.stopPropagation();});
  dialog.addEventListener('keyup',event=>{if(event.code==='Space')space=false;event.stopPropagation();});
  dialog.addEventListener('close',()=>{gesture=null;draft=null;space=false;if(importing&&!importAccepted)onCancelImport?.();});
  window.addEventListener('resize',draw);
  return {open(id,{importing:reviewImport=false}={}){
    importing=reviewImport;importAccepted=false;title.textContent=importing?'Review imported assets':'Shared asset metadata';doneImport.hidden=!importing;saveButton.hidden=importing;
    const d=doc().definitions[id]||Object.values(doc().definitions)[0];if(!d)return;
    definitionId=d.id;assetId=d.visual.assetId;frameId=d.visual.frameId;mode='cuts';adding=false;gesture=null;draft=null;
    if(!dialog.open)dialog.showModal();refresh();fit();
  },refresh(){if(dialog.open){refresh();draw();}}};
}
