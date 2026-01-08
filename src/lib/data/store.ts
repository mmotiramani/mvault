
// src/lib/data/store.ts
import type { Encrypted, VaultItem, VaultItemPayload } from './types';
import { encryptJSON, decryptJSON } from '../crypto/crypto';
import { openDBWithSchema, ITEMS_STORE } from './db';

async function txPut(db: IDBDatabase, val: unknown) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    tx.objectStore(ITEMS_STORE).put(val);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function txDel(db: IDBDatabase, key: IDBValidKey) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    tx.objectStore(ITEMS_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function txAll<T>(db: IDBDatabase) {
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readonly');
    const req = tx.objectStore(ITEMS_STORE).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function createItem(key: CryptoKey, id: string, payload: VaultItemPayload): Promise<VaultItem> {
  const db = await openDBWithSchema();
  const now = Date.now();
  const enc = await encryptJSON(key, payload);
  const item: VaultItem = { id, createdAt: now, updatedAt: now, enc: { v: 2, ...enc } as Encrypted };
  await txPut(db, item);
  db.close();
  return item;
}

/*
export async function listItems<T>(key: CryptoKey): Promise<Array<{ item: VaultItem; payload: T }>> {
  const db = await openDBWithSchema();
  const all = await txAll<VaultItem>(db);
  db.close();
  return Promise.all(all.map(async (i) => ({ item: i, payload: await decryptJSON<T>(key, i.enc.iv, i.enc.ct) })));
}
*/


export async function listItems<T>(key: CryptoKey): Promise<Array<{ item: VaultItem; payload: T }>> {
  const db = await openDBWithSchema();
  const all = await txAll<VaultItem>(db);
  db.close();

  const out: Array<{ item: VaultItem; payload: T }> = [];

  for (const i of all) {
    try {
      const payload = await decryptJSON<T>(
        key,
        i.enc.iv,  // number[] from encryptJSON
        i.enc.ct,  // number[] from encryptJSON
        { label: i.name ?? String((i as any).id ?? '') }
      );
      out.push({ item: i, payload });
    } catch (e: any) {
      const id = (i as any).id ?? '(no-id)';
      const name = (i as any).name ?? '(no-name)';
      const reason = e?.message || String(e);
      // Vaults should fail-fast rather than silently produce partial exports
      throw new Error(`Decrypt failed for item id=${id} name="${name}": ${reason}`);
      // If you prefer to skip bad items and continue:
      // console.error('Decrypt failed', { id, name, error: e });
      // continue;
    }
  }

  return out;
}


export async function updateItem<T>(key: CryptoKey, i: VaultItem, payload: T): Promise<VaultItem> {
  const db = await openDBWithSchema();
  const enc = await encryptJSON(key, payload);
  const upd: VaultItem = { ...i, updatedAt: Date.now(), enc: { v: 2, ...enc } as Encrypted };
  await txPut(db, upd);
  db.close();
  return upd;
}

export async function deleteItem(id: string): Promise<void> {
  const db = await openDBWithSchema();
  await txDel(db, id);
  db.close();
}
