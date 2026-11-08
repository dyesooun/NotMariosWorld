// Reusable Looney Tunes style iris wipe for a game viewport.
// The overlay is clipped to the viewport element so surrounding page chrome is
// never covered. A radial-gradient keeps the reveal perfectly circular in CSS
// pixels regardless of the viewport aspect ratio.
export class IrisTransition {
  static DEFAULT_DURATION = 500;

  constructor(viewport, { duration = IrisTransition.DEFAULT_DURATION } = {}) {
    this.viewport = viewport;
    this.setDuration(duration);
    this.overlay = null;
    this.active = false;
    this._token = 0;
    this._blockInput=event=>{if(this.active){event.preventDefault();event.stopImmediatePropagation();}};
    this._inputEvents=['keydown','keyup','pointerdown','click','submit'];
    for(const event of this._inputEvents)viewport?.addEventListener(event,this._blockInput,true);
    this._resize = () => this._render(this._progress);
    this._observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(this._resize);
    if(viewport)this._observer?.observe(viewport);
  }

  setDuration(duration) { this.duration = Number.isFinite(Number(duration))&&Number(duration)>0?Number(duration):IrisTransition.DEFAULT_DURATION; return this; }

  _ensureOverlay() {
    if (this.overlay?.isConnected) return this.overlay;
    if (!this.viewport) return null;
    const overlay = document.createElement('div');
    overlay.className = 'iris-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    this.viewport.append(overlay);
    this.overlay = overlay;
    return overlay;
  }

  _radius() {
    const rect = this.viewport?.getBoundingClientRect();
    if (!rect) return 0;
    // Distance from center to a corner guarantees all four corners are black
    // at radius zero and fully revealed once this value is reached.
    return Math.hypot(rect.width / 2, rect.height / 2) + 1;
  }

  _render(progress = 0) {
    this._progress = Math.max(0, Math.min(1, Number(progress) || 0));
    const overlay = this.overlay;
    if (!overlay) return;
    const radius = this._radius() * this._progress;
    overlay.style.setProperty('--iris-radius', `${radius}px`);
    overlay.style.background = this._progress <= 0
      ? '#000'
      : 'radial-gradient(circle at 50% 50%, transparent var(--iris-radius), #000 var(--iris-radius))';
    overlay.style.setProperty('--iris-progress', String(this._progress));
  }

  _animate(from, to, duration = this.duration) {
    const token = ++this._token;
    const started = performance.now();
    this._render(from);
    return new Promise(resolve => {
      const tick = now => {
        if (token !== this._token) return resolve(false);
        const raw = Math.min(1, (now - started) / duration);
        // Smoothstep gives the soft cartoon ease without a CSS transition
        // racing layout changes or missing the exact black handoff frame.
        const eased = raw * raw * (3 - 2 * raw);
        this._render(from + (to - from) * eased);
        if (raw < 1) requestAnimationFrame(tick);
        else resolve(true);
      };
      requestAnimationFrame(tick);
    });
  }

  async close() {
    if (this.active) return false;
    const overlay = this._ensureOverlay();
    if (!overlay) return false;
    this.active = true;
    overlay.dataset.phase = 'closing';
    overlay.hidden = false;
    const result = await this._animate(1, 0);
    this._render(0);
    return result;
  }

  async open() {
    const overlay = this._ensureOverlay();
    if (!overlay) return false;
    this.active = true;
    overlay.dataset.phase = 'opening';
    overlay.hidden = false;
    const result = await this._animate(0, 1);
    if (result && this.overlay === overlay) {
      overlay.hidden = true;
      overlay.remove();
      this.overlay = null;
      this.active = false;
    }
    return result;
  }

  async run(switchScene) {
    if (this.active) return false;
    const closed = await this.close();
    if (!closed) return false;
    const token=this._token;
    // Let the browser paint the solid-black frame before mutating the scene.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if(token!==this._token)return false;
    try { await switchScene?.(); }
    finally { if(token===this._token)await this.open(); }
    return true;
  }

  retarget(viewport) {
    this._observer?.disconnect();
    if(this.viewport?.__irisTransition===this)delete this.viewport.__irisTransition;
    for(const event of this._inputEvents)this.viewport?.removeEventListener(event,this._blockInput,true);
    this.viewport=viewport;
    viewport.__irisTransition=this;
    this._observer?.observe(viewport);
    for(const event of this._inputEvents)viewport?.addEventListener(event,this._blockInput,true);
    if(this.overlay)viewport.append(this.overlay);
    this._render(this._progress);
  }

  cancel() {
    this._token++;
    this.active = false;
    this.overlay?.remove();
    this.overlay = null;
  }

  destroy() {
    this.cancel();
    for(const event of this._inputEvents)this.viewport?.removeEventListener(event,this._blockInput,true);
    this._observer?.disconnect();
    if(this.viewport?.__irisTransition===this)delete this.viewport.__irisTransition;
  }
}

export function irisTransitionFor(viewport, options) {
  if (!viewport) return null;
  const transition=viewport.__irisTransition || (viewport.__irisTransition = new IrisTransition(viewport, options));
  if(options?.duration!==undefined)transition.setDuration(options.duration);
  return transition;
}
