
// src/lib/io/fsa.ts
import { openDBWithSchema, META_STORE } from '../data/db';

export type LastVaultMeta = { name: string; savedAt: number };
export type FsaErrorCode = 'abort' | 'not-allowed' | 'security' | 'type' | 'unknown';

const LAST_HANDLE_KEY = 'lastFileHandle';
const LAST_META_KEY = 'lastFileMeta';

function supportsFSA() {
  return 'showOpenFilePicker' in window || 'showSaveFilePicker' in window;
}

async function metaPut(key: IDBValidKey, val: any) {
  const db = await openDBWithSchema();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function metaGet<T>(key: IDBValidKey): Promise<T | undefined> {
  const db = await openDBWithSchema();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

function classifyFsaError(err: any): FsaErrorCode {
  const name = err?.name || '';
  if (name === 'AbortError') return 'abort';
  if (name === 'NotAllowedError') return 'not-allowed';
  if (name === 'SecurityError') return 'security';
  if (name === 'TypeError') return 'type';
  return 'unknown';
}

export async function pickOpenHandle(): Promise<FileSystemFileHandle | null> {
  if (!supportsFSA() || !('showOpenFilePicker' in window)) return null;
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'MVault files', accept: { 'application/json': ['.mvault'] } }],
      excludeAcceptAllOption: true,
    });
    await metaPut(LAST_HANDLE_KEY, handle);
    return handle;
  } catch (err) {
    const code = classifyFsaError(err);
    if (code !== 'abort') console.error('Open picker failed:', err);
    return null;
  }
}

export async function pickSaveHandle(suggestedName = 'vault.mvault'): Promise<FileSystemFileHandle | null> {
  if (!supportsFSA() || !('showSaveFilePicker' in window)) return null;
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'MVault file', accept: { 'application/json': ['.mvault'] } }],
      excludeAcceptAllOption: false,
    });
    await metaPut(LAST_HANDLE_KEY, handle);
    return handle;
  } catch (err) {
    const code = classifyFsaError(err);
    if (code !== 'abort') console.error('Save picker failed:', err);
    return null;
  }
}

export async function getLastHandle(): Promise<FileSystemFileHandle | null> {
  const h = await metaGet<FileSystemFileHandle>(LAST_HANDLE_KEY);
  return h || null;
}
export async function getLastMeta(): Promise<LastVaultMeta | null> {
  const m = await metaGet<LastVaultMeta>(LAST_META_KEY);
  return m || null;
}
export async function setLastMeta(meta: LastVaultMeta): Promise<void> {
  await metaPut(LAST_META_KEY, meta);
}

export async function readHandleText(handle: FileSystemFileHandle): Promise<string> {
  try {
    const file = await handle.getFile();
    return file.text();
  } catch (err) {
    console.error('readHandleText failed:', err);
    throw err;
  }
}

export async function writeHandleText(handle: FileSystemFileHandle, text: string): Promise<void> {
  try {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  } catch (err) {
    console.error('writeHandleText failed:', err);
    throw err;
  }
}

export async function saveBlobFallback(blob: Blob, fileName: string) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  } catch (err) {
    console.error('saveBlobFallback failed:', err);
  }
}
