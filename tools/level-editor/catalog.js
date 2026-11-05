import { validateTilesetManifest } from './manifest-validation.js';

let schemaPromise;
const clone = value => JSON.parse(JSON.stringify(value));
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tileset';
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url} (${response.status}).`);
  return response.json();
}
const schema = () => schemaPromise ||= json('/assets/sprites/schema.json');
const rectangle = (rect, width, height) => rect && [rect.x / width, rect.y / height, rect.w / width, rect.h / height];
function shapes(value, width, height) {
  if (value == null) return null;
  return value.map(shape => shape.kind === 'rect'
    ? { kind: 'rect', rect: rectangle(shape.rectPx, width, height) }
    : { kind: 'polygon', points: shape.pointsPx.map(p => [p.x / width, p.y / height]) });
}
function bounds(geometry) {
  if (!geometry?.length) return null;
  const points = geometry.flatMap(shape => shape.kind === 'rect'
    ? [[shape.rect[0], shape.rect[1]], [shape.rect[0] + shape.rect[2], shape.rect[1] + shape.rect[3]]]
    : shape.points);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}
function sizeFor(category, rect) {
  const width = category === 'background' ? 640 : category === 'platform' ? Math.min(180, rect.w) : category === 'beam' ? rect.w * Math.min(1, 186 / rect.h) : Math.min(64, rect.w);
  return { width, height: rect.h / rect.w * width };
}
function tileDefinition(id, frameId, frame, assetId) {
  const { w, h } = frame.sourceRectPx;
  const body = shapes(frame.solidShapesPx, w, h), danger = shapes(frame.hazardShapesPx, w, h), interaction = shapes(frame.interactionShapesPx, w, h);
  let collider = bounds(body), hitbox = bounds(danger), mode = body?.length ? 'solid' : interaction?.length || danger?.length ? 'trigger' : 'none';
  let estimated = false;
  if (frame.category === 'platform') {
    mode = 'solid';
    if (body === null) { collider = [.08, .18, .84, .22]; estimated = true; }
  }
  if (frame.category === 'chest') {
    mode = 'trigger'; collider = bounds(interaction);
    if (interaction === null) { collider = [.1, .1, .8, .9]; estimated = true; }
  }
  if (['hazard', 'beam'].includes(frame.category)) {
    mode = 'trigger';
    if (danger === null) { hitbox = [.075, .075, .85, .85]; estimated = true; }
  }
  return {
    id, name: frame.name, kind: ['foliage', 'overhang'].includes(frame.category) ? 'prop' : frame.category,
    visual: { assetId, frameId, ...(frame.pivotPx ? { pivot: [frame.pivotPx.x / w, frame.pivotPx.y / h] } : {}) },
    size: sizeFor(frame.category, frame.sourceRectPx),
    physics: {
      mode, collider, hitbox, lethal: !!hitbox || !!danger?.length, gravity: false,
      calibration: estimated || frame.measurementStatus !== 'measured' ? 'estimated' : 'manifest',
      solidShapes: body, hazardShapes: danger, interactionShapes: interaction,
      walkSurfaces: frame.walkSurfacesPx?.map(s => ({ ...s, x1: s.x1 / w, y1: s.y1 / h, x2: s.x2 / w, y2: s.y2 / h })) ?? null,
    },
    behavior: { type: 'static' }, source: { manifest: 'tileset', frameId },
  };
}

export async function createTilesetCatalog(manifest, imageSrc, { existingIds = [], schema: suppliedSchema } = {}) {
  if (manifest?.format !== 'platformer-tileset-manifest') throw new Error('New tilesets must follow the generic tileset schema.');
  const errors = validateTilesetManifest(manifest, suppliedSchema || await schema());
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'));
  const used = new Set(existingIds), base = `${slug(manifest.name)}-atlas`;
  let assetId = base, suffix = 2;
  while (used.has(assetId)) assetId = `${base}-${suffix++}`;
  const asset = { id: assetId, name: manifest.name, src: imageSrc, width: manifest.atlas.width, height: manifest.atlas.height, frames: {}, manifest: clone(manifest) };
  const definitions = {}, warnings = [];
  for (const [frameId, frame] of Object.entries(manifest.frames)) {
    asset.frames[frameId] = { ...clone(frame), ...frame.sourceRectPx };
    if (frame.category === 'beam') continue;
    const definitionId = `${assetId}:${frameId}`;
    definitions[definitionId] = tileDefinition(definitionId, frameId, frame, assetId);
  }
  const beams = Object.entries(manifest.frames).filter(([, frame]) => frame.category === 'beam');
  const offFrames = beams.filter(([, frame]) => frame.beam.state === 'off');
  const onFrames = beams.filter(([, frame]) => frame.beam.state === 'on');
  let pairs = manifest.beamPairs || [];
  if (!pairs.length && onFrames.length) {
    pairs = onFrames.map(([onId, on]) => ({ id: onId, onFrameId: onId, offFrameId: [...offFrames].sort(([, a], [, b]) => Math.abs(a.sourceRectPx.w - on.sourceRectPx.w) - Math.abs(b.sourceRectPx.w - on.sourceRectPx.w))[0]?.[0] || onId, offOffsetPx: { x: 0, y: 0 }, onOffsetPx: { x: 0, y: 0 }, measurementStatus: 'estimated' }));
    warnings.push('Beam pairings use estimated alignment; review their ON/OFF artwork.');
  }
  for (const pair of pairs) {
    const frame = manifest.frames[pair.onFrameId], definitionId = `${assetId}:beam:${pair.id}`;
    const definition = tileDefinition(definitionId, pair.onFrameId, frame, assetId);
    definition.name = `${frame.name} (beam)`;
    definition.visual = { ...definition.visual, onFrameId: pair.onFrameId, offFrameId: pair.offFrameId, beamAlignment: clone(pair) };
    definition.behavior = { type: 'beam', onMs: 1000, offMs: 1000, phaseMs: 0, startState: 'on' };
    if (pair.measurementStatus !== 'measured') definition.physics.calibration = 'estimated';
    definitions[definitionId] = definition;
  }
  const estimated = Object.values(definitions).filter(d => d.physics.calibration === 'estimated').length;
  if (estimated) warnings.push(`${estimated} definitions use estimated geometry; review before renderer integration.`);
  return { assets: { [assetId]: asset }, definitions, warnings };
}

export function adaptLegacyForestTileset(manifest) {
  const categories = { platforms: 'platform', decorations: 'prop', hazards: 'hazard', vertical_beam: 'beam', tile_specific_props: 'prop', overhang_decorations: 'overhang', background_parallax: 'background', flowers_plants: 'foliage' };
  const frames = {};
  for (const [id, frame] of Object.entries(manifest.frames)) {
    const category = /chest/i.test(id) ? 'chest' : categories[frame.category] || 'prop';
    frames[id] = {
      name: frame.display_name || id, category, sourceRectPx: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      measurementStatus: 'unresolved', notes: ['Existing crop preserved; numerical geometry has not been measured.'],
      contentBoundsPx: null, pivotPx: null, anchorRole: frame.anchor === 'bottom_center' ? 'ground' : 'unresolved',
      walkSurfacesPx: null, solidShapesPx: null, hazardShapesPx: null, interactionShapesPx: null, components: null,
    };
    if (category === 'platform') frames[id].terrain = { repeatX: 'unverified', leftJoinPx: null, rightJoinPx: null, leftCapPx: null, repeatRegionPx: null, rightCapPx: null, compatibleLeftFrameIds: null, compatibleRightFrameIds: null };
    if (category === 'background') frames[id].background = { repeatX: 'unverified', repeatY: 'unverified', horizonYPx: null, groundYPx: null, composition: 'unresolved' };
    if (category === 'beam') {
      const state = id.includes('_off_') ? 'off' : 'on';
      frames[id].beam = { state, topEmitterPx: null, bottomReceiverPx: null, corePx: null, repeatCorePx: null, topMountPx: null, bottomMountPx: null, coreRepeatY: 'unverified' };
      if (state === 'off') frames[id].hazardShapesPx = [];
    }
  }
  return {
    format: 'platformer-tileset-manifest', version: 1, name: manifest.theme || 'Forest tileset', units: 'source-image-pixels', coordinateSystem: 'top-left-x-right-y-down',
    atlas: { image: manifest.asset, width: manifest.atlas.width, height: manifest.atlas.height, transparent: true, layout: 'irregular', rendering: { filter: 'nearest', defaultFacing: 'not_applicable' } },
    frames, measurement: { method: 'mixed', notes: ['Legacy forest crop adapter; geometry intentionally unresolved.'] }, beamPairs: null,
  };
}

export function createCreatureCatalog(manifest) {
  const assetId = 'forest-creatures-atlas';
  const asset = { id: assetId, name: 'Forest creatures', src: '/assets/sprites/forest/creatures/creatures.png', width: manifest.atlas.width, height: manifest.atlas.height, frames: clone(manifest.frames), manifest: clone(manifest) };
  const definitions = {};
  for (const entity of [...manifest.enemies, ...manifest.projectiles]) {
    const definitionId = `${assetId}:${entity.id}`, projectile = manifest.projectiles.includes(entity);
    const frameId = Object.values(entity.animations)[0].frames[0], frame = asset.frames[frameId];
    const [px, py] = entity.pivot_px, [x, y, w, h] = entity.collision_box_relative_to_pivot_px;
    const body = [(px + x) / frame.w, (py + y) / frame.h, w / frame.w, h / frame.h];
    const animations = clone(entity.animations);
    const animation = ['run','walk','hover','idle','flight'].find(name => animations[name]) || Object.keys(animations)[0];
    definitions[definitionId] = {
      id: definitionId, name: entity.display_name, kind: projectile ? 'projectile' : 'enemy',
      visual: { assetId, frameId, animations, defaultAnimation: animation, pivot: [px / frame.w, py / frame.h] },
      size: { width: projectile ? 40 : 64, height: (projectile ? 40 : 64) * frame.h / frame.w },
      physics: { mode: 'trigger', collider: body, hitbox: body, lethal: true, gravity: !!entity.gravity, calibration: 'estimated' },
      behavior: projectile ? { type: 'projectile', speed: 120, lifetimeMs: 3000 } : {
        type: 'enemy', role: entity.role, speed: 42, detectRange: 400, fireIntervalMs: 4800,
        ...(entity.projectile_id ? { projectileDefinitionId: `${assetId}:${entity.projectile_id}`, spawnOffset: entity.spawn_offset_from_pivot_px.map((n, i) => n / (i ? frame.h : frame.w)) } : {}),
      },
      source: { manifest: 'forest-creatures', entityId: entity.id, interpretationHints: clone(entity) },
    };
  }
  return { assets: { [assetId]: asset }, definitions, warnings: [] };
}

export async function loadForestCatalog() {
  const [tileset, creatures, tilesetSchema] = await Promise.all([
    json('/assets/sprites/forest/tileset/manifest.json'), json('/assets/sprites/forest/creatures/manifest.json'), schema(),
  ]);
  const current = tileset.format === 'platformer-tileset-manifest';
  if (!current && tileset.format !== 'whimsical-overgrowth-forest-tileset-atlas/v1') throw new Error('The bundled forest tileset has an unsupported format.');
  const sourceImage = new URL(current ? tileset.atlas.image : tileset.asset, 'http://editor.local/assets/sprites/forest/tileset/');
  if (sourceImage.origin !== 'http://editor.local' || !sourceImage.pathname.startsWith('/assets/sprites/')) throw new Error('Bundled tileset images must use a local sprite path.');
  const result = await createTilesetCatalog(current ? tileset : adaptLegacyForestTileset(tileset), sourceImage.pathname, { schema: tilesetSchema });
  const creatureCatalog = createCreatureCatalog(creatures);
  Object.assign(result.assets, creatureCatalog.assets); Object.assign(result.definitions, creatureCatalog.definitions);
  if (!current) result.warnings.unshift('Bundled forest uses legacy crop metadata with editable geometry estimates. Future tilesets must use the generic schema.');
  return result;
}
