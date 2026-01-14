
// src/lib/app/session.ts
import { writable } from 'svelte/store';
import type { VaultHeader, VaultItemPayload, VaultItem } from '../data/types';
import { getOrCreateHeader, deriveFromHeader } from '../crypto/header';
import { listItems } from '../data/store';
import { hideAll as hideAllReveals } from '../ui/reveal';

//for passphase changing and showing in progress in Toast.
import { rekeyVault } from '../crypto/rekey';
import { rekeyProgress, startRekey, updateRekey, finishRekey } from './rekeyProgress';
import { showToast } from '../ui/toast';


export async function changePassphrase(newPass: string, currentPass?: string): Promise<void> {
  // Snapshot current state
  let sVal: SessionState | null = null;
  session.update(s => (sVal = s, s));

  const isLocked = !sVal?.key;
  try {
    // Kick progress UI into gear (phase will be updated by rekeyVault)
    startRekey('decrypt', 0, 'Preparing…');

    const { header, newKey, count } = await rekeyVault({
      sessionKey: isLocked ? null : sVal!.key,
      currentPass: isLocked ? (currentPass ?? null) : null,
      newPass,
      onProgress: (phase, done, total) => {
        updateRekey(phase, done, total);
      }
    });

    // Swap the in-memory key/header
    session.set({
      header,
      key: newKey,
      unlockedAt: Date.now(),
      allTags: sVal?.allTags ?? []
    });

    finishRekey(true, 'Passphrase changed');
    showToast('Passphrase changed', 'success');
  } catch (e: any) {
    console.error(e);
    finishRekey(false, e?.message || 'Failed to change passphrase');
    showToast('Failed to change passphrase', 'error');
    throw e;
  }
}


export type SessionState = {
  header: VaultHeader | null;
  key: CryptoKey | null;
  unlockedAt: number | null;
  allTags: string[];
};

const initial: SessionState = { header: null, key: null, unlockedAt: null, allTags: [] };
export const session = writable<SessionState>(initial);

export async function initHeader() {
  const header = await getOrCreateHeader();
  session.update((s) => ({ ...s, header }));
}

export async function unlock(passphrase: string) {
  let hdr: VaultHeader | null = null;
  session.update((s) => (hdr = s.header, s));
  if (!hdr) hdr = await getOrCreateHeader();
  const key = await deriveFromHeader(passphrase, hdr!);
  const unlockedAt = Date.now();
  const allTags = await computeAllTags(key);
  session.set({ header: hdr!, key, unlockedAt, allTags });
}

export function lock() {
  hideAllReveals();
  session.update((s) => ({ header: s.header, key: null, unlockedAt: null, allTags: [] }));
}

export async function computeAllTags(key: CryptoKey): Promise<string[]> {
  const entries = await listItems<VaultItemPayload>(key);
  const tagSet = new Set<string>();
  for (const e of entries) for (const t of e.payload.tags || []) tagSet.add(t.toLowerCase());
  return Array.from(tagSet).sort();
}

export async function refreshTags() {
  let key: CryptoKey | null = null;
  session.update((s) => (key = s.key, s));
  if (!key) return;
  const allTags = await computeAllTags(key);
  session.update((s) => ({ ...s, allTags }));
}
