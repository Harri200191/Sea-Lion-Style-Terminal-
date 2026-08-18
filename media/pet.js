// @ts-check
/**
 * The sea lion that galumphs around the panel.
 *
 * Three behaviours: it wanders to random spots on its own, a click puts it to
 * sleep (and another wakes it), and it can be dragged anywhere at any time.
 */
(function () {
  const vscode = acquireVsCodeApi();

  const stage = /** @type {HTMLElement} */ (document.getElementById('stage'));
  const seal = /** @type {HTMLElement} */ (document.getElementById('seal'));
  const body = /** @type {SVGGElement} */ (/** @type {unknown} */ (document.getElementById('body')));
  const hint = /** @type {HTMLElement} */ (document.getElementById('hint'));

  const SEAL_W = 78;
  const SEAL_H = 56;
  const SPEED = 46; // pixels per second
  const ARRIVE = 3; // how close counts as "there"

  // Restored on reload so the seal does not teleport home when the panel hides.
  const saved = vscode.getState() || {};

  const state = {
    x: typeof saved.x === 'number' ? saved.x : 40,
    y: typeof saved.y === 'number' ? saved.y : 40,
    targetX: 40,
    targetY: 40,
    asleep: Boolean(saved.asleep),
    facing: 1,
    /** Animation phase for the galumph bob. */
    phase: 0,
    moving: false,
    dragging: false,
    nextWanderAt: 0
  };

  state.targetX = state.x;
  state.targetY = state.y;

  function bounds() {
    const rect = stage.getBoundingClientRect();
    return {
      maxX: Math.max(0, rect.width - SEAL_W),
      maxY: Math.max(0, rect.height - SEAL_H)
    };
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function save() {
    vscode.setState({ x: state.x, y: state.y, asleep: state.asleep });
  }

  function pickDestination(now) {
    const { maxX, maxY } = bounds();
    state.targetX = Math.random() * maxX;
    state.targetY = Math.random() * maxY;
    // Rest a while once it arrives, like a real lazy pinniped.
    state.nextWanderAt = now + 2200 + Math.random() * 4200;
  }

  function render() {
    // Bob and squash while humping along; settle flat when still.
    const bob = state.moving ? Math.abs(Math.sin(state.phase)) * -5 : 0;
    const squash = state.moving ? 1 + Math.sin(state.phase * 2) * 0.05 : 1;

    seal.style.transform = `translate(${state.x}px, ${state.y + bob}px)`;
    body.style.transform = `scaleX(${state.facing * squash}) scaleY(${2 - squash})`;
    body.style.transformOrigin = '50% 85%';
  }

  let last = performance.now();

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!state.dragging && !state.asleep) {
      if (now >= state.nextWanderAt) {
        pickDestination(now);
      }

      const dx = state.targetX - state.x;
      const dy = state.targetY - state.y;
      const distance = Math.hypot(dx, dy);

      if (distance > ARRIVE) {
        const step = Math.min(distance, SPEED * dt);
        state.x += (dx / distance) * step;
        state.y += (dy / distance) * step;
        state.moving = true;
        state.phase += dt * 9;
        if (Math.abs(dx) > 1) {
          state.facing = dx < 0 ? -1 : 1;
        }
      } else if (state.moving) {
        state.moving = false;
        state.phase = 0;
        save();
      }
    } else if (state.moving) {
      state.moving = false;
      state.phase = 0;
    }

    render();
    requestAnimationFrame(tick);
  }

  // --- dragging, and telling a drag apart from a click ----------------------

  let pointerId = null;
  let grabDx = 0;
  let grabDy = 0;
  let downAt = 0;
  let travelled = 0;

  seal.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    seal.setPointerCapture(pointerId);
    seal.classList.add('dragging');

    const rect = stage.getBoundingClientRect();
    grabDx = event.clientX - rect.left - state.x;
    grabDy = event.clientY - rect.top - state.y;
    downAt = performance.now();
    travelled = 0;
    state.dragging = true;

    hint.classList.add('gone');
    event.preventDefault();
  });

  seal.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId || !state.dragging) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    const { maxX, maxY } = bounds();
    const nx = clamp(event.clientX - rect.left - grabDx, 0, maxX);
    const ny = clamp(event.clientY - rect.top - grabDy, 0, maxY);

    travelled += Math.hypot(nx - state.x, ny - state.y);
    state.x = nx;
    state.y = ny;
    render();
  });

  function endDrag(event) {
    if (pointerId !== event.pointerId) {
      return;
    }
    seal.releasePointerCapture(pointerId);
    pointerId = null;
    seal.classList.remove('dragging');
    state.dragging = false;

    // A short press that barely moved is a click, not a drag.
    const isClick = travelled < 5 && performance.now() - downAt < 400;
    if (isClick) {
      toggleSleep();
    } else {
      // Stay put for a moment where it was dropped.
      state.targetX = state.x;
      state.targetY = state.y;
      state.nextWanderAt = performance.now() + 2500;
    }
    save();
  }

  seal.addEventListener('pointerup', endDrag);
  seal.addEventListener('pointercancel', endDrag);

  function toggleSleep() {
    state.asleep = !state.asleep;
    seal.classList.toggle('asleep', state.asleep);
    seal.setAttribute('aria-pressed', String(state.asleep));
    seal.title = state.asleep ? 'Sleeping. Click to wake.' : 'Click to send to sleep, or drag.';

    if (state.asleep) {
      state.moving = false;
      state.phase = 0;
    } else {
      // Waking up deserves a bark.
      vscode.postMessage({ type: 'bark' });
      state.nextWanderAt = performance.now() + 600;
    }
  }

  // Keyboard access, since a click-only pet is unreachable otherwise.
  seal.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleSleep();
      hint.classList.add('gone');
    }
  });

  // Keep the seal inside the panel when it is resized.
  new ResizeObserver(() => {
    const { maxX, maxY } = bounds();
    state.x = clamp(state.x, 0, maxX);
    state.y = clamp(state.y, 0, maxY);
    state.targetX = clamp(state.targetX, 0, maxX);
    state.targetY = clamp(state.targetY, 0, maxY);
    render();
  }).observe(stage);

  seal.classList.toggle('asleep', state.asleep);
  seal.setAttribute('aria-pressed', String(state.asleep));
  setTimeout(() => hint.classList.add('gone'), 9000);
  requestAnimationFrame(tick);
})();
