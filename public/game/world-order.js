export const DEFAULT_WORLD_ORDER = Object.freeze([1, 2, 3]);

export function normalizeWorldOrder(value) {
  if (!Array.isArray(value) || value.length !== 3 || !DEFAULT_WORLD_ORDER.every(id=>value.includes(id))) return [...DEFAULT_WORLD_ORDER];
  return [...value];
}

export function worldOrdinal(level, order = DEFAULT_WORLD_ORDER) {
  if (level === 0) return 0;
  const normalized = normalizeWorldOrder(order);
  const position = normalized.indexOf(level);
  return position < 0 ? 0 : position + 1;
}
