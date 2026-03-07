// src/lib/app/autoLock.ts
import { session } from './session';
import { get } from 'svelte/store';
import { uiGuard, lockIsSuspended } from './uiGuard';

let timeout: number | null = null;
let subscribedToGuard = false;

function lockNow() {
  import('./session').then(({ lock }) => lock());
}

function addBlurListener() {
  // only add if not suspended
  if (!lockIsSuspended()) {
    window.addEventListener('blur', lockNow);
  }
}

function removeBlurListener() {
  window.removeEventListener('blur', lockNow);
}

export function startAutoLock(minutes = 10) {
  const schedule = () => {
    if (timeout) window.clearTimeout(timeout);
    const s = get(session);
    if (s.key) timeout = window.setTimeout(() => lockNow(), minutes * 60_000);
  };

  const reset = () => schedule();
  schedule();

  window.addEventListener('mousemove', reset);
  window.addEventListener('keydown', reset);

  // Initial attach/detach for blur based on guard
  if (lockIsSuspended()) removeBlurListener();
  else addBlurListener();

  // Subscribe once to uiGuard to toggle blur listener during WebAuthn sheets
  if (!subscribedToGuard) {
    uiGuard.subscribe(st => {
      if (st.suspendLock) {
        removeBlurListener();
      } else {
        addBlurListener();
      }
    });
    subscribedToGuard = true;
  }

  return () => {
    if (timeout) window.clearTimeout(timeout);
    window.removeEventListener('mousemove', reset);
    window.removeEventListener('keydown', reset);
    removeBlurListener();
  };
}