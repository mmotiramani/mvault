
// src/lib/crypto/header.ts
import { DEFAULT_ITERATIONS, deriveKey } from './crypto';
import type { VaultHeader } from '../data/types';

const META_DB = 'mvault';
const META_STORE = 'meta';
const META_KEY = 'header'; // single-record store

function openMeta(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function metaGet<T>(key: IDBValidKey): Promise<T | undefined> {
  const db = await openMeta();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function metaPut<T>(key: IDBValidKey, val: T): Promise<void> {
  const db = await openMeta();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

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
  const salt = new Uint8Array(header.kdf.salt);
  return deriveKey(passphrase, salt, header.kdf.iterations);
}
