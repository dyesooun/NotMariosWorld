import { resolvePlacement } from './document.js';
import { placementMatrix,placementCorners } from './transforms.js';

export async function loadImages(assets,{allowMissing=false}={}) {
  const entries = await Promise.all(Object.entries(assets).map(([id, asset]) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) {if(allowMissing)resolve([id,null]);else reject(new Error(`${asset.name || id}: image dimensions do not match the manifest.`));}
      else resolve([id, image]);
    };
    image.onerror = () => allowMissing?resolve([id,null]):reject(new Error(`Cannot load image for ${asset.name || id}.`));
    image.src = asset.src;
  })));
  return new Map(entries.filter(([,image])=>image));
}

const modulo = (value, period) => ((value % period) + period) % period;
function motionFor(behavior) {
  if (behavior.motion === null) return null;
  if (behavior.motion !== undefined) return behavior.motion;
  return behavior.type === 'moving' ? behavior : null;
}
export function getPreviewState(document, placement, timeMs = 0, runtime = {}) {
  const resolved = resolvePlacement(document, placement);
  const { behavior, visual } = resolved;
  let { x, y } = resolved;
  let frameId = visual.frameId, beamOn = null, damageActive = false;
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const motion = motionFor(behavior);
  if (motion) {
    const offset = Math.sin((time + (motion.phaseMs || 0)) / Math.max(1, motion.periodMs) * Math.PI * 2) * motion.distance;
    if (motion.axis === 'y') y += offset; else x += offset;
  }
  if (behavior.type === 'beam') {
    const on = Math.max(1, behavior.onMs), off = Math.max(1, behavior.offMs);
    const startMs = Math.max(0, behavior.startMs || 0);
    if (time < startMs) beamOn = false;
    else {
      const clock = modulo((time - startMs) + (behavior.phaseMs || 0), on + off);
      beamOn = behavior.startState === 'off' ? clock >= off : clock < on;
    }
    frameId = (beamOn ? visual.onFrameId : visual.offFrameId) || visual.frameId;
    damageActive = beamOn;
  } else {
    const animation = visual.animations?.[runtime.animation || resolved.animation];
    if (animation?.frames?.length) {
      const animationTime=Number.isFinite(runtime.animationTimeMs)?Math.max(0,runtime.animationTimeMs):time;
      const elapsedFrames = Math.floor(animationTime / 1000 * animation.fps);
      const index = animation.loop ? elapsedFrames % animation.frames.length : Math.min(animation.frames.length - 1, elapsedFrames);
      frameId = animation.frames[index];
      damageActive = (animation.damage_active_indices || []).includes(index);
    }
  }
  const triggeredAtMs = Number.isFinite(runtime?.triggeredAtMs) ? Math.max(0, runtime.triggeredAtMs) : null;
  const vanish = behavior.vanish;
  const vanishElapsedMs = !vanish || triggeredAtMs == null || time < triggeredAtMs ? null : time - triggeredAtMs;
  const vanishRemainingMs = vanishElapsedMs == null ? null : Math.max(0, vanish.countdownMs - vanishElapsedMs);
  const restoreMode = vanish?.restoreMode || 'respawn';
  const restoreMs = restoreMode === 'timed' ? vanish.restoreMs : null;
  const restoreAtMs = vanishElapsedMs == null || restoreMs == null ? null : vanish.countdownMs + restoreMs;
  const vanishRestored = !!vanish && restoreMode === 'timed' && vanishElapsedMs != null && vanishElapsedMs >= restoreAtMs;
  const vanished = !!vanish && ((runtime?.permanentGone === true) || (vanishElapsedMs != null && vanishElapsedMs >= vanish.countdownMs && !vanishRestored));
  const restoreRemainingMs = vanishElapsedMs == null || restoreMode !== 'timed' || vanishRestored ? (vanishRestored ? 0 : null) : Math.max(0, restoreAtMs - vanishElapsedMs);
  const physics=resolved.gameplay?.role!=='none'&&resolved.gameplay?.nonblocking===true?{...resolved.physics,mode:'none'}:resolved.physics;
  return { ...resolved, physics, animation:runtime.animation||resolved.animation, x, y, frameId, assetId: visual.assetId, beamOn, damageActive, vanished, vanishRemainingMs, restoreRemainingMs, vanishRestored: vanishRestored || !!runtime?.vanishRestored };
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

export function drawPlacement(ctx, document, placement, images, { timeMs = 0, collisions = false, selected = false, triggeredAtMs = null, animation, animationTimeMs, state: evaluatedState } = {}) {
  const state = evaluatedState || getPreviewState(document, placement, timeMs, { triggeredAtMs,animation,animationTimeMs });
  const { x, y, width, height, assetId, frameId, physics } = state;
  const frame = document.assets[assetId]?.frames[frameId];
  const image = images.get(assetId);
  const matrix = placementMatrix(state);
  ctx.save(); ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f); ctx.imageSmoothingEnabled = false;
  if (state.vanished) {
    if (!selected) { ctx.restore(); return { x, y, width, height, vanished: true }; }
    ctx.globalAlpha = 0.18;
  }
  const hideBeamArt=state.beamOn===false&&(!state.visual.offFrameId||state.visual.offFrameId===(state.visual.onFrameId||state.visual.frameId));
  let artX = (state.visual.offset?.[0] || 0) * width, artY = (state.visual.offset?.[1] || 0) * height;
  let artWidth = width * (state.visual.scale?.[0] ?? 1), artHeight = height * (state.visual.scale?.[1] ?? 1);
  if (state.beamOn === false && frame && state.visual.beamAlignment) {
    const alignment = state.visual.beamAlignment, onFrame = document.assets[assetId].frames[state.visual.onFrameId];
    artX += (alignment.offOffsetPx.x - alignment.onOffsetPx.x) / onFrame.w * width;
    artY += (alignment.offOffsetPx.y - alignment.onOffsetPx.y) / onFrame.h * height;
    artWidth *= frame.w / onFrame.w; artHeight *= frame.h / onFrame.h;
  }
  if (!hideBeamArt) {
    if (image && frame) ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, artX, artY, artWidth, artHeight);
    else { ctx.fillStyle = '#75484b'; ctx.fillRect(0, 0, width, height); }
  }
  if (collisions && !state.vanished) {
    if (physics.mode === 'solid') overlay(ctx, physics.solidShapes, physics.collider, '#7ee5ba', width, height);
    else if (physics.mode === 'trigger') overlay(ctx, physics.interactionShapes, physics.collider, '#70c8ff', width, height);
    const damageWindow=state.visual.animations?.[state.animation]?.damage_active_indices;
    if (physics.lethal && state.beamOn !== false && (!Array.isArray(damageWindow)||state.damageActive)) overlay(ctx, physics.hazardShapes, physics.hitbox, '#ff868a', width, height);
    for (const surface of physics.walkSurfaces || []) {
      ctx.beginPath(); ctx.strokeStyle = '#ffe58c'; ctx.lineWidth = 2;
      ctx.moveTo(surface.x1 * width, surface.y1 * height); ctx.lineTo(surface.x2 * width, surface.y2 * height); ctx.stroke();
    }
    const pivot = state.visual.pivot;
    if (Array.isArray(pivot)) { ctx.fillStyle = '#fff'; ctx.fillRect(pivot[0] * width - 2, pivot[1] * height - 2, 4, 4); }
  }
  if (selected && state.behavior?.vanish?.triggerVolume) {
    const [tx, ty, tw, th] = state.behavior.vanish.triggerVolume;
    ctx.save(); ctx.globalAlpha=1; ctx.strokeStyle = '#70c8ff'; ctx.fillStyle = '#70c8ff18'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.rect(tx * width, ty * height, tw * width, th * height); ctx.fill(); ctx.stroke(); ctx.restore();
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
  const placement = { definitionId, x: (canvas.width - definition.size.width * scale) / 2, y: (canvas.height - definition.size.height * scale) / 2, width: definition.size.width * scale, height: definition.size.height * scale, layer: 0, flipX: false, settings: { ...definition.behavior, type: definition.behavior.type === 'beam' ? 'beam' : 'static', motion: null }, animation };
  drawPlacement(ctx, document, placement, images, { timeMs });
}
