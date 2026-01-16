
// src/lib/crypto/rekey.ts
import type { VaultHeader, VaultItem, VaultItemPayload, Encrypted } from '../data/types';
import { openDBWithSchema, ITEMS_STORE, META_STORE } from '../data/db';
import { getOrCreateHeader, deriveFromHeader, ensureCanary } from './header';
import { saveHeaderInTx } from './header';
import { encryptJSON, decryptJSON } from './crypto';
import { startRekey, updateRekey, finishRekey } from '../app/rekeyProgress';

export type RekeyPhase = 'decrypt' | 'reencrypt' | 'writing' | 'finalize';

/**
 * Create a new header with fresh KDF params (new salt + optional iterations).
 * Canary will be added later by ensureCanary(header, newKey).
 */
async function createFreshHeaderForNewPassphrase(
  newPass: string,
  iterations?: number
): Promise<VaultHeader> {
  const current = await getOrCreateHeader();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iters = typeof iterations === 'number' ? iterations : current.kdf.iterations;

  const fresh: VaultHeader = {
    version: 1,
    kdf: {
      type: 'PBKDF2',
      hash: 'SHA-256',
      iterations: iters,
      salt: Array.from(salt),
    },
    // canary to be set via ensureCanary(header,newKey) later
  };

  return fresh;
}

export type RekeyOptions = {
  /** If the vault is unlocked, pass the session key to avoid re-entering current passphrase. */
  sessionKey?: CryptoKey | null;
  /** If locked, pass the current passphrase to derive the old key. */
  currentPass?: string | null;
  /** New passphrase to derive the new key. */
  newPass: string;
  /** Optional override for KDF iterations. */
  iterations?: number;
  /** Progress callback (phase, done, total). */
  onProgress?: (phase: RekeyPhase, done: number, total: number) => void;
};

/**
 * Atomic rekey:
 * - Decrypt all items with old key (progress: "decrypt")
 * - Derive new key + fresh header (new salt/iterations)
 * - Re-encrypt all payloads (progress: "reencrypt")
 * - Single IDB transaction over [ITEMS_STORE, META_STORE] to write all items + header (progress: "writing")
 * - Commit => success; Abort => no partial writes
 */
export async function rekeyVault(opts: RekeyOptions): Promise<{ header: VaultHeader; newKey: CryptoKey; count: number }> {
  const { sessionKey, currentPass, newPass, iterations, onProgress } = opts;
  if (!newPass || newPass.trim().length === 0) {
    throw new Error('New passphrase is empty');
  }

  // ----- 1) Determine old key & read all items -----
  const header = await getOrCreateHeader();
  let oldKey: CryptoKey | null = sessionKey ?? null;
  if (!oldKey) {
    if (!currentPass) throw new Error('Vault is locked; current passphrase required.');
    oldKey = await deriveFromHeader(currentPass, header);
  }

  const db = await openDBWithSchema();

  // Read items
  const items: VaultItem[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(ITEMS_STORE, 'readonly');
    const store = tx.objectStore(ITEMS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as VaultItem[]);
    req.onerror = () => reject(req.error);
  });

  const total = items.length;

  // Decrypt loop
  startRekey('decrypt', total, 'Decrypting items…');
  const decrypted: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const payload = await decryptJSON<VaultItemPayload>(oldKey, it.enc.iv, it.enc.ct, { label: String(it.id) });
    decrypted.push({ item: it, payload });
    updateRekey('decrypt', i + 1, total, 'Decrypting items…');
    onProgress?.('decrypt', i + 1, total);
  }

  // ----- 2) Derive new key & build fresh header -----
  const freshHeader = await createFreshHeaderForNewPassphrase(newPass, iterations);
  // We need a CryptoKey derived from the fresh header KDF params:
  const newKey = await deriveFromHeader(newPass, freshHeader);

  // Add a canary (NOT persisted yet – ensureCanary returns a header object)
  const freshHeaderWithCanary = await ensureCanary(freshHeader, newKey);

  // ----- 3) Re-encrypt all payloads with new key -----
  startRekey('reencrypt', total, 'Re-encrypting items…');
  const updatedItems: VaultItem[] = new Array(items.length);
  for (let i = 0; i < decrypted.length; i++) {

    // BEFORE
    // const { item, payload } = decrypted[i];
    // const enc: Encrypted = await encryptJSON(newKey, payload); // { v:2, iv, ct }
    // updatedItems[i] = { ...item, enc, updatedAt: Date.now() };

    // AFTER
    const { item, payload } = decrypted[i];
    const sealed = await encryptJSON(newKey, payload); // -> { iv, ct }
    const toNumArray = (x: Uint8Array | number[]) => (Array.isArray(x) ? x : Array.from(x));
    const enc: Encrypted = { v: 2 as const, iv: toNumArray((sealed as any).iv), ct: toNumArray((sealed as any).ct) };
    updatedItems[i] = { ...item, enc, updatedAt: Date.now() };
    
    updateRekey('reencrypt', i + 1, total, 'Re-encrypting items…');
    onProgress?.('reencrypt', i + 1, total);
  }

  // ----- 4) Single atomic transaction: write items + header -----
  startRekey('writing', total + 1, 'Writing items and header…');
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ITEMS_STORE, META_STORE], 'readwrite');
    const itemsStore = tx.objectStore(ITEMS_STORE);

    // Write items (track progress using req.onsuccess)
    for (let i = 0; i < updatedItems.length; i++) {
      const req = itemsStore.put(updatedItems[i]);
      req.onsuccess = () => {
        // +1 per item written
        const done = i + 1;
        updateRekey('writing', done, total + 1, 'Writing items and header…');
        onProgress?.('writing', done, total + 1);
      };
      req.onerror = () => {
        tx.abort();
      };
    }

    // Put header (after enqueuing item writes; still part of same tx)
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);

    // Enqueue header write at the end (counts as the final tick)
    saveHeaderInTx(tx, freshHeaderWithCanary);
    // Manually bump progress to total+1 once tx completes successfully (below)
  });

  // Final progress bump (header count)
  updateRekey('finalize', total + 1, total + 1, 'Finalizing…');
  finishRekey(true, 'Rekey complete');

  db.close();
  return { header: freshHeaderWithCanary, newKey, count: items.length };
}
