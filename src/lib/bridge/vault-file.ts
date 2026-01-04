
// src/lib/bridge/vault-file.ts
import type { VaultHeader, VaultItem, VaultItemPayload } from '../data/types';
import { getOrCreateHeader, deriveFromHeader, ensureCanary, saveHeader } from '../crypto/header';
import { listItems } from '../data/store';
import { decryptJSON } from '../crypto/crypto';
import { openDBWithSchema, ITEMS_STORE } from '../data/db';
import { showToast } from '../ui/toast';
import {
  pickOpenHandle, pickSaveHandle, getLastHandle,
  readHandleText, writeHandleText, saveBlobFallback, setLastMeta
} from '../io/fsa';

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

/** FSA-capable: open -> REPLACE DB (overwrite memory) */
export async function openFromFileFSA(): Promise<void> {
  const handle = await pickOpenHandle();
  if (!handle) { showToast('Open canceled or unavailable', 'info'); return; }
  try {
    const text = await readHandleText(handle);
    const parsed = JSON.parse(text) as VaultFileJSON;
    const { header, items } = parsed;
    const pass = prompt('Enter passphrase to open vault:'); if (!pass) return;

    const key = await validatePassphrase(header, items, pass);
    const ensured = await ensureCanary(header, key);
    if (ensured !== header) await saveHeader(ensured);

    await clearItems();
    const db = await openDBWithSchema();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ITEMS_STORE, 'readwrite');
      const store = tx.objectStore(ITEMS_STORE);
      items.forEach(i => store.put(i));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await setLastMeta({ name: (await handle.getFile()).name ?? 'vault.mvault', savedAt: Date.now() });
    showToast('Vault opened (replaced from file)', 'success');
  } catch (e: any) {
    showToast(e?.code === 'incorrect-passphrase' ? 'Incorrect passphrase' : 'Failed to open vault', 'error');
  }
}

/** Non-FSA: default MERGE; set replace=true to overwrite DB */
export async function openFromText(text: string, passphrase: string, replace = false): Promise<void> {
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
    showToast(e?.code === 'incorrect-passphrase' ? 'Incorrect passphrase' : 'Failed to open vault', 'error');
  }
}

/** Serialize all items from DB into vault JSON (ensures canary when passphrase provided) */
export async function serializeVaultJSON(passphrase?: string): Promise<string> {
  const header = await getOrCreateHeader();
  const key = passphrase ? await deriveFromHeader(passphrase, header) : null;
  const finalHeader = key ? await ensureCanary(header, key) : header;

  // If passphrase isn't provided here, listItems should still work with current key/state
  const items = (await listItems<VaultItemPayload>(key || (await deriveFromHeader('', finalHeader)))).map(({ item }) => item);
  return JSON.stringify({ header: finalHeader, items });
}

export async function saveVaultFSA(suggestedName = 'vault.mvault', passphrase?: string): Promise<void> {
  try {
    const json = await serializeVaultJSON(passphrase);
    const handle = await getLastHandle() || await pickSaveHandle(suggestedName);
    if (handle) {
      await writeHandleText(handle, json);
      await setLastMeta({ name: (await handle.getFile()).name ?? suggestedName, savedAt: Date.now() });
      showToast('Saved', 'success');
    } else {
      await saveBlobFallback(new Blob([json], { type: 'application/json' }), suggestedName);
      showToast('Saved (downloaded)', 'success');
    }
  } catch (err) {
    console.error('saveVaultFSA failed:', err);
    showToast('Save failed', 'error');
  }
}

export async function saveVaultAsFSA(suggestedName = 'vault.mvault', passphrase?: string): Promise<void> {
  try {
    const json = await serializeVaultJSON(passphrase);
    const handle = await pickSaveHandle(suggestedName);
    if (handle) {
      await writeHandleText(handle, json);
      await setLastMeta({ name: (await handle.getFile()).name ?? suggestedName, savedAt: Date.now() });
      showToast('Saved as', 'success');
    } else {
      await saveBlobFallback(new Blob([json], { type: 'application/json' }), suggestedName);
      showToast('Saved as (downloaded)', 'success');
    }
  } catch (err) {
    console.error('saveVaultAsFSA failed:', err);
    showToast('Save As failed', 'error');
  }
}
