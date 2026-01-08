
// src/__tests__/header.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { getOrCreateHeader, deriveFromHeader, ensureCanary } from '../lib/crypto/header';

// Mock db
vi.mock('../lib/data/db', () => ({
  openDBWithSchema: async () => ({
    transaction: () => ({
      objectStore: () => ({ put: () => {}, get: () => ({ onsuccess: null, onerror: null }) }),
      oncomplete: null, onerror: null
    }),
    close: () => {}
  }),
  META_STORE: 'meta',
}));

// Mock encryptJSON minimal
vi.mock('../lib/crypto/crypto', () => ({
  encryptJSON: async (_k: CryptoKey, _o: unknown) => ({ iv: [1,2,3], ct: [4,5,6] }),
}));

describe('header + canary', () => {
  it('creates header and derives key', async () => {
    const h = await getOrCreateHeader();
    expect(h.kdf.type).toBe('PBKDF2');
    const key = await deriveFromHeader('pass', h);
    expect(key).toBeTruthy();
  });

  it('ensures canary present', async () => {
    const h = await getOrCreateHeader();
    const key = await deriveFromHeader('pass', h);
    const out = await ensureCanary(h, key);
    expect(out.canary).toBeTruthy();
  });
});
