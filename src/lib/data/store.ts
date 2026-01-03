
// src/lib/data/store.ts
import type { Encrypted, VaultItem, VaultItemPayload } from './types';
import { encryptJSON, decryptJSON } from '../crypto/crypto';

const DB_NAME = 'mvault';
const STORE = 'items';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txPut(db: IDBDatabase, val: unknown) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function txDel(db: IDBDatabase, key: IDBValidKey) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function txAll<T>(db: IDBDatabase) {
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function createItem(key: CryptoKey, id: string, payload: VaultItemPayload): Promise<VaultItem> {
  const db = await openDB();
  const now = Date.now();
  const enc = await encryptJSON(key, payload);
  const item: VaultItem = { id, createdAt: now, updatedAt: now, enc: { v: 2, ...enc } as Encrypted };
  await txPut(db, item);
  db.close();
  return item;
}

export async function listItems<T>(key: CryptoKey): Promise<Array<{ item: VaultItem; payload: T }>> {
  const db = await openDB();
  const all = await txAll<VaultItem>(db);
  db.close();
  return Promise.all(all.map(async (i) => ({ item: i, payload: await decryptJSON<T>(key, i.enc.iv, i.enc.ct) })));
}

export async function updateItem<T>(key: CryptoKey, i: VaultItem, payload: T): Promise<VaultItem> {
  const db = await openDB();
  const enc = await encryptJSON(key, payload);
  const upd: VaultItem = { ...i, updatedAt: Date.now(), enc: { v: 2, ...enc } as Encrypted };
  await txPut(db, upd);
  db.close();
  return upd;
}

export async function deleteItem(id: string): Promise<void> {
  const db = await openDB();
  await txDel(db, id);
  db.close();
}
