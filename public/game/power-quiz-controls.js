const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;

function ownerDocument(viewport) {
  return viewport?.ownerDocument || (typeof document !== 'undefined' ? document : null);
}

function keyFor(model) {
  return model ? `${model.transactionId}:${model.id}` : null;
}

function setText(element, value) {
  element.textContent = value == null ? '' : String(value);
}

function setRect(element, rect) {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.w}px`;
  element.style.height = `${rect.h}px`;
}

/**
 * Creates the complete in-world question and its answer controls in one DOM card.
 * The card is deliberately independent of the canvas drawing lifecycle so
 * text input and accessibility controls cannot disappear during animation.
 */
export function createPowerQuizControls(viewport, { onSubmit, onOpen, onClose } = {}) {
  if (!viewport) throw new Error('createPowerQuizControls requires a viewport element');
  const doc = ownerDocument(viewport);
  if (!doc) throw new Error('createPowerQuizControls requires a DOM document');

  const root = doc.createElement('form');
  root.className = 'power-quiz-controls';
  root.hidden = true;
  root.setAttribute('aria-label', 'Power question');
  root.addEventListener('submit', onFormSubmit);

  const shade = doc.createElement('div');
  shade.className = 'power-quiz-shade';
  const panel = doc.createElement('section');
  panel.className = 'power-quiz-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');

  const header = doc.createElement('header');
  const title = doc.createElement('span');
  title.className = 'power-quiz-title';
  const timer = doc.createElement('span');
  timer.className = 'power-quiz-timer';
  header.append(title, timer);

  const progress = doc.createElement('div');
  progress.className = 'power-quiz-progress';
  const progressFill = doc.createElement('div');
  progressFill.className = 'power-quiz-progress-fill';
  progress.append(progressFill);

  const prompt = doc.createElement('h2');
  prompt.className = 'power-quiz-prompt';
  const input = doc.createElement('input');
  input.className = 'power-quiz-answer';
  input.name = 'answer';
  input.placeholder = 'Type your answer…';
  input.setAttribute('aria-label', 'Answer to power question');
  input.maxLength = 120;
  input.setAttribute('autocomplete', 'off');
  input.spellcheck = false;
  input.required = true;
  const submit = doc.createElement('button');
  submit.className = 'button primary power-quiz-submit';
  submit.type = 'submit';
  setText(submit, 'Submit');
  const status = doc.createElement('p');
  status.className = 'power-quiz-status';
  const hint = doc.createElement('p');
  hint.className = 'power-quiz-hint';
  const note = doc.createElement('p');
  note.className = 'power-quiz-note';
  setText(note, 'ONE ATTEMPT / ANSWERS ARE CASE-INSENSITIVE');
  const footer = doc.createElement('footer');
  footer.append(hint, note);
  panel.append(header, progress, prompt, input, submit, status, footer);
  shade.append(panel);
  root.append(shade);
  viewport.append(root);

  let activeKey = null;
  let currentModel = null;
  let currentCanvas = null;
  let submitted = false;
  let submitting = false;

  function focusCanvas() {
    const active = doc.activeElement;
    if (active && root.contains(active) && currentCanvas?.focus) currentCanvas.focus({ preventScroll: true });
  }

  function hide() {
    if (!root.hidden) {
      focusCanvas();
      root.hidden = true;
      onClose?.();
    }
    activeKey = null;
    currentModel = null;
    submitted = false;
    submitting = false;
  }

  function geometry(model, canvas) {
    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect?.() || viewportRect;
    const scale = Math.min(canvasRect.width / LOGICAL_WIDTH, canvasRect.height / LOGICAL_HEIGHT);
    const offsetX = canvasRect.left - viewportRect.left + (canvasRect.width - LOGICAL_WIDTH * scale) / 2;
    const offsetY = canvasRect.top - viewportRect.top + (canvasRect.height - LOGICAL_HEIGHT * scale) / 2;
    panel.style.position = 'absolute';
    panel.style.left = `${offsetX + model.panel.x * scale}px`;
    panel.style.top = `${offsetY + model.panel.y * scale}px`;
    panel.style.width = `${model.panel.w}px`;
    panel.style.height = `${model.panel.h}px`;
    panel.style.transform = `scale(${scale})`;
    panel.style.transformOrigin = 'top left';
    setRect(input, {
      x: model.input.x - model.panel.x,
      y: model.input.y - model.panel.y,
      w: model.input.w,
      h: model.input.h,
    });
    setRect(submit, {
      x: model.submit.x - model.panel.x,
      y: model.submit.y - model.panel.y,
      w: model.submit.w,
      h: model.submit.h,
    });
  }

  function updateState(model) {
    const canAnswer = !!model.canAnswer && !model.answered;
    input.hidden = !canAnswer;
    submit.hidden = !canAnswer;
    input.disabled = !canAnswer || submitted || submitting;
    submit.disabled = !canAnswer || submitted || submitting;
    if (model.answered) {
      setText(status, model.result === 'correct' ? 'ANSWER CORRECT' : 'ANSWER RECORDED');
    } else if (!model.canAnswer) {
      setText(status, 'TIME UP');
    } else {
      setText(status, '');
    }
  }

  function onFormSubmit(event) {
    event.preventDefault();
    if (!currentModel || currentModel.answered || !currentModel.canAnswer || submitted || submitting) return false;
    const answer = String(input.value || '').trim();
    if (!answer) return false;
    const key = activeKey;
    submitting = true;
    updateState(currentModel);
    let result;
    try {
      result = onSubmit?.({ transactionId: currentModel.transactionId, challengeId: currentModel.id, answer });
    } catch {
      result = false;
    }
    if (result === false) {
      submitting = false;
      updateState(currentModel);
      return false;
    }
    if (!result || typeof result.then !== 'function') {
      submitting = false;
      submitted = true;
      updateState(currentModel);
      return false;
    }
    Promise.resolve(result).then(value => {
      if (key !== activeKey) return;
      submitting = false;
      if (value !== false) submitted = true;
      updateState(currentModel);
    }, () => {
      if (key !== activeKey) return;
      submitting = false;
      updateState(currentModel);
    });
    return false;
  }

  function update(model, { canvas, focus = false } = {}) {
    if (canvas) currentCanvas = canvas;
    if (!model) {
      hide();
      return;
    }
    const nextKey = keyFor(model);
    const isNew = nextKey !== activeKey;
    if (isNew) {
      activeKey = nextKey;
      submitted = false;
      submitting = false;
      input.value = '';
      onOpen?.(model);
    }
    currentModel = model;
    root.hidden = false;
    root.setAttribute('aria-label', `${model.title || 'Power question'}. ${model.prompt || ''}`);
    setText(title, model.title || 'POWER QUESTION');
    setText(timer, model.answered ? 'ANSWER LOCKED' : `${Math.max(0, model.remaining ?? 0)}s LEFT`);
    setText(prompt, model.prompt || '');
    setText(hint, model.hint || '');
    const progress = model.progress ?? (Number(model.remaining) || 0) / ((Number(model.durationMs) || 10000) / 1000);
    progressFill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
    geometry(model, currentCanvas);
    updateState(model);
    if ((isNew || focus) && model.canAnswer) input.focus({ preventScroll: true });
  }

  function resetSubmission() {
    if (!currentModel) return;
    submitted = false;
    submitting = false;
    updateState(currentModel);
  }

  return {
    update,
    destroy() {
      hide();
      root.removeEventListener('submit', onFormSubmit);
      root.remove();
    },
    resetSubmission,
    root,
  };
}
