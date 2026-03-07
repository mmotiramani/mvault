
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
      
const host = window.location.hostname;            // 'localhost' in dev, 'mmotiramani.github.io' in prod
const rp = { name: 'mvault', id: host };

const { uvCapable } = await detectBiometricPreferred();
if (!uvCapable) {
  return { enrolled: false, mode: 'unknown', message: 'No platform authenticator with biometrics/PIN detected.' };
}

const challenge = crypto.getRandomValues(new Uint8Array(32));
const userId   = crypto.getRandomValues(new Uint8Array(16));

const cred = await withLockSuspended('webauthn-enrollment', async () => {
  return await navigator.credentials.create({
    publicKey: {
      challenge,
      rp,
      user: { id: userId, name: 'mvault-user', displayName: 'mvault-user' },
      // IMPORTANT: include both algorithms for compatibility (Windows Hello needs RS256)
      pubKeyCredParams: [
        { type: 'public-key', alg: -7   },  // ES256
        { type: 'public-key', alg: -257 }   // RS256
      ],                                     // [3](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/index.html)
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 30_000,
      // IMPORTANT: request PRF so the credential can support prf-eval later
      extensions: { prf: {} }                // [1](https://github.com/w3c/webauthn/issues/1691)
    }
  } as CredentialCreationOptions) as PublicKeyCredential | null;
});

if (!cred) return { enrolled: false, mode: 'unknown', message: 'Registration cancelled.' };

// Check client-side extension output
const prfOut  = (cred as any).getClientExtensionResults?.()?.prf;  // {enabled?: boolean} if supported  [2](https://mojoauth.com/ciam-qna/webauthn-browser-cross-platform-challenges)
const prfEnabled = prfOut?.enabled === true;

const credentialId = b64UrlFromU8(new Uint8Array(cred.rawId));

// Save device-local enrollment. `storage` stays 'none' until user enables a passwordless mode.
await saveBioEnrollment({
  credentialId,
  mode: prfEnabled ? 'prf' : 'sig',
  storage: 'none',
  createdAt: Date.now()
});

return {
  enrolled: true,
  mode: prfEnabled ? 'prf' : 'sig',
  message: prfEnabled
    ? 'Biometric enrollment stored. PRF is enabled for this credential.'
    : 'Biometric enrollment stored. PRF not enabled by this authenticator; fallback is available.'
};

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


// Base64URL helpers (you already had b64UrlFromU8; adding decode too)
function u8FromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64url(u8: Uint8Array): string {
  const s = btoa(String.fromCharCode(...u8));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Best-effort PRF feature detection (Chromium). */
export async function supportsPrf(): Promise<boolean> {
  if (!('PublicKeyCredential' in window)) return false;
  // If the new capabilities API exists, prefer it.
  const anyPKC = PublicKeyCredential as any;
  if (typeof anyPKC.getClientCapabilities === 'function') {
    try {
      const caps = await anyPKC.getClientCapabilities();
      // Many Chromium builds expose `prf: true` here when extension is supported. [4](https://dev.to/codeparrot/svelte-for-beginners-easy-guide-3fam)
      if (caps && caps.prf === true) return true;
    } catch {/* ignore */}
  }
  // Fallback: we can attempt a guarded "no-op" eval later; for now just return false and let enable() try.
  return false;
}

/**
 * Derive a stable 32-byte secret via PRF for this credential + salt.
 * Requires UV=required and allowCredentials with the local credentialId.
 */


/** Derive PRF secret or return `null` if unsupported/unavailable. */
async function prfDeriveSecretOrNull(credentialIdB64: string, salt: Uint8Array): Promise<Uint8Array | null> {
  const rpId = window.location.hostname;                 // 'localhost' in dev, 'mmotiramani.github.io' in prod
  const rawId = u8FromB64url(credentialIdB64);

  const cred = await withLockSuspended('webauthn-prf-eval', async () => {
    return await navigator.credentials.get({
      publicKey: {
        rpId,
        userVerification: 'required',
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: rawId }],
        extensions: { prf: { eval: { first: salt } } as any }      // pass Uint8Array, not .buffer  [1](https://github.com/w3c/webauthn/issues/1691)
      },
      mediation: 'optional'
    } as CredentialRequestOptions) as PublicKeyCredential | null;
  });

  if (!cred) return null;

  const ext = (cred as any).getClientExtensionResults?.();         // [2](https://mojoauth.com/ciam-qna/webauthn-browser-cross-platform-challenges)
  const buf: ArrayBuffer | undefined = ext?.prf?.results?.first;
  if (!buf || buf.byteLength !== 32) return null;

  return new Uint8Array(buf);
}

async function prfDeriveSecret(credentialIdB64url: string, salt: Uint8Array): Promise<Uint8Array> {
  const rpId = window.location.hostname; // 'localhost' in dev, 'mmotiramani.github.io' in prod
  const rawId: Uint8Array = u8FromB64url(credentialIdB64url);

  const cred = await withLockSuspended('webauthn-prf-eval', async () => {
    return await navigator.credentials.get({
      publicKey: {
        rpId,
        userVerification: 'required',
        challenge: crypto.getRandomValues(new Uint8Array(32)),           // Uint8Array OK
        allowCredentials: [{ type: 'public-key', id: rawId }],           // Uint8Array OK
        // PRF extension input: pass Uint8Array (NOT .buffer) to avoid ArrayBufferLike
        extensions: { prf: { eval: { first: salt } } as any }
      },
      mediation: 'optional'
    } as CredentialRequestOptions) as PublicKeyCredential | null;
  });

  if (!cred) throw new Error('PRF get() returned null');

  const ext = (cred as any).getClientExtensionResults?.();
  // Chromium returns: { prf: { results: { first: ArrayBuffer } } }
  const buf: ArrayBuffer | undefined = ext?.prf?.results?.first;
  if (!buf || buf.byteLength !== 32) throw new Error('PRF result missing or wrong length');

  return new Uint8Array(buf); // Uint8Array as our canonical BufferSource
}


/** Enable PRF-preferred passwordless by sealing the passphrase under a PRF-derived KEK. */

/** Seal the passphrase under a PRF‑derived KEK and save it in the device-local bio record. */


export async function enablePasswordlessWithPRF(passphrase: string): Promise<{ ok: boolean; message: string; }> {
  try {
    const bio = await loadBioEnrollment();
    if (!bio?.credentialId) return { ok: false, message: 'No local biometric enrollment found on this device.' };

    // await supportsPrf(); // hint only
    // Preflight: try a PRF eval on a throwaway salt before sealing.
    const probe = await prfDeriveSecretOrNull(bio.credentialId, crypto.getRandomValues(new Uint8Array(32)));
    if (!probe) {
      return { ok: false, message: 'This authenticator/browser does not return PRF output for this credential.' };
    }

    // Now derive with the actual persisted salt, and seal passphrase.
    const salt = crypto.getRandomValues(new Uint8Array(32));                 // Uint8Array
      const secret = await prfDeriveSecretOrNull(bio.credentialId, salt);
    if (!secret) return { ok: false, message: 'PRF not available for this credential.' };

    // PRF secret → AES‑GCM KEK (pass Uint8Array, not .buffer)
    const kek = await crypto.subtle.importKey(
      'raw',
      secret.buffer as ArrayBuffer,                                          // <-- Cast to ArrayBuffer
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    const iv  = crypto.getRandomValues(new Uint8Array(12));                  // Uint8Array
    const pt  = new TextEncoder().encode(passphrase);                        // Uint8Array
    const ct  = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },                                               // <-- iv: Uint8Array
      kek,
      pt                                                                      // <-- data: Uint8Array
    );

  await saveBioEnrollment({
    ...bio,
      storage: 'prf' as const,
      prf: {
        v: 1 as const,
        alg: 'AES-GCM' as const,
        saltB64: b64UrlFromU8(salt),
        ivB64:   b64UrlFromU8(iv),
        ctB64:   b64UrlFromU8(new Uint8Array(ct))                            // serialize as Base64URL
      },
      lastUsedAt: Date.now()
    });

    //await saveBioEnrollment(updated);
    return { ok: true, message: 'Biometric passwordless (preferred) enabled on this device.' };
  } catch (e: any) {
    console.error('[mvault] PRF enable failed:', e);
    return { ok: false, message: e?.message ?? 'PRF not supported on this browser/authenticator.' };
  }
}


/** Biometric-only unlock using PRF-preferred path. */

export async function biometricUnlockWithPRF(): Promise<{ ok: boolean; message: string; }> {
  try {
    const bio = await loadBioEnrollment();
    if (!bio?.credentialId) return { ok: false, message: 'No local biometric enrollment found.' };
    if (bio.storage !== 'prf' || !bio.prf) return { ok: false, message: 'PRF-based unlock is not enabled on this device.' };

    const salt = u8FromB64url(bio.prf.saltB64);
    const secret = await prfDeriveSecretOrNull(bio.credentialId, salt);
    if (!secret) return { ok: false, message: 'PRF not available for this credential.' };
    const kek = await crypto.subtle.importKey('raw', secret.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

    const iv = u8FromB64url(bio.prf.ivB64);
    const ct = u8FromB64url(bio.prf.ctB64);

    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      kek,
      ct.buffer as ArrayBuffer
    );
    const pass = new TextDecoder().decode(new Uint8Array(ptBuf));

    await unlock(pass);  // reuse your existing unlock(passphrase)
    return { ok: true, message: 'Unlocked with biometrics (preferred).' };
  } catch (e: any) {
    console.error('[mvault] PRF unlock failed:', e);
    return { ok: false, message: e?.message ?? 'Biometric unlock (preferred) failed.' };
  }
}


export async function probePrfForThisCredential(): Promise<boolean> {
  const bio = await loadBioEnrollment();
  if (!bio?.credentialId) return false;
  // try a PRF eval on a dummy salt; return true only on 32-byte output
  const out = await prfDeriveSecretOrNull(bio.credentialId, crypto.getRandomValues(new Uint8Array(32)));
  return !!out;
}

export async function supportsLargeBlobForThisCredential(): Promise<boolean> {
  const bio = await loadBioEnrollment();
  if (!bio?.credentialId) return false;

  try {
    const rpId = window.location.hostname;
    const rawId = u8FromB64url(bio.credentialId);
    const cred = await navigator.credentials.get({
      publicKey: {
        rpId,
        userVerification: 'required',
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: rawId }],
        extensions: { largeBlob: { read: true } as any }
      },
      mediation: 'optional'
    } as CredentialRequestOptions) as PublicKeyCredential | null;

    const out = (cred as any)?.getClientExtensionResults?.()?.largeBlob;
    return !!out && ('supported' in out ? out.supported === true : 'blob' in out);
  } catch {
    return false;
  }
}


// Add near your other biometric helpers.
export async function biometricGate(): Promise<{ ok: boolean; message: string; }> {
  try {
    const bio = await loadBioEnrollment();
    if (!bio?.credentialId) return { ok: false, message: 'No local biometric enrollment found on this device.' };

    const rpId  = window.location.hostname;
    const rawId = u8FromB64url(bio.credentialId);

    const cred = await withLockSuspended('webauthn-uv-gate', async () => {
      return await navigator.credentials.get({
        publicKey: {
          rpId,
          userVerification: 'required',                         // OS sheet — Face ID / Touch ID / Windows Hello
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: rawId }]
        },
        mediation: 'optional'
      } as CredentialRequestOptions) as PublicKeyCredential | null;
    });

    if (!cred) return { ok: false, message: 'Verification cancelled.' };
    return { ok: true, message: 'Verified.' };
  } catch (e: any) {
    console.error('[mvault] biometricGate error:', e);
    return { ok: false, message: e?.message ?? 'Verification failed.' };
  }
}

// ----------------------------------------------
// Safe / interactive capability probes for UI
// ----------------------------------------------

/**
 * Safe, no‑prompt hint: returns true if the browser reports PRF support
 * (Chromium exposes getClientCapabilities). This does NOT show any OS sheet
 * and does NOT trigger blur — safe to call at mount.
 */
export async function supportsPrfStatic(): Promise<boolean> {
  if (!('PublicKeyCredential' in window)) return false;
  const anyPKC = PublicKeyCredential as any;
  if (typeof anyPKC.getClientCapabilities === 'function') {
    try {
      const caps = await anyPKC.getClientCapabilities();
      // Many builds expose caps.prf === true or an extensions array that includes 'prf'.
      return !!(caps && (caps.prf === true || (Array.isArray(caps.extensions) && caps.extensions.includes('prf'))));
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Interactive one‑shot probe (user gesture only).
 * Shows ONE OS sheet and checks, in a single call:
 *  - PRF: does the authenticator return a 32‑byte 'prf.results.first'?
 *  - largeBlob: is it supported / readable?
 *
 * We wrap the whole thing with withLockSuspended(..) so the blur during the OS sheet
 * does NOT auto‑lock and yank the screen.
 */
export async function detectCapabilitiesInteractive(): Promise<{ prf: boolean; largeBlob: boolean; message?: string }> {
  try {
    const bio = await loadBioEnrollment();
    if (!bio?.credentialId) return { prf: false, largeBlob: false, message: 'No local biometric enrollment found.' };

    const rpId  = window.location.hostname;
    const rawId = u8FromB64url(bio.credentialId);
    const salt  = crypto.getRandomValues(new Uint8Array(32));

    const cred = await withLockSuspended('webauthn-cap-probe', async () => {
      return await navigator.credentials.get({
        publicKey: {
          rpId,
          userVerification: 'required',
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: rawId }],
          // Probe both PRF and largeBlob in a single sheet to avoid multiple blurs.
          extensions: {
            prf: { eval: { first: salt } } as any,
            largeBlob: { read: true } as any
          },
          timeout: 30_000
        },
        mediation: 'optional'
      } as CredentialRequestOptions) as PublicKeyCredential | null;
    });

    if (!cred) return { prf: false, largeBlob: false, message: 'Verification cancelled.' };

    const ext = (cred as any).getClientExtensionResults?.() ?? {};
    const prfOk = !!ext.prf?.results?.first && ext.prf.results.first.byteLength === 32;
    const lbOk  = !!ext.largeBlob && (ext.largeBlob.supported === true || 'blob' in ext.largeBlob);

    return { prf: prfOk, largeBlob: lbOk };
  } catch (e: any) {
    console.error('[mvault] detectCapabilitiesInteractive error:', e);
    return { prf: false, largeBlob: false, message: e?.message ?? 'Capability probe failed.' };
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


