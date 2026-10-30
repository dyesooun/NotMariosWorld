// Server-authoritative power chest rules. This module intentionally has no DOM dependencies.
export const POWER_DEFINITIONS = Object.freeze([
  Object.freeze({ type: 'slow', name: 'Sticky Boots', durationMs: 5000 }),
  Object.freeze({ type: 'reverse', name: 'Wrong Way', durationMs: 5000 }),
  Object.freeze({ type: 'slippery', name: 'Ice Skates', durationMs: 5000 }),
  Object.freeze({ type: 'fog', name: 'Ink Cloud', durationMs: 5000 })
]);

const slotFor = (player, level) => {
  player.powerSlots ||= {};
  return player.powerSlots[level] ||= { claimed: false, used: false, reserved: null, power: null };
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

export function collectPower(player, level = player?.state?.level, random = Math.random) {
  if (!player || !Number.isFinite(level)) return null;
  const slot = slotFor(player, level);
  if (slot.claimed || !player.state || player.state.finished || player.state.deadUntil > 0) return null;
  const power = POWER_DEFINITIONS[Math.floor(Math.max(0, Math.min(.999999, Number(random()) || 0)) * POWER_DEFINITIONS.length)];
  const target = (Number(random()) || 0) < .5 ? 'random' : 'all';
  slot.claimed = true;
  slot.used = false;
  slot.power = { type: power.type, name: power.name, target, durationMs: power.durationMs };
  player.power = { level, claimed: true, used: false, queued: false, queuePosition: null, power: { ...slot.power } };
  return { type: 'powerCollected', level, power: { ...slot.power } };
}

const eligibleTargets = (room, caster) => [...room.players.values()].filter(player => player !== caster && player.connected && player.spawned && !player.state?.finished);

export function reservePower(room, caster, { now = Date.now(), random = Math.random } = {}) {
  if (!room || room.status !== 'running' || !caster || !caster.spawned || !caster.connected || caster.state?.deadUntil > 0 || caster.state?.finished) return { ok: false, code: 'POWER_UNAVAILABLE' };
  const level = caster.state.level;
  const slot = caster.powerSlots?.[level];
  if (!slot?.claimed || slot.used || slot.reserved || !slot.power) return { ok: false, code: 'POWER_UNAVAILABLE' };
  if (!eligibleTargets(room, caster).length) return { ok: false, code: 'NO_TARGET' };
  const id = `${caster.id}-${level}-${now}-${Math.floor((Number(random()) || 0) * 1000000)}`;
  slot.reserved = id;
  return { ok: true, id, caster, level, power: { ...slot.power } };
}

export function activatePower(room, caster, { now = Date.now(), random = Math.random, force = false, reservation = null } = {}) {
  if (room?.activePower?.endsAt <= now) room.activePower = null;
  if (!room || !caster || room.status !== 'running' || room.activePower || room.powerDuel || !caster.connected || (!force && (!caster.spawned || caster.state?.deadUntil > 0 || caster.state?.finished))) return { ok: false, code: 'POWER_UNAVAILABLE' };
  const level = reservation?.level ?? caster.state.level;
  const slot = caster.powerSlots?.[level];
  if (!slot?.claimed || slot.used || (force ? slot.reserved !== reservation?.id : slot.reserved) || !slot.power) return { ok: false, code: 'POWER_UNAVAILABLE' };
  const others = eligibleTargets(room, caster);
  if (!others.length) return { ok: false, code: 'NO_TARGET' };
  const targets = slot.power.target === 'all' ? others : [others[Math.floor(Math.max(0, Math.min(.999999, Number(random()) || 0)) * others.length)]];
  caster.effects ||= {};
  for (const target of targets) {
    target.effects ||= {};
    target.effects[slot.power.type] = { type: slot.power.type, by: caster.id, endsAt: now + slot.power.durationMs, id: `${caster.id}-${slot.power.type}-${now}` };
  }
  slot.used = true;
  slot.reserved = null;
  if (caster.state.level === level) caster.power = { level, claimed: true, used: true, queued: false, queuePosition: null, power: { ...slot.power } };
  room.activePower ||= { id: reservation?.id || `${caster.id}-${now}`, casterId: caster.id, casterName: caster.name, level, power: { ...slot.power }, startedAt: now, endsAt: now + slot.power.durationMs };
  return { ok: true, power: { ...slot.power }, targets };
}

export function releasePowerReservation(entry) {
  const slot = entry?.caster?.powerSlots?.[entry.level];
  if (slot && slot.reserved === entry.id) slot.reserved = null;
  if (entry?.caster?.power?.level === entry.level && entry.caster.power.used === false) {
    entry.caster.power.queued = false; entry.caster.power.queuePosition = null;
  }
}

export function resetPowerInventory(player) {
  player.powerSlots = {};
  player.power = null;
}
