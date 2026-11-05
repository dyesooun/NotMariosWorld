/*
 * Character import intentionally accepts metadata owned by the editor. A simple
 * hand-authored mapping is also supported:
 * { frames: { id: {x,y,w,h} }, characters: [{ id, name, animations,
 * defaultAnimation, size, pivot, collider, hitbox }] }.
 * `animations` uses { state: { frames: ['frame-id'], fps, loop } }.
 */
const BAD = new Set(['__proto__', 'prototype', 'constructor']);
import { createDocument, validateDocument } from './document.js';
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clone = v => JSON.parse(JSON.stringify(v));
function unsafe(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (BAD.has(key)) throw new Error(`${path}.${key}: unsafe key`);
    unsafe(child, `${path}.${key}`);
  }
}
function crop(value, width, height, path) {
  if (!value || !['x','y','w','h'].every(k => Number.isInteger(value[k])) || value.w <= 0 || value.h <= 0 || value.x < 0 || value.y < 0 || value.x + value.w > width || value.y + value.h > height) {
    throw new Error(`${path}: crop must be a positive integer rectangle inside the image.`);
  }
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}
function normalizedRect(value, path) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[2] <= 0 || value[3] <= 0 || value.some(n => n < 0 || n > 1) || value[0] + value[2] > 1 || value[1] + value[3] > 1) throw new Error(`${path}: expected a normalized rectangle inside [0,1].`);
  return [...value];
}
function frameIdsFromManifest(manifest, width, height) {
  const frames = {};
  for (const [id, value] of Object.entries(manifest.frames || {})) frames[id] = { ...value, ...crop(value, width, height, `frames.${id}`), name: value.display_name || value.description || id };
  return frames;
}
function sizeFor(frame, requested) {
  if (requested && finite(requested.width) && finite(requested.height) && requested.width > 0 && requested.height > 0) return { width: requested.width, height: requested.height };
  return { width: 64, height: Math.max(1, 64 * frame.h / frame.w) };
}
function sizeForChecked(frame, requested, path) {
  if (requested != null && (!requested || !finite(requested.width) || !finite(requested.height) || requested.width <= 0 || requested.height <= 0)) throw new Error(`${path}: size width and height must be positive.`);
  return sizeFor(frame, requested);
}
function toNormalizedCollision(value, frame, pivot, path, relativePixels = false) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[2] <= 0 || value[3] <= 0) throw new Error(`${path}: expected [x,y,width,height].`);
  return relativePixels
    ? normalizedRect([(pivot[0] + value[0]) / frame.w, (pivot[1] + value[1]) / frame.h, value[2] / frame.w, value[3] / frame.h], path)
    : normalizedRect(value, path);
}
function animationMap(input, frames, path) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${path}: animations are required.`);
  const out = {};
  for (const [state, value] of Object.entries(input)) {
    if (!value || !Array.isArray(value.frames) || !value.frames.length) throw new Error(`${path}.${state}: frames are required.`);
    for (const id of value.frames) if (!Object.hasOwn(frames, id)) throw new Error(`${path}.${state}: unknown frame ${id}.`);
    if (!finite(value.fps) || value.fps <= 0 || value.fps > 120 || typeof value.loop !== 'boolean') throw new Error(`${path}.${state}: fps and loop are required.`);
    out[state] = { frames: [...value.frames], fps: value.fps, loop: value.loop };
    if (value.damage_active_indices != null) {
      if (!Array.isArray(value.damage_active_indices) || value.damage_active_indices.some(index => !Number.isInteger(index) || index < 0 || index >= value.frames.length)) throw new Error(`${path}.${state}: damage event index is outside the state.`);
      out[state].damage_active_indices = [...value.damage_active_indices];
    }
    if (value.spawn_projectile_at_index != null) {
      if (!Number.isInteger(value.spawn_projectile_at_index) || value.spawn_projectile_at_index < 0 || value.spawn_projectile_at_index >= value.frames.length) throw new Error(`${path}.${state}: projectile event index is outside the state.`);
      out[state].spawn_projectile_at_index = value.spawn_projectile_at_index;
    }
  }
  if (!Object.keys(out).length) throw new Error(`${path}: at least one state is required.`);
  return out;
}
function uniqueId(base, used) { let id = base, n = 2; while (used.has(id)) id = `${base}-${n++}`; used.add(id); return id; }

export function createCharacterCatalog({ name = 'Imported character', imageSrc, width, height, cuts = [], manifest = null, existingIds = [], levels = [] } = {}) {
  if (typeof imageSrc !== 'string' || !imageSrc) throw new Error('Character image source is required.');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('Character image dimensions are required.');
  unsafe(manifest);
  if (manifest && Array.isArray(manifest)) throw new Error('Character manifest must be an object.');
  if (manifest?.atlas && (manifest.atlas.width !== width || manifest.atlas.height !== height)) throw new Error('Character manifest dimensions do not match the decoded image.');
  if (manifest && Object.hasOwn(manifest, 'characters') && (!Array.isArray(manifest.characters) || !manifest.characters.length)) throw new Error('Character manifest must contain at least one character.');
  if (manifest && Object.hasOwn(manifest, 'enemies') && (!Array.isArray(manifest.enemies) || !manifest.enemies.length)) throw new Error('Character manifest must contain at least one enemy.');
  const frames = manifest ? frameIdsFromManifest(manifest, width, height) : {};
  if (!manifest) {
    if (!Array.isArray(cuts) || !cuts.length) throw new Error('At least one character frame cut is required.');
    cuts.forEach((value, i) => { const rect = crop(value, width, height, `cuts[${i}]`); const id = `frame-${String(i + 1).padStart(4, '0')}`; frames[id] = { ...rect, name: value.name || `Frame ${i + 1}` }; });
  }
  if (!Object.keys(frames).length) throw new Error('Character import contains no frames.');
  const used = new Set(existingIds), assetId = uniqueId(`${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'}-atlas`, used);
  const assetFrames = Object.fromEntries(Object.entries(frames).map(([id, frame]) => [id, { ...clone(frame), sourceRectPx: { x: frame.x, y: frame.y, w: frame.w, h: frame.h } }]));
  const asset = { id: assetId, name, src: imageSrc, width, height, frames: assetFrames, characterImport: true, manifest: manifest ? clone(manifest) : undefined };
  const definitions = {}, characters = manifest?.characters || manifest?.enemies || [];
  const specs = characters.length ? characters : [{ id: 'character', name, animations: { idle: { frames: Object.keys(frames), fps: 8, loop: true } } }];
  const characterIds = new Set();
  for (const spec of specs) {
    if (!spec || typeof spec.id !== 'string' || !spec.id.trim() || characterIds.has(spec.id)) throw new Error('Character IDs must be nonempty and unique.');
    characterIds.add(spec.id);
    const fallbackId = Object.keys(frames)[0];
    const requestedDefault = spec.defaultAnimation || Object.keys(spec.animations || {})[0] || 'idle';
    const requestedState = spec.animations?.[requestedDefault];
    const firstId = requestedState?.frames?.[0] || fallbackId;
    if (!frames[firstId]) throw new Error(`${spec.id}: default state references an unknown frame.`);
    const first = frames[firstId];
    const pivot = Array.isArray(spec.pivot_px) ? spec.pivot_px : Array.isArray(spec.pivot) ? spec.pivot : [first.w / 2, first.h];
    if (!Array.isArray(pivot) || pivot.length !== 2 || !pivot.every(finite)) throw new Error(`${spec.id}: pivot must contain two finite pixels.`);
    const animations = animationMap(spec.animations || { idle: { frames: [firstId], fps: 8, loop: true } }, frames, `${spec.id}.animations`);
    const defaultAnimation = spec.defaultAnimation || Object.keys(animations)[0];
    if (!animations[defaultAnimation]) throw new Error(`${spec.id}: default animation is missing.`);
    const collider = !manifest && spec.collider == null && spec.collision_box_relative_to_pivot_px == null
      ? [0.1, 0.1, 0.8, 0.9]
      : spec.collision_box_relative_to_pivot_px != null
      ? toNormalizedCollision(spec.collision_box_relative_to_pivot_px, first, pivot, `${spec.id}.collider`, true)
      : toNormalizedCollision(spec.collider, first, pivot, `${spec.id}.collider`);
    const hitbox = toNormalizedCollision(spec.hitbox, first, pivot, `${spec.id}.hitbox`);
    const definitionId = uniqueId(`${assetId}:${spec.id}`, used);
    definitions[definitionId] = { id: definitionId, name: spec.display_name || spec.name || spec.id, kind: 'character', levels: [...levels], visual: { assetId, frameId: firstId, animations, defaultAnimation, pivot: [pivot[0] / first.w, pivot[1] / first.h] }, size: sizeForChecked(first, spec.size, `${spec.id}.size`), physics: { mode: collider ? 'trigger' : 'none', collider, hitbox, lethal: !!hitbox, gravity: manifest ? spec.gravity !== false : false, calibration: manifest ? 'manifest' : 'estimated', solidShapes: null, hazardShapes: null, interactionShapes: null, walkSurfaces: null }, behavior: { type: 'static' }, source: { characterId: spec.id, characterImport: true } };
  }
  const result = { assets: { [assetId]: asset }, definitions, warnings: manifest ? [] : ['Character states are preview metadata; the engine owns runtime state changes.'] };
  const errors = validateDocument(createDocument(result));
  if (errors.length) throw new Error(`Character import validation failed: ${errors.join('\n')}`);
  return result;
}
