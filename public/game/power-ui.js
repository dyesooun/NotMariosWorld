import { POWER_DEFINITIONS, POWER_STRENGTH_DEFAULTS } from './powers.js';
import { LEVELS } from './levels.js';
import { GAME_CARD_SCALE } from './overlay-layout.js';

// This is the rendered logical bounds (not the former unscaled design size).
// Keep it authoritative so shared announcements can avoid the actual card.
export const POWER_HUD_RECT = Object.freeze({ x: 14, y: 14, w: 308 * GAME_CARD_SCALE, h: 80 * GAME_CARD_SCALE });
export const INK_EXTRA_DARKNESS = POWER_STRENGTH_DEFAULTS.inkDarknessPercent / 100;

export function activePowerEffects(player, now = Date.now()) {
  return Object.fromEntries(Object.entries(player?.effects || {}).filter(([, effect]) => effect.endsAt > now));
}
export function powerUIModel(player, { now = Date.now(), running = true, isHost = false } = {}) {
  const state = player?.state, inventory = player?.power;
  const slot = inventory && (inventory.level === state?.level || inventory.queued || inventory.testing || !inventory.used) ? inventory : null;
  const visible = !!(running && player?.spawned && state?.level > 0 && !state.finished);
  const queued = !!slot?.queued, testing=!!slot?.testing, held = slot?.claimed && (!slot.used || queued || testing);
  const canUse = !!(visible && held && !queued && !testing && (!player.powerQuiz||player.powerQuiz.answered) && !state.respawnRemaining && player.connected && !isHost);
  const active = activePowerEffects(player, now), darkness = Math.max(0, Math.min(.95, Number(active.fog?.strength?.darknessPercent ?? POWER_STRENGTH_DEFAULTS.inkDarknessPercent) / 100));
  const powerName = slot?.power?.name || null, powerType = slot?.power?.type || null;
  return { visible, held, queued, testing, queuePosition:slot?.queuePosition??null, canUse, fog: !!active.fog, darkness,
    powerName, powerType,
    heading: testing ? 'POWER QUIZ' : queued ? `${slot.power.name} / QUEUED` : held ? slot.power.name : slot?.used ? 'POWER USED / FIND ANOTHER' : 'FIND A POWER CHEST',
    detail: testing ? 'Answer in the world / one attempt' : queued ? `Waiting / #${slot.queuePosition??'?'} in room queue` : held ? 'Everyone else / quiz to attack' : `Chests opened: ${player?.powerChestClaims?.length||0}/${LEVELS[state?.level]?.powerChests?.length||0} / one slot`,
    button: { x: POWER_HUD_RECT.x + 218 * GAME_CARD_SCALE, y: POWER_HUD_RECT.y + 24 * GAME_CARD_SCALE, w: 74 * GAME_CARD_SCALE, h: 34 * GAME_CARD_SCALE },
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
    // Apply the issued darkness before drawing readable HUDs.
    ctx.fillStyle = `rgba(0,0,0,${model.darkness})`; ctx.fillRect(0, 0, 960, 540);
  }
  // The player viewport renders these labels as sharp HTML text above the pixel canvas.
  model.textRows=[];
  const text = (value, x, y, size = 11, color = '#e9f4d5') => {
    size=Math.max(10,size)*(GAME_CARD_SCALE/0.75);x=Math.round(x);y=Math.round(y);
    model.textRows.push({value,x,y,size,color});
    if(options.domText)return;
    ctx.fillStyle = color; ctx.font = `${size}px monospace`; ctx.fillText(value,x,y);
  };
  const r = POWER_HUD_RECT;
  const panel = (x,y,w,h) => {
    const edge=2*GAME_CARD_SCALE,corner=5*GAME_CARD_SCALE,shadow=5*GAME_CARD_SCALE;
    ctx.fillStyle='#08161288';ctx.fillRect(x+shadow,y+shadow,w,h);
    ctx.fillStyle='#b7ef51';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#172c25f5';ctx.fillRect(x+edge,y+edge,w-edge*2,h-edge*2);
    ctx.fillStyle='#b7ef51';
    for(const [cx,cy] of [[x,y],[x+w-corner,y],[x,y+h-corner],[x+w-corner,y+h-corner]])ctx.fillRect(cx,cy,corner,corner);
  };
  panel(r.x,r.y,r.w,r.h);
  text(model.powerName || 'POWER SLOT', r.x + 12 * GAME_CARD_SCALE, r.y + 18 * GAME_CARD_SCALE, 10, '#b7ef51');
  const status=model.testing?'ANSWER YOUR QUESTION':model.queued?`QUEUED / #${model.queuePosition??'?'}`:model.held?'READY TO ACTIVATE':model.heading;
  text(status, r.x + 12 * GAME_CARD_SCALE, r.y + 38 * GAME_CARD_SCALE, 10, model.held ? '#b7ef51' : '#e9f4d5');
  text(model.detail, r.x + 12 * GAME_CARD_SCALE, r.y + 70 * GAME_CARD_SCALE, 9, '#aac3b5');
  if (model.held) {
    const button = model.button;
    ctx.fillStyle = model.canUse || options.isHost ? '#b7ef51' : '#75896a'; ctx.fillRect(button.x, button.y, button.w, button.h);
    text(model.testing ? 'QUIZ' : model.queued ? 'QUEUED' : '[F] USE', button.x + 6 * GAME_CARD_SCALE, button.y + 21 * GAME_CARD_SCALE, 10, '#142a29');
  }
  model.effects.forEach((effect, i) => {
    const y = r.y + r.h + 10 * GAME_CARD_SCALE + i * 26 * GAME_CARD_SCALE;
    panel(r.x, y, r.w, 23 * GAME_CARD_SCALE);
    text(`${effect.name.toUpperCase()} / ${effect.seconds}s`, r.x + 11 * GAME_CARD_SCALE, y + 16 * GAME_CARD_SCALE, 10, '#b7ef51');
  });
  ctx.restore(); return model;
}
