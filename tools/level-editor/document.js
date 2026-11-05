export const DOCUMENT_FORMAT = 'not-marios-world-level';
export const DOCUMENT_VERSION = 2;
export const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const id = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const KINDS = ['platform', 'enemy', 'character', 'chest', 'background', 'prop', 'beam', 'hazard', 'projectile'];

export function createDocument(catalog) {
  return {
    format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, id: id('level'),
    name: 'Untitled level', biome: 'custom',
    world: { width: 14200, height: 600, backgroundColor: '#183c38' },
    assets: clone(catalog.assets), definitions: clone(catalog.definitions), placements: [],
  };
}

export function createPlacement(document, definitionId, x, y) {
  const definition = document.definitions[definitionId];
  if (!definition) throw new Error('Choose an existing asset definition.');
  return {
    id: id('object'), definitionId, x, y,
    width: definition.size.width, height: definition.size.height,
    layer: definition.kind === 'background' ? -20 : ['prop'].includes(definition.kind) ? -5 : 0,
    flipX: false, rotation: 0, settings: {},
  };
}

export function resolvePlacement(document, placement) {
  const definition = document.definitions[placement.definitionId];
  if (!definition) throw new Error(`Missing definition: ${placement.definitionId}`);
  return {
    definition, visual: definition.visual, physics: definition.physics,
    behavior: { ...definition.behavior, ...placement.settings },
    x: placement.x, y: placement.y, width: placement.width, height: placement.height,
    layer: placement.layer, flipX: !!placement.flipX, rotation: Number.isFinite(placement.rotation) ? placement.rotation : 0,
    animation: placement.animation || definition.visual.defaultAnimation || null,
  };
}

function hasUnsafeKeys(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => ['__proto__', 'prototype', 'constructor'].includes(key) || hasUnsafeKeys(child));
}

export function validateDocument(document) {
  const errors = [];
  const error = (path, message) => { if (errors.length < 80) errors.push(`${path}: ${message}`); };
  if (!object(document)) return ['Document must be a JSON object.'];
  if (hasUnsafeKeys(document)) return ['Document contains an unsafe object key.'];
  if (document.format !== DOCUMENT_FORMAT || document.version !== DOCUMENT_VERSION) return ['Unsupported level format or version.'];
  if (typeof document.id !== 'string' || !document.id) error('id', 'must be a nonempty string');
  if (typeof document.name !== 'string' || !document.name.trim() || document.name.length > 200) error('name', 'must contain 1–200 characters');
  if (!object(document.world)) error('world', 'must be an object');
  else {
    for (const [key, limit] of [['width', 1000000], ['height', 100000]]) {
      if (!finite(document.world[key]) || document.world[key] < 1 || document.world[key] > limit) error(`world.${key}`, `must be between 1 and ${limit} logical pixels`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(document.world.backgroundColor)) error('world.backgroundColor', 'must be a six-digit hex color');
  }
  for (const key of ['assets', 'definitions']) if (!object(document[key])) error(key, 'must be an object');
  if (!Array.isArray(document.placements)) error('placements', 'must be an array');
  if (!object(document.assets) || !object(document.definitions) || !Array.isArray(document.placements)) return errors;
  if (Object.keys(document.assets).length > 100) error('assets', 'at most 100 atlases are supported');
  if (Object.keys(document.definitions).length > 20000 || document.placements.length > 20000) error('document', 'at most 20000 definitions and placements are supported');

  for (const [assetId, asset] of Object.entries(document.assets)) {
    const path = `assets.${assetId}`;
    if (!object(asset)) { error(path, 'must be an object'); continue; }
    if (asset.id !== assetId) error(path, 'id must match its map key');
    if (typeof asset.src !== 'string' || !(/^(?:\/assets\/sprites\/|data:image\/(?:png|jpeg|webp|gif|bmp);base64,)/i.test(asset.src))) error(path, 'image must use a local sprite path or embedded raster data URL');
    if (!Number.isInteger(asset.width) || asset.width <= 0 || !Number.isInteger(asset.height) || asset.height <= 0) error(path, 'atlas dimensions must be positive integers');
    if (!object(asset.frames)) { error(path, 'frames must be an object'); continue; }
    for (const [frameId, frame] of Object.entries(asset.frames)) {
      if (!object(frame) || !['x','y','w','h'].every(key => Number.isInteger(frame[key])) || frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0 || frame.x + frame.w > asset.width || frame.y + frame.h > asset.height) error(`${path}.frames.${frameId}`, 'crop must fit the atlas');
    }
  }

  function rect(value, path) {
    if (value === null) return;
    if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[2] <= 0 || value[3] <= 0 || value.some(v => Math.abs(v) > 100)) error(path, 'must be null or a finite normalized [x,y,width,height] rectangle');
  }
  function shapes(value, path) {
    if (value == null) return;
    if (!Array.isArray(value)) { error(path, 'must be an array or null'); return; }
    for (const [i, shape] of value.entries()) {
      if (shape?.kind === 'rect') rect(shape.rect, `${path}[${i}]`);
      else if (shape?.kind === 'polygon') {
        if (!Array.isArray(shape.points) || shape.points.length < 3 || !shape.points.every(p => Array.isArray(p) && p.length === 2 && p.every(finite))) error(`${path}[${i}]`, 'polygon needs at least three finite points');
      } else error(`${path}[${i}]`, 'unknown shape type');
    }
  }
  function behavior(value, path) {
    if (!object(value) || !['static','moving','beam','enemy','projectile'].includes(value.type)) { error(path, 'invalid behavior type'); return; }
    if (value.type === 'moving') {
      if (!['x', 'y'].includes(value.axis)) error(path, 'movement axis must be x or y');
      if (!finite(value.distance) || value.distance < 0 || value.distance > 100000) error(path, 'travel distance must be between 0 and 100000');
      if (!finite(value.periodMs) || value.periodMs < 1 || value.periodMs > 3600000) error(path, 'periodMs must be between 1 and 3600000');
    }
    if (value.type === 'beam') {
      for (const key of ['onMs','offMs']) if (!finite(value[key]) || value[key] < 1 || value[key] > 3600000) error(`${path}.${key}`, 'must be between 1 and 3600000 milliseconds');
      if (!['on','off'].includes(value.startState)) error(path, 'beam startState must be on or off');
    }
    if (value.motion !== undefined && value.motion !== null) {
      if (!object(value.motion)) error(`${path}.motion`, 'motion must be null or an object');
      else {
        if (!['x', 'y'].includes(value.motion.axis)) error(`${path}.motion.axis`, 'motion axis must be x or y');
        if (!finite(value.motion.distance) || value.motion.distance < 0 || value.motion.distance > 100000) error(`${path}.motion.distance`, 'motion distance must be between 0 and 100000');
        if (!finite(value.motion.periodMs) || value.motion.periodMs < 1 || value.motion.periodMs > 3600000) error(`${path}.motion.periodMs`, 'motion periodMs must be between 1 and 3600000');
        if (value.motion.phaseMs != null && (!finite(value.motion.phaseMs) || Math.abs(value.motion.phaseMs) > 3600000)) error(`${path}.motion.phaseMs`, 'motion phaseMs must be finite and within one hour');
      }
    }
    if (value.phaseMs != null && (!finite(value.phaseMs) || Math.abs(value.phaseMs) > 3600000)) error(path, 'phaseMs must be finite and within one hour');
    if (value.startMs != null && (!finite(value.startMs) || value.startMs < 0 || value.startMs > 3600000)) error(path, 'startMs must be between 0 and 3600000 milliseconds');
    if (value.vanish != null) {
      if (!object(value.vanish)) error(path, 'vanish must be an object');
      else {
        rect(value.vanish.triggerVolume, `${path}.vanish.triggerVolume`);
        if (!finite(value.vanish.countdownMs) || value.vanish.countdownMs < 0 || value.vanish.countdownMs > 3600000) error(`${path}.vanish.countdownMs`, 'must be between 0 and 3600000 milliseconds');
      }
    }
    for (const key of ['speed','detectRange','fireIntervalMs','lifetimeMs']) if (value[key] != null && (!finite(value[key]) || value[key] < 0)) error(`${path}.${key}`, 'must be a nonnegative finite number');
  }
  for (const [definitionId, definition] of Object.entries(document.definitions)) {
    const path = `definitions.${definitionId}`;
    if (!object(definition)) { error(path, 'must be an object'); continue; }
    if (definition.id !== definitionId) error(path, 'id must match its map key');
    if (typeof definition.name !== 'string' || !definition.name.trim()) error(path, 'name is required');
    if(definition.levels!=null&&(!Array.isArray(definition.levels)||definition.levels.length>100||definition.levels.some(level=>typeof level!=='string'||!level.trim()||level.length>100)))error(path,'level tags must be an array of nonempty strings');
    if (!KINDS.includes(definition.kind)) error(path, 'invalid object kind');
    if (!object(definition.size) || !finite(definition.size.width) || !finite(definition.size.height) || definition.size.width <= 0 || definition.size.height <= 0) error(path, 'default display size must be positive');
    const visual = definition.visual;
    const asset = document.assets[visual?.assetId];
    if (!object(visual) || !asset || !Object.hasOwn(asset.frames || {}, visual.frameId)) error(path, 'visual must reference an existing atlas frame');
    if (visual) {
      for (const key of ['offset','scale','pivot']) if (visual[key] != null && (!Array.isArray(visual[key]) || visual[key].length !== 2 || !visual[key].every(finite) || (key === 'scale' && visual[key].some(n => n <= 0)))) error(path, `invalid visual ${key}`);
      for (const key of ['onFrameId','offFrameId']) if (visual[key] && !Object.hasOwn(asset?.frames || {}, visual[key])) error(path, `${key} must reference an existing frame`);
      if (visual.animations != null && !object(visual.animations)) error(path, 'animations must be an object');
      else for (const [name, animation] of Object.entries(visual.animations || {})) {
        if (!Array.isArray(animation?.frames) || !animation.frames.length || animation.frames.some(f => !Object.hasOwn(asset?.frames || {}, f)) || !finite(animation.fps) || animation.fps <= 0 || animation.fps > 120 || typeof animation.loop !== 'boolean') error(`${path}.animations.${name}`, 'invalid frames, fps, or loop flag');
        if (!object(animation) || !Array.isArray(animation.frames)) continue;
        for (const index of animation.damage_active_indices || []) if (!Number.isInteger(index) || index < 0 || index >= animation.frames.length) error(path, 'damage event index is outside its animation');
        if (animation.spawn_projectile_at_index != null && (!Number.isInteger(animation.spawn_projectile_at_index) || animation.spawn_projectile_at_index < 0 || animation.spawn_projectile_at_index >= animation.frames.length)) error(path, 'projectile event index is outside its animation');
      }
      if (visual.defaultAnimation && !Object.hasOwn(visual.animations || {}, visual.defaultAnimation)) error(path, 'default animation is missing');
    }
    const physics = definition.physics;
    if (!object(physics)) error(path, 'physics definition is required');
    else {
      if (!['none','solid','trigger'].includes(physics.mode)) error(path, 'invalid collision mode');
      rect(physics.collider, `${path}.collider`); rect(physics.hitbox, `${path}.hitbox`);
      for (const key of ['solidShapes','hazardShapes','interactionShapes']) shapes(physics[key], `${path}.${key}`);
      if (typeof physics.lethal !== 'boolean' || typeof physics.gravity !== 'boolean') error(path, 'lethal and gravity must be booleans');
      if (!['estimated','manifest','authored'].includes(physics.calibration)) error(path, 'invalid calibration status');
      if (physics.walkSurfaces != null && (!Array.isArray(physics.walkSurfaces) || physics.walkSurfaces.some(s => !['horizontal','slope'].includes(s.kind) || !['x1','y1','x2','y2'].every(k => finite(s[k]))))) error(path, 'invalid walking surfaces');
    }
    behavior(definition.behavior, `${path}.behavior`);
    if (definition.behavior?.projectileDefinitionId && !document.definitions[definition.behavior.projectileDefinitionId]) error(path, 'projectile definition does not exist');
  }
  const placementIds = new Set();
  for (const [i, placement] of document.placements.entries()) {
    const path = `placements[${i}]`;
    if (!object(placement)) { error(path, 'must be an object'); continue; }
    if (typeof placement.id !== 'string' || !placement.id || placementIds.has(placement.id)) error(path, 'placement ID must be nonempty and unique');
    placementIds.add(placement.id);
    const definition = document.definitions[placement.definitionId];
    if (!definition) { error(path, 'definition does not exist'); continue; }
    for (const key of ['x','y','width','height','layer']) if (!finite(placement[key]) || Math.abs(placement[key]) > 2000000 || (['width','height'].includes(key) && placement[key] <= 0)) error(`${path}.${key}`, 'invalid logical geometry');
    if (typeof placement.flipX !== 'boolean' || !object(placement.settings)) error(path, 'flipX and settings are required');
    if (!finite(placement.rotation) || placement.rotation < -360000 || placement.rotation > 360000) error(`${path}.rotation`, 'must be finite and between -360000 and 360000 degrees');
    if (placement.animation && !definition.visual.animations?.[placement.animation]) error(path, 'selected animation does not exist');
    behavior({ ...definition.behavior, ...placement.settings }, `${path}.settings`);
    const supportId = placement.settings?.supportId;
    if (supportId && !document.placements.some(p => p.id === supportId && document.definitions[p.definitionId]?.kind === 'platform')) error(path, 'support platform does not exist');
  }
  return errors;
}

export function parseDocument(text) {
  if (text.length > 100 * 1024 * 1024) throw new Error('Project exceeds the 100 MB import limit.');
  const document = JSON.parse(text);
  if (document?.format === DOCUMENT_FORMAT && document.version === 1) {
    for (const placement of document.placements || []) if (placement && placement.rotation == null) placement.rotation = 0;
    document.version = DOCUMENT_VERSION;
  }
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.slice(0, 10).join('\n'));
  return document;
}

export function serializeDocument(document) {
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.slice(0, 10).join('\n'));
  return JSON.stringify(document, null, 2);
}

export class History {
  constructor(initial, limit = 30) { this.states = [JSON.stringify(initial)]; this.index = 0; this.limit = limit; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.states.length - 1; }
  commit(document) {
    const value = JSON.stringify(document);
    if (value === this.states[this.index]) return false;
    this.states.splice(this.index + 1); this.states.push(value);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1; return true;
  }
  undo() { return this.canUndo ? JSON.parse(this.states[--this.index]) : null; }
  redo() { return this.canRedo ? JSON.parse(this.states[++this.index]) : null; }
}
