export const DOCUMENT_FORMAT = 'not-marios-world-level';
export const DOCUMENT_VERSION = 2;
import { GAMEPLAY_ROLES, resolveGameplay } from './gameplay.js';
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
    id: placement.id, definition, visual: definition.visual, physics: definition.physics,
    behavior: { ...definition.behavior, ...placement.settings },
    x: placement.x, y: placement.y, width: placement.width, height: placement.height,
    layer: placement.layer, flipX: !!placement.flipX, rotation: Number.isFinite(placement.rotation) ? placement.rotation : 0,
    animation: placement.animation || definition.visual.defaultAnimation || null,
    gameplay: resolveGameplay(definition, placement),
    vfx: { ...definition.vfx, ...placement.vfx },
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
    if(document.world.spawn!=null&&(!object(document.world.spawn)||!['x','y'].every(key=>finite(document.world.spawn[key])&&Math.abs(document.world.spawn[key])<=2000000)))error('world.spawn','must contain finite x/y coordinates in logical pixels');
    if (document.world.spawnPlacementId != null && (typeof document.world.spawnPlacementId !== 'string' || !document.world.spawnPlacementId.trim() || document.world.spawnPlacementId.length > 200)) error('world.spawnPlacementId', 'must be a nonempty string of at most 200 characters');
    const atmosphere = document.world.atmosphere;
    if (atmosphere != null) {
      if (!object(atmosphere)) error('world.atmosphere', 'must be an object');
      else {
        if (atmosphere.enabled != null && typeof atmosphere.enabled !== 'boolean') error('world.atmosphere.enabled', 'must be a boolean');
        if (atmosphere.color != null && !/^#[0-9a-f]{6}$/i.test(atmosphere.color)) error('world.atmosphere.color', 'must be a six-digit hex color');
        if (atmosphere.opacity != null && (!finite(atmosphere.opacity) || atmosphere.opacity < 0 || atmosphere.opacity > 1)) error('world.atmosphere.opacity', 'must be between 0 and 1');
        if (atmosphere.cards != null) {
          if (!Array.isArray(atmosphere.cards) || atmosphere.cards.length > 100) error('world.atmosphere.cards', 'must contain at most 100 fog cards');
          else for (const [i, card] of atmosphere.cards.entries()) {
            const path = `world.atmosphere.cards[${i}]`;
            if (!object(card)) { error(path, 'must be an object'); continue; }
            for (const key of ['x', 'y', 'width', 'height']) if (!finite(card[key]) || Math.abs(card[key]) > 2000000 || (['width', 'height'].includes(key) && card[key] <= 0)) error(`${path}.${key}`, 'must contain finite logical geometry with positive width/height');
            if (card.drift != null && (!finite(card.drift) || card.drift < 0 || card.drift > 500)) error(`${path}.drift`, 'must be between 0 and 500 pixels');
            if (card.speed != null && (!finite(card.speed) || Math.abs(card.speed) > 100)) error(`${path}.speed`, 'must be within ±100 pixels/second');
          }
        }
      }
    }
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
    if (value.type === 'enemy') {
      if (value.actorType != null && !['creature', 'shooter'].includes(value.actorType)) error(`${path}.actorType`, 'must be creature or shooter');
      if (value.flying != null && typeof value.flying !== 'boolean') error(`${path}.flying`, 'must be a boolean');
      if (value.states != null) {
        if (!object(value.states)) error(`${path}.states`, 'must be an object');
        else {
          const required = value.actorType === 'shooter' ? ['idle', 'playerDetected', 'shooting', 'dead'] : ['idle', 'moving', 'playerDetected', 'dead'];
          for (const key of required) if (value.states[key] != null && (typeof value.states[key] !== 'string' || !value.states[key].trim() || value.states[key].length > 100)) error(`${path}.states.${key}`, 'must be an animation name');
          if (value.detectedMode != null && !['once', 'while-detected'].includes(value.detectedMode)) error(`${path}.detectedMode`, 'must be once or while-detected');
        }
      }
      if (value.spawnOffset != null && (!Array.isArray(value.spawnOffset) || value.spawnOffset.length !== 2 || !value.spawnOffset.every(finite) || value.spawnOffset.some(n => n < -100 || n > 100))) error(`${path}.spawnOffset`, 'must be a normalized pivot delta within ±100');
      if (value.projectileDefinitionId != null && (typeof value.projectileDefinitionId !== 'string' || !value.projectileDefinitionId.trim() || value.projectileDefinitionId.length > 200)) error(`${path}.projectileDefinitionId`, 'must be a nonempty definition id');
      if (value.supportId != null && (typeof value.supportId !== 'string' || !value.supportId.trim())) error(`${path}.supportId`, 'must be a nonempty placement id');
      if (value.supportIds != null && (!Array.isArray(value.supportIds) || value.supportIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(value.supportIds).size !== value.supportIds.length)) error(`${path}.supportIds`, 'must be an array of unique nonempty placement ids');
    }
    if (value.type === 'projectile') {
      for (const key of ['flightAnimation', 'impactAnimation']) if (value[key] != null && (typeof value[key] !== 'string' || !value[key].trim())) error(`${path}.${key}`, 'must be a nonempty animation name');
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
        if (value.vanish.restoreMode != null && !['respawn', 'timed', 'permanent'].includes(value.vanish.restoreMode)) error(`${path}.vanish.restoreMode`, 'must be respawn, timed, or permanent');
        if (value.vanish.restoreMode === 'timed' && (!finite(value.vanish.restoreMs) || value.vanish.restoreMs < 1 || value.vanish.restoreMs > 3600000)) error(`${path}.vanish.restoreMs`, 'must be between 1 and 3600000 milliseconds for timed restore');
      }
    }
    if (value.speed != null && (!finite(value.speed) || value.speed < 0 || value.speed > 100000)) error(`${path}.speed`, 'must be between 0 and 100000');
    if (value.detectRange != null && (!finite(value.detectRange) || value.detectRange < 0 || value.detectRange > 1000000)) error(`${path}.detectRange`, 'must be between 0 and 1000000');
    if (value.attackRange != null && (!finite(value.attackRange) || value.attackRange < 0 || value.attackRange > 1000000)) error(`${path}.attackRange`, 'must be between 0 and 1000000');
    if (value.attackCooldownMs != null && (!finite(value.attackCooldownMs) || value.attackCooldownMs < 0 || value.attackCooldownMs > 3600000)) error(`${path}.attackCooldownMs`, 'must be between 0 and 3600000 milliseconds');
    if (value.fireIntervalMs != null && (!finite(value.fireIntervalMs) || value.fireIntervalMs < 1 || value.fireIntervalMs > 3600000)) error(`${path}.fireIntervalMs`, 'must be between 1 and 3600000 milliseconds');
    if (value.lifetimeMs != null && (!finite(value.lifetimeMs) || value.lifetimeMs < 1 || value.lifetimeMs > 3600000)) error(`${path}.lifetimeMs`, 'must be between 1 and 3600000 milliseconds');
  }
  function gameplay(value, path) {
    if (value == null) return;
    if (!object(value)) { error(path, 'must be an object'); return; }
    for (const key of ['role', 'tags', 'triggerVolume', 'coinValue', 'order', 'anchor', 'priority', 'targetLevelId', 'chestId', 'decoyKind', 'nonblocking']) if (Object.hasOwn(value, key) && value[key] === null) error(`${path}.${key}`, 'must not be null');
    if (value.role != null && !GAMEPLAY_ROLES.some(([role]) => role === value.role)) error(`${path}.role`, 'invalid gameplay role');
    if (value.tags != null && (!Array.isArray(value.tags) || value.tags.length > 100 || value.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 100))) error(`${path}.tags`, 'must be an array of nonempty strings');
    if (value.triggerVolume != null && (!Array.isArray(value.triggerVolume) || value.triggerVolume.length !== 4 || !value.triggerVolume.every(finite) || value.triggerVolume[2] <= 0 || value.triggerVolume[3] <= 0 || value.triggerVolume.some(v => Math.abs(v) > 100))) error(`${path}.triggerVolume`, 'must be a finite normalized rectangle within ±100');
    if (value.coinValue != null && (!Number.isInteger(value.coinValue) || value.coinValue < 1 || value.coinValue > 1000)) error(`${path}.coinValue`, 'must be an integer between 1 and 1000');
    if (value.order != null && (!Number.isInteger(value.order) || value.order < 1)) error(`${path}.order`, 'must be a positive integer');
    if (value.anchor != null && (!Array.isArray(value.anchor) || value.anchor.length !== 2 || !value.anchor.every(finite) || value.anchor.some(v => Math.abs(v) > 100))) error(`${path}.anchor`, 'must be a finite normalized point within ±100');
    if (value.priority != null && (!Number.isInteger(value.priority) || Math.abs(value.priority) > 1000000)) error(`${path}.priority`, 'must be a bounded integer');
    for (const key of ['targetLevelId', 'chestId']) if (value[key] != null && (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 200)) error(`${path}.${key}`, 'must be a nonempty string');
    if (value.decoyKind != null && !['spikes', 'bomb'].includes(value.decoyKind)) error(`${path}.decoyKind`, 'must be spikes or bomb');
    if (value.nonblocking != null && typeof value.nonblocking !== 'boolean') error(`${path}.nonblocking`, 'must be a boolean');
  }
  function vfx(value, path) {
    if (value == null) return;
    if (!object(value)) { error(path, 'must be an object'); return; }
    if (value.enabled != null && typeof value.enabled !== 'boolean') error(`${path}.enabled`, 'must be a boolean');
    if (value.color != null && !/^#[0-9a-f]{6}$/i.test(value.color)) error(`${path}.color`, 'must be a six-digit hex color');
    if (value.hazardType != null && !['auto', 'mushroom', 'thorns', 'spike', 'generic'].includes(value.hazardType)) error(`${path}.hazardType`, 'must be auto, mushroom, thorns, spike, or generic');
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
    vfx(definition.vfx, `${path}.vfx`);
    if (definition.behavior?.type === 'projectile' && definition.kind !== 'projectile') error(path, 'projectile behavior requires projectile kind');
    if (definition.kind === 'projectile' && definition.behavior?.type !== 'projectile') error(path, 'projectile kind requires projectile behavior');
    if (definition.behavior?.actorType === 'shooter' && definition.behavior?.projectileDefinitionId && document.definitions[definition.behavior.projectileDefinitionId]?.kind !== 'projectile') error(path, 'projectile definition must have projectile kind');
    if (definition.behavior?.type === 'enemy' && object(definition.behavior.states)) {
      const allowed = new Set(['idle', 'moving', 'playerDetected', 'shooting', 'attack', 'dead']);
      for (const [stateName, animationName] of Object.entries(definition.behavior.states)) {
        if (!allowed.has(stateName)) error(`${path}.behavior.states.${stateName}`, 'unknown actor state slot');
        if (animationName != null && !definition.visual?.animations?.[animationName]) error(`${path}.behavior.states.${stateName}`, 'must reference an existing animation');
      }
    }
    if (definition.behavior?.type === 'projectile') for (const key of ['flightAnimation', 'impactAnimation']) if (definition.behavior[key] && !definition.visual?.animations?.[definition.behavior[key]]) error(`${path}.behavior.${key}`, 'must reference an existing animation');
    if (definition.behavior?.projectileDefinitionId && !document.definitions[definition.behavior.projectileDefinitionId]) error(path, 'projectile definition does not exist');
    gameplay(definition.gameplay, `${path}.gameplay`);
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
    const placementBehavior = { ...definition.behavior, ...placement.settings };
    if (placementBehavior.type === 'enemy' && object(placementBehavior.states)) {
      const allowed = new Set(['idle', 'moving', 'playerDetected', 'shooting', 'attack', 'dead']);
      for (const [stateName, animationName] of Object.entries(placementBehavior.states)) {
        if (!allowed.has(stateName)) error(`${path}.settings.states.${stateName}`, 'unknown actor state slot');
        if (animationName != null && !definition.visual?.animations?.[animationName]) error(`${path}.settings.states.${stateName}`, 'must reference an existing animation');
      }
    }
    if (placementBehavior.type === 'projectile' && definition.kind !== 'projectile') error(`${path}.settings`, 'projectile behavior requires projectile kind');
    gameplay(placement.gameplay, `${path}.gameplay`);
    vfx(placement.vfx, `${path}.vfx`);
    const supportId = Array.isArray(placement.settings?.supportIds) ? null : placement.settings?.supportId;
    if (supportId && !document.placements.some(p => p.id === supportId && document.definitions[p.definitionId]?.kind === 'platform')) error(path, 'support platform does not exist');
    const supportIds = placement.settings?.supportIds;
    if (Array.isArray(supportIds)) for (const support of supportIds) if (support && !document.placements.some(p => p.id === support && document.definitions[p.definitionId]?.kind === 'platform')) error(`${path}.settings.supportIds`, 'support platform does not exist');
  }
  for (const [definitionId, definition] of Object.entries(document.definitions)) {
    const supportIds = definition.behavior?.supportIds;
    if (Array.isArray(supportIds)) for (const support of supportIds) if (support && !document.placements.some(p => p.id === support && document.definitions[p.definitionId]?.kind === 'platform')) error(`definitions.${definitionId}.behavior.supportIds`, 'support platform does not exist');
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
