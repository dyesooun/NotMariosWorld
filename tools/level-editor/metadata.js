import { clone, validateDocument } from './document.js';
import { validateTilesetManifest } from './manifest-validation.js';
import { cleanupSupportIds } from './support-picker.js';
import { frameClipPolygonError } from '../../public/game/json-level/frame-outline.js';

const BAD = new Set(['__proto__', 'prototype', 'constructor']);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function deleteAssetDefinition(doc,definitionId){
  const definition=doc.definitions[definitionId];if(!definition)throw new Error('Choose an existing asset.');
  const removedPlacements=new Set(doc.placements.filter(p=>p.definitionId===definitionId).map(p=>p.id));
  doc.placements=doc.placements.filter(p=>!removedPlacements.has(p.id));
  delete doc.definitions[definitionId];
  for(const d of Object.values(doc.definitions))if(d.behavior?.projectileDefinitionId===definitionId)delete d.behavior.projectileDefinitionId;
  cleanupSupportIds(doc.placements,removedPlacements);
  for (const d of Object.values(doc.definitions)) {
    if (Array.isArray(d.behavior?.supportIds)) d.behavior.supportIds = d.behavior.supportIds.filter(id => !removedPlacements.has(id));
    if (removedPlacements.has(d.behavior?.supportId)) delete d.behavior.supportId;
  }
  for(const p of doc.placements){if(p.settings?.projectileDefinitionId===definitionId)delete p.settings.projectileDefinitionId;}
  const assetId=definition.visual.assetId;
  if(!Object.values(doc.definitions).some(d=>d.visual.assetId===assetId))delete doc.assets[assetId];
  return doc;
}
function safe(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  for (const k of Object.keys(value)) { if (BAD.has(k)) throw new Error(`${path}.${k}: unsafe key`); safe(value[k], `${path}.${k}`); }
}
function assetFrame(doc, assetId, frameId) {
  const asset = doc.assets?.[assetId]; if (!asset) throw new Error(`Unknown asset: ${assetId}`);
  const frame = asset.frames?.[frameId]; if (!frame) throw new Error(`Unknown source frame: ${frameId}`);
  return { asset, frame };
}
function crop(c) {
  if (!c || !['x','y','w','h'].every(k => Number.isInteger(c[k])) || c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0) throw new Error('Crop must contain positive integer x, y, w, h.');
  return { x: c.x, y: c.y, w: c.w, h: c.h };
}
function sourceRect(frame) { return {x:frame.x??frame.sourceRectPx?.x,y:frame.y??frame.sourceRectPx?.y,w:frame.w??frame.sourceRectPx?.w,h:frame.h??frame.sourceRectPx?.h}; }
function syncFrame(frame, rect) { Object.assign(frame, rect, { sourceRectPx: { ...rect } }); }
function syncManifestFrame(asset, frameId, frame) {
  if (asset.manifest?.format !== 'platformer-tileset-manifest') {
    const mf = asset.manifest?.frames?.[frameId];
    if (mf) { const sr = sourceRect(frame); if (own(mf, 'x')) mf.x = sr.x; if (own(mf, 'y')) mf.y = sr.y; if (own(mf, 'w')) mf.w = sr.w; if (own(mf, 'h')) mf.h = sr.h; if (mf.sourceRectPx) mf.sourceRectPx = clone(sr); if (frame.clipPolygon) mf.clipPolygon = clone(frame.clipPolygon); else delete mf.clipPolygon; }
    return;
  }
  asset.manifest.frames ||= {};
  asset.manifest.frames[frameId] = genericFrame(frame);
}
function genericFrame(frame) {
  const keys = ['name','category','tags','sourceRectPx','clipPolygon','measurementStatus','notes','contentBoundsPx','pivotPx','anchorRole','walkSurfacesPx','solidShapesPx','hazardShapesPx','interactionShapesPx','components','terrain','background','beam'];
  const out = {}; for (const k of keys) if (frame[k] !== undefined) out[k] = clone(frame[k]);
  out.sourceRectPx=sourceRect(frame);
  return out;
}
function invalidate(frame, note = 'Source crop changed; pixel measurements are unresolved. Logical definition physics are preserved until explicitly regenerated.') {
  for (const k of ['contentBoundsPx','pivotPx','walkSurfacesPx','solidShapesPx','hazardShapesPx','interactionShapesPx','components']) frame[k] = null;
  if (frame.beam?.state === 'off') frame.hazardShapesPx = [];
  if (frame.beam) { for (const k of ['topEmitterPx','bottomReceiverPx','corePx','repeatCorePx','topMountPx','bottomMountPx']) frame.beam[k] = null; }
  if (frame.terrain) for (const k of ['leftJoinPx','rightJoinPx','leftCapPx','repeatRegionPx','rightCapPx']) frame.terrain[k] = null;
  if (frame.background) { frame.background.horizonYPx = null; frame.background.groundYPx = null; }
  frame.measurementStatus = 'unresolved'; frame.notes = [...(frame.notes || []), note];
}
function normalizedRect(r) {
  if (r == null) return null;
  if (!Array.isArray(r) || r.length !== 4 || !r.every(finite) || r[2] <= 0 || r[3] <= 0 || r.some(v => v < 0 || v > 1)) throw new Error('Geometry must be null or a normalized rectangle inside [0,1].');
  if (r[0] + r[2] > 1 || r[1] + r[3] > 1) throw new Error('Geometry rectangle must fit inside [0,1].');
  return [...r];
}
function shape(rect) { return rect == null ? [] : [{ kind: 'rect', rect }]; }

export function updateSourceFrame(doc, assetId, frameId, nextCrop) {
  const { asset, frame } = assetFrame(doc, assetId, frameId), c = crop(nextCrop);
  if (c.x + c.w > asset.width || c.y + c.h > asset.height) throw new Error('Crop must fit within the atlas.');
  syncFrame(frame, c); invalidate(frame); syncManifestFrame(asset, frameId, frame); return doc;
}

// Visual-only clipping; intentionally does not invalidate or regenerate logical geometry.
export function setSourceFrameOutline(doc, assetId, frameId, points) {
  const { asset, frame } = assetFrame(doc, assetId, frameId);
  if (points == null) delete frame.clipPolygon;
  else { const error = frameClipPolygonError(points); if (error) throw new Error(error); frame.clipPolygon = points.map(p => [p[0], p[1]]); }
  syncManifestFrame(asset, frameId, frame);
  return doc;
}

function scalePixelMetadata(value, sx, sy, key = '') {
  if (Array.isArray(value)) {
    if (key.endsWith('Px') && value.every(item => typeof item === 'number')) {
      if (value.length === 2) return [value[0] * sx, value[1] * sy];
      if (value.length === 4) return [value[0] * sx, value[1] * sy, value[2] * sx, value[3] * sy];
    }
    return value.map(item => scalePixelMetadata(item, sx, sy, key));
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number' && /^(x\d*|left|right|width|w)$/.test(key)) out[key] = item * sx;
    else if (typeof item === 'number' && /^(y\d*|top|bottom|height|h)$/.test(key)) out[key] = item * sy;
    else out[key] = scalePixelMetadata(item, sx, sy, key);
  }
  return out;
}

// Swap an atlas source without changing reusable definition IDs or world data.
// The caller supplies a decoded data URL and dimensions after validation.
export function replaceAtlasImage(doc, assetId, replacement, mode = 'keep') {
  const asset = doc.assets?.[assetId];
  if (!asset) throw new Error(`Unknown atlas: ${assetId}`);
  const width = Number(replacement?.width), height = Number(replacement?.height);
  if (!replacement?.src || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('Replacement image is invalid.');
  if (mode !== 'keep' && mode !== 'scale') throw new Error('Choose how to handle existing cut coordinates.');
  if (mode === 'keep') {
    for (const [id, frame] of Object.entries(asset.frames || {})) {
      const r = sourceRect(frame);
      if (!r || r.x + r.w > width || r.y + r.h > height) throw new Error(`Replacement image is too small for cut “${frame.name || id}”. Choose “Scale cuts to image size” or use a matching canvas.`);
    }
  } else {
    const sx = width / asset.width, sy = height / asset.height;
    for (const frame of Object.values(asset.frames || {})) {
      const r = sourceRect(frame);
      const x = Math.min(width - 1, Math.max(0, Math.round(r.x * sx))), y = Math.min(height - 1, Math.max(0, Math.round(r.y * sy)));
      const right = Math.min(width, Math.max(x + 1, Math.round((r.x + r.w) * sx))), bottom = Math.min(height, Math.max(y + 1, Math.round((r.y + r.h) * sy)));
      syncFrame(frame, { x, y, w: right - x, h: bottom - y });
    }
    for (const definition of Object.values(doc.definitions || {})) {
      if (definition.visual?.assetId !== assetId) continue;
      if (definition.visual.beamAlignment) definition.visual.beamAlignment = scalePixelMetadata(definition.visual.beamAlignment, sx, sy, 'beamAlignmentPx');
    }
    if(asset.manifest?.beamPairs)asset.manifest.beamPairs=scalePixelMetadata(asset.manifest.beamPairs,sx,sy);
  }
  asset.src = replacement.src; asset.width = width; asset.height = height;
  if (asset.manifest?.atlas) { asset.manifest.atlas.image = replacement.name || asset.manifest.atlas.image || asset.src; asset.manifest.atlas.width = width; asset.manifest.atlas.height = height; }
  for (const [id, frame] of Object.entries(asset.frames || {})) {
    invalidate(frame, 'Atlas image replaced; source-pixel measurements need review.');
    syncManifestFrame(asset, id, frame);
  }
  return doc;
}

export function setDefinitionGeometry(doc, definitionId, channel, input) {
  const d = doc.definitions?.[definitionId]; if (!d) throw new Error(`Unknown definition: ${definitionId}`);
  if (!['body','damage','interaction'].includes(channel)) throw new Error('Geometry channel must be body, damage, or interaction.');
  const rect = normalizedRect(input), p = d.physics;
  if (channel === 'body') { p.collider = rect; if (p.mode === 'trigger') p.interactionShapes = shape(rect); else p.solidShapes = shape(rect); if (rect && p.mode === 'none') p.mode = 'solid'; }
  if (channel === 'damage') { p.hitbox = rect; p.hazardShapes = shape(rect); p.lethal = rect != null && d.kind === 'enemy' && d.behavior?.actorType === 'creature' ? true : p.lethal; }
  if (channel === 'interaction') { p.collider = rect; p.interactionShapes = shape(rect); if (rect && p.mode === 'none') p.mode = 'trigger'; }
  p.calibration = 'authored';
  const v = d.visual, a = v && doc.assets[v.assetId], f = a?.frames?.[v.frameId];
  if (f && a.manifest?.format === 'platformer-tileset-manifest') {
    const r = sourceRect(f), key = channel === 'body' ? (p.mode==='trigger'?'interactionShapesPx':'solidShapesPx') : channel === 'damage' ? 'hazardShapesPx' : 'interactionShapesPx';
    if(rect){
      const x=Math.min(r.w-1,Math.floor(rect[0]*r.w)),y=Math.min(r.h-1,Math.floor(rect[1]*r.h));
      const right=Math.min(r.w,Math.max(x+1,Math.ceil((rect[0]+rect[2])*r.w))),bottom=Math.min(r.h,Math.max(y+1,Math.ceil((rect[1]+rect[3])*r.h)));
      f[key]=[{kind:'rect',rectPx:{x,y,w:right-x,h:bottom-y}}];
    }else f[key]=[];
    f.measurementStatus = 'estimated'; f.notes = [...(f.notes || []), 'Geometry authored in editor; source-pixel interpretation is estimated.']; syncManifestFrame(a, v.frameId, f);
  }
  return doc;
}

export function addSourceFrame(doc, assetId, nextCrop, options = {}) {
  const asset = doc.assets?.[assetId]; if (!asset) throw new Error(`Unknown asset: ${assetId}`);
  const c = crop(nextCrop); if (c.x + c.w > asset.width || c.y + c.h > asset.height) throw new Error('Crop must fit within the atlas.');
  const base = 'cut-', used = new Set(Object.keys(asset.frames)); let n = 1; while (used.has(`${base}${n}`)) n++;
  const frameId = `${base}${n}`, kind = options.kind || 'prop';
  if (kind === 'beam') throw new Error('Add beam frames through a complete ON/OFF manifest pair.');
  const category = ['platform','chest','prop','hazard','background','foliage','overhang'].includes(kind) ? kind : 'prop';
  const frame = { name: options.name || 'New asset', category, sourceRectPx: c, ...c, measurementStatus: 'estimated', notes: ['New source cut; review pixel measurements.'], contentBoundsPx: null, pivotPx: null, anchorRole: 'unresolved', walkSurfacesPx: null, solidShapesPx: null, hazardShapesPx: null, interactionShapesPx: null, components: null };
  if (category === 'platform') frame.terrain = { repeatX:'unverified', leftJoinPx:null, rightJoinPx:null, leftCapPx:null, repeatRegionPx:null, rightCapPx:null, compatibleLeftFrameIds:null, compatibleRightFrameIds:null };
  if (category === 'background') frame.background = { repeatX:'unverified', repeatY:'unverified', horizonYPx:null, groundYPx:null, composition:'unresolved' };
  asset.frames[frameId] = frame; syncManifestFrame(asset, frameId, frame);
  const id = `${assetId}:${frameId}`, size = kind === 'platform' ? { width: Math.min(180, c.w), height: c.h / c.w * Math.min(180, c.w) } : { width: Math.min(64, c.w), height: c.h / c.w * Math.min(64, c.w) };
  doc.definitions[id] = { id, name: frame.name, kind: frame.category === 'foliage' || frame.category === 'overhang' ? 'prop' : frame.category, visual: { assetId, frameId }, size, physics: { mode: kind === 'platform' ? 'solid' : 'none', collider: kind === 'platform' ? [.0,.0,1,1] : null, hitbox: null, lethal: false, gravity: false, calibration: 'estimated', solidShapes: null, hazardShapes: null, interactionShapes: null, walkSurfaces: null }, behavior: { type: 'static' }, source: { manifest: 'tileset', frameId } };
  return id;
}

export function removeSourceFrame(doc, assetId, frameId) {
  const { asset } = assetFrame(doc, assetId, frameId);
  if(Object.keys(asset.frames).length<=1)throw new Error('Keep at least one source cut. Add another cut before removing this one.');
  const refs = Object.entries(doc.definitions).filter(([,d]) => d.visual?.assetId === assetId && (d.visual.frameId === frameId || d.visual.onFrameId === frameId || d.visual.offFrameId === frameId || Object.values(d.visual.animations||{}).some(a=>a.frames.includes(frameId))));
  if (refs.some(([id,d]) => doc.placements.some(p => p.definitionId === id) || d.visual?.animations || d.visual?.onFrameId || d.visual?.offFrameId)) throw new Error('Cannot remove a placed, animated, or beam-referenced source frame.');
  for (const [id] of refs) delete doc.definitions[id];
  delete asset.frames[frameId]; if (asset.manifest?.frames) delete asset.manifest.frames[frameId]; return doc;
}

function genericManifest(asset) {
  if (asset.manifest?.format === 'platformer-tileset-manifest') return clone(asset.manifest);
  const frames = {}; for (const [id, f] of Object.entries(asset.frames)) frames[id] = genericFrame(f);
  return { format:'platformer-tileset-manifest', version:1, name:asset.name || asset.id, units:'source-image-pixels', coordinateSystem:'top-left-x-right-y-down', atlas:{ image:asset.manifest?.atlas?.image || asset.src, width:asset.width, height:asset.height, transparent:true, layout:'irregular', rendering:{filter:'nearest',defaultFacing:'not_applicable'} }, frames, measurement:{method:'mixed',notes:['Exported from level editor.']}, beamPairs:null };
}
export function exportTilesetManifest(doc, assetId, schema) {
  const asset = doc.assets?.[assetId]; if (!asset) throw new Error(`Unknown asset: ${assetId}`); if (/creature|sprite-atlas\/v1$/i.test(asset.manifest?.format || '')) throw new Error('Creature atlases cannot be exported as generic tilesets.');
  const m = genericManifest(asset);m.frames={};m.atlas.width=asset.width;m.atlas.height=asset.height;for (const [id,f] of Object.entries(asset.frames)) m.frames[id] = genericFrame(f);
  if (Array.isArray(m.beamPairs)) m.beamPairs = m.beamPairs.filter(p => m.frames[p.onFrameId]?.beam?.state === 'on' && m.frames[p.offFrameId]?.beam?.state === 'off');
  const errors = schema ? validateTilesetManifest(m, schema) : []; if (errors.length) throw new Error(errors.slice(0, 8).join('\n')); return m;
}
export function exportAssetLibrary(doc, assetIds = Object.keys(doc.assets)) {
  const documentErrors = validateDocument(doc); if (documentErrors.length) throw new Error(documentErrors.slice(0, 10).join('\n'));
  safe(assetIds); const ids = new Set(assetIds), defs = {};
  for (const [id,d] of Object.entries(doc.definitions)) if (ids.has(d.visual?.assetId)) defs[id] = clone(d);
  const pending = [...Object.values(defs)]; for (let i=0;i<pending.length;i++) { const depId = pending[i].behavior?.projectileDefinitionId; if (depId && !defs[depId]) { const dep = doc.definitions[depId]; if (!dep) throw new Error('Missing projectile dependency.'); defs[dep.id] = clone(dep); ids.add(dep.visual.assetId); pending.push(dep); } }
  const assets = {}; for (const id of ids) { if (!doc.assets[id]) throw new Error(`Unknown asset: ${id}`); assets[id] = clone(doc.assets[id]); }
  return { format:'level-editor-asset-library', version:1, assets, definitions:defs };
}
export function importAssetLibrary(doc, library, schema) {
  if (JSON.stringify(library).length > 100 * 1024 * 1024) throw new Error('Asset library exceeds the 100 MB import limit.');
  safe(library); if (!library || library.format !== 'level-editor-asset-library' || library.version !== 1 || !library.assets || !library.definitions) throw new Error('Unsupported asset library.');
  if (schema) for (const asset of Object.values(library.assets)) if (asset.manifest?.format === 'platformer-tileset-manifest') validateOrThrow(exportTilesetManifest({ assets: { [asset.id]: asset }, definitions: {} }, asset.id, schema));
  const candidate = clone(doc); Object.assign(candidate.assets, clone(library.assets)); Object.assign(candidate.definitions, clone(library.definitions));
  const errors = validateDocument(candidate); if (errors.length) throw new Error(errors.slice(0, 10).join('\n')); return candidate;
}

// Keep the opened level authoritative while retaining reusable assets from the
// current editor library. A failed merge never mutates the supplied document.
export function mergeLibraryIntoDocument(primaryDocument, retainedLibrary) {
  if (!primaryDocument || !retainedLibrary) return clone(primaryDocument);
  safe(retainedLibrary);
  if (retainedLibrary.format !== 'level-editor-asset-library' || retainedLibrary.version !== 1 || !retainedLibrary.assets || !retainedLibrary.definitions) throw new Error('Unsupported retained asset library.');
  const candidate = clone(primaryDocument);
  for (const [id, asset] of Object.entries(retainedLibrary.assets)) if (!candidate.assets[id]) candidate.assets[id] = clone(asset);
  for (const [id, definition] of Object.entries(retainedLibrary.definitions)) if (!candidate.definitions[id]) candidate.definitions[id] = clone(definition);
  const errors = validateDocument(candidate);
  if (errors.length) throw new Error(errors.slice(0, 10).join('\n'));
  return candidate;
}
function validateOrThrow(errors) { if (errors?.length) throw new Error(errors.slice(0, 8).join('\n')); }
