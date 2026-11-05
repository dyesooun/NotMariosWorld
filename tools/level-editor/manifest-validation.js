const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const annotation = new Set(['$schema', '$id', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly']);
const supported = new Set(['$ref','$defs','type','enum','const','properties','additionalProperties','required','if','then','else','allOf','oneOf','items','uniqueItems','minItems','maxItems','minProperties','maxProperties','minLength','maxLength','minimum','maximum','propertyNames',...annotation]);
const canon=v=>v&&typeof v==='object'?Array.isArray(v)?`[${v.map(canon).join(',')}]`:`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')}}`:JSON.stringify(v);

function walk(value, schema, path, root, errors) {
  if (errors.length >= 100 || schema == null) return;
  if (schema === true) return;
  if (schema === false) { errors.push(`${path}: prohibited value`); return; }
  for(const k of Object.keys(schema)) if(!supported.has(k)) errors.push(`${path}: unsupported validation keyword ${k}`);
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/')) return errors.push(`${path}: unsupported external $ref`);
    let target = root;
    for (const part of schema.$ref.slice(2).split('/')) target = target?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (!target) return errors.push(`${path}: unresolved ${schema.$ref}`);
    walk(value,target,path,root,errors);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(s => { const e=[]; walk(value,s,path,root,e); return !e.length; });
    if (matches.length !== 1) errors.push(`${path}: must match exactly one schema option`); else walk(value,matches[0],path,root,errors);
  }
  if (schema.allOf) for (const s of schema.allOf) walk(value,s,path,root,errors);
  if (schema.if) { const e=[]; walk(value,schema.if,path,root,e); if (!e.length && schema.then) walk(value,schema.then,path,root,errors); else if (e.length && schema.else) walk(value,schema.else,path,root,errors); }
  if (schema.const !== undefined && canon(value) !== canon(schema.const)) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(x => Object.is(x,value))) errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (schema.type) {
    const ok = schema.type === 'null' ? value === null : schema.type === 'array' ? Array.isArray(value) : schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : schema.type === 'integer' ? Number.isInteger(value) : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === schema.type;
    if (!ok) return errors.push(`${path}: expected ${schema.type}`);
  }
  if (typeof value === 'string') { if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${path}: too short`); if (schema.maxLength !== undefined && [...value].length > schema.maxLength) errors.push(`${path}: too long`); }
  if (typeof value === 'number') { if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`); if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`); if (!Number.isFinite(value)) errors.push(`${path}: must be finite`); }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.uniqueItems) for (let i=0;i<value.length;i++) for (let j=0;j<i;j++) if (canon(value[i])===canon(value[j])) errors.push(`${path}: duplicate item`);
    if (schema.items) value.forEach((v,i)=>walk(v,schema.items,`${path}[${i}]`,root,errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of Object.keys(value)) if (BAD_KEYS.has(k)) errors.push(`${path}.${k}: forbidden key`);
    for (const k of schema.required || []) if (!Object.hasOwn(value,k)) errors.push(`${path}: missing ${k}`);
    if (schema.propertyNames) for (const k of Object.keys(value)) walk(k,schema.propertyNames,`${path}.${k}`,root,errors);
    for (const [k,v] of Object.entries(value)) {
      const child = schema.properties?.[k] ?? schema.additionalProperties;
      if (child === false) errors.push(`${path}.${k}: unknown property`);
      else if (child && typeof child === 'object') walk(v,child,`${path}.${k}`,root,errors);
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push(`${path}: needs at least ${schema.minProperties} properties`);
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) errors.push(`${path}: too many properties`);
  }
}

function forbidden(value,path,errors){if(!value||typeof value!=='object'||errors.length>=100)return;for(const k of Object.keys(value)){if(BAD_KEYS.has(k))errors.push(`${path}.${k}: forbidden key`);forbidden(value[k],`${path}.${k}`,errors)}}
function checkSchema(node, errors, seen = new Set()) {
  if (typeof node === 'boolean' || !node || seen.has(node)) return;
  seen.add(node);
  for (const key of Object.keys(node)) if (!supported.has(key)) errors.push(`Schema uses unsupported validation keyword: ${key}`);
  for (const key of ['properties','$defs']) for (const child of Object.values(node[key] || {})) checkSchema(child,errors,seen);
  for (const key of ['allOf','oneOf']) for (const child of node[key] || []) checkSchema(child,errors,seen);
  for (const key of ['additionalProperties','items','if','then','else','propertyNames']) checkSchema(node[key],errors,seen);
}
export function validateSchema(value, schema) { const errors=[]; checkSchema(schema,errors); if (errors.length) return errors.slice(0,100); forbidden(value,'$',errors); walk(value,schema,'$',schema,errors); return errors.slice(0,100); }

const rect = r => r && Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h) && r.w>0 && r.h>0;
function semantic(m, errors) {
  const atlas=m.atlas||{}; const frames=m.frames||{}; const ids=new Set(Object.keys(frames));
  if(atlas.layout==='grid'&&atlas.grid&&((atlas.grid.columns*atlas.grid.cellWidthPx+(atlas.grid.columns-1)*atlas.grid.spacingPx+2*atlas.grid.paddingPx)>atlas.width||(atlas.grid.rows*atlas.grid.cellHeightPx+(atlas.grid.rows-1)*atlas.grid.spacingPx+2*atlas.grid.paddingPx)>atlas.height))errors.push('$.atlas.grid: extent exceeds atlas');
  for (const [id,f] of Object.entries(frames)) {
    const p=`$.frames.${id}`, sr=f.sourceRectPx;
    if (sr && (sr.x<0||sr.y<0||sr.x+sr.w>atlas.width||sr.y+sr.h>atlas.height)) errors.push(`${p}.sourceRectPx: outside atlas`);
    const inside=(r,n)=>{ if(r && (!rect(r)||r.x<0||r.y<0||r.x+r.w>sr.w||r.y+r.h>sr.h)) errors.push(`${p}.${n}: outside crop`); };
    for (const n of ['contentBoundsPx','pivotPx']) { if(n==='contentBoundsPx') inside(f[n],n); else if(f[n] && (f[n].x<0||f[n].y<0||f[n].x>sr.w||f[n].y>sr.h)) errors.push(`${p}.${n}: outside crop`); }
    for (const n of ['solidShapesPx','hazardShapesPx','interactionShapesPx']) for (const s of (f[n]||[])) { if(s.kind==='rect') inside(s.rectPx,n); else if(s.kind==='polygon') { const pts=s.pointsPx||[]; for(const q of pts) if(q.x<0||q.y<0||q.x>sr.w||q.y>sr.h) errors.push(`${p}.${n}: point outside crop`); let area=0; for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];area+=a.x*b.y-b.x*a.y;} if(Math.abs(area)<1) errors.push(`${p}.${n}: degenerate polygon`); if(new Set(pts.map(q=>`${q.x},${q.y}`)).size!==pts.length) errors.push(`${p}.${n}: repeated vertex`); for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(i!==j&&Math.abs(i-j)!==1&&!(i===0&&j===pts.length-1)){const a=pts[i],b=pts[(i+1)%pts.length],c=pts[j],d=pts[(j+1)%pts.length],cross=(u,v,w)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x);if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)errors.push(`${p}.${n}: self-intersecting polygon`);}} }
    for(const s of (f.walkSurfacesPx||[])) { if(s.x1<0||s.x2<0||s.y1<0||s.y2<0||s.x1>sr.w||s.x2>sr.w||s.y1>sr.h||s.y2>sr.h) errors.push(`${p}.walkSurfacesPx: endpoint outside crop`); if(s.kind==='horizontal'&&s.y1!==s.y2) errors.push(`${p}.walkSurfacesPx: horizontal endpoints differ in Y`); if(s.x1>=s.x2) errors.push(`${p}.walkSurfacesPx: endpoints must be ordered`); }
    const comps=f.components||[]; const cids=new Set(); for(const c of comps){if(cids.has(c.id)) errors.push(`${p}.components: duplicate ${c.id}`); cids.add(c.id); inside(c.boundsPx,'components.boundsPx'); if(c.pivotPx&&(c.pivotPx.x<0||c.pivotPx.y<0||c.pivotPx.x>sr.w||c.pivotPx.y>sr.h))errors.push(`${p}.components.pivotPx: outside crop`);}
    if(f.terrain){for(const n of ['leftJoinPx','rightJoinPx'])if(f.terrain[n]&&(f.terrain[n].x<0||f.terrain[n].y<0||f.terrain[n].x>sr.w||f.terrain[n].y>sr.h))errors.push(`${p}.terrain.${n}: outside crop`);for(const n of ['leftCapPx','repeatRegionPx','rightCapPx'])inside(f.terrain[n],`terrain.${n}`);for(const n of ['compatibleLeftFrameIds','compatibleRightFrameIds']) for(const id of (f.terrain[n]||[])) if(!ids.has(id)||frames[id].category!=='platform') errors.push(`${p}.terrain.${n}: ${id} is not a platform`);}
    if(f.beam) {
      for(const n of ['topEmitterPx','bottomReceiverPx','corePx','repeatCorePx'])inside(f.beam[n],`beam.${n}`);
      for(const n of ['topMountPx','bottomMountPx'])if(f.beam[n]&&(f.beam[n].x>sr.w||f.beam[n].y>sr.h))errors.push(`${p}.beam.${n}: outside crop`);
    }
    if(f.background)for(const n of ['horizonYPx','groundYPx'])if(f.background[n]!=null&&f.background[n]>sr.h)errors.push(`${p}.background.${n}: outside crop`);
  }
  if(Array.isArray(m.beamPairs)){const seen=new Set(); for(const b of m.beamPairs){if(seen.has(b.id)) errors.push(`$.beamPairs: duplicate ${b.id}`); seen.add(b.id); for(const n of ['onFrameId','offFrameId']) if(!ids.has(b[n])||frames[b[n]].category!=='beam') errors.push(`$.beamPairs.${b.id}: ${n} must reference beam`); if(frames[b.onFrameId]?.beam?.state!=='on'||frames[b.offFrameId]?.beam?.state!=='off') errors.push(`$.beamPairs.${b.id}: states must be on/off`);}}
  return errors;
}
export function validateTilesetManifest(value,schema){ const e=validateSchema(value,schema); if(!e.length) semantic(value,e); return e.slice(0,100); }
