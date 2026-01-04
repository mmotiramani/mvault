
// src/lib/crypto/header.ts
import { DEFAULT_ITERATIONS } from './crypto';
import type { VaultHeader } from '../data/types';
import { openDBWithSchema, META_STORE } from '../data/db';

async function metaGet<T>(key: IDBValidKey): Promise<T | undefined> {
  const db = await openDBWithSchema();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function metaPut<T>(key: IDBValidKey, val: T): Promise<void> {
  const db = await openDBWithSchema();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const META_KEY = 'header';

export async function getOrCreateHeader(): Promise<VaultHeader> {
  const existing = await metaGet<VaultHeader>(META_KEY);
  if (existing) return existing;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const header: VaultHeader = {
    version: 1,
    kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations: DEFAULT_ITERATIONS, salt: Array.from(salt) },
  };
  await metaPut(META_KEY, header);
  return header;
}

export async function deriveFromHeader(passphrase: string, header: VaultHeader): Promise<CryptoKey> {
  const { deriveKey } = await import('./crypto');
  return deriveKey(passphrase, new Uint8Array(header.kdf.salt), header.kdf.iterations);
}
