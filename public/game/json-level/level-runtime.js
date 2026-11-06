import { validateDocument } from './document.js';
import { getPreviewState } from './preview.js';
import { boxPolygon, shapePolygons, collisionMTV, polygonsOverlap } from './runtime-geometry.js';
import { gameplayAnchor, gameplayTriggerPolygons, resolveGameplay } from './gameplay.js';
import { ActorSimulation } from './actor-simulation.js';

const STEP = 1 / 120;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validPoint = value => value && finite(value.x) && finite(value.y);

/** A small, renderer-independent level simulation used by the JSON preview. */
export class LevelRuntime {
  constructor(document, options = {}) {
    const errors = validateDocument(document);
    if (errors.length) throw new Error(errors.slice(0, 10).join('\n'));
    this.document = document;
    this.gravity = finite(options.gravity) ? options.gravity : 1700;
    this.runSpeed = finite(options.runSpeed) ? options.runSpeed : 270;
    this.accel = finite(options.accel) ? options.accel : Infinity;
    this.airControl = finite(options.airControl) ? options.airControl : .78;
    this.jumpBufferMs = finite(options.jumpBufferMs) ? options.jumpBufferMs : 120;
    this.coyoteMs = finite(options.coyoteMs) ? options.coyoteMs : 100;
    this._jumpBufferRemainingMs = 0;
    this.powerEffects = options.powerEffects || {};
    this.jumpSpeed = finite(options.jumpSpeed) ? options.jumpSpeed : 650;
    this.respawnMs = finite(options.respawnMs) ? Math.max(0, options.respawnMs) : 3000;
    this.player = { x: 40, y: 40, width: 28, height: 36, vx: 0, vy: 0, grounded: false, standingId: null };
    this.timeMs = 0;
    this.deaths = 0;
    this.deadRemainingMs = 0;
    this.events = [];
    this.triggerTimes = new Map();
    this.permanentGone = new Set();
    this._vanishInside = new Set();
    this._vanishRestored = new Set();
    this._vanishEmitted = new Set();
    this.warnings = [];
    this._entities = new Map();
    this._actors = new Map();
    this._projectiles = new Map();
    this._activeInteractions = new Set();
    this._previousStates = new Map();
    this._accumulator = 0;
    this._jumpHeld = false;
    this._coyoteMs = 0;
    this._motionEpochMs = 0;
    this.deathCause = null;
    this.coins = 0; this.collected = new Set(); this.collectedAtMs = new Map(); this.claimedChests = new Map(); this.checkpoint = null; this.reachedCheckpoints = new Set(); this.checkpointReachedAtMs = new Map();
    this.farthestX = 0; this.progress = 0; this.finished = false; this._roleContacts = new Set();
    this._checkpointOrders = this._buildCheckpointOrders();
    this._spawn = this._chooseSpawn(options.spawn);
    this._putAtSpawn();
    this._initActors();
  }

  _initActors() {
    this._actorSimulation ||= new ActorSimulation(this);
    this._actorSimulation.reset();
  }

  _actorStep(dt) { this._actorSimulation.step(dt); }
  killEntity(id) { return this._actorSimulation.kill(id); }
  getEntityState(id) { return this._actors.get(id)?.state ?? null; }

  _chooseSpawn(override) {
    if (validPoint(override)) return { x: override.x, y: override.y };
    const states = this.getStatesAt(0);
    const referencedId = this.document.world?.spawnPlacementId;
    const referenced = typeof referencedId === 'string' && referencedId.trim()
      ? states.find(entry => entry.placement.id === referencedId && entry.state.gameplay?.role === 'spawnpoint')
      : null;
    if (referenced) {
      this.warnings.push(`Spawn selected from ${referenced.state.definition.name}.`);
      return gameplayAnchor(referenced.state, this.player.width, this.player.height);
    }
    const tagged = states.filter(entry => entry.state.gameplay?.role === 'spawnpoint')
      .sort((a, b) => (Number(b.state.gameplay.priority) || 0) - (Number(a.state.gameplay.priority) || 0) ||
        this.document.placements.indexOf(a.placement) - this.document.placements.indexOf(b.placement));
    if (tagged[0]) {this.warnings.push(`Spawn selected from ${tagged[0].state.definition.name}.`);return gameplayAnchor(tagged[0].state, this.player.width, this.player.height);}
    if (validPoint(this.document.world?.spawn)) return { x: this.document.world.spawn.x, y: this.document.world.spawn.y };
    const candidates = [];
    const sceneHazards = states.flatMap(entry => shapePolygons({...entry.state,beamOn:true,damageActive:true}, 'hazard'));
    const sceneSolids=states.flatMap(entry=>shapePolygons(entry.state,'solid'));
    for (const { placement, state } of states) {
      const solids = shapePolygons(state, 'solid');
      if (!solids.length) continue;
      for(const polygon of solids){
        const area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a.x*b.y-b.x*a.y;},0),sign=Math.sign(area);
        for(let i=0;i<polygon.length;i++){
          const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
          if(!length||-dx*sign/length>-.55||Math.abs(dx)<this.player.width+2)continue;
          const lo=Math.min(a.x,b.x),hi=Math.max(a.x,b.x),width=this.player.width;
          for(const desired of [lo+4,(lo+hi-width)/2,hi-width-4]){
            const x=Math.max(0,Math.min(this.document.world.width-width,desired));if(x<lo||x+width>hi)continue;
            const surfaceY=px=>a.y+(px-a.x)/dx*dy,y=Math.min(surfaceY(x),surfaceY(x+width))-this.player.height-.02;
            const body=boxPolygon({x,y,width,height:this.player.height}),probe=boxPolygon({x,y:y+.5,width,height:this.player.height});
            if(polygonsOverlap([body],sceneSolids)||polygonsOverlap([probe],sceneHazards)||!polygonsOverlap([probe],[polygon]))continue;
            candidates.push({x,y,order:x,id:placement.id});
          }
        }
      }
    }
    candidates.sort((a, b) => a.order - b.order);
    if (candidates[0]) { this.warnings.push(`Spawn inferred from safe solid ${candidates[0].id}.`); return { x: candidates[0].x, y: candidates[0].y }; }
    this.warnings.push('No safe solid found; using fallback spawn (40, 40).');
    return { x: 40, y: 40 };
  }

  _putAtSpawn() { Object.assign(this.player, { x: this._spawn.x, y: this._spawn.y, vx: 0, vy: 0, grounded: false, standingId: null }); }

  get spawn() { return { ...this._spawn }; }

  setSpawn(spawn) {
    if (!validPoint(spawn)) throw new Error('Spawn must contain finite x and y coordinates.');
    this._spawn = { x: spawn.x, y: spawn.y };
    this._putAtSpawn();
  }

  getStatesAt(timeMs) {
    const result = this.document.placements.map(placement => {
      const definition = this.document.definitions[placement.definitionId];
      const entity = this._entities.get(placement.id);
      const actor = this._actors.get(placement.id);
      const animation = actor?.stateName || entity?.stateName || definition.visual.defaultAnimation || null;
      const evaluatedTime = Math.max(0, timeMs - this._motionEpochMs);
      const state = getPreviewState(this.document, placement, evaluatedTime, {
        animation,
        animationTimeMs: actor ? Math.max(0, timeMs - actor.animationStartMs) : entity ? Math.max(0, timeMs - entity.animationStartMs) : evaluatedTime,
        triggeredAtMs: this.triggerTimes.get(placement.id),
        permanentGone: this.permanentGone.has(placement.id),
        vanishRestored: this._vanishRestored.has(placement.id),
      });
      // Effects use the run clock; motion/beam cycles use their respawn epoch.
      state.timeMs=timeMs;
      if (actor) this._actorSimulation.applyActorState(actor, state, timeMs);
      const gameplay = state.gameplay || resolveGameplay(definition, placement);
      state.gameplay = gameplay;
      const chestId = gameplay.chestId || placement.id;
      if (gameplay.role === 'power-chest' && this.claimedChests.has(chestId)) {
        state.collected = true; state.vanished = true; state.collectedAtMs = this.claimedChests.get(chestId);
        state.physics = { ...(state.physics || {}), mode: 'none', solidShapes: [], hazardShapes: [], interactionShapes: [] };
      } else if (this.collected.has(placement.id)) {
        state.collected = true; state.vanished = true; state.collectedAtMs = this.collectedAtMs.get(placement.id) ?? null;
        state.physics = { ...(state.physics || {}), mode: 'none', solidShapes: [], hazardShapes: [], interactionShapes: [] };
      } else if (gameplay.role && gameplay.role !== 'none' && gameplay.nonblocking === true) {
        state.physics = { ...(state.physics || {}), mode: 'none', solidShapes: [] };
      }
      if (gameplay.role === 'checkpoint' && this.reachedCheckpoints.has(placement.id)) { state.checkpointReached = true; state.checkpointReachedAtMs = this.checkpointReachedAtMs.get(placement.id) ?? null; }
      return { placement, state };
    });
    for (const shot of this._projectiles.values()) result.push(this._actorSimulation.projectileState(shot, timeMs));
    return result;
  }

  getStates() { return this.getStatesAt(this.timeMs); }

  /** Apply server-confirmed power-chest claims; geometry/contact remains local. */
  claimPowerChests(ids) {
    if (!Array.isArray(ids)) return [];
    const claimed = [];
    for (const rawId of ids) {
      const chestId = typeof rawId === 'string' ? rawId : String(rawId ?? '');
      if (!chestId || this.claimedChests.has(chestId)) continue;
      const entry = this.document.placements.map(placement => ({ placement, gameplay: resolveGameplay(this.document.definitions[placement.definitionId], placement) }))
        .find(item => item.gameplay.role === 'power-chest' && (item.gameplay.chestId || item.placement.id) === chestId);
      if (!entry) continue;
      this.claimedChests.set(chestId, this.timeMs);
      claimed.push(chestId);
    }
    return claimed;
  }

  setEntityState(id, stateName) {
    const placement = this.document.placements.find(item => item.id === id);
    if (!placement) throw new Error(`Unknown placement: ${id}`);
    const definition = this.document.definitions[placement.definitionId];
    if (!definition.visual.animations?.[stateName]) throw new Error(`Unknown character state: ${stateName}`);
    this._entities.set(id, { stateName, animationStartMs: this.timeMs });
  }

  reset({ spawn } = {}) {
    if (spawn !== undefined) {
      if (!validPoint(spawn)) throw new Error('Spawn must contain finite x and y coordinates.');
      this._spawn = { x: spawn.x, y: spawn.y };
    }
    this.timeMs = 0; this._motionEpochMs = 0; this.deaths = 0; this.deathCause = null; this.deadRemainingMs = 0; this.events = [];
    this.triggerTimes.clear(); this.permanentGone.clear(); this._vanishInside.clear(); this._vanishRestored.clear(); this._vanishEmitted.clear(); this._activeInteractions.clear(); this._previousStates.clear(); this._entities.clear(); this._actors.clear(); this._projectiles.clear(); this._accumulator = 0; this._coyoteMs = 0; this._jumpHeld = false; this._jumpBufferRemainingMs = 0;
    this.coins = 0; this.collected.clear(); this.collectedAtMs.clear(); this.claimedChests.clear(); this.checkpoint = null; this.reachedCheckpoints.clear(); this.checkpointReachedAtMs.clear(); this.farthestX = 0; this.progress = 0; this.finished = false; this._roleContacts.clear();
    this._putAtSpawn();
    this._initActors();
    return this.getStates();
  }

  _emit(event) { this.events.push({ timeMs: this.timeMs, ...event }); }

  _kill(cause) {
    if (this.deadRemainingMs > 0) return;
    this.deaths += 1; this.deathCause = cause?.state?.definition?.name || 'Hazard'; this.deadRemainingMs = this.respawnMs; this.player.vx = 0; this.player.vy = 0; this.player.grounded = false; this.player.standingId = null;
    // Collected coins and their points persist for this level/run. Only
    // traversal progress is checkpoint-protected and rolled back on death.
    this.farthestX = this.checkpoint?.farthestX ?? 0;
    this.progress = this.checkpoint?.progress ?? 0;
    this._emit({ type: 'death', cause: cause ? { id: cause.placement.id, kind: cause.state.definition.kind, name: cause.state.definition.name } : null });
    if (this.respawnMs === 0) this._respawn();
  }

  _respawn() {
    this.deadRemainingMs = 0; this._motionEpochMs = this.timeMs; this.triggerTimes.clear(); this._vanishInside.clear(); this._vanishRestored.clear(); this._vanishEmitted.clear(); this._activeInteractions.clear(); this._previousStates.clear(); this._entities.clear(); this.collectedAtMs.clear(); this._initActors(); this._jumpHeld = false; this._coyoteMs = 0; this._jumpBufferRemainingMs = 0; this.deathCause = null;
    if (this.checkpoint) {
      this.farthestX = this.checkpoint.farthestX; this.progress = this.checkpoint.progress;
      Object.assign(this.player, { x: this.checkpoint.x, y: this.checkpoint.y, vx: 0, vy: 0, grounded: false, standingId: null });
    } else { this.farthestX = 0; this.progress = 0; this._putAtSpawn(); }
    this._roleContacts.clear(); this._emit({ type: 'respawn' });
  }

  _buildCheckpointOrders() {
    const entries = this.document.placements.map((placement, index) => ({ placement, index, definition: this.document.definitions[placement.definitionId] }))
      .filter(item => resolveGameplay(item.definition, item.placement).role === 'checkpoint')
      .sort((a, b) => (a.placement.x || 0) - (b.placement.x || 0) || a.index - b.index);
    return new Map(entries.map((item, index) => [item.placement.id, index + 1]));
  }

  _roleContactStep(states) {
    if (this.finished) return;
    const body = boxPolygon(this.player), active = new Set(), overlapping = states.filter(entry => {
      const role = entry.state.gameplay?.role || 'none';
      return role !== 'none' && !entry.state.vanished && !entry.state.collected && gameplayTriggerPolygons(entry.state).some(poly => Array.isArray(poly) && poly.length >= 3 && poly.every(point => finite(point.x) && finite(point.y)) && polygonsOverlap([body], [poly]));
    });
    // Decoys resolve first so a simultaneous trap cannot grant coins/checkpoints.
    const decoy = overlapping.find(entry => entry.state.gameplay.role === 'decoy-chest' && !this._roleContacts.has(entry.placement.id));
    if (decoy) {
      const gameplay = decoy.state.gameplay, id = decoy.placement.id, chestId = gameplay.chestId || id;
      this._emit({ type: 'gameplay-contact', role: 'decoy-chest', id, chestId, action: 'entered' });
      this._emit({ type: 'decoy', id, chestId, decoyKind: gameplay.decoyKind });
      this._kill({ placement: decoy.placement, state: decoy.state });
      this._roleContacts.clear();
      return;
    }
    for (const entry of overlapping.filter(item => item.state.gameplay.role === 'coin')) {
      const id = entry.placement.id, gameplay = entry.state.gameplay;
      if (!this.collected.has(id)) { const value = Math.max(0, Math.trunc(Number(gameplay.coinValue) || 1)); this.collected.add(id); this.collectedAtMs.set(id, this.timeMs); this.coins += value; this._emit({ type: 'coin', id, value, total: this.coins }); }
    }
    for (const entry of overlapping.filter(item => item.state.gameplay.role === 'checkpoint').sort((a, b) => (Number.isFinite(a.state.gameplay.order) ? a.state.gameplay.order : this._checkpointOrders.get(a.placement.id) || 0) - (Number.isFinite(b.state.gameplay.order) ? b.state.gameplay.order : this._checkpointOrders.get(b.placement.id) || 0))) {
      const id = entry.placement.id, gameplay = entry.state.gameplay, order = Number.isFinite(gameplay.order) ? gameplay.order : this._checkpointOrders.get(id) || 0;
      this.reachedCheckpoints.add(id); if (!this.checkpointReachedAtMs.has(id)) this.checkpointReachedAtMs.set(id, this.timeMs);
      if (!this.checkpoint || order > this.checkpoint.order) { const anchor = gameplayAnchor(entry.state, this.player.width, this.player.height); this.checkpoint = { id, order, x: anchor.x, y: anchor.y, coins: this.coins, collected: [...this.collected], farthestX: this.farthestX, progress: this.progress }; this.reachedCheckpoints.add(id); this._emit({ type: 'checkpoint', id, order }); }
    }
    const exit = overlapping.find(entry => entry.state.gameplay.role === 'exit');
    if (exit) { const gameplay = exit.state.gameplay; this.finished = true; this.player.vx = 0; this.player.vy = 0; this.progress = 1; this._emit({ type: 'level-exit', id: exit.placement.id, targetLevelId: gameplay.targetLevelId }); return; }
    for (const entry of overlapping.filter(item => item.state.gameplay.role === 'power-chest' || item.state.gameplay.role === 'decoy-chest')) {
      const gameplay = entry.state.gameplay, id = entry.placement.id, chestId = gameplay.chestId || id; active.add(id);
      if (!this._roleContacts.has(id)) this._emit({ type: 'gameplay-contact', role: gameplay.role, id, chestId, action: 'entered' });
    }
    for (const id of this._roleContacts) if (!active.has(id)) {
      const entry = states.find(item => item.placement.id === id), gameplay = entry?.state.gameplay || {};
      if (gameplay.role === 'power-chest' || gameplay.role === 'decoy-chest') this._emit({ type: 'gameplay-contact', role: gameplay.role, id, chestId: gameplay.chestId || id, action: 'left' });
    }
    this._roleContacts = active;
  }

  _refreshVanishTransitions() {
    for (const entry of this.getStates()) {
      const vanish = entry.state.behavior.vanish;
      if (!vanish || !this.triggerTimes.has(entry.placement.id)) continue;
      const id = entry.placement.id;
      const elapsed = Math.max(0, this.timeMs - this._motionEpochMs - this.triggerTimes.get(id));
      if (vanish.restoreMode === 'timed' && elapsed >= vanish.countdownMs + vanish.restoreMs) {
        this.triggerTimes.delete(id); this._vanishRestored.add(id); this._vanishEmitted.delete(id); this._emit({ type: 'restore', id });
        continue;
      }
      if (elapsed >= vanish.countdownMs && !this._vanishEmitted.has(id)) {
        this._vanishEmitted.add(id);
        if (vanish.restoreMode === 'permanent') this.permanentGone.add(id);
        this._emit({ type: 'vanish', id });
      }
    }
  }

  _interactionAndTrigger(states) {
    const body = boxPolygon(this.player);
    const now = new Set();
    const vanishNow = new Set();
    for (const entry of states) {
      const vanish = shapePolygons(entry.state, 'vanish');
      const id = entry.placement.id;
      const inside = vanish.length && polygonsOverlap([body], vanish);
      if (inside) vanishNow.add(id);
      if (vanish.length && inside && !this._vanishInside.has(id) && !this.triggerTimes.has(id) && !this.permanentGone.has(id)) {
        this.triggerTimes.set(id, Math.max(0, this.timeMs - this._motionEpochMs)); this._vanishRestored.delete(id); this._vanishEmitted.delete(id); this._emit({ type: 'vanish-trigger', id });
      }
      const interaction = entry.state.gameplay?.role && entry.state.gameplay.role !== 'none' ? [] : shapePolygons(entry.state, 'interaction');
      if (interaction.length && polygonsOverlap([body], interaction)) now.add(entry.placement.id);
    }
    for (const id of this._vanishInside) if (!vanishNow.has(id)) this._vanishInside.delete(id);
    for (const id of vanishNow) this._vanishInside.add(id);
    for (const id of now) if (!this._activeInteractions.has(id)) {
      const placement = this.document.placements.find(item => item.id === id), state = states.find(item => item.placement.id === id)?.state;
      this._emit({ type: 'interaction', id, kind: state?.definition.kind, name: state?.definition.name, action: 'entered' });
    }
    for (const id of this._activeInteractions) if (!now.has(id)) {
      const placement = this.document.placements.find(item => item.id === id), state = states.find(item => item.placement.id === id)?.state;
      this._emit({ type: 'interaction', id, kind: state?.definition.kind, name: state?.definition.name, action: 'left' });
    }
    this._activeInteractions = now;
  }

  _solidStep(states, dt) {
    const current = new Map(states.map(entry => [entry.placement.id, entry]));
    const previousStates = this._previousStates.size ? this._previousStates : new Map(this.getStatesAt(Math.max(0, this.timeMs - dt * 1000)).map(entry => [entry.placement.id, entry]));
    const previousPlayer = { ...this.player };
    if (this.player.standingId) {
      const previous = previousStates.get(this.player.standingId), next = current.get(this.player.standingId);
      if (previous && next && !next.state.vanished && shapePolygons(next.state, 'solid').length) { this.player.x += next.state.x - previous.state.x; this.player.y += next.state.y - previous.state.y; }
    }
    const effects = this.powerEffects || {}, reverse = !!effects.reverse, slow = !!effects.slow, slippery = !!effects.slippery;
    const strength = effect => effect?.strength || effect || {};
    const speedPercent = strength(effects.slippery).speedPercent ?? strength(effects.slow).speedPercent ?? strength(effects.reverse).speedPercent ?? 100;
    const gripPercent = strength(effects.slippery).gripPercent ?? 100;
    const left = reverse ? this._input.right : this._input.left, right = reverse ? this._input.left : this._input.right;
    const direction = (right ? 1 : 0) - (left ? 1 : 0);
    const target = direction * this.runSpeed * speedPercent / 100, control = this.player.grounded ? 1 : this.airControl;
    if (direction) this.player.vx += Math.sign(target - this.player.vx) * Math.min(Math.abs(target - this.player.vx), this.accel * control * dt * (slow ? .72 : 1) * (slippery ? Math.max(.65, gripPercent / 100) : 1));
    else this.player.vx *= Math.max(0, 1 - (slippery ? 8 * gripPercent / 100 : 8) * dt);
    this._jumpBufferRemainingMs = this._input.jump && !this._jumpHeld ? this.jumpBufferMs : Math.max(0, this._jumpBufferRemainingMs - dt * 1000);
    if (this._jumpBufferRemainingMs > 0 && (this.player.grounded || this._coyoteMs > 0)) { this.player.vy = -this.jumpSpeed; this.player.grounded = false; this.player.standingId = null; this._coyoteMs = 0; this._jumpBufferRemainingMs = 0; }
    this._jumpHeld = !!this._input.jump;
    this.player.vy += this.gravity * dt;
    this.player.x += this.player.vx * dt; this.player.y += this.player.vy * dt;
    if (this.player.x < 0) { this.player.x = 0; this.player.vx = 0; }
    const maxX = Math.max(0, (this.document.world.width || Infinity) - this.player.width);
    if (this.player.x > maxX) { this.player.x = maxX; this.player.vx = 0; }
    if (this.player.y > (this.document.world.height || Infinity) + 100) { this._kill({ placement: { id: 'world-fall' }, state: { definition: { kind: 'hazard', name: 'Fall' } } }); return true; }
    if (this._hazardStep(states)) return true;
    this.player.grounded = false; this.player.standingId = null;
    for (const entry of states) {
      const polygons = shapePolygons(entry.state, 'solid');
      const previousEntry = previousStates.get(entry.placement.id);
      const previousPolygons = previousEntry ? shapePolygons(previousEntry.state, 'solid') : polygons;
      for (const polygon of polygons) {
        // One-way platforms resolve only a feet crossing from above. Resolve
        // vertically so partial landings never push the player off an edge.
        if (entry.state.definition.kind === 'platform') {
          const top = this._platformLandingTop(previousPlayer, polygon, previousPolygons);
          if (top !== null) {
            this.player.y = top - this.player.height;
            this.player.vy = 0;
            this.player.grounded = true;
            this.player.standingId = entry.placement.id;
          }
          continue;
        }
        const mtv = collisionMTV(boxPolygon(this.player), polygon);
        if (!mtv) continue;
        this.player.x += mtv.x; this.player.y += mtv.y;
        if (mtv.normal.y < -.55) { this.player.grounded = true; this.player.standingId = entry.placement.id; }
        const inward=this.player.vx*mtv.normal.x+this.player.vy*mtv.normal.y;
        if(inward<0){this.player.vx-=inward*mtv.normal.x;this.player.vy-=inward*mtv.normal.y;}
      }
    }
    this._coyoteMs = this.player.grounded ? this.coyoteMs : Math.max(0, this._coyoteMs - dt * 1000);
    if (this.player.grounded) this._coyoteMs = this.coyoteMs;
  }

  _platformLandingTop(previousPlayer, polygon, previousPolygons) {
    const previousBottom = previousPlayer.y + this.player.height;
    const currentBottom = this.player.y + this.player.height;
    const topAt = (shape, x, width) => {
      const right = x + width, ys = [];
      const loX = Math.min(...shape.map(point => point.x)), hiX = Math.max(...shape.map(point => point.x));
      if (Math.min(right, hiX) - Math.max(x, loX) <= 1e-7) return null;
      for (let i = 0; i < shape.length; i++) {
        const a = shape[i], b = shape[(i + 1) % shape.length];
        if (Math.abs(a.x - b.x) < 1e-9) {
          if (a.x >= x - 1e-6 && a.x <= right + 1e-6) ys.push(Math.min(a.y, b.y));
          continue;
        }
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        if (a.x >= x - 1e-6 && a.x <= right + 1e-6) ys.push(a.y);
        if (b.x >= x - 1e-6 && b.x <= right + 1e-6) ys.push(b.y);
        for (const edgeX of [x, right]) if (edgeX >= lo && edgeX <= hi) ys.push(a.y + (edgeX - a.x) * (b.y - a.y) / (b.x - a.x));
      }
      return ys.length ? Math.min(...ys) : null;
    };
    const currentTop = topAt(polygon, this.player.x, this.player.width);
    if (currentTop === null) return null;
    const previousTop = previousPolygons?.map(shape => topAt(shape, previousPlayer.x, this.player.width)).filter(value => value !== null).sort((a, b) => a - b)[0] ?? currentTop;
    return previousBottom <= previousTop + 1e-4 && currentBottom >= currentTop - 1e-4 ? currentTop : null;
  }

  _hazardStep(states) {
    const body = boxPolygon(this.player);
    for (const entry of states) {
      if (this._actors.has(entry.placement.id) || this._projectiles.has(entry.placement.id)) continue;
      if (shapePolygons(entry.state, 'hazard').some(poly => collisionMTV(body, poly))) { this._kill(entry); return true; }
    }
    return false;
  }

  _actorCollisionStep(states, previousPlayer) { return this._actorSimulation.collideActors(states, previousPlayer); }
  _projectileStep(dt, states) { this._actorSimulation.stepProjectiles(dt, states); }

  _step(dt) {
    this.timeMs += dt * 1000;
    if (this.finished) return;
    this._actorSimulation.removeFinishedImpacts();
    if (this.deadRemainingMs > 0) { this.deadRemainingMs = Math.max(0, this.deadRemainingMs - dt * 1000); if (this.deadRemainingMs === 0) this._respawn(); return; }
    this._actorStep(dt);
    let states = this.getStates();
    this._interactionAndTrigger(states);
    this._refreshVanishTransitions();
    states = this.getStates();
    if (this._hazardStep(states)) return;
    const previousPlayer = { ...this.player };
    if (this._solidStep(states.filter(entry => !entry.state.vanished), dt)) return;
    states = this.getStates();
    this._projectileStep(dt, states);
    if (this.deadRemainingMs > 0) return;
    this._actorCollisionStep(states, previousPlayer);
    if (this.deadRemainingMs > 0) return;
    this._hazardStep(states);
    if (this.deadRemainingMs > 0) return;
    this.farthestX = Math.max(this.farthestX, Math.max(0, this.player.x - (this.distanceOriginX ?? 0)));
    const courseLength = (this.progressEndX ?? this.document.world.width) - (this.distanceOriginX ?? 0);
    this.progress = Math.max(this.progress, courseLength > 0 ? Math.min(1, this.farthestX / courseLength) : 0);
    this._roleContactStep(states);
    if (this.finished) return;
    this._interactionAndTrigger(states);
    this._refreshVanishTransitions();
    states = this.getStates();
    this._previousStates = new Map(states.map(entry => [entry.placement.id, entry]));
  }

  advance(dtSeconds, input = {}) {
    const dt = Math.min(0.1, Math.max(0, finite(dtSeconds) ? dtSeconds : 0));
    this.events = []; this._input = input || {};
    this._accumulator += dt;
    while (this._accumulator >= STEP) { this._accumulator -= STEP; this._step(STEP); }
    return this.events.slice();
  }
}

export default LevelRuntime;
