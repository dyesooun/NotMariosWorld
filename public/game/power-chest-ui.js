export function powerChestOfferModel(player, { running = true, isHost = false } = {}) {
  const offer = player?.powerOffer;
  if (!running || isHost || !offer || !player.connected || !player.spawned || player.state?.finished || player.state?.respawnRemaining || player.state?.level !== offer.level || (player.powerQuiz && !player.powerQuiz.answered)) return null;
  return {
    ...offer,
    heldName: player.power?.power?.name || 'Current power',
    nextName: offer.power?.name || 'Mystery power',
    panel: { x: 220, y: 300, w: 520, h: 172 },
    note: offer.queued ? 'Your current power is queued. This chest stays unopened.' : 'Hold one power at a time. Walk away to keep your current one.',
  };
}

// A real in-world card, updated from snapshots independently of canvas animation.
export function createPowerChestControls(viewport, { onChoice, onOpen, onClose } = {}) {
  const doc = viewport.ownerDocument;
  const root = doc.createElement('section');
  root.className = 'power-chest-controls'; root.hidden = true;
  const panel = doc.createElement('div'); panel.className = 'power-chest-panel';
  panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Choose a chest power');
  const title = doc.createElement('h2'); title.textContent = 'ONE SLOT. YOUR CALL.';
  const held = doc.createElement('p'); held.className = 'power-chest-held';
  const next = doc.createElement('p'); next.className = 'power-chest-next';
  const actions = doc.createElement('div'); actions.className = 'power-chest-actions';
  const attack = doc.createElement('button'); attack.type = 'button'; attack.className = 'button primary'; attack.textContent = 'Attack current [F]';
  const replace = doc.createElement('button'); replace.type = 'button'; replace.className = 'button ghost'; replace.textContent = 'Replace with new';
  const note = doc.createElement('p'); note.className = 'power-chest-note';
  actions.append(attack, replace); panel.append(title, held, next, actions, note); root.append(panel); viewport.append(root);
  let current = null, key = null, pending = false;
  const choose = choice => {
    if (!current || pending || !(choice === 'attack' ? current.canAttack : current.canReplace)) return;
    pending = true; attack.disabled = replace.disabled = true;
    if (onChoice?.({ offerId: current.id, itemId: current.itemId, choice }) === false) resetSubmission();
  };
  attack.addEventListener('click', () => choose('attack'));
  replace.addEventListener('click', () => choose('replace'));
  function resetSubmission() {
    pending = false; attack.disabled = !current?.canAttack; replace.disabled = !current?.canReplace;
  }
  function update(model, { canvas } = {}) {
    if (!model) {
      if (!root.hidden) onClose?.();
      if (root.contains(doc.activeElement)) canvas?.focus({ preventScroll: true });
      root.hidden = true; current = null; key = null; pending = false; return;
    }
    const nextKey = `${model.id}:${model.itemId}:${!!model.queued}`;
    if (nextKey !== key) { key = nextKey; pending = false; onOpen?.(); }
    current = model; root.hidden = false;
    held.textContent = `HELD / ${model.heldName}`; next.textContent = `IN THIS CHEST / ${model.nextName}`; note.textContent = model.note;
    attack.disabled = pending || !model.canAttack; replace.disabled = pending || !model.canReplace;
    const bounds = canvas?.getBoundingClientRect() || viewport.getBoundingClientRect(), outer = viewport.getBoundingClientRect();
    const scale = Math.min(bounds.width / 960, bounds.height / 540), r = model.panel;
    panel.style.left = `${bounds.left - outer.left + (bounds.width - 960 * scale) / 2 + r.x * scale}px`;
    panel.style.top = `${bounds.top - outer.top + (bounds.height - 540 * scale) / 2 + r.y * scale}px`;
    panel.style.width = `${r.w}px`; panel.style.height = `${r.h}px`; panel.style.transform = `scale(${scale})`;
  }
  return { root, update, resetSubmission, destroy() { root.remove(); current = null; } };
}
