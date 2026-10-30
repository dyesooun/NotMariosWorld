// Server-authoritative power chest rules. This module intentionally has no DOM dependencies.
import { LEVELS } from './levels.js';
export const POWER_DEFINITIONS = Object.freeze([
  Object.freeze({ type: 'slow', name: 'Sticky Boots', durationMs: 5000 }),
  Object.freeze({ type: 'reverse', name: 'Wrong Way', durationMs: 5000 }),
  Object.freeze({ type: 'slippery', name: 'Ice Skates', durationMs: 5000 }),
  Object.freeze({ type: 'fog', name: 'Ink Cloud', durationMs: 5000 })
]);

const slotFor = (player, level) => {
  player.powerSlots ||= {};
  return player.powerSlots[level] ||= { claimed: false, used: false, reserved: null, power: null, chests: {} };
};

export function currentPower(player, level = player?.state?.level) {
  const slot = player?.powerSlots?.[level];
  return slot?.power ? { ...slot.power } : null;
}

export function powerEffects(player, now = Date.now()) {
  const effects = player?.effects || {};
  const active = {};
  for (const [type, effect] of Object.entries(effects)) {
    if (effect && effect.endsAt > now) active[type] = { ...effect };
  }
  return active;
}

export function chestPower(player, level, chestId, random = Math.random, durationMs = 5000) {
  if (!LEVELS[level]?.powerChests?.some(chest => chest.id === chestId)) return null;
  const slot = slotFor(player, level);
  slot.chests ||= {};
  const record = slot.chests[chestId] ||= { claimed: false };
  if (!record.power) {
    const definition = POWER_DEFINITIONS[Math.floor(Math.max(0, Math.min(.999999, Number(random()) || 0)) * POWER_DEFINITIONS.length)];
    record.power = { type: definition.type, name: definition.name, target: 'all', durationMs };
  }
  return { ...record.power };
}

export function collectPower(player, level = player?.state?.level, random = Math.random, chestId = null, { durationMs = 5000 } = {}) {
  if (!player || !Number.isFinite(level)) return null;
  const slot = slotFor(player, level);
  if (!player.state || player.state.finished || player.state.deadUntil > 0) return null;
  // A player may carry/reserve only one item across all levels.  Claimed
  // chests remain durable outside engine.state and therefore survive death.
  const held = player.power && !player.power.used && !player.powerSlots?.[player.power.level]?.used;
  if (held || Object.values(player.powerSlots || {}).some(s => s.reserved)) return null;
  const claimedCount = Object.values(slot.chests || {}).filter(chest => chest?.claimed).length;
  const id = chestId || LEVELS[level]?.powerChests?.find(chest => !slot.chests?.[chest.id]?.claimed)?.id;
  if (claimedCount >= 3 || !LEVELS[level]?.powerChests?.some(chest => chest.id === id)) return null;
  slot.chests ||= {};
  if (slot.chests[id]?.claimed) return null;
  const power = chestPower(player, level, id, random, durationMs);
  const itemId = `${player.runId || player.id || 'player'}:${id}`;
  slot.chests[id] = { ...slot.chests[id], claimed: true, itemId };
  slot.claimed = true; // compatibility summary; individual chests are authoritative.
  slot.used = false;
  slot.power = { ...power };
  slot.itemId = itemId;
  player.power = { level, itemId, chestId: id, claimed: true, used: false, queued: false, queuePosition: null, power: { ...slot.power } };
  return { type: 'powerCollected', level, itemId, chestId: id, power: { ...slot.power } };
}

const eligibleTargets = (room, caster) => [...room.players.values()].filter(player => player !== caster && player.connected && player.spawned && !player.state?.finished);

export function reservePower(room, caster, { now = Date.now(), random = Math.random } = {}) {
  if (!room || room.status !== 'running' || !caster || !caster.spawned || !caster.connected || caster.state?.deadUntil > 0 || caster.state?.finished) return { ok: false, code: 'POWER_UNAVAILABLE' };
  const held = caster.power;
  const level = held?.level ?? caster.state.level;
  const slot = caster.powerSlots?.[level];
  if (!held || held.level !== caster.state.level || held.used || !slot?.claimed || slot.used || Object.values(caster.powerSlots || {}).some(item => item.reserved) || !slot.power || held.itemId !== slot.itemId) return { ok: false, code: 'POWER_UNAVAILABLE' };
  if (!eligibleTargets(room, caster).length) return { ok: false, code: 'NO_TARGET' };
  const id = `${caster.id}-${level}-${now}-${Math.floor((Number(random()) || 0) * 1000000)}`;
  slot.reserved = id;
  return { ok: true, id, caster, runId: caster.runId, level, itemId: held.itemId, chestId: held.chestId, power: { ...slot.power, target: 'all', durationMs: Number(room.settings?.powerDurationSeconds || 5) * 1000 } };
}

export function activatePower(room, caster, { now = Date.now(), random = Math.random, force = false, reservation = null } = {}) {
  if (room?.activePower?.endsAt <= now) room.activePower = null;
  if (!room || !caster || room.status !== 'running' || room.activePower || room.powerDuel || !caster.connected || (!force && (!caster.spawned || caster.state?.deadUntil > 0 || caster.state?.finished))) return { ok: false, code: 'POWER_UNAVAILABLE' };
  const level = reservation?.level ?? caster.state.level;
  const slot = caster.powerSlots?.[level];
  if (!slot?.claimed || slot.used || (force ? slot.reserved !== reservation?.id : slot.reserved) || !slot.power || reservation?.itemId && reservation.itemId !== slot.itemId) return { ok: false, code: 'POWER_UNAVAILABLE' };
  const others = eligibleTargets(room, caster);
  if (!others.length) return { ok: false, code: 'NO_TARGET' };
  const targets = others;
  caster.effects ||= {};
  for (const target of targets) {
    target.effects ||= {};
    target.effects[slot.power.type] = { type: slot.power.type, by: caster.id, endsAt: now + slot.power.durationMs, id: `${caster.id}-${slot.power.type}-${now}` };
  }
  slot.used = true;
  slot.reserved = null;
  if (caster.power?.itemId === slot.itemId) caster.power = { ...caster.power, level, claimed: true, used: true, queued: false, queuePosition: null, power: { ...slot.power } };
  room.activePower ||= { id: reservation?.id || `${caster.id}-${now}`, casterId: caster.id, casterName: caster.name, level, power: { ...slot.power }, startedAt: now, endsAt: now + slot.power.durationMs };
  return { ok: true, power: { ...slot.power }, targets };
}

export function releasePowerReservation(entry) {
  const slot = entry?.caster?.powerSlots?.[entry.level];
  if (slot && slot.reserved === entry.id && slot.itemId === entry.itemId) slot.reserved = null;
  if (entry?.caster?.power?.itemId === entry.itemId && entry.caster.power.used === false) {
    entry.caster.power.queued = false; entry.caster.power.queuePosition = null;
  }
}

export function resetPowerInventory(player) {
  player.powerSlots = {};
  player.power = null;
  player.powerOffer = null;
}
