
// src/lib/data/db.ts
export const DB_NAME = 'mvault';
export const DB_VERSION = 3; // bump to force a single upgrade path
export const META_STORE = 'meta';
export const ITEMS_STORE = 'items';

export function openDBWithSchema(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE); // no keyPath (single-record header)
      }
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
