// src/lib/app/uiGuard.ts
// to register for lock suspension untill the biometric enrollment flow is complete (which may involve page blur and async work).
// src/lib/app/uiGuard.ts
import { writable, get } from 'svelte/store';

type UiGuardState = { suspendLock: boolean; reason?: string };

/** Global guard: when true, do not auto-lock on blur/visibility. */
export const uiGuard = writable<UiGuardState>({ suspendLock: false });

/** Run an async task with lock temporarily suspended (e.g., WebAuthn OS sheet). */
export async function withLockSuspended<T>(reason: string, task: () => Promise<T>): Promise<T> {
  uiGuard.set({ suspendLock: true, reason });
  try { return await task(); }
  finally { uiGuard.set({ suspendLock: false, reason: undefined }); }
}

export function lockIsSuspended(): boolean {
  return !!get(uiGuard).suspendLock;
}