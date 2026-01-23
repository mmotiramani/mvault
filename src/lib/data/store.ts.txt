
// src/lib/data/store.ts
import type { Encrypted, VaultItem, VaultItemPayload } from './types';
import { encryptJSON, decryptJSON } from '../crypto/crypto';
import { openDBWithSchema, ITEMS_STORE } from './db';
import { refreshTags } from '../app/session';
import { isDirty } from 'zod/v3';
import { fa } from 'zod/locales';

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

export async function txAll<T>(db: IDBDatabase) {
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
  const item: VaultItem = { id, createdAt: now, updatedAt: now, enc: {  ...enc } as Encrypted };
  await txPut(db, item);
  db.close();
  //isDirty = false;
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
  const all = await txAll<VaultItem>(db);  // assumes this reads from the same ITEMS_STORE
  db.close();

  console.debug('[mvault] listItems: raw rows from DB =', all.length);

  const out: Array<{ item: VaultItem; payload: T }> = [];
  const FAIL_FAST = true; // set to false to skip bad rows instead of throwing

  // small helper to ensure Uint8Array for decrypt
  const toU8 = (x: number[] | Uint8Array | ArrayBuffer) =>
    x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x);

  for (const i of all) {
    try {
      const payload = await decryptJSON<T>(
        key,
        toU8(i.enc.iv),
        toU8(i.enc.ct),
        { label: String(i.id ?? '') }
      );
      out.push({ item: i, payload });
    } catch (e: any) {
      const reason = e?.message || String(e);
      const msg = `Decrypt failed for id=${String(i.id ?? '')}: ${reason}`;
      if (FAIL_FAST) {
        console.error('[mvault]', msg);
        throw new Error(msg);
      } else {
        console.warn('[mvault]', msg, '(skipping row)');
        continue;
      }
    }
  }

  console.debug('[mvault] listItems: decrypted rows =', out.length);
  return out;
}



export async function updateItem<T>(key: CryptoKey, i: VaultItem, payload: T): Promise<VaultItem> {
  const db = await openDBWithSchema();
  const enc = await encryptJSON(key, payload);
  const upd: VaultItem = { ...i, updatedAt: Date.now(), enc: { ...enc } as Encrypted };
  await txPut(db, upd);
  db.close();
  await refreshTags();
  return upd;

}

export async function deleteItem(id: string): Promise<void> {
  const db = await openDBWithSchema();
  await txDel(db, id);
  await refreshTags();
  db.close();
}


async function putItem(item: VaultItem): Promise<void> {
  const db = await openDBWithSchema();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(ITEMS_STORE);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

function sanitizeTags(tags: string[] | undefined): string[] {
  const set = new Set<string>();
  for (const t of tags || []) {
    const v = (t || '').trim().toLowerCase();
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}
function normalizeUrl(u: string | undefined): string {
  const trimmed = (u || '').trim();
  if (!trimmed) return '';
  try {
    const withScheme = /^\w+:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).toString();
  } catch {
    return trimmed;
  }
}

export type ValidationError = { field: keyof VaultItemPayload; message: string };

export function validatePayload(p: VaultItemPayload): ValidationError[] {
  const errors: ValidationError[] = [];
  const name = (p.name || '').trim();
  if (!name) errors.push({ field: 'name', message: 'Name is required' });
  if (name.length > 200) errors.push({ field: 'name', message: 'Name is too long' });

  const url = (p.url || '').trim();
  if (url) {
    try {
      const withScheme = /^\w+:\/\//.test(url) ? url : `https://${url}`;
      new URL(withScheme);
    } catch {
      errors.push({ field: 'url', message: 'Invalid URL' });
    }
  }

  const notes = p.notes ?? '';
  if (notes.length > 4000) errors.push({ field: 'notes', message: 'Notes exceed 4000 characters' });

  return errors;
}


export async function updateItemPayload(
  item: VaultItem,
  next: VaultItemPayload,
  key: CryptoKey
): Promise<VaultItem> {
  if (!key) throw new Error('Locked: no session key');

  // Optional sanity: verify the key can decrypt current item
  await decryptJSON<VaultItemPayload>(key, item.enc.iv, item.enc.ct, { label: item.id ?? String((item as any).id ?? '') });

  // Normalize + validate (keeps your current rules)
  const clean: VaultItemPayload = {
    name: (next.name ?? '').trim(),
    username: (next.username ?? '').trim(),
    password: next.password ?? '',
    url: normalizeUrl(next.url),
    tags: sanitizeTags(next.tags),
    notes: next.notes ?? ''
  };
  const errs = validatePayload(clean);
  if (errs.length) {
    const e: any = new Error('invalid-payload');
    e.code = 'invalid-payload';
    e.errors = errs;
    throw e;
  }

  // Delegate the actual encrypt+persist to updateItem (preserves id & createdAt)
  return updateItem(key, item, clean);
}


/*

export async function updateItemPayload(
  item: VaultItem,
  next: VaultItemPayload,
  key: CryptoKey
): Promise<VaultItem> {
  if (!key) throw new Error('Locked: no session key');

  // Optional: ensure key correctness early
  await decryptJSON<VaultItemPayload>(key, item.enc.iv, item.enc.ct, { label: item.id ?? String((item as any).id ?? '') });

  const clean: VaultItemPayload = {
    name: (next.name || '').trim(),
    username: (next.username ?? '').trim(),
    password: next.password ?? '',
    url: normalizeUrl(next.url),
    tags: sanitizeTags(next.tags),
    notes: next.notes ?? '',
  };

  const errs = validatePayload(clean);
  if (errs.length) {
    const e: any = new Error('invalid-payload');
    e.code = 'invalid-payload';
    e.errors = errs;
    throw e;
  }

  const { iv, ct } = await encryptJSON(key, clean);
  const updated: VaultItem = {
    ...item,
    id: clean.name,      // mirror for list/search
    enc: {v:2, iv, ct },
    updatedAt: Date.now(),
  };
  await putItem(updated);
  return updated;
}
*/


// 
export async function createItemFromPayload(
  key: CryptoKey,
  next: VaultItemPayload
): Promise<VaultItem> {
  if (!key) throw new Error('Locked: no session key');

  // Reuse the same normalization rules as updateItemPayload
  const clean: VaultItemPayload = {
    name: (next.name ?? '').trim(),
    username: (next.username ?? '').trim(),
    password: next.password ?? '',
    url: normalizeUrl(next.url),
    tags: sanitizeTags(next.tags),
    notes: next.notes ?? ''
  };

  const errs = validatePayload(clean);
  if (errs.length) {
    const e: any = new Error('invalid-payload');
    e.code = 'invalid-payload';
    e.errors = errs;
    throw e;
  }

  // Canonical id is the (clean) name for mvault (your baseline) 
  // NOTE: createItem currently uses "put", so identical names will overwrite.
  // If you want "duplicate name" protection, switch to "add" in txPut.
  const id = clean.name;
  const item = await createItem(key, id, clean);

  // Keep the global tag universe up-to-date like updateItem does
  await refreshTags();

  return item;
}
