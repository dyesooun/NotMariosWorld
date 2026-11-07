import { GAME_CARD_SCALE } from './overlay-layout.js';
import { POWER_HUD_RECT } from './power-ui.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const descriptions = { slow: 'Slower movement.', reverse: 'Reversed controls.', slippery: 'Fast and slippery.', fog: 'Darker view.' };

// Currency, targets and deadlines come from the coordinator; selection and
// keyboard focus belong to this persistent DOM control.
export function createCoinAttackControls(viewport, { onAttack = () => false, onClose = () => {}, onOpen = () => {} } = {}) {
  const doc = viewport.ownerDocument || document;
  const root = doc.createElement('section');
  root.className = 'coin-attack-controls';
  root.setAttribute('aria-label', 'Coin attack');
  root.hidden = true;
  viewport.append(root);
  let model = null, mode = 'board', selectedPower = null, submitting = false, lastMarkup = '', canvas = null;
  const cooldown = () => Math.max(0, Number(model?.cooldownEndsAt || 0) - Number(model?.now ?? Date.now()));
  const ready = () => model?.canActivate !== false && model?.canAfford && !model?.pending && !submitting && !cooldown();
  const focusFirst = () => (root.querySelector('[data-attack-power]') || root.querySelector('[data-attack-target]') || root.querySelector('[data-attack-close]'))?.focus();

  function close({ restoreFocus = true } = {}) {
    const wasOpen = mode !== 'board';
    const hadFocus = root.contains(doc.activeElement);
    mode = 'board'; selectedPower = null;
    render();
    if (wasOpen) onClose();
    if (restoreFocus && hadFocus) (root.querySelector('[data-attack-open]') || canvas)?.focus();
  }
  function render() {
    root.hidden = !model?.visible && !submitting;
    root.classList.toggle('is-dialog', mode !== 'board');
    let markup = '';
    const pending = !!model?.pending || submitting;
    if (!root.hidden && mode === 'board') {
      const seconds = Math.ceil(cooldown() / 1000);
      markup = `<div class="coin-attack-board pixel-world-panel">
        ${pending || seconds ? `<span class="coin-attack-title">ATTACK</span><span class="coin-attack-status">${seconds ? `${seconds}s · ` : ''}${pending ? submitting ? 'REQUESTING…' : model.active ? 'IN PROGRESS' : `QUEUED${model.queuePosition ? ` · #${model.queuePosition}` : ''}` : 'COOLDOWN'}</span>` : `<button class="coin-attack-open" data-attack-open="1" ${ready() ? '' : 'disabled'}><span>ATTACK</span><kbd>Q</kbd></button><span class="coin-attack-balance" title="${model.available} available; ${model.cost} coins per attack">${model.available} / ${model.cost} COINS</span>`}
      </div>`;
    } else if (!root.hidden && mode === 'powers') {
      markup = `<div class="coin-attack-dialog pixel-world-panel" role="dialog" aria-modal="true" aria-labelledby="coin-attack-heading">
        <div class="coin-attack-dialog-head"><strong id="coin-attack-heading">CHOOSE A POWER</strong><button class="coin-attack-close" data-attack-close="1" aria-label="Close coin attack">×</button></div>
        <p>${model.cost} coins · Score stays unchanged.</p>
        <div class="coin-attack-options">${model.powers.map((power, index) => `<button data-attack-power="${esc(power.type)}" aria-keyshortcuts="${index + 1}"><span class="coin-attack-power-heading"><kbd>${index + 1}</kbd><strong>${esc(power.name)}</strong></span><small>${esc(descriptions[power.type])}</small></button>`).join('')}</div>
        <div class="coin-attack-footer"><button class="coin-attack-back" data-attack-close="1"><span>Cancel</span><kbd>ESC</kbd></button></div></div>`;
    } else if (!root.hidden) {
      markup = `<div class="coin-attack-dialog pixel-world-panel" role="dialog" aria-modal="true" aria-labelledby="coin-target-heading">
        <div class="coin-attack-dialog-head"><strong id="coin-target-heading">TARGET A RUNNER</strong><button class="coin-attack-close" data-attack-close="1" aria-label="Close coin attack">×</button></div>
        <p>${esc(model.powers.find(power => power.type === selectedPower)?.name)} · ${model.cost} coins</p>
        <div class="coin-attack-targets">${model.targets.length ? model.targets.map(target => `<button data-attack-target="${esc(target.id)}"><strong>${esc(target.name)}</strong><small>${esc(target.worldLabel || 'Racing')}</small></button>`).join('') : '<span class="coin-attack-empty">No eligible runners remain.</span>'}</div>
        <div class="coin-attack-footer"><button class="coin-attack-back" data-attack-back="1">← Back</button></div></div>`;
    }
    if (markup === lastMarkup) return;
    const active = root.contains(doc.activeElement) ? doc.activeElement : null;
    const focusKey = active && ['attackPower', 'attackTarget', 'attackClose', 'attackBack', 'attackOpen'].find(key => key in active.dataset);
    const focusValue = focusKey && active.dataset[focusKey];
    root.innerHTML = markup; lastMarkup = markup;
    if (focusKey) {
      const replacement = [...root.querySelectorAll('button')].find(button => button.dataset[focusKey] === focusValue);
      (replacement || root.querySelector('button'))?.focus();
    }
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if ('attackOpen' in button.dataset && ready()) { onOpen(); mode = 'powers'; render(); focusFirst(); }
    else if ('attackPower' in button.dataset && ready()) { selectedPower = button.dataset.attackPower; mode = 'targets'; render(); focusFirst(); }
    else if ('attackTarget' in button.dataset && selectedPower && ready() && model.targets.some(target => target.id === button.dataset.attackTarget)) {
      submitting = true;
      try {
        if (onAttack({ powerType: selectedPower, targetId: button.dataset.attackTarget }) === false) submitting = false;
      } catch (error) { submitting = false; render(); throw error; }
      if (submitting) close(); else render();
    } else if ('attackBack' in button.dataset) { mode = 'powers'; selectedPower = null; render(); focusFirst(); }
    else if ('attackClose' in button.dataset) close();
  });
  function handleKeydown(event) {
    if (mode === 'board' || event.ctrlKey || event.altKey || event.metaKey) return false;
    if (mode === 'powers' && /^[1-4]$/.test(event.key) && !event.repeat && ready()) {
      const power = model.powers[Number(event.key) - 1];
      if (!power) return false;
      event.preventDefault(); event.stopPropagation();
      selectedPower = power.type; mode = 'targets'; render(); focusFirst();
      return true;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return true; }
    if (event.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button')].filter(button => !button.disabled);
      const index = buttons.indexOf(doc.activeElement);
      if (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === buttons.length - 1)) {
        event.preventDefault(); event.stopPropagation(); (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus(); return true;
      }
    }
    return false;
  }
  root.addEventListener('keydown', handleKeydown);
  return {
    root,
    get isOpen() { return mode !== 'board'; },
    update(nextModel, options = {}) {
      model = nextModel;
      canvas = options.canvas || canvas;
      if (!model?.visible || model?.pending || cooldown()) submitting = false;
      if (mode !== 'board' && (!model?.visible || !ready())) close({ restoreFocus: false });
      const viewportBounds = viewport.getBoundingClientRect();
      const bounds = canvas?.getBoundingClientRect?.() || viewportBounds;
      const scale = canvas ? Math.min(bounds.width / 960, bounds.height / 540) : 1;
      const contentLeft = bounds.left - viewportBounds.left + (bounds.width - 960 * scale) / 2;
      const contentTop = bounds.top - viewportBounds.top + (bounds.height - 540 * scale) / 2;
      const effects = Math.max(0, Number(model?.effectCount) || 0);
      const effectHeight = effects ? (10 + (effects - 1) * 26 + 23) * GAME_CARD_SCALE : 0;
      root.style.left = `${contentLeft + POWER_HUD_RECT.x * scale}px`;
      root.style.top = `${contentTop + (POWER_HUD_RECT.y + POWER_HUD_RECT.h + effectHeight + 10) * scale}px`;
      root.style.setProperty('--coin-attack-scale', String(scale * GAME_CARD_SCALE));
      render();
    },
    close,
    handleKeydown,
    resetSubmission() { submitting = false; render(); },
    destroy() { if (mode !== 'board') onClose(); root.remove(); }
  };
}
