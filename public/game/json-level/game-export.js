import { validateDocument, clone, DOCUMENT_FORMAT, DOCUMENT_VERSION } from './document.js';

const own = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const copyKeys = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const out = {};
  for (const key of keys) if (own(value, key)) out[key] = value[key] === undefined ? undefined : clone(value[key]);
  return out;
};
const GEOMETRY = ['solidShapes', 'hazardShapes', 'interactionShapes', 'collider', 'hitbox', 'walkSurfaces'];
const BEHAVIOR = ['type','actorType','flying','states','detectedMode','spawnOffset','projectileDefinitionId','supportId','supportIds','axis','distance','periodMs','motion','phaseMs','startMs','vanish','speed','detectRange','attackRange','attackCooldownMs','fireIntervalMs','lifetimeMs','bodySize','flightAnimation','impactAnimation','onMs','offMs','startState'];
const VISUAL = ['assetId','frameId','offset','scale','pivot','defaultAnimation','onFrameId','offFrameId','beamAlignment','animations'];
const PHYSICS = ['mode', 'lethal', 'gravity', ...GEOMETRY];
const PLACEMENT = ['id','definitionId','x','y','width','height','layer','flipX','rotation','animation','settings','gameplay','vfx'];
const GAMEPLAY = ['role','tags','triggerVolume','coinValue','order','anchor','priority','targetLevelId','chestId','decoyKind','nonblocking'];
const VFX = ['enabled','hazardType','color'];
const ANIMATION = ['frames','fps','loop','damage_active_indices','spawn_projectile_at_index'];
const FRAME = ['x','y','w','h'];

function runtimeAnimation(animation) { return copyKeys(animation, ANIMATION); }
function runtimeShapes(shapes) {
  if (shapes == null) return shapes;
  return (shapes || []).map(shape => shape?.kind === 'rect' ? { kind: 'rect', rect: clone(shape.rect) } : shape?.kind === 'polygon' ? { kind: 'polygon', points: clone(shape.points) } : null).filter(Boolean);
}
function runtimeVisual(visual, usedFrames) {
  const out = copyKeys(visual, VISUAL);
  if (visual?.animations) {
    out.animations = {};
    for (const [name, animation] of Object.entries(visual.animations)) {
      out.animations[name] = runtimeAnimation(animation);
      for (const frame of animation.frames || []) usedFrames.add(frame);
    }
  }
  if (visual?.beamAlignment) {
    out.beamAlignment = copyKeys(visual.beamAlignment, ['offOffsetPx','onOffsetPx']);
    for (const key of ['offOffsetPx','onOffsetPx']) if (visual.beamAlignment[key]) out.beamAlignment[key] = copyKeys(visual.beamAlignment[key], ['x','y']);
  }
  for (const key of ['frameId','onFrameId','offFrameId']) if (visual?.[key]) usedFrames.add(visual[key]);
  return out;
}
function runtimeBehavior(value) {
  const out = copyKeys(value, BEHAVIOR);
  if (value?.states) out.states = copyKeys(value.states, ['idle','moving','playerDetected','shooting','attack','dead']);
  if (value?.motion) out.motion = copyKeys(value.motion, ['axis','distance','periodMs','phaseMs']);
  if (value?.vanish) out.vanish = copyKeys(value.vanish, ['triggerVolume','countdownMs','restoreMode','restoreMs']);
  if (value?.bodySize && !Array.isArray(value.bodySize)) out.bodySize = copyKeys(value.bodySize, ['width','height']);
  return out;
}
function runtimeDefinition(definition) {
  const usedFrames = new Set();
  const out = copyKeys(definition, ['id','name','kind','size','tags','visual','physics','behavior','gameplay','vfx']);
  out.size = copyKeys(definition.size, ['width','height']);
  out.visual = runtimeVisual(definition.visual, usedFrames);
  out.physics = copyKeys(definition.physics, PHYSICS);
  for (const key of GEOMETRY.slice(0, 3)) if (definition.physics?.[key] != null) out.physics[key] = runtimeShapes(definition.physics[key]);
  if (definition.physics?.walkSurfaces) out.physics.walkSurfaces = definition.physics.walkSurfaces.map(surface => copyKeys(surface, ['kind','x1','y1','x2','y2']));
  out.behavior = runtimeBehavior(definition.behavior);
  if (definition.gameplay) out.gameplay = copyKeys(definition.gameplay, GAMEPLAY);
  if (definition.vfx) out.vfx = copyKeys(definition.vfx, VFX);
  out.__usedFrames = usedFrames;
  return out;
}
function runtimePlacement(placement) {
  const out = copyKeys(placement, PLACEMENT);
  if (placement.settings) out.settings = runtimeBehavior(placement.settings);
  if (placement.gameplay) out.gameplay = copyKeys(placement.gameplay, GAMEPLAY);
  if (placement.vfx) out.vfx = copyKeys(placement.vfx, VFX);
  return out;
}
function usedDefinitionIds(document) {
  const ids = new Set((document.placements || []).map(p => p.definitionId));
  for (const id of [...ids]) {
    const d = document.definitions[id];
    const projectile = d?.behavior?.projectileDefinitionId;
    if (projectile) ids.add(projectile);
    for (const p of document.placements || []) if (p.definitionId === id && p.settings?.projectileDefinitionId) ids.add(p.settings.projectileDefinitionId);
  }
  let changed = true;
  while (changed) { changed = false; for (const id of [...ids]) { const p = document.definitions[id]?.behavior?.projectileDefinitionId; if (p && !ids.has(p)) { ids.add(p); changed = true; } } }
  return ids;
}

export function createGameDocument(document, assetPaths = {}) {
  const errors = validateDocument(document);
  if (errors.length) throw new Error(`Cannot export invalid source document:\n${errors.slice(0, 10).join('\n')}`);
  const ids = usedDefinitionIds(document), definitions = {}, assetIds = new Set(), frameIds = new Map();
  for (const id of ids) {
    const source = document.definitions[id];
    if (!source) throw new Error(`Cannot export missing definition ${id}.`);
    const d = runtimeDefinition(source); definitions[id] = d; assetIds.add(source.visual.assetId); const frames = frameIds.get(source.visual.assetId) || new Set(); for (const frame of d.__usedFrames) frames.add(frame); frameIds.set(source.visual.assetId, frames); delete d.__usedFrames;
  }
  const assets = {};
  for (const assetId of assetIds) {
    const source = document.assets[assetId];
    if (!source) throw new Error(`Cannot export missing asset ${assetId}.`);
    if (own(assetPaths, assetId) && !assetPaths[assetId]) throw new Error(`Asset ${assetId} is missing from public/assets/sprites. Copy the matching artwork into public/assets/sprites and try again.`);
    const src = own(assetPaths, assetId) ? assetPaths[assetId] : source.src;
    if (typeof src !== 'string' || !src.startsWith('/assets/sprites/') || src.includes('\\') || /[\u0000-\u001f?#]/.test(src) || src.split('/').some(part => part === '..' || part === '.')) throw new Error(`Asset ${assetId} must resolve to an existing /assets/sprites/ project path.`);
    const frames = {}; for (const frameId of frameIds.get(assetId) || []) if (source.frames[frameId]) frames[frameId] = copyKeys(source.frames[frameId], FRAME);
    assets[assetId] = { id: assetId, src, width: source.width, height: source.height, frames };
  }
  const world = copyKeys(document.world, ['width','height','backgroundColor','spawn','spawnPlacementId','atmosphere']);
  if (world.spawn) world.spawn = copyKeys(world.spawn, ['x','y']);
  if (world.atmosphere) {
    world.atmosphere = copyKeys(world.atmosphere, ['enabled','color','opacity','cards']);
    if (Array.isArray(world.atmosphere.cards)) world.atmosphere.cards = world.atmosphere.cards.map(c => copyKeys(c, ['x','y','width','height','drift','speed']));
  }
  const result = { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, id: document.id, name: document.name, biome: document.biome, world, assets, definitions, placements: (document.placements || []).map(runtimePlacement) };
  const resultErrors = validateDocument(result);
  if (resultErrors.length) throw new Error(`Exported game document is invalid:\n${resultErrors.slice(0, 10).join('\n')}`);
  return result;
}
export function serializeGameDocument(document, assetPaths = {}) { return JSON.stringify(createGameDocument(document, assetPaths)); }
