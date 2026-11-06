/** Pure support-platform helpers shared by the editor and focused tests. */
export function supportIdsFor(value) {
  const settings = value?.settings || value || {};
  if (Array.isArray(settings.supportIds)) return [...new Set(settings.supportIds.filter(Boolean))];
  return settings.supportId ? [settings.supportId] : [];
}

export function toggleSupportId(value, id) {
  const next = supportIdsFor(value);
  const index = next.indexOf(id);
  if (index < 0) next.push(id); else next.splice(index, 1);
  return next;
}

export function writeSupportIds(settings, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  settings.supportIds = unique;
  delete settings.supportId;
  return settings;
}

export function cleanupSupportIds(placements, removedIds) {
  const removed = removedIds instanceof Set ? removedIds : new Set(removedIds || []);
  for (const placement of placements || []) {
    const existing = placement.settings && (Array.isArray(placement.settings.supportIds) || placement.settings.supportId);
    if (!existing) continue;
    const ids = supportIdsFor(placement).filter(id => !removed.has(id));
    writeSupportIds(placement.settings, ids);
  }
  return placements;
}

export function pickPlatformAtPoint(candidates, point, contains) {
  return [...(candidates || [])].reverse().find(candidate => candidate.solid && contains(candidate, point)) || null;
}

export function remapSupportIds(settings, idMap) {
  const hadRefs = !!(settings && (Array.isArray(settings.supportIds) || settings.supportId));
  if (!hadRefs) return settings;
  const ids = supportIdsFor(settings).map(id => idMap.get(id) || id);
  return writeSupportIds(settings, ids);
}
