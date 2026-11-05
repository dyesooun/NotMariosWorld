import { resolvePlacement } from './document.js';
import { placementMatrix,placementCorners } from './transforms.js';

export async function loadImages(assets) {
  const entries = await Promise.all(Object.entries(assets).map(([id, asset]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) reject(new Error(`${asset.name || id}: image dimensions do not match the manifest.`));
      else resolve([id, image]);
    };
    image.onerror = () => reject(new Error(`Cannot load image for ${asset.name || id}.`));
    image.src = asset.src;
  })));
  return new Map(entries);
}

const modulo = (value, period) => ((value % period) + period) % period;
export function getPreviewState(document, placement, timeMs = 0) {
  const resolved = resolvePlacement(document, placement);
  const { behavior, visual } = resolved;
  let { x, y } = resolved;
  let frameId = visual.frameId, beamOn = null, damageActive = false;
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  if (behavior.type === 'moving') {
    const offset = Math.sin((time + (behavior.phaseMs || 0)) / Math.max(1, behavior.periodMs) * Math.PI * 2) * behavior.distance;
    if (behavior.axis === 'y') y += offset; else x += offset;
  }
  if (behavior.type === 'beam') {
    const on = Math.max(1, behavior.onMs), off = Math.max(1, behavior.offMs);
    const clock = modulo(time + (behavior.phaseMs || 0), on + off);
    beamOn = behavior.startState === 'off' ? clock >= off : clock < on;
    frameId = (beamOn ? visual.onFrameId : visual.offFrameId) || visual.frameId;
    damageActive = beamOn;
  } else {
    const animation = visual.animations?.[resolved.animation];
    if (animation?.frames?.length) {
      const elapsedFrames = Math.floor(time / 1000 * animation.fps);
      const index = animation.loop ? elapsedFrames % animation.frames.length : Math.min(animation.frames.length - 1, elapsedFrames);
      frameId = animation.frames[index];
      damageActive = (animation.damage_active_indices || []).includes(index);
    }
  }
  return { ...resolved, x, y, frameId, assetId: visual.assetId, beamOn, damageActive };
}

function shapePath(ctx, shape, width, height) {
  ctx.beginPath();
  if (shape.kind === 'rect') { const r = shape.rect; ctx.rect(r[0] * width, r[1] * height, r[2] * width, r[3] * height); }
  else if (shape.kind === 'polygon' && shape.points.length) {
    shape.points.forEach(([x, y], i) => i ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)); ctx.closePath();
  }
}
function overlay(ctx, shapes, fallback, color, width, height) {
  const geometry = shapes == null ? (fallback ? [{ kind: 'rect', rect: fallback }] : []) : shapes;
  ctx.strokeStyle = color; ctx.fillStyle = `${color}22`; ctx.lineWidth = 1;
  for (const shape of geometry) { shapePath(ctx, shape, width, height); ctx.fill(); ctx.stroke(); }
}

export function drawPlacement(ctx, document, placement, images, { timeMs = 0, collisions = false, selected = false } = {}) {
  const state = getPreviewState(document, placement, timeMs);
  const { x, y, width, height, assetId, frameId, physics } = state;
  const frame = document.assets[assetId]?.frames[frameId];
  const image = images.get(assetId);
  const matrix = placementMatrix(state);
  ctx.save(); ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f); ctx.imageSmoothingEnabled = false;
  let artX = (state.visual.offset?.[0] || 0) * width, artY = (state.visual.offset?.[1] || 0) * height;
  let artWidth = width * (state.visual.scale?.[0] ?? 1), artHeight = height * (state.visual.scale?.[1] ?? 1);
  if (state.beamOn === false && frame && state.visual.beamAlignment) {
    const alignment = state.visual.beamAlignment, onFrame = document.assets[assetId].frames[state.visual.onFrameId];
    artX += (alignment.offOffsetPx.x - alignment.onOffsetPx.x) / onFrame.w * width;
    artY += (alignment.offOffsetPx.y - alignment.onOffsetPx.y) / onFrame.h * height;
    artWidth *= frame.w / onFrame.w; artHeight *= frame.h / onFrame.h;
  }
  if (image && frame) ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, artX, artY, artWidth, artHeight);
  else { ctx.fillStyle = '#75484b'; ctx.fillRect(0, 0, width, height); }
  if (collisions) {
    if (physics.mode === 'solid') overlay(ctx, physics.solidShapes, physics.collider, '#7ee5ba', width, height);
    else if (physics.mode === 'trigger') overlay(ctx, physics.interactionShapes, physics.collider, '#70c8ff', width, height);
    if (physics.lethal && state.beamOn !== false) overlay(ctx, physics.hazardShapes, physics.hitbox, '#ff868a', width, height);
    for (const surface of physics.walkSurfaces || []) {
      ctx.beginPath(); ctx.strokeStyle = '#ffe58c'; ctx.lineWidth = 2;
      ctx.moveTo(surface.x1 * width, surface.y1 * height); ctx.lineTo(surface.x2 * width, surface.y2 * height); ctx.stroke();
    }
    const pivot = state.visual.pivot;
    if (Array.isArray(pivot)) { ctx.fillStyle = '#fff'; ctx.fillRect(pivot[0] * width - 2, pivot[1] * height - 2, 4, 4); }
  }
  ctx.restore();
  if (selected) {
    const corners=placementCorners(state);
    ctx.save(); ctx.strokeStyle = '#fff0ac'; ctx.lineWidth = 1; ctx.setLineDash([5, 3]);ctx.beginPath();
    corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.restore();
  }
  return { x, y, width, height };
}

export function drawThumbnail(canvas, document, definitionId, images, { timeMs = 0, animation } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const definition = document.definitions[definitionId];
  if (!definition) return;
  const scale = Math.min((canvas.width - 8) / definition.size.width, (canvas.height - 8) / definition.size.height);
  const placement = { definitionId, x: (canvas.width - definition.size.width * scale) / 2, y: (canvas.height - definition.size.height * scale) / 2, width: definition.size.width * scale, height: definition.size.height * scale, layer: 0, flipX: false, settings: { ...definition.behavior, type: definition.behavior.type === 'beam' ? 'beam' : 'static' }, animation };
  drawPlacement(ctx, document, placement, images, { timeMs });
}
