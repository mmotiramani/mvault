
// src/lib/app/autoLock.ts
import { session } from './session';
import { get } from 'svelte/store';

let timeout: number | null = null;

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
  window.addEventListener('blur', lockNow);

  return () => {
    if (timeout) window.clearTimeout(timeout);
    window.removeEventListener('mousemove', reset);
    window.removeEventListener('keydown', reset);
    window.removeEventListener('blur', lockNow);
  };
}

function lockNow() {
  import('./session').then(({ lock }) => lock());
}
