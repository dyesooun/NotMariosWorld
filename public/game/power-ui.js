import { POWER_DEFINITIONS } from './powers.js';

export const POWER_HUD_RECT = Object.freeze({ x: 14, y: 14, w: 308, h: 80 });
export const INK_EXTRA_DARKNESS = .75;

export function activePowerEffects(player, now = Date.now()) {
  return Object.fromEntries(Object.entries(player?.effects || {}).filter(([, effect]) => effect.endsAt > now));
}
export function powerUIModel(player, { now = Date.now(), running = true, isHost = false } = {}) {
  const state = player?.state, inventory = player?.power;
  const slot = inventory && (inventory.level === state?.level || inventory.queued || inventory.testing || !inventory.used) ? inventory : null;
  const visible = !!(running && player?.spawned && state?.level > 0 && !state.finished);
  const queued = !!slot?.queued, testing=!!slot?.testing, held = slot?.claimed && (!slot.used || queued || testing);
  const canUse = !!(visible && held && !queued && !testing && (!player.powerQuiz||player.powerQuiz.answered) && !state.respawnRemaining && player.connected && !isHost);
  return { visible, held, queued, testing, queuePosition:slot?.queuePosition??null, canUse, fog: !!activePowerEffects(player, now).fog,
    heading: testing ? 'POWER QUIZ' : queued ? `${slot.power.name} / QUEUED` : held ? slot.power.name : slot?.used ? 'POWER USED / FIND ANOTHER' : 'FIND A POWER CHEST',
    detail: testing ? 'Answer in the world / one attempt' : queued ? `Waiting / #${slot.queuePosition??'?'} in room queue` : held ? 'Everyone else / quiz to attack' : `Chests opened: ${player?.powerChestClaims?.length||0}/3 / one slot`,
    button: { x: 232, y: 38, w: 74, h: 34 },
    effects: Object.entries(activePowerEffects(player, now)).map(([type, effect]) => ({ type, name: POWER_DEFINITIONS.find(p => p.type === type)?.name || type, seconds: Math.ceil((effect.endsAt - now) / 1000) }))
  };
}
export function renderPowerUI(canvas, player, options = {}) {
  const model = powerUIModel(player, options), ctx = canvas.getContext('2d');
  if (!model.visible) return model;
  ctx.save(); ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 540, 0, 0);
  if (model.fog) {
    ctx.fillStyle = '#293e62ad'; ctx.fillRect(0, 0, 960, 540);
    for (let i = 0; i < 36; i++) {
      const x = (i * 173 + (options.time || 0) * 19) % 1120 - 160, y = (i * 97) % 540;
      ctx.fillStyle = i % 2 ? '#c1c2df2e' : '#667dba47'; ctx.fillRect(x, y, 150, 48);
    }
    // Reduce the existing ink scene's remaining brightness by 75%, keeping HUDs readable.
    ctx.fillStyle = `rgba(0,0,0,${INK_EXTRA_DARKNESS})`; ctx.fillRect(0, 0, 960, 540);
  }
  const text = (value, x, y, size = 11, color = '#e9f4d5') => { ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.fillText(value, x, y); };
  const r = POWER_HUD_RECT;
  ctx.fillStyle = '#142a29ec'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = model.held ? '#b7ef51' : '#709083'; ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
  text('CHEST POWER / ONE SLOT', r.x + 12, r.y + 18, 9, '#a2c8aa');
  text(model.heading, r.x + 12, r.y + 36, 13, model.held ? '#b7ef51' : '#e9f4d5');
  text(model.detail, r.x + 12, r.y + 70, 9, '#aac3b5');
  if (model.held) {
    const button = model.button;
    ctx.fillStyle = model.canUse || options.isHost ? '#b7ef51' : '#75896a'; ctx.fillRect(button.x, button.y, button.w, button.h);
    text(model.testing ? 'QUIZ' : model.queued ? 'QUEUED' : options.isHost ? 'READY [F]' : 'USE [F]', button.x + 8, button.y + 21, 10, '#142a29');
  }
  model.effects.forEach((effect, i) => {
    const y = r.y + r.h + 10 + i * 26;
    ctx.fillStyle = '#2f2541ed'; ctx.fillRect(r.x, y, r.w, 23);
    text(`${effect.name.toUpperCase()} / ${effect.seconds}s`, r.x + 11, y + 16, 11, '#e6caff');
  });
  ctx.restore(); return model;
}
