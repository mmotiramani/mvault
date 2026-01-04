
// src/lib/app/changePassphrase.ts
import { openDBWithSchema, ITEMS_STORE } from '../data/db';
import type { VaultHeader, VaultItem, VaultItemPayload, Encrypted } from '../data/types';
import { getOrCreateHeader, deriveFromHeader, saveHeader, ensureCanary } from '../crypto/header';
import { decryptJSON, encryptJSON } from '../crypto/crypto';
import { showToast } from '../ui/toast';

export async function changePassphrase(oldPass: string, newPass: string): Promise<void> {
  const header = await getOrCreateHeader();
  const oldKey = await deriveFromHeader(oldPass, header);
  const newHeader: VaultHeader = header;
  const newKey = await deriveFromHeader(newPass, newHeader);

  const db = await openDBWithSchema();
  const tx = db.transaction(ITEMS_STORE, 'readwrite');
  const store = tx.objectStore(ITEMS_STORE);

  await new Promise<void>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = async () => {
      const items = req.result as VaultItem[];
      try {
        for (const it of items) {
          const payload = await decryptJSON<VaultItemPayload>(oldKey, it.enc.iv, it.enc.ct);
          const enc = await encryptJSON(newKey, payload);
          const upd: VaultItem = { ...it, updatedAt: Date.now(), enc: { v: 2, ...enc } as Encrypted };
          store.put(upd);
        }
        resolve();
      } catch (e) { reject(e); }
    };
    req.onerror = () => reject(req.error);
  });
  db.close();

  const ensured = await ensureCanary(newHeader, newKey);
  if (ensured !== newHeader) await saveHeader(ensured);

  showToast('Passphrase changed and all items re-encrypted', 'success');
}
