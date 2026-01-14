
// src/lib/app/rekeyProgress.ts
import { writable } from 'svelte/store';

export type RekeyPhase = 'idle' | 'decrypt' | 'reencrypt' | 'writing' | 'finalize' | 'done' | 'error';

export type RekeyState = {
  active: boolean;
  phase: RekeyPhase;
  done: number;
  total: number;
  percent: number; // 0..100 (rounded)
  message?: string;
};

const initial: RekeyState = { active: false, phase: 'idle', done: 0, total: 0, percent: 0 };

export const rekeyProgress = writable<RekeyState>(initial);

export function startRekey(phase: RekeyPhase, total: number, message?: string) {
  rekeyProgress.set({
    active: true, phase, done: 0, total,
    percent: total > 0 ? 0 : 100,
    message
  });
}

export function updateRekey(phase: RekeyPhase, done: number, total: number, message?: string) {
  const clampedDone = Math.max(0, Math.min(done, Math.max(total, 1)));
  const percent = Math.round((clampedDone / Math.max(total, 1)) * 100);
  rekeyProgress.set({ active: true, phase, done: clampedDone, total, percent, message });
}

export function finishRekey(success = true, message?: string) {
  rekeyProgress.set({
    active: false,
    phase: success ? 'done' : 'error',
    done: 0, total: 0, percent: success ? 100 : 0,
    message
  });
}
``
