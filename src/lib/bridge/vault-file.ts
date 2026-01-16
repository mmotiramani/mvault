
// src/lib/bridge/vault-file.ts
import type { VaultHeader, VaultItem, VaultItemPayload, Encrypted } from '../data/types';
import { getOrCreateHeader, deriveFromHeader, ensureCanary, saveHeader } from '../crypto/header';
import { listItems } from '../data/store';
import { decryptJSON, encryptJSON } from '../crypto/crypto';
import { openDBWithSchema, ITEMS_STORE } from '../data/db';
import { showToast } from '../ui/toast';
import { get } from 'svelte/store';
import { session } from '../app/session';

/**
 * The mvault file format your exporter creates:
 *   { header: VaultHeader-with-canary, items: VaultItemPayload[] }  // items are PLAINTEXT payloads
 * We must encrypt those payloads with the derived key before persisting into IndexedDB.
 */
type VaultFileJSON = { header: VaultHeader; items: VaultItemPayload[] };

/** Clears only the ITEMS store (used when replace=true) */
async function clearItems(): Promise<void> {
  const db = await openDBWithSchema();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    const req = tx.objectStore(ITEMS_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/** Normalize iv/ct to number[] to match Encrypted type */
function toNumArray(x: Uint8Array | number[]): number[] {
  return Array.isArray(x) ? x : Array.from(x);
}

/**
 * Validates passphrase by deriving a key from the FILE HEADER and
 * checking the header canary (preferred).
 * Returns a CryptoKey bound to this header's KDF parameters.
 */
export async function validatePassphrase(
  header: VaultHeader,
  // items kept for potential future fallback checks
  _items: VaultItemPayload[],
  passphrase: string
): Promise<CryptoKey> {
  const key = await deriveFromHeader(passphrase, header);
  try {
    if (header.canary) {
      // Preferred path: verify the canary binds this key
      await decryptJSON(key, header.canary.iv, header.canary.ct);
    }
    // If the header had no canary, we can't verify here (older exports).
    // ensureCanary() below will create one bound to this key.
    return key;
  } catch {
    const e: any = new Error('incorrect-passphrase');
    e.code = 'incorrect-passphrase';
    throw e;
  }
}

/**
 * Manual Import (upload)
 * - `text` is the JSON content from a .mvault export
 * - `passphrase` is the file passphrase (the passphrase the user used for the export)
 * - `replace=true` will clear the current DB items before import; default merges (adds)
 *
 * IMPORTANT: This function:
 *   1) validates the passphrase using the FILE HEADER canary,
 *   2) ensures/saves the header (so future unlock derives from this header),
 *   3) ENCRYPTS each plaintext payload with the derived key before writing to DB.
 * This keeps the DB fully consistent with the passphrase you just used.
 */

/*
export async function importFromText(text: string, passphrase: string, replace = false): Promise<void> {
  try {
    const parsed = JSON.parse(text) as VaultFileJSON;
    const { header, items } = parsed;

    // 1) Validate file passphrase & derive a key from the FILE header
    const key = await validatePassphrase(header, items, passphrase);

    // 2) Ensure the header has a canary bound to THIS key and persist it for future unlocks
    const ensuredHeader = await ensureCanary(header, key);
    await saveHeader(ensuredHeader);

    // 3) Open one DB connection and do everything with it (clear + writes)
    const db = await openDBWithSchema();

    // Helper to await put()
    const putAsync = (store: IDBObjectStore, value: any) =>
      new Promise<void>((resolve, reject) => {
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

    // Clear (optional) on the SAME connection
    if (replace) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ITEMS_STORE, 'readwrite');
        const req = tx.objectStore(ITEMS_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    // 4) Encrypt & persist imported payloads (await each request)
    const toNumArray = (x: Uint8Array | number[]) => (Array.isArray(x) ? x : Array.from(x));

    const writeTx = db.transaction(ITEMS_STORE, 'readwrite');
    const store = writeTx.objectStore(ITEMS_STORE);

    for (const payload of items) {
      const sealed = await encryptJSON(key, payload); // -> { iv, ct } as Uint8Array | number[]
      const enc: Encrypted = {
        v: 2 as const,
        iv: toNumArray((sealed as any).iv),
        ct: toNumArray((sealed as any).ct)
      };
      const now = Date.now();
      const item: VaultItem = {
        id: (crypto as any).randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`,
        createdAt: now,
        updatedAt: now,
        enc
      };
      await putAsync(store, item);
    }

    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () => reject(writeTx.error);
      writeTx.onabort = () => reject(writeTx.error);
    });

    // 5) Post-import sanity: read back the count from the same DB
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(ITEMS_STORE, 'readonly');
      const req = tx.objectStore(ITEMS_STORE).count();
      req.onsuccess = () => resolve(req.result ?? 0);
      req.onerror = () => reject(req.error);
    });
    console.debug('[mvault] importFromText → items in store:', count);

    db.close();

    // 6) Update the runtime session so the app is already unlocked with the new key/header
    session.update((s: any) => ({ ...s, key, header: ensuredHeader }));

    showToast(replace ? 'Vault replaced from file' : 'Vault merged from file', 'success');
  } catch (e: any) {
    console.error('[mvault] importFromText failed:', e);
    showToast(e?.code === 'incorrect-passphrase' ? 'Incorrect passphrase' : 'Import failed', 'error');
  }
}
*/


export async function importFromText(text: string, passphrase: string, replace = false): Promise<void> {
  try {
    // The file may contain items as VaultItemPayload[] (plaintext) OR VaultItem[] (encrypted)
    type AnyItem = VaultItemPayload | VaultItem;

    const parsed = JSON.parse(text) as { header: VaultHeader; items: AnyItem[] };
    const { header, items } = parsed;

    // 1) Validate passphrase using FILE header canary
    const key = await validatePassphrase(header, items as any, passphrase);

    // 2) Ensure header has a canary for this key and persist it
    const ensuredHeader = await ensureCanary(header, key);
    await saveHeader(ensuredHeader);

    // 3) Single DB connection for clear + writes
    const db = await openDBWithSchema();

    // optional clear
    if (replace) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ITEMS_STORE, 'readwrite');
        const req = tx.objectStore(ITEMS_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    const toNumArray = (x: Uint8Array | number[]) => (Array.isArray(x) ? x : Array.from(x));
    const toU8 = (x: number[] | Uint8Array | ArrayBuffer) =>
      x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x);

    const putAsync = (store: IDBObjectStore, value: any) =>
      new Promise<void>((resolve, reject) => {
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

    // 4) Normalize each file item to a plaintext payload, then encrypt and write
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(ITEMS_STORE);

    for (const src of items) {
      let payload: VaultItemPayload;
      let createdAt = Date.now();
      let updatedAt = createdAt;
      let id: string | undefined;

      if ((src as any)?.enc?.ct) {
        // Case A: file carried ENCRYPTED items (VaultItem)
        const vi = src as VaultItem;
        id = vi.id;
        createdAt = vi.createdAt ?? createdAt;
        updatedAt = vi.updatedAt ?? createdAt;

        // Decrypt to get the plaintext payload
        payload = await decryptJSON<VaultItemPayload>(
          key,
          toU8(vi.enc.iv),
          toU8(vi.enc.ct),
          { label: String(vi.id ?? '') }
        );
      } else {
        // Case B: file carried PLAINTEXT payloads (VaultItemPayload)
        payload = src as VaultItemPayload;
      }

      // Encrypt payload for DB
      const sealed = await encryptJSON(key, payload);       // -> { iv, ct } as Uint8Array | number[]
      const enc: Encrypted = { v: 2 as const, iv: toNumArray((sealed as any).iv), ct: toNumArray((sealed as any).ct) };

      // Reuse id/timestamps if provided, otherwise generate
      const now = Date.now();
      const finalId = id ?? (crypto as any).randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`;
      const item: VaultItem = {
        id: finalId,
        createdAt: createdAt ?? now,
        updatedAt: updatedAt ?? now,
        enc
      };

      await putAsync(store, item);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    // 5) Post-check: how many rows now?
    const count = await new Promise<number>((resolve, reject) => {
      const rtx = db.transaction(ITEMS_STORE, 'readonly');
      const req = rtx.objectStore(ITEMS_STORE).count();
      req.onsuccess = () => resolve(req.result ?? 0);
      req.onerror = () => reject(req.error);
    });
    console.debug('[mvault] importFromText → items in store:', count);

    db.close();

    // 6) Keep the app unlocked with the imported key/header
    session.update((s: any) => ({ ...s, key, header: ensuredHeader }));

    showToast(replace ? 'Vault replaced from file' : 'Vault merged from file', 'success');
  } catch (e: any) {
    console.error('[mvault] importFromText failed:', e);
    showToast(e?.code === 'incorrect-passphrase' ? 'Incorrect passphrase' : 'Import failed', 'error');
  }
}


/**
 * Export to a downloadable .mvault file.
 * Keeps your original logic: decrypt from DB with the current key and write PLAINTEXT payloads.
 */
export async function exportToDownload(fileName = 'vault.mvault', passphrase?: string): Promise<void> {
  try {
    const s = get(session);
    const header = s.header ?? (await getOrCreateHeader());
    // Prefer the runtime unlocked key; if user supplied a passphrase, recompute explicitly
    const key = passphrase ? await deriveFromHeader(passphrase, header!) : s.key;

    if (!key) {
      showToast('Vault is locked. Please unlock or provide passphrase.', 'error');
      return;
    }

    // Assert/refresh canary with the key being used
    const finalHeader = await ensureCanary(header!, key);

    // Decrypt with the correct key (no empty-pass fallback)
    // const items = (await listItems<VaultItemPayload>(key)).map(({ item }) => item);
    const items = (await listItems<VaultItemPayload>(key)).map(({ payload }) => payload);

    const json = JSON.stringify({ header: finalHeader, items });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);

    console.log('exportToDownload succeeded');
    showToast('Exported', 'success');
  } catch (err) {
    console.log('exportToDownload failed');
    console.error('exportToDownload failed:', err);
    showToast('Export failed', 'error');
  }
}
