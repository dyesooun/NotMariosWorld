const MAX_PIXELS = 16_777_216;

function integer(value, name, { min = 1 } = {}) {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${name} must be an integer >= ${min}`);
  return value;
}

function optionsBase({ maxCuts = 2000, paddingPx = 0 } = {}) {
  integer(maxCuts, 'maxCuts');
  if (maxCuts > 5000) throw new RangeError('maxCuts must not exceed 5000');
  if (!Number.isInteger(paddingPx) || paddingPx < 0) throw new RangeError('paddingPx must be a non-negative integer');
  return { maxCuts, paddingPx };
}

function validateImage(imageData) {
  if (!imageData || !Number.isInteger(imageData.width) || imageData.width < 1 ||
      !Number.isInteger(imageData.height) || imageData.height < 1) {
    throw new TypeError('imageData width and height must be positive integers');
  }
  const pixels = imageData.width * imageData.height;
  if (pixels > MAX_PIXELS) throw new RangeError(`decoded pixel count exceeds ${MAX_PIXELS}`);
  if (!imageData.data || imageData.data.length !== pixels * 4) {
    throw new RangeError('imageData.data length must equal width * height * 4');
  }
  return pixels;
}

function paddedRect(box, pad, width, height) {
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  const right = Math.min(width, box.x + box.w + pad), bottom = Math.min(height, box.y + box.h + pad);
  return { x, y, w: right - x, h: bottom - y };
}

function bboxGap(a, b) {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(dx, dy);
}

export function detectAtlasCuts(imageData, {
  alphaThreshold = 32, minAreaPx = 24, mergeGapPx = 3, paddingPx = 1, maxCuts = 2000
} = {}) {
  const pixels = validateImage(imageData);
  const { maxCuts: limit, paddingPx: pad } = optionsBase({ maxCuts, paddingPx });
  integer(alphaThreshold, 'alphaThreshold', { min: 0 });
  if (alphaThreshold > 255) throw new RangeError('alphaThreshold must not exceed 255');
  integer(minAreaPx, 'minAreaPx');
  if (!Number.isInteger(mergeGapPx) || mergeGapPx < 0) throw new RangeError('mergeGapPx must be a non-negative integer');
  const { width, height, data } = imageData;
  let opaqueCount = 0;
  for (let p = 0; p < pixels; p++) { const a = data[p * 4 + 3]; if (a > 0 && a >= alphaThreshold) opaqueCount++; }
  if (!opaqueCount) return { cuts: [], warnings: ['No pixels met alphaThreshold; atlas is empty.'], opaque: false };
  if (opaqueCount / pixels >= 0.98) {
    return { cuts: [{ x: 0, y: 0, w: width, h: height, areaPx: opaqueCount }],
      warnings: ['Atlas is nearly fully opaque; choose grid cuts or manual regions.'], opaque: true };
  }

  const seen = new Uint8Array(pixels), components = [];
  const stack = [];
  const push = (index) => { seen[index] = 1; stack.push(index); };
  for (let start = 0; start < pixels; start++) {
    if (seen[start] || data[start * 4 + 3] === 0 || data[start * 4 + 3] < alphaThreshold) continue;
    push(start); let area = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    while (stack.length) {
      const index = stack.pop(), x = index % width, y = (index / width) | 0;
      area++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x && !seen[index - 1] && data[(index - 1) * 4 + 3] > 0 && data[(index - 1) * 4 + 3] >= alphaThreshold) push(index - 1);
      if (x + 1 < width && !seen[index + 1] && data[(index + 1) * 4 + 3] > 0 && data[(index + 1) * 4 + 3] >= alphaThreshold) push(index + 1);
      if (y && !seen[index - width] && data[(index - width) * 4 + 3] > 0 && data[(index - width) * 4 + 3] >= alphaThreshold) push(index - width);
      if (y + 1 < height && !seen[index + width] && data[(index + width) * 4 + 3] > 0 && data[(index + width) * 4 + 3] >= alphaThreshold) push(index + width);
    }
    components.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, areaPx: area });
    if (components.length > Math.max(50000, limit * 25)) throw new RangeError('atlas has too many components to analyze safely');
  }
  // Small components are removed only after the merge pass, so detached details can be retained.
  const parent = components.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  if (mergeGapPx > 0) {
    const bins=new Map(),scale=64;let comparisons=0;
    components.forEach((c,i)=>{
      const candidates=new Set();
      for(let y=Math.floor((c.y-mergeGapPx)/scale);y<=Math.floor((c.y+c.h+mergeGapPx)/scale);y++)for(let x=Math.floor((c.x-mergeGapPx)/scale);x<=Math.floor((c.x+c.w+mergeGapPx)/scale);x++)for(const j of bins.get(`${x},${y}`)||[])candidates.add(j);
      for(const j of candidates){if(++comparisons>5_000_000)throw new RangeError('Too many fragments to group. Raise the alpha cutoff, reduce the merge gap, or use Grid.');if(bboxGap(c,components[j])<=mergeGapPx)join(i,j);}
      for(let y=Math.floor(c.y/scale);y<=Math.floor((c.y+c.h)/scale);y++)for(let x=Math.floor(c.x/scale);x<=Math.floor((c.x+c.w)/scale);x++){
        const key=`${x},${y}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);
      }
    });
  }
  const merged = new Map();
  components.forEach((part, i) => {
    const root = find(i), old = merged.get(root);
    if (!old) merged.set(root, { ...part });
    else { const right = Math.max(old.x + old.w, part.x + part.w), bottom = Math.max(old.y + old.h, part.y + part.h);
      old.x = Math.min(old.x, part.x); old.y = Math.min(old.y, part.y); old.w = right - old.x; old.h = bottom - old.y; old.areaPx += part.areaPx; }
  });
  const cuts = [...merged.values()].filter((c) => c.areaPx >= minAreaPx).map((c) => ({ ...paddedRect(c, pad, width, height), areaPx: c.areaPx }));
  if (cuts.length > limit) throw new RangeError(`atlas has more than maxCuts (${limit}) regions`);
  cuts.sort((a, b) => a.y - b.y || a.x - b.x);
  return { cuts, warnings: [], opaque: false };
}

export function createGridCuts({ atlasWidth, atlasHeight, cellWidthPx, cellHeightPx, paddingPx = 0, spacingPx = 0, columns, rows, maxCuts = 2000 } = {}) {
  integer(atlasWidth, 'atlasWidth'); integer(atlasHeight, 'atlasHeight'); integer(cellWidthPx, 'cellWidthPx'); integer(cellHeightPx, 'cellHeightPx');
  if (!Number.isInteger(spacingPx) || spacingPx < 0) throw new RangeError('spacingPx must be a non-negative integer');
  const { maxCuts: limit, paddingPx: pad } = optionsBase({ maxCuts, paddingPx });
  const fitCols = Math.floor((atlasWidth - 2 * pad + spacingPx) / (cellWidthPx + spacingPx));
  const fitRows = Math.floor((atlasHeight - 2 * pad + spacingPx) / (cellHeightPx + spacingPx));
  const cols = columns === undefined ? fitCols : integer(columns, 'columns');
  const rowCount = rows === undefined ? fitRows : integer(rows, 'rows');
  if (!cols || !rowCount || cols > fitCols || rowCount > fitRows) throw new RangeError('grid extents exceed atlas dimensions');
  if (cols * rowCount > limit) throw new RangeError(`grid has more than maxCuts (${limit}) cells`);
  const cuts = [];
  for (let y = 0; y < rowCount; y++) for (let x = 0; x < cols; x++) {
    const raw = { x: pad + x * (cellWidthPx + spacingPx), y: pad + y * (cellHeightPx + spacingPx), w: cellWidthPx, h: cellHeightPx };
    cuts.push({ ...raw, areaPx: cellWidthPx * cellHeightPx });
  }
  return cuts;
}

export function estimateFrameGeometry(imageData, crop, { alphaThreshold = 32 } = {}) {
  validateImage(imageData); integer(alphaThreshold, 'alphaThreshold', { min: 0 });
  if (alphaThreshold > 255) throw new RangeError('alphaThreshold must not exceed 255');
  if (!crop || !['x', 'y', 'w', 'h'].every((k) => Number.isInteger(crop[k])) || crop.x < 0 || crop.y < 0 || crop.w < 1 || crop.h < 1 || crop.x + crop.w > imageData.width || crop.y + crop.h > imageData.height) throw new RangeError('crop must be an integer rectangle within image bounds');
  let minX = crop.w, minY = crop.h, maxX = -1, maxY = -1;
  for (let y = 0; y < crop.h; y++) for (let x = 0; x < crop.w; x++) {
    const a = imageData.data[((crop.y + y) * imageData.width + crop.x + x) * 4 + 3]; if (a === 0 || a < alphaThreshold) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { contentBoundsPx: null, suggestedRectPx: null, pivotPx: null, walkSurfacesPx: null, measurementStatus: 'estimated', notes: ['Crop contains no pixels meeting alphaThreshold.'] };
  const contentBoundsPx = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { contentBoundsPx, suggestedRectPx: { ...contentBoundsPx }, pivotPx: { x: Math.round(minX + contentBoundsPx.w / 2), y: minY + contentBoundsPx.h }, walkSurfacesPx: [{ kind: 'horizontal', x1: minX, y1: minY, x2: maxX+1, y2: minY }], measurementStatus: 'estimated', notes: ['Geometry is an alpha-derived estimate; configure runtime physics separately.'] };
}
