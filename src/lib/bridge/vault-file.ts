// src/lib/bridge/vault-file.ts
import type { VaultItem, VaultItemPayload, Encrypted } from '../data/types';
import { createEncryptedPackage, decryptPackage, encryptJSON } from '../crypto/crypto';
import { listItems } from '../data/store';
import { openDBWithSchema, ITEMS_STORE } from '../data/db';
import { showToast } from '../ui/toast';
import { get } from 'svelte/store';
import { session } from '../app/session';

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
 * Import from an encrypted mvault package (Base64 iv/cipher).
 * Requires the vault to be UNLOCKED so items can be re-encrypted with the live key.
 */
export async function importEncryptedFromText(text: string, filePassphrase: string, replace = true): Promise<void> {
  try {
    const s = get(session);
    const currentKey: CryptoKey | undefined = s.key ?? undefined;
    if (!currentKey) {
      showToast('Unlock your vault before importing', 'error');
      return;
    }

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

    const db = await openDBWithSchema();

    // Optional clear
    if (replace) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ITEMS_STORE, 'readwrite');
        const req = tx.objectStore(ITEMS_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    const toNumArray = (x: Uint8Array | number[]) => (Array.isArray(x) ? x : Array.from(x));
    const tx = db.transaction(ITEMS_STORE, 'readwrite');
    const store = tx.objectStore(ITEMS_STORE);

    for (const it of decoded.data ?? []) {
      const sealed = await encryptJSON(currentKey, it.payload);
      const enc: Encrypted = { v: 2 as const, iv: toNumArray((sealed as any).iv), ct: toNumArray((sealed as any).ct) };

      const now = Date.now();
      const id = it.id ?? ((crypto as any).randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`);
      const row: VaultItem = {
        id,
        createdAt: it.createdAt ?? now,
        updatedAt: now,
        enc
      };
      store.put(row);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    db.close();
    showToast(replace ? 'Vault replaced from encrypted file' : 'Vault merged from encrypted file', 'success');
  } catch (e: any) {
    console.error('[mvault] importEncryptedFromText failed:', e);
    showToast(e?.message || 'Import failed', 'error');
  }
}