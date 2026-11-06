import { getPreviewState } from './preview.js';
import { boxPolygon, shapePolygons, polygonsOverlap, polygonBounds } from './runtime-geometry.js';
import { localToWorld } from './transforms.js';
import { PROJECTILE_RULES } from '../projectiles.js';

const duration = animation => animation?.frames?.length && animation.fps > 0 ? animation.frames.length / animation.fps * 1000 : 0;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const rectShapes = rect => rect ? [{ kind: 'rect', rect }] : [];

function platformBounds(state) {
  const polygons = shapePolygons(state, 'solid');
  if (!polygons.length) return null;
  const points = polygons.flat();
  return polygonBounds(points);
}

function surfaceY(state, x, width) {
  const values = [];
  for (const polygon of shapePolygons(state, 'solid')) for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (Math.abs(b.x - a.x) < 1e-8) continue;
    const lo = Math.max(x, Math.min(a.x, b.x)), hi = Math.min(x + width, Math.max(a.x, b.x));
    if (hi <= lo) continue;
    for (const px of [lo, hi]) values.push(a.y + (px - a.x) / (b.x - a.x) * (b.y - a.y));
  }
  return values.length ? Math.min(...values) : null;
}

// Per-run actor state, independent of the authored document and the renderer.
export class ActorSimulation {
  constructor(runtime) { this.runtime = runtime; this.sequence = 0; }

  reset() {
    const r = this.runtime;
    r._actors.clear(); r._projectiles.clear(); this.sequence = 0;
    const states = r.document.placements.map(placement => ({ placement, state: getPreviewState(r.document, placement, 0) }));
    for (const { placement, state } of states) {
      const b = state.behavior;
      if (b.type !== 'enemy' || !['creature', 'shooter'].includes(b.actorType)) continue;
      const pivot = state.visual.pivot || [.5, 1];
      const actor = {
        id: placement.id, placement, definition: state.definition, behavior: b,
        x: state.x, y: state.y, facing: placement.flipX ? -1 : 1, patrolDirection: placement.flipX ? -1 : 1,
        state: 'idle', stateName: null, animationStartMs: r.timeMs, detected: false,
        dead: false, deadAtMs: 0, shotEmitted: false, nextFireAtMs: r.timeMs,
        supportId: b.supportId || null, lastSupportX: null,
        lastAuthoredX: state.x, lastAuthoredY: state.y, baseAuthoredY: state.y,
        footOffset: localToWorld(state, { x: pivot[0] * state.width, y: pivot[1] * state.height }).y - state.y,
      };
      if (!actor.supportId) {
        const foot = state.y + actor.footOffset;
        const supports = states.filter(entry => entry.state.definition.kind === 'platform').map(entry => {
          const bounds = platformBounds(entry.state), top = surfaceY(entry.state, state.x, state.width);
          return { entry, bounds, top };
        }).filter(item => item.bounds && item.top != null && state.x >= item.bounds.x - 1 && state.x + state.width <= item.bounds.x + item.bounds.width + 1
          && Math.abs(item.top - foot) <= Math.max(16, state.height / 2));
        supports.sort((a, b) => Math.abs(a.top - foot) - Math.abs(b.top - foot));
        actor.supportId = supports[0]?.entry.placement.id || null;
      }
      const support = states.find(entry => entry.placement.id === actor.supportId);
      actor.lastSupportX = support?.state.x ?? null;
      this.transition(actor, b.actorType === 'creature' && Number(b.speed ?? 42) > 0 && support ? 'moving' : 'idle', false);
      r._actors.set(actor.id, actor);
    }
  }

  animation(actor, slot) {
    const name = actor.behavior.states?.[slot];
    return name && actor.definition.visual.animations?.[name] ? name : null;
  }

  transition(actor, slot, emit = true) {
    if (actor.state === slot && actor.stateInitialized) return;
    actor.stateInitialized = true;
    actor.state = slot;
    actor.stateName = this.animation(actor, slot) || (slot === 'dead' ? null : actor.definition.visual.defaultAnimation || null);
    actor.animationStartMs = this.runtime.timeMs; actor.shotEmitted = false;
    if (emit) this.runtime._emit({ type: 'actor-state', id: actor.id, state: slot, animation: actor.stateName });
  }

  step(dt) {
    const r = this.runtime, states = r.getStates();
    for (const actor of r._actors.values()) {
      if (actor.dead) continue;
      const b = actor.behavior, creature = b.actorType === 'creature';
      const authored = getPreviewState(r.document, actor.placement, r.timeMs - r._motionEpochMs);
      actor.x += authored.x - actor.lastAuthoredX; actor.y += authored.y - actor.lastAuthoredY;
      actor.lastAuthoredX = authored.x; actor.lastAuthoredY = authored.y;
      const support = states.find(entry => entry.placement.id === actor.supportId);
      const bounds = support && !support.state.vanished ? platformBounds(support.state) : null;
      if (bounds) {
        actor.x += actor.lastSupportX == null ? 0 : support.state.x - actor.lastSupportX;
        actor.lastSupportX = support.state.x;
        const hi = bounds.x + bounds.width - actor.placement.width;
        actor.x = clamp(actor.x, bounds.x, Math.max(bounds.x, hi));
        const top = surfaceY(support.state, actor.x, actor.placement.width);
        if (top != null) actor.y = top - actor.footOffset + authored.y - actor.baseAuthoredY;
      }
      const dx = r.player.x + r.player.width / 2 - (actor.x + actor.placement.width / 2);
      const samePlatform = !!bounds && r.player.grounded && r.player.standingId === actor.supportId;
      const dy = Math.abs(r.player.y + r.player.height - (actor.y + actor.footOffset));
      const eligible = Math.abs(dx) <= (b.detectRange ?? (creature ? 400 : 500)) && dy <= 140
        && (!creature || samePlatform);
      if (!eligible) {
        actor.detected = false;
        this.transition(actor, creature && bounds && Number(b.speed ?? 42) > 0 ? 'moving' : 'idle');
      } else {
        if (!actor.detected) {
          actor.detected = true;
          if (this.animation(actor, 'playerDetected')) this.transition(actor, 'playerDetected');
        }
        if (actor.state === 'playerDetected') {
          if (r.timeMs - actor.animationStartMs < duration(actor.definition.visual.animations[actor.stateName])) continue;
          this.transition(actor, creature && Number(b.speed ?? 42) > 0 ? 'moving' : 'idle');
        }
        if (creature) this.transition(actor, Number(b.speed ?? 42) > 0 && bounds ? 'moving' : 'idle');
        else {
          actor.facing = Math.sign(dx) || actor.facing;
          const shootingName = this.animation(actor, 'shooting') || actor.definition.visual.defaultAnimation;
          const shootingAnimation = actor.definition.visual.animations?.[shootingName];
          const releaseDelay = shootingAnimation ? (shootingAnimation.spawn_projectile_at_index ?? 0) / shootingAnimation.fps * 1000 : 0;
          if (actor.state !== 'shooting' && r.timeMs + releaseDelay + 1e-6 >= actor.nextFireAtMs) this.transition(actor, 'shooting');
          if (actor.state === 'shooting') {
            const animation = actor.definition.visual.animations[actor.stateName];
            const elapsed = r.timeMs - actor.animationStartMs;
            const eventIndex = animation?.spawn_projectile_at_index ?? 0;
            const fireAt = animation ? eventIndex / animation.fps * 1000 : 0;
            if (!actor.shotEmitted && elapsed + 1e-6 >= fireAt) {
              this.spawn(actor); actor.shotEmitted = true;
              actor.nextFireAtMs = r.timeMs + (b.fireIntervalMs ?? PROJECTILE_RULES.fireInterval * 1000);
            }
            if (elapsed + 1e-6 >= duration(animation) && actor.shotEmitted) this.transition(actor, 'idle');
          }
        }
      }
      if (creature && bounds && actor.state === 'moving') {
        const speed = Number(b.speed ?? 42), direction = eligible ? Math.sign(dx) : actor.patrolDirection;
        actor.x += direction * (eligible ? Math.min(speed * 1.45, 70) : speed) * dt;
        const hi = bounds.x + bounds.width - actor.placement.width;
        if (actor.x <= bounds.x) { actor.x = bounds.x; actor.patrolDirection = 1; }
        if (actor.x >= hi) { actor.x = Math.max(bounds.x, hi); actor.patrolDirection = -1; }
        actor.facing = direction || actor.facing;
      }
    }
  }

  applyActorState(actor, state, timeMs) {
    state.x = actor.x; state.y = actor.y; state.flipX = actor.facing < 0;
    state.actorState = actor.state; state.animation = actor.stateName;
    const animation = actor.definition.visual.animations?.[actor.stateName];
    if (animation && ['playerDetected', 'shooting', 'dead'].includes(actor.state)) {
      const index = clamp(Math.floor(Math.max(0, timeMs - actor.animationStartMs) / 1000 * animation.fps), 0, animation.frames.length - 1);
      state.frameId = animation.frames[index];
    }
    // Actor body contact stays lethal independently of artistic attack windows.
    const contact = state.physics.collider || state.physics.hitbox;
    state.physics = { ...state.physics, mode: 'trigger', solidShapes: [], lethal: true, hitbox: contact, hazardShapes: rectShapes(contact) };
    state.damageActive = true;
    if (actor.dead) {
      state.physics = { ...state.physics, lethal: false, mode: 'none', hazardShapes: [], interactionShapes: [], solidShapes: [] };
      if (!animation || timeMs - actor.deadAtMs + 1e-6 >= duration(animation)) state.vanished = true;
    }
    return state;
  }

  kill(id) {
    const r = this.runtime, actor = r._actors.get(id);
    if (!actor || actor.dead) return false;
    actor.dead = true; actor.deadAtMs = r.timeMs;
    this.transition(actor, 'dead'); actor.shotEmitted = true;
    r._emit({ type: 'enemy-kill', id, kind: actor.definition.name, x: actor.x + actor.placement.width / 2, y: actor.y });
    return true;
  }

  collideActors(states, previousPlayer) {
    const r = this.runtime, body = boxPolygon(r.player);
    for (const entry of states) {
      const actor = r._actors.get(entry.placement.id);
      if (!actor || actor.dead || entry.state.vanished) continue;
      const polygons = shapePolygons(entry.state, 'hazard');
      if (!polygonsOverlap([body], polygons)) continue;
      const top = Math.min(...polygons.flat().map(point => point.y));
      if (r.player.vy > 0 && previousPlayer.y + previousPlayer.height <= top + 2) {
        this.kill(actor.id); r.player.y = top - r.player.height; r.player.vy = -r.jumpSpeed * .65;
        r._emit({ type: 'enemy-stomp', id: actor.id });
      } else { r._kill(entry); return true; }
    }
    return false;
  }

  spawn(actor) {
    const r = this.runtime, definitionId = actor.behavior.projectileDefinitionId, definition = r.document.definitions[definitionId];
    if (!definition || definition.kind !== 'projectile') return;
    const state = r.getStates().find(entry => entry.placement.id === actor.id)?.state;
    if (!state || state.vanished) return;
    const pivot = state.visual.pivot || [.5, 1], offset = actor.behavior.spawnOffset || [0, 0];
    const muzzle = localToWorld(state, { x: (pivot[0] + offset[0]) * state.width, y: (pivot[1] + offset[1]) * state.height });
    const dx = r.player.x + r.player.width / 2 - muzzle.x, dy = r.player.y + r.player.height / 2 - muzzle.y, length = Math.hypot(dx, dy) || 1;
    const speed = definition.behavior.speed ?? PROJECTILE_RULES.speed;
    const id = `${actor.id}:shot:${++this.sequence}`;
    r._projectiles.set(id, { id, ownerId: actor.id, definitionId, definition, x: muzzle.x, y: muzzle.y,
      vx: dx / length * speed, vy: dy / length * speed, rotation: Math.atan2(dy, dx) * 180 / Math.PI,
      width: PROJECTILE_RULES.width, height: PROJECTILE_RULES.height,
      lifeMs: definition.behavior.lifetimeMs ?? PROJECTILE_RULES.lifetime * 1000,
      phase: 'flight', stateName: definition.behavior.flightAnimation || definition.visual.defaultAnimation || null, animationStartMs: r.timeMs });
    r._emit({ type: 'projectile-spawn', id, ownerId: actor.id });
  }

  projectileState(shot, timeMs) {
    const definition = shot.definition, visual = definition.visual;
    const body = definition.physics.collider || definition.physics.hitbox;
    const center = body ? [body[0] + body[2] / 2, body[1] + body[3] / 2] : visual.pivot || [.5, .5];
    const width = definition.size.width, height = definition.size.height;
    const origin = localToWorld({ x: 0, y: 0, width, height, rotation: shot.rotation, flipX: false }, { x: center[0] * width, y: center[1] * height });
    const placement = { id: shot.id, definitionId: shot.definitionId, x: shot.x - origin.x, y: shot.y - origin.y,
      width, height, layer: shot.layer ?? 1, flipX: false, rotation: shot.rotation, settings: {} };
    const state = getPreviewState(this.runtime.document, placement, timeMs - shot.animationStartMs, { animation: shot.stateName, animationTimeMs: Math.max(0, timeMs - shot.animationStartMs) });
    const hitbox = [center[0] - shot.width / width / 2, center[1] - shot.height / height / 2, shot.width / width, shot.height / height];
    state.physics = { ...state.physics, mode: 'trigger', lethal: shot.phase === 'flight', collider: hitbox, hitbox,
      solidShapes: [], hazardShapes: rectShapes(hitbox), interactionShapes: [] };
    state.damageActive = true; state.projectilePhase = shot.phase; state.gameplay = { role: 'none' };
    if (shot.phase === 'impact') {
      const animation = visual.animations?.[shot.stateName];
      if (!animation || timeMs - shot.animationStartMs + 1e-6 >= duration(animation)) state.vanished = true;
      else state.frameId = animation.frames[Math.min(animation.frames.length - 1, Math.floor((timeMs - shot.animationStartMs) / 1000 * animation.fps))];
    }
    return { placement, state };
  }

  impact(shot) {
    const r = this.runtime, name = shot.definition.behavior.impactAnimation;
    r._emit({ type: 'projectile-impact', id: shot.id });
    if (name && shot.definition.visual.animations?.[name]) {
      shot.phase = 'impact'; shot.stateName = name; shot.animationStartMs = r.timeMs; shot.vx = 0; shot.vy = 0;
    } else r._projectiles.delete(shot.id);
  }

  removeFinishedImpacts() {
    const r = this.runtime;
    for (const shot of r._projectiles.values()) if (shot.phase === 'impact'
      && r.timeMs - shot.animationStartMs + 1e-6 >= duration(shot.definition.visual.animations?.[shot.stateName])) r._projectiles.delete(shot.id);
  }

  stepProjectiles(dt, states) {
    const r = this.runtime, playerBody = boxPolygon(r.player);
    this.removeFinishedImpacts();
    for (const shot of [...r._projectiles.values()]) {
      if (shot.phase !== 'flight') continue;
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.lifeMs -= dt * 1000;
      if (shot.lifeMs <= 1e-6) { r._projectiles.delete(shot.id); continue; }
      const evaluated = this.projectileState(shot, r.timeMs), polygons = shapePolygons(evaluated.state, 'hazard');
      if (polygonsOverlap(polygons, [playerBody])) { this.impact(shot); r._kill(evaluated); return; }
      const hit = states.some(entry => entry.placement.id !== shot.ownerId && !r._actors.has(entry.placement.id) && !r._projectiles.has(entry.placement.id)
        && (polygonsOverlap(polygons, shapePolygons(entry.state, 'solid')) || polygonsOverlap(polygons, shapePolygons(entry.state, 'hazard'))));
      if (hit) this.impact(shot);
    }
  }
}
