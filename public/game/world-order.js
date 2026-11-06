import { DEFAULT_LEVEL_IDS } from './level-catalog.js';

export const DEFAULT_WORLD_ORDER = Object.freeze([...DEFAULT_LEVEL_IDS]);

export function normalizeWorldOrder(value) {
  if (!Array.isArray(value) || value.length !== DEFAULT_WORLD_ORDER.length || !DEFAULT_WORLD_ORDER.every(id=>value.includes(id))) return [...DEFAULT_WORLD_ORDER];
  return [...value];
}

export function worldOrdinal(level, order = DEFAULT_WORLD_ORDER) {
  if (level === 0) return 0;
  const normalized = normalizeWorldOrder(order);
  const position = normalized.indexOf(level);
  return position < 0 ? 0 : position + 1;
}
