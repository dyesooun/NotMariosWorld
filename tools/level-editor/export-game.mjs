import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from '../../public/game/json-level/document.js';
import { serializeGameDocument } from '../../public/game/json-level/game-export.js';
import { buildProjectImageIndex, resolveProjectAssetPaths } from './project-images.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('Usage: node tools/level-editor/export-game.mjs <editor.json> <game.json>'); process.exitCode = 2; }
else try {
  if (path.resolve(input).toLowerCase() === path.resolve(output).toLowerCase()) throw new Error('Choose a separate game output file to preserve the editable source.');
  const source = parseDocument(await readFile(path.resolve(input), 'utf8')), index = await buildProjectImageIndex(), paths = resolveProjectAssetPaths(source, index);
  const text = serializeGameDocument(source, paths); await writeFile(path.resolve(output), text + '\n');
  const game = JSON.parse(text);
  console.log(`Exported ${source.name}: ${game.placements.length} placements, ${Object.keys(game.definitions).length} definitions, ${Object.keys(game.assets).length} atlases, ${Buffer.byteLength(text)} bytes.`);
} catch (error) { console.error(`Level export failed: ${error.message}`); process.exitCode = 1; }
