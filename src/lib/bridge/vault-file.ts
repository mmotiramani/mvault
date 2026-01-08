
// src/lib/bridge/vault-file.ts
import type { VaultHeader, VaultItem, VaultItemPayload } from '../data/types';
import { getOrCreateHeader, deriveFromHeader, ensureCanary, saveHeader } from '../crypto/header';
import { listItems } from '../data/store';
import { decryptJSON } from '../crypto/crypto';
import { openDBWithSchema, ITEMS_STORE } from '../data/db';
import { showToast } from '../ui/toast';


import { get } from 'svelte/store';
import { session } from '../app/session';


type VaultFileJSON = { header: VaultHeader; items: VaultItem[] };

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

export async function validatePassphrase(header: VaultHeader, items: VaultItem[], passphrase: string): Promise<CryptoKey> {
  const key = await deriveFromHeader(passphrase, header);
  try {
    if (header.canary) {
      await decryptJSON(key, header.canary.iv, header.canary.ct);
    } else if (items.length > 0) {
      await decryptJSON(key, items[0].enc.iv, items[0].enc.ct);
    }
    return key;
  } catch {
    const e: any = new Error('incorrect-passphrase');
    e.code = 'incorrect-passphrase';
    throw e;
  }
}

/** Manual Import (upload) — default MERGE; set replace=true to overwrite DB */
export async function importFromText(text: string, passphrase: string, replace = false): Promise<void> {
  try {
    const parsed = JSON.parse(text) as VaultFileJSON;
    const { header, items } = parsed;

    const key = await validatePassphrase(header, items, passphrase);
    const ensured = await ensureCanary(header, key);
    if (ensured !== header) await saveHeader(ensured);

    if (replace) await clearItems();
    const db = await openDBWithSchema();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ITEMS_STORE, 'readwrite');
      const store = tx.objectStore(ITEMS_STORE);
      items.forEach(i => store.put(i));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    showToast(replace ? 'Vault replaced from file' : 'Vault merged from file', 'success');
  } catch (e: any) {
    showToast(e?.code === 'incorrect-passphrase' ? 'Incorrect passphrase' : 'Import failed', 'error');
  }
}


export async function exportToDownload(fileName = 'vault.mvault', passphrase?: string): Promise<void> {
  try {
    const s = get(session);
    const header = s.header ?? (await getOrCreateHeader());

    // Prefer the runtime unlocked key; if user supplied a passphrase, recompute explicitly
    const key = passphrase
      ? await deriveFromHeader(passphrase, header!)
      : s.key;

    if (!key) {
      showToast('Vault is locked. Please unlock or provide passphrase.', 'error');
      return;
    }

    // Assert/refresh canary with the key being used
    const finalHeader = await ensureCanary(header!, key);

    // Decrypt with the correct key (no empty-pass fallback)
    const items = (await listItems<VaultItemPayload>(key)).map(({ item }) => item);

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

