
// src/lib/app/session.ts
import { writable } from 'svelte/store';
import type { VaultHeader, VaultItemPayload, VaultItem } from '../data/types';
import { getOrCreateHeader, deriveFromHeader, ensureCanary, saveHeader } from '../crypto/header';
import { listItems, txAll } from '../data/store';
import { hideAll as hideAllReveals } from '../ui/reveal';

//for passphase changing and showing in progress in Toast.
import { rekeyVault } from '../crypto/rekey';
import { rekeyProgress, startRekey, updateRekey, finishRekey } from './rekeyProgress';
import { showToast } from '../ui/toast';


import { openDBWithSchema, ITEMS_STORE } from '../data/db';
import { decryptJSON } from '../crypto/crypto';


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
 

  // NEW: verify passphrase-derived key (fail fast)
  try {
    await assertKeyValid(key, hdr);
  } catch {
    // surface a clean error to UI
    const e: any = new Error('incorrect-passphrase');
    e.code = 'incorrect-passphrase';
    throw e;
  }


  // Optional: if no canary yet (fresh/legacy DB), create one now
  const ensured = await ensureCanary(hdr, key);
  if (ensured !== hdr) await saveHeader(ensured);

  const unlockedAt = Date.now();
  const allTags = await computeAllTags(key);
  session.set({ header: hdr!, key, unlockedAt, allTags });
}

export function lock() {
  hideAllReveals();
  session.update((s) => ({ header: s.header, key: null, unlockedAt: null, allTags: [] }));
}

export async function computeAllTags(key: CryptoKey): Promise<string[]> {
 
const db = await openDBWithSchema();
  const all = await txAll<VaultItem>(db);
  db.close();

  const tagSet = new Set<string>();
  for (const i of all) {
    try {
      const p = await decryptJSON<VaultItemPayload>(key, i.enc.iv, i.enc.ct, { label: String(i.id) });
      for (const t of p.tags || []) tagSet.add((t || '').toLowerCase());
    } catch (e) {
      // Skip this record but log it; tags are best-effort
      console.warn('computeAllTags: skip item due to decrypt error', i.id, e);
      continue;
    }
  }
  return Array.from(tagSet).sort();

 /*
  const entries = await listItems<VaultItemPayload>(key);
  const tagSet = new Set<string>();
  for (const e of entries) for (const t of e.payload.tags || []) tagSet.add(t.toLowerCase());
  return Array.from(tagSet).sort();
  */
}

export async function refreshTags() {
  let key: CryptoKey | null = null;
  session.update((s) => (key = s.key, s));
  if (!key) return;
  const allTags = await computeAllTags(key);
  session.update((s) => ({ ...s, allTags }));
}


/*
Fail‑fast passphrase check on unlock
Add a helper that verifies the passphrase-derived key before computeAllTags:

If header has a canary, decrypt it.
Else, if there are items, decrypt the first item.
Else (empty vault), accept the key and create a canary after unlock
*/
async function assertKeyValid(key: CryptoKey, header: VaultHeader): Promise<void> {
  // Prefer canary
  if (header.canary) {
    await decryptJSON(key, header.canary.iv, header.canary.ct, { label: 'canary' });
    return;
  }

  // Fallback: try first item
  const db = await openDBWithSchema();
  const first: VaultItem | undefined = await new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readonly');
    const store = tx.objectStore(ITEMS_STORE);
    const req = store.openCursor();
    req.onsuccess = () => resolve(req.result?.value as VaultItem | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();

  if (!first) return; // empty vault: nothing to validate against

  await decryptJSON<VaultItemPayload>(key, first.enc.iv, first.enc.ct, { label: String(first.id) });
}


