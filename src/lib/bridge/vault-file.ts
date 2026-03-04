// src/lib/bridge/vault-file.ts
//import type { VaultHeader, VaultItem, VaultItemPayload, Encrypted } from '../data/types';
import type { VaultHeader, VaultItem, VaultItemPayload, Encrypted } from '../data/types';
import { DEFAULT_ITERATIONS, createEncryptedPackage, decryptPackage, encryptJSON } from '../crypto/crypto';
import { listItems } from '../data/store';
import { openDBWithSchema, ITEMS_STORE,  META_STORE } from '../data/db';
import { showToast } from '../ui/toast';
import { get } from 'svelte/store';
import { session } from '../app/session';


/** Utility: ensure number[] for Encrypted */
const toNumArray = (x: Uint8Array | number[]) => (Array.isArray(x) ? x : Array.from(x));

// Reuse header helpers from your rekey flow
import { ensureCanary, deriveFromHeader } from '../crypto/header';
import { saveHeaderInTx } from '../crypto/header'; // atomic header write in an existing tx [2](https://telekom-my.sharepoint.de/personal/mahesh_motiramani_t-systems_com/Documents/Microsoft%20Copilot%20Chat%20Files/rekey.ts.txt)


/** Export an encrypted, compact (.mvault.json) package using a FILE PASSPHRASE. */
export async function exportEncryptedToDownload(
  fileName = `mvault-${new Date().toISOString()}.mvault.json`,
  filePassphrase: string
): Promise<void> {
  try {
    const s = get(session);
    const key: CryptoKey | undefined = s.key ?? undefined;
    if (!key) {
      showToast('Unlock your vault before exporting', 'error');
      return;
    }

    // Decrypt DB items to plaintext payloads via your existing helper
    const items = await listItems<VaultItemPayload>(key); // [{item, payload}]
    const bundle = items.map(({ item, payload }) => ({
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      payload
    }));

    // Self-contained encrypted payload (Base64 iv/cipher; EXPORT_KDF_ITERATIONS used internally)
    const payload = {
      format: 'mvault-export',
      formatVersion: 1,
      createdAt: Date.now(),
      data: bundle
    };
    const pkg = await createEncryptedPackage(payload, filePassphrase);

    const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);

    showToast('Encrypted export created', 'success');
  } catch (err) {
    console.error('[mvault] exportEncryptedToDownload failed:', err);
    showToast('Export failed', 'error');
  }
}


/**
 * ENCRYPTED IMPORT (works while LOCKED; REPLACES everything):
 * - Decrypts file with FILE PASSPHRASE.
 * - Creates a NEW vault header (fresh salt, DEFAULT_ITERATIONS) bound to that passphrase.
 * - Re-encrypts all items with the NEW vault key and writes them.
 * - Saves header (with canary) INSIDE THE SAME TX for atomicity.
 * - Updates session to the new key/header.
 */

export async function importEncryptedFromText(text: string, filePassphrase: string, replace = true): Promise<void> {
  try {
    const s = get(session);
    const currentKey: CryptoKey | undefined = s.key ?? undefined;
  /*  if (!currentKey) {
      showToast('Unlock your vault before importing', 'error');
      return;
    }
*/
    // Strict encrypted package only (no legacy support)
    const pkg = JSON.parse(text) as {
      version: number;
      kdf: { type: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: number[] };
      iv: string; cipher: string;
    };
    const decoded = await decryptPackage<{
      format: 'mvault-export';
      formatVersion: number;
      createdAt: number;
      data: Array<{ id: string; createdAt: number; updatedAt: number; payload: VaultItemPayload }>;
    }>(pkg, filePassphrase);

    if (decoded.format !== 'mvault-export' || decoded.formatVersion !== 1) {
      throw new Error('Unsupported export format');
    }


    // 2) Build a NEW header (fresh salt; canary will be attached below)
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const newHeader: VaultHeader = {
      version: 1,
      kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations: DEFAULT_ITERATIONS, salt: Array.from(salt) }
      // canary to be added after we derive the key
    };

    // Derive the NEW vault key from *file passphrase* and the NEW header's KDF params
    const newKey = await deriveFromHeader(filePassphrase, newHeader);

    // Create a canary bound to newKey/newHeader
    const sealedCanary = await encryptJSON(newKey, { m: 'MVault-canary' });
    const canary: Encrypted = { v: 2 as const, iv: toNumArray((sealedCanary as any).iv), ct: toNumArray((sealedCanary as any).ct) };
    const headerToSave: VaultHeader = { ...newHeader, canary };

    // 3) One atomic IDB transaction: clear items, put all items, save header

    const db = await openDBWithSchema();

    // Optional clear
  
        const tx = db.transaction([ITEMS_STORE, META_STORE], 'readwrite');
        const itemsStore = tx.objectStore(ITEMS_STORE);

    // Clear all existing items (REPLACE semantics)
    itemsStore.clear();


   // Write all items re-encrypted with the NEW key
    for (const it of decoded.data) {

      const sealed = await encryptJSON(newKey, it.payload);
      const enc: Encrypted = { v: 2 as const, iv: toNumArray((sealed as any).iv), ct: toNumArray((sealed as any).ct) };
      const now = Date.now();
      const id = it.id ?? ((crypto as any).randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`);
      const row: VaultItem = {
        id,
        createdAt: it.createdAt ?? now,
        updatedAt: now,
        enc
      };
      itemsStore.put(row);
    }

    // Save the NEW header bound to filePassphrase/key within the SAME tx
    saveHeaderInTx(tx, headerToSave);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();

   // 4) Update runtime session: vault is now unlocked with the NEW passphrase/key
    session.update((s: any) => ({ ...s, key: newKey, header: headerToSave }));
    showToast('Vault replaced from encrypted file', 'success');
  } catch (err: any) {
    console.error('[mvault] importEncryptedFromText failed:', err);
    const msg = err?.message ?? '';
    if (/incorrect|operationerror|decryption.*failed/i.test(msg)) {
      showToast('Incorrect file passphrase or the file is corrupted', 'error');
    } else if (/invalid-package|invalid package|missing (iv|cipher|kdf\.salt)|unsupported/i.test(msg)) {
      showToast('Not a valid mvault encrypted file', 'error');
    } else {
      showToast('Import failed', 'error');
    }

  }
}