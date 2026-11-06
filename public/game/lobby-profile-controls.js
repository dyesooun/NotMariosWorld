import { AVATARS, COLORS } from './engine.js';
import { GAME_CARD_SCALE } from './overlay-layout.js';

const COLOR_NAMES = ['lime', 'pink', 'blue', 'purple', 'gold', 'coral'];

// Real DOM controls stay inside the canvas viewport, including in fullscreen.
export function createLobbyProfileControls(viewport, { onChange, onFocus, onPlay, drawAvatar } = {}) {
  const doc = viewport.ownerDocument;
  const root = doc.createElement('section');
  root.className = 'lobby-profile-controls pixel-world-panel';
  root.setAttribute('aria-label', 'Lobby player selection');
  const title = doc.createElement('h2'); title.textContent = 'MAKE A LITTLE TROUBLE.';
  const label = doc.createElement('label'); label.textContent = 'YOUR NAME';
  const name = doc.createElement('input');
  name.id = 'profile-name'; name.maxLength = 24; name.autocomplete = 'nickname';
  name.setAttribute('aria-label', 'Player name'); label.append(name);
  const avatars = doc.createElement('div'); avatars.className = 'lobby-avatars';
  avatars.setAttribute('role', 'group'); avatars.setAttribute('aria-label', 'Choose an avatar');
  const avatarButtons = AVATARS.map(avatar => {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'lobby-avatar';
    button.setAttribute('aria-label', `Choose ${avatar}`); button.title = avatar;
    const portrait = doc.createElement('canvas'); portrait.width = 64; portrait.height = 64;
    portrait.setAttribute('aria-hidden', 'true');
    button.append(portrait); avatars.append(button);
    button.addEventListener('click', () => { if (!button.disabled) { onChange?.({ avatar }); onPlay?.(); } });
    return { button, portrait, avatar };
  });
  const colors = doc.createElement('div'); colors.className = 'lobby-colors';
  colors.setAttribute('role', 'group'); colors.setAttribute('aria-label', 'Choose a color');
  const colorButtons = COLORS.map((color, index) => {
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'lobby-color';
    button.style.backgroundColor = color; button.title = COLOR_NAMES[index];
    button.setAttribute('aria-label', `Choose color ${COLOR_NAMES[index]}`);
    button.addEventListener('click', () => { if (!button.disabled) { onChange?.({ color }); onPlay?.(); } });
    colors.append(button); return { button, color };
  });
  const hint = doc.createElement('p'); hint.textContent = 'Move now · Change your look until the host starts';
  root.append(title, label, avatars, colors, hint); viewport.append(root);
  name.addEventListener('input', () => { if (!name.disabled) onChange?.({ name: name.value.slice(0, 24) }); });
  name.addEventListener('change', () => {
    if (name.disabled) return;
    name.value = name.value.trim() || 'Player'; onChange?.({ name: name.value });
  });
  name.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); name.blur(); onPlay?.(); }
  });
  root.addEventListener('focusin', () => onFocus?.());
  return {
    root,
    update({ profile, status, connected = true, obscured = false }, { canvas } = {}) {
      const editable = status === 'lobby' && connected;
      root.hidden = status !== 'lobby' || obscured;
      name.disabled = !editable;
      if (doc.activeElement !== name) name.value = profile.name;
      for (const { button, portrait, avatar } of avatarButtons) {
        button.disabled = !editable;
        button.setAttribute('aria-pressed', String(profile.avatar === avatar));
        drawAvatar?.(portrait, avatar, profile.color);
      }
      for (const { button, color } of colorButtons) {
        button.disabled = !editable; button.setAttribute('aria-pressed', String(profile.color === color));
      }
      if (canvas) {
        const viewportBounds = viewport.getBoundingClientRect(), bounds = canvas.getBoundingClientRect();
        const scale = Math.min(bounds.width / 960, bounds.height / 540);
        root.style.left = `${bounds.left - viewportBounds.left + (bounds.width - 960 * scale) / 2 + 14 * scale}px`;
        root.style.top = `${bounds.top - viewportBounds.top + (bounds.height - 540 * scale) / 2 + 14 * scale}px`;
        root.style.transform = `scale(${scale * GAME_CARD_SCALE})`;
      }
    },
    destroy() { root.remove(); },
  };
}
