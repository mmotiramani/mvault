
// src/lib/app/session.ts
import { writable, get } from 'svelte/store';
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

// --- Biometric enrollment (scaffolding only) ---

// --- Step 2: Passwordless via largeBlob fallback ---
// We will store the passphrase inside the credential's largeBlob extension (local to authenticator).
// On unlock, we read it back after UV=required and call your existing unlock(passphrase).


import { loadBioEnrollment, saveBioEnrollment, hasLocalBioEnrollment } from './bio';
import { withLockSuspended } from './uiGuard';

export type BioMode = 'prf' | 'sig' | 'unknown';

function b64UrlFromU8(u8: Uint8Array): string {
  const s = btoa(String.fromCharCode(...u8));
  // normalize to URL-safe if you prefer; not strictly required for our use
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Detect if a platform authenticator with UV is present (and a rough PRF hint for later steps). */
export async function detectBiometricPreferred(): Promise<{ uvCapable: boolean; prfLikely: boolean; }> {
  if (!('PublicKeyCredential' in window)) return { uvCapable: false, prfLikely: false };
  const uvCapable = await (window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ?? false;
  // Step 2 will refine PRF detection; treat this as a hint only.
  const prfLikely = !!(PublicKeyCredential as any).getClientCapabilities;
  return { uvCapable, prfLikely };
}


/**
 * Enroll a platform credential with UV=required (no decryption yet).
 * Stores only device-local metadata (credentialId + mode hint) in IndexedDB.
 * Must be called from a user gesture (button click) so Safari allows the OS sheet.
 */

export async function enrollBiometricPreferred(): Promise<{ enrolled: boolean; mode: BioMode; message?: string; }> {
  try {
    const host = window.location.hostname; // "localhost" in dev, "mmotiramani.github.io" in prod  [1](https://msftnewsnow.com/microsoft-authenticator-ends-password-support-edge/)
    const rp = { name: 'mvault', id: host };

    const { uvCapable, prfLikely } = await detectBiometricPreferred();
    if (!uvCapable) return { enrolled: false, mode: 'unknown' as const, message: 'No platform authenticator with biometrics/PIN detected.' };

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId   = crypto.getRandomValues(new Uint8Array(16));

    const result = await withLockSuspended('webauthn-enrollment', async () => {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp,
          user: { id: userId, name: 'mvault-user', displayName: 'mvault-user' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',  // OS sheet (Face ID / Touch ID / Windows Hello / Android biometrics)  [5](https://mulimani.github.io/)
            residentKey: 'preferred'
          },
          timeout: 30_000
        }
      } as CredentialCreationOptions);

      const pc = cred as PublicKeyCredential | null;
      if (!pc) return { enrolled: false, mode: 'unknown' as const, message: 'Registration cancelled.' };

      const credentialId = b64UrlFromU8(new Uint8Array(pc.rawId));

      // compute the union-typed mode once and reuse it
      const mode: BioMode = prfLikely ? 'prf' : 'sig';

      await saveBioEnrollment({ credentialId, mode, createdAt: Date.now() });
      return { enrolled: true, mode, message: 'Biometric enrollment stored on this device.' };
    });

    return result;
  } catch (e: any) {
    console.error('[mvault] enrollBiometricPreferred error:', e);
    return { enrolled: false, mode: 'unknown' as const, message: e?.message || 'Enrollment failed.' };
  }
}

export async function deviceHasBiometricEnrollment(): Promise<boolean> {
  return hasLocalBioEnrollment();
}


/**
 * Enable passwordless fallback: write the passphrase into the credential's largeBlob.
 * Must be called from a user gesture (button click) to satisfy browser UX.
 */
export async function enablePasswordlessWithLargeBlob(passphrase: string): Promise<{ ok: boolean; message: string; }> {
  try {
    const bio = await loadBioEnrollment();
    if (!bio?.credentialId) {
      return { ok: false, message: 'No local biometric enrollment found on this device.' };
    }

    // Convert stored Base64URL credentialId back to raw bytes
    const rawId = Uint8Array.from(
      (bio.credentialId.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    // Fix padding if needed
    const pad = rawId.length % 4;
    const idB64 = bio.credentialId.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
    const rawIdBytes = Uint8Array.from(atob(idB64), c => c.charCodeAt(0));

    const rpId = window.location.hostname; // localhost in dev; mmotiramani.github.io in prod

    const writeData = new TextEncoder().encode(passphrase);

    const result = await withLockSuspended('webauthn-largeblob-write', async () => {
      const cred = await navigator.credentials.get({
        publicKey: {
          rpId,
          // UV=required to show OS sheet
          userVerification: 'required',
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: rawIdBytes }],
          // EXTENSIONS: write largeBlob
          extensions: { largeBlob: { write: writeData } as any }
        },
        mediation: 'optional'
      } as CredentialRequestOptions);

      // Some UAs return extension results on the PublicKeyCredential
      const written = (cred as any)?.getClientExtensionResults?.()?.largeBlob?.written === true;
      return { written: !!written };
    });

    if (!result.written) {
      return { ok: false, message: 'This browser/authenticator does not support largeBlob write, or the write failed.' };
    }

    // Mark that this device now has passwordless fallback enabled.
    await saveBioEnrollment({ ...bio, storage: 'largeBlob', lastUsedAt: Date.now() });

    return { ok: true, message: 'Biometric passwordless fallback enabled on this device.' };
  } catch (e: any) {
    console.error('[mvault] largeBlob write failed:', e);
    return { ok: false, message: e?.message ?? 'Failed to enable passwordless fallback.' };
  }
}

/**
 * Biometric-only unlock using largeBlob fallback.
 * Reads the passphrase from the credential after UV, then calls existing unlock(passphrase).
 */
export async function biometricUnlockWithLargeBlob(): Promise<{ ok: boolean; message: string; }> {
  try {
    const bio = await loadBioEnrollment();
    if (!bio?.credentialId) return { ok: false, message: 'No local biometric enrollment found.' };
    if (bio.storage !== 'largeBlob') return { ok: false, message: 'Passwordless fallback is not enabled on this device.' };

    const rpId = window.location.hostname;
    const idB64 = bio.credentialId.replace(/-/g, '+').replace(/_/g, '/');
    const pad = idB64.length % 4;
    const rawIdBytes = Uint8Array.from(atob(idB64 + (pad ? '='.repeat(4 - pad) : '')), c => c.charCodeAt(0));

    const res = await withLockSuspended('webauthn-largeblob-read', async () => {
      const cred = await navigator.credentials.get({
        publicKey: {
          rpId,
          userVerification: 'required',
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: rawIdBytes }],
          // EXTENSIONS: read largeBlob
          extensions: { largeBlob: { read: true } as any }
        },
        mediation: 'optional'
      } as CredentialRequestOptions);

      const blob: ArrayBuffer | undefined = (cred as any)?.getClientExtensionResults?.()?.largeBlob?.blob;
      if (!blob || (blob as any).byteLength === 0) return { ok: false, pass: null };
      const pass = new TextDecoder().decode(new Uint8Array(blob as ArrayBuffer));
      return { ok: true, pass };
    });

    if (!res.ok || !res.pass) {
      return { ok: false, message: 'Could not read passphrase from authenticator.' };
    }

    // Call your existing unlock with the recovered passphrase
    await unlock(res.pass);
    return { ok: true, message: 'Unlocked with biometrics.' };
  } catch (e: any) {
    console.error('[mvault] largeBlob read failed:', e);
    return { ok: false, message: e?.message ?? 'Biometric unlock failed.' };
  }
}


export async function changePassphrase(newPass: string, currentPass?: string): Promise<void> {
  // Snapshot current state

    // BEFORE
    // let sVal: SessionState | null = null;
    // session.update(s => (sVal = s, s));
    // const isLocked = !sVal?.key;

    // AFTER
  const sVal = get(session);
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


