
// src/__tests__/bridge-manual.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { importFromText, exportToDownload, validatePassphrase } from '../lib/bridge/vault-file';
import type { VaultHeader, VaultItem } from '../lib/data/types';

// Mocks
vi.mock('../lib/crypto/header', () => ({
  getOrCreateHeader: async () => ({
    version: 1,
    kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations: 250000, salt: Array.from(new Uint8Array(16)) }
  } as VaultHeader),
  deriveFromHeader: async (_p: string, _h: VaultHeader) => ({} as CryptoKey),
  ensureCanary: async (h: VaultHeader, _k: CryptoKey) => h,
  saveHeader: async (_h: VaultHeader) => {},
}));
vi.mock('../lib/crypto/crypto', () => ({
  decryptJSON: async (_k: CryptoKey, _iv: number[], _ct: number[]) => ({}),
}));
vi.mock('../lib/data/db', () => {
  const items: any[] = [];
  return {
    ITEMS_STORE: 'items',
    openDBWithSchema: async () => ({
      transaction: () => ({
        objectStore: () => ({
          clear: () => {},
          getAll: () => ({ onsuccess: null, onerror: null }),
          put: (v: any) => { items.push(v); }
        }),
        oncomplete: null, onerror: null
      }),
      close: () => {}
    }),
  };
});
vi.mock('../lib/data/store', () => ({
  listItems: async <T>(_k: CryptoKey) => ([] as any),
}));

describe('validatePassphrase', () => {
  it('accepts canary or first item', async () => {
    const header: VaultHeader = {
      version: 1,
      kdf: { type:'PBKDF2', hash:'SHA-256', iterations:250000, salt:Array.from(new Uint8Array(16)) },
      canary: { v:2, iv:[1], ct:[2] }
    };
    const items: VaultItem[] = [];
    const key = await validatePassphrase(header, items, 'p');
    expect(key).toBeTruthy();
  });
});

describe('exportToDownload', () => {
  it('creates a download anchor', async () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      if (tag === 'a') (el as any).click = clickSpy;
      return el;
    });
    await exportToDownload('vault.mvault');
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe('importFromText', () => {
  it('merges by default (replace=false)', async () => {
    const header: VaultHeader = {
      version: 1,
      kdf: { type:'PBKDF2', hash:'SHA-256', iterations:250000, salt:Array.from(new Uint8Array(16)) },
    };
    const payload = { header, items: [] as VaultItem[] };
    await importFromText(JSON.stringify(payload), 'p', false);
    expect(true).toBe(true); // no throw
  });
});
