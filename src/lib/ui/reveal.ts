
// src/lib/ui/reveal.ts
import { writable } from 'svelte/store';

/** The id of the entry whose password is currently revealed (only one at a time). */
export const revealedId = writable<string | null>(null);

/** Default auto-hide timeout (ms). Adjust to your preference. */
export const DEFAULT_AUTO_HIDE_MS = 15_000;

let autoHideMs = DEFAULT_AUTO_HIDE_MS;
let timer: number | null = null;
let handlersAttached = false;

// Keep references so we can detach listeners cleanly
let onBlurHandler: ((ev: FocusEvent) => void) | null = null;
let onVisibilityHandler: ((ev: Event) => void) | null = null;
let onKeydownHandler: ((ev: KeyboardEvent) => void) | null = null;

function clearTimer() {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
}
function startTimer() {
  clearTimer();
  if (autoHideMs > 0) {
    timer = window.setTimeout(() => hideAll(), autoHideMs);
  }
}

/**
 * Toggle reveal for an id (reveals this id, hides others).
 * If the same id is already revealed, it hides it.
 */
export function toggleReveal(id: string, opts?: { autoHideMs?: number }) {
  let prev: string | null = null;
  revealedId.update(curr => {
    prev = curr;
    return curr === id ? null : id;
  });

  if (prev === id) {
    clearTimer();
  } else {
    if (typeof opts?.autoHideMs === 'number') autoHideMs = opts.autoHideMs;
    startTimer();
  }
}

/** Hide any revealed password immediately. */
export function hideAll() {
  clearTimer();
  revealedId.set(null);
}

/**
 * Attach global auto-hide handlers (blur / visibility hidden / Escape).
 * Call once (e.g., from onMount in a top-level component). Returns a detach function.
 */
export function attachRevealAutoHideHandlers(ms?: number): () => void {
  if (handlersAttached) {
    if (typeof ms === 'number') autoHideMs = ms;
    return detachRevealAutoHideHandlers;
  }
  if (typeof ms === 'number') autoHideMs = ms;

  onBlurHandler = () => hideAll();
  onVisibilityHandler = () => { if (document.hidden) hideAll(); };
  onKeydownHandler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') hideAll(); };

  window.addEventListener('blur', onBlurHandler);
  document.addEventListener('visibilitychange', onVisibilityHandler);
  window.addEventListener('keydown', onKeydownHandler);

  handlersAttached = true;
  return detachRevealAutoHideHandlers;
}

/** Detach handlers installed by attachRevealAutoHideHandlers. */
export function detachRevealAutoHideHandlers() {
  if (!handlersAttached) return;
  if (onBlurHandler) window.removeEventListener('blur', onBlurHandler);
  if (onVisibilityHandler) document.removeEventListener('visibilitychange', onVisibilityHandler);
  if (onKeydownHandler) window.removeEventListener('keydown', onKeydownHandler);
  onBlurHandler = null; onVisibilityHandler = null; onKeydownHandler = null;
  handlersAttached = false;
  clearTimer();
}
