// src/lib/app/bio.ts
import { openDBWithSchema, META_STORE } from '../data/db';
import type { BioMode } from './session';

const META_KEY_BIO = 'bio:enrollment';

export type BioEnrollment = {
  credentialId: string;
  mode: BioMode; // 'prf' | 'sig' | 'unknown';
  createdAt: number;
  lastUsedAt?: number;

  // NEW: how passwordless data is stored (fallback uses largeBlob)
  storage?: 'prf' | 'largeBlob' | 'none';


  // NEW: when storage === 'prf', we store a small sealed blob under a PRF‑derived KEK:
  prf?: {
    v: 1;                    // schema version
    alg: 'AES-GCM';
    saltB64: string;         // PRF salt (Base64URL)
    ivB64: string;           // AES-GCM IV (Base64URL)
    ctB64: string;           // ciphertext (Base64URL)
  };
};

export async function saveBioEnrollment(rec: BioEnrollment): Promise<void> {
  const db = await openDBWithSchema();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(rec, META_KEY_BIO);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function loadBioEnrollment(): Promise<BioEnrollment | null> {
  const db = await openDBWithSchema();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(META_KEY_BIO);
    req.onsuccess = () => { db.close(); resolve((req.result as BioEnrollment) ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

export async function clearBioEnrollment(): Promise<void> {
  const db = await openDBWithSchema();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(META_KEY_BIO);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function hasLocalBioEnrollment(): Promise<boolean> {
  return !!(await loadBioEnrollment());
}