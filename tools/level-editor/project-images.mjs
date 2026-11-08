import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compressedSiblingPath } from '../../public/game/json-level/project-image-path.js';

const EXT = new Set(['.png','.jpg','.jpeg','.webp','.gif','.bmp']);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function buildProjectImageIndex(root = path.join(PROJECT_ROOT, 'public/assets/sprites')) {
  const result = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name), info = await lstat(full);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await walk(full);
      else if (info.isFile() && EXT.has(path.extname(entry.name).toLowerCase())) {
        const bytes = await readFile(full), rel = path.relative(root, full).split(path.sep).join('/');
        result.push({ src: `/assets/sprites/${rel}`, sha256: createHash('sha256').update(bytes).digest('hex') });
      }
    }
  }
  await walk(root); return result.sort((a,b) => a.src.localeCompare(b.src));
}
function embeddedHash(src) { const match = /^data:image\/[\w.+-]+;base64,(.*)$/i.exec(src || ''); return match ? createHash('sha256').update(Buffer.from(match[1], 'base64')).digest('hex') : null; }
export function resolveProjectAssetPaths(document, index) {
  const bySrc = new Map((index || []).map(x => [x.src, x])), available = new Set(bySrc.keys()), byHash = new Map(), paths = {};
  for (const image of index || []) if (!byHash.has(image.sha256)) byHash.set(image.sha256, image.src);
  for (const [id, asset] of Object.entries(document.assets || {})) {
    if (/^\/assets\/sprites\//.test(asset.src || '')) {
      let src;
      try { src = decodeURIComponent(asset.src); } catch { src = null; }
      paths[id] = bySrc.has(src) ? compressedSiblingPath(src, available) : null;
    }
    else { const hash = embeddedHash(asset.src); if (hash && byHash.has(hash)) paths[id] = compressedSiblingPath(byHash.get(hash), available); }
  }
  return paths;
}
export function embeddedAssetHash(src) { return embeddedHash(src); }
