// Runtime level registry.  Metadata is deliberately independent of world-order.js
// so authored levels can be added without introducing a routing cycle.
import { parseDocument } from './json-level/document.js';
import { resolveGameplay } from './json-level/gameplay.js';

function validateCatalog(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('Level catalog must contain at least one level.');
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Level catalog entries must be objects.');
    if (!Number.isSafeInteger(entry.id) || entry.id < 1 || ids.has(entry.id)) throw new Error(`Invalid duplicate level catalog id: ${entry.id}`);
    if (typeof entry.name !== 'string' || !entry.name.trim()) throw new Error(`Invalid level catalog name for ${entry.id}`);
    if (entry.legacy && ![2, 3].includes(entry.id)) throw new Error(`Unsupported legacy level ${entry.id}`);
    if (!entry.legacy && (typeof entry.src !== 'string' || !entry.src.trim())) throw new Error(`Authored level ${entry.id} is missing src`);
    ids.add(entry.id);
  }
  return entries.map(entry => Object.freeze({ ...entry }));
}
const isNode = typeof process !== 'undefined' && !!process.versions?.node;
async function readJson(src) {
  if (isNode) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const url = src.startsWith('/game/')
      ? new URL(`./${src.slice('/game/'.length)}`, import.meta.url)
      : src.startsWith('/') ? new URL(`..${src}`, import.meta.url)
      : new URL(src, import.meta.url);
    return JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
  }
  const response = await fetch(new URL(src, `${globalThis.location?.origin || ''}/game/`).href);
  if (!response.ok) throw new Error(`Cannot load authored level ${src} (${response.status}).`);
  return response.json();
}

const catalogDocument = await readJson('/game/level-catalog.json');
if (!Array.isArray(catalogDocument?.levels)) throw new Error('Level catalog JSON must contain a levels array.');
export const LEVEL_CATALOG = validateCatalog(catalogDocument.levels);
export const DEFAULT_LEVEL_IDS = LEVEL_CATALOG.map(entry => entry.id);

export async function loadLevelCatalog(entries = LEVEL_CATALOG) {
  const documents = new Map();
  for (const entry of entries) {
    if (!entry.src || entry.legacy) continue;
    const document = await readJson(entry.src);
    const documentUrl = new URL(entry.src, `${globalThis.location?.origin || 'http://localhost'}/game/`);
    for (const asset of Object.values(document.assets || {})) {
      if (typeof asset.src === 'string' && !/^(?:data:|blob:|https?:\/\/|\/)/i.test(asset.src)) asset.src = new URL(asset.src, documentUrl).pathname;
    }
    documents.set(entry.id, parseDocument(typeof document === 'string' ? document : JSON.stringify(document)));
  }
  return documents;
}

// Consumers that need the authored documents can await this once.  Legacy
// level entries remain available synchronously from levels.js.
export const LEVEL_DOCUMENTS = await loadLevelCatalog();
export function createLevelRegistry(entries = LEVEL_CATALOG, documents = LEVEL_DOCUMENTS) {
  const registry = new Map();
  for (const entry of entries) registry.set(entry.id, { ...entry, document: documents.get(entry.id) || null });
  return registry;
}
export const LEVEL_REGISTRY = createLevelRegistry();

export function documentToLevel(document, id = 1, metadata = {}) {
  if (!document) return null;
  const definitions = document.definitions || {};
  const placements = document.placements || [];
  const resolved = placement => {
    const definition = definitions[placement.definitionId] || {};
    const gameplay = resolveGameplay(definition, placement);
    return { placement, definition, gameplay };
  };
  const entries = placements.map(resolved);
  const platforms = entries.filter(({ definition }) => definition.kind === 'platform').map(({ placement, definition }) => ({
    id: placement.id, x: placement.x, y: placement.y, w: placement.width, h: placement.height,
    kind: placement.settings?.motion ? 'moving' : placement.settings?.vanish ? 'vanish' : 'wood',
    definitionId: placement.definitionId,
  }));
  const coins = entries.filter(({ gameplay }) => gameplay.role === 'coin').map(({ placement, gameplay }) => ({ id: placement.id, x: placement.x + placement.width / 2, y: placement.y + placement.height / 2, r: Math.min(placement.width, placement.height) / 2, value: gameplay.coinValue || 1 }));
  const checkpointEntries = entries.filter(({ gameplay }) => gameplay.role === 'checkpoint').sort((a,b)=>a.placement.x-b.placement.x);
  const checkpoints = checkpointEntries.map(({placement,gameplay},i)=>({id:placement.id,placementId:placement.id,x:placement.x+placement.width/2,y:placement.y+placement.height,order:Number.isFinite(gameplay.order)?gameplay.order:i+1})).sort((a,b)=>a.order-b.order);

  const exits = entries.filter(({ gameplay }) => gameplay.role === 'exit');
  const powerChests = entries.filter(({ gameplay }) => gameplay.role === 'power-chest').map(({ placement, gameplay }, i) => ({ id: gameplay.chestId || placement.id, placementId: placement.id, x: placement.x + placement.width / 2, y: placement.y + placement.height, w: placement.width, h: placement.height, index: i }));
  const hazards = entries.filter(({ definition, gameplay }) => gameplay.role === 'hazard' || gameplay.role === 'decoy-chest' || definition.kind === 'hazard' || definition.physics?.lethal).map(({ placement, definition, gameplay }) => ({ id: placement.id, x: placement.x, y: placement.y, w: placement.width, h: placement.height, kind: gameplay.role === 'decoy-chest' ? 'decoy' : definition.kind, actualKind: gameplay.role === 'decoy-chest' ? gameplay.decoyKind : definition.kind, label: definition.name || 'Hazard', definitionId: placement.definitionId }));
  const enemies = entries.filter(({ definition }) => definition.kind === 'enemy').map(({ placement, definition }) => ({ id: placement.id, x: placement.x, y: placement.y, w: placement.width, h: placement.height, kind: definition.name || 'enemy', platformIndex: -1, speed: definition.behavior?.speed || 42, shooter: definition.behavior?.type === 'enemy' && !!definition.behavior?.projectileDefinitionId }));
  return { id, theme: metadata.theme || document.biome || 'forest', name: metadata.name || document.name, width: document.world.width, height: document.world.height, endX: exits[0] ? exits[0].placement.x : document.world.width, platforms, coins, checkpoints, powerChests, hazards, enemies, jsonDocument: document, authored: true };
}
