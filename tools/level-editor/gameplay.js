import { localToWorld } from './transforms.js';
import { shapePolygons } from './runtime-geometry.js';

export const GAMEPLAY_ROLES = [
  ['none', 'None'], ['coin', 'Coin'], ['checkpoint', 'Checkpoint'],
  ['spawnpoint', 'Spawn point'], ['exit', 'Exit'],
  ['power-chest', 'Power chest'], ['decoy-chest', 'Decoy chest'],
];
const ROLE_SET = new Set(GAMEPLAY_ROLES.map(([value]) => value));
const DEFAULT_TRIGGER = [0, 0, 1, 1];
const DEFAULT_ANCHOR = [0.5, 1];
const copy = value => Array.isArray(value) ? [...value] : value;
const validRole = value => ROLE_SET.has(value) ? value : 'none';
const first = (override, shared, fallback) => override !== undefined ? override : shared !== undefined ? shared : fallback;
const tags = (shared, override) => [...new Set([...(Array.isArray(shared) ? shared : []), ...(Array.isArray(override) ? override : [])])];

export function resolveGameplay(definition, placement = {}) {
  const shared = definition?.gameplay || {}, override = placement?.gameplay || {};
  const role = validRole(first(override.role, shared.role, 'none'));
  const result = {
    role,
    tags: tags(shared.tags, override.tags),
    triggerVolume: copy(first(override.triggerVolume, shared.triggerVolume, DEFAULT_TRIGGER)),
    coinValue: first(override.coinValue, shared.coinValue, 1),
    order: first(override.order, shared.order, undefined),
    anchor: copy(first(override.anchor, shared.anchor, DEFAULT_ANCHOR)),
    priority: first(override.priority, shared.priority, 0),
    targetLevelId: first(override.targetLevelId, shared.targetLevelId, undefined),
    chestId: first(override.chestId, shared.chestId, undefined),
    decoyKind: first(override.decoyKind, shared.decoyKind, 'spikes'),
    nonblocking: first(override.nonblocking, shared.nonblocking, role !== 'none'),
  };
  if ((role === 'power-chest' || role === 'decoy-chest') && !result.chestId) result.chestId = placement.id;
  return result;
}

export function setGameplayRole(current = {}, role) {
  if (!ROLE_SET.has(role)) throw new Error(`Unknown gameplay role: ${role}`);
  const next = { ...current, role };
  if (next.triggerVolume === undefined) next.triggerVolume = [...DEFAULT_TRIGGER];
  if (next.anchor === undefined) next.anchor = [...DEFAULT_ANCHOR];
  if (next.tags === undefined) next.tags = [];
  if (next.coinValue === undefined) next.coinValue = 1;
  if (next.priority === undefined) next.priority = 0;
  if (next.decoyKind === undefined) next.decoyKind = 'spikes';
  next.nonblocking = role === 'none' ? (current.nonblocking ?? false) : (current.nonblocking ?? true);
  return next;
}

export function gameplayAnchor(state, playerWidth = 28, playerHeight = 36) {
  const gameplay = state?.gameplay || {};
  const anchor = Array.isArray(gameplay.anchor) ? gameplay.anchor : DEFAULT_ANCHOR;
  const point = localToWorld(state, { x: anchor[0] * state.width, y: anchor[1] * state.height });
  return { x: point.x - playerWidth / 2, y: point.y - playerHeight };
}

export function gameplayTriggerPolygons(state) {
  const gameplay = state?.gameplay || {};
  // Gameplay is opt-in. A legacy preview state has no gameplay object and
  // must not accidentally become a full-placement trigger.
  if (!state || !state.gameplay || gameplay.role === undefined || gameplay.role === 'none' || state.vanished || state.collected || gameplay.collected) return [];
  const triggerVolume = Array.isArray(gameplay.triggerVolume) ? gameplay.triggerVolume : DEFAULT_TRIGGER;
  return shapePolygons({ ...state, vanished: false, physics: {
    ...(state.physics || {}), mode: 'trigger', collider: triggerVolume,
    interactionShapes: [{ kind: 'rect', rect: triggerVolume }],
  } }, 'interaction');
}

export const isGameplayRole = value => ROLE_SET.has(value);
