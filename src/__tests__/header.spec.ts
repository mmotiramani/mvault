
// src/__tests__/header.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { getOrCreateHeader, deriveFromHeader, ensureCanary } from '../lib/crypto/header';
import { encryptJSON } from '../lib/crypto/crypto';

// Mock openDBWithSchema for META_STORE writes
vi.mock('../lib/data/db', () => ({
  openDBWithSchema: async () => ({
    transaction: () => ({
      objectStore: () => ({
        put: () => {},
        get: () => ({ onsuccess: null as any, onerror: null as any }),
      }),
      oncomplete: null as any, onerror: null as any
    }),
    close: () => {}
  }),
  META_STORE: 'meta',
}));

describe('header canary flow', () => {
  it('creates header and derives key', async () => {
    const header = await getOrCreateHeader();
    expect(header.kdf.type).toBe('PBKDF2');
    const key = await deriveFromHeader('test-pass', header);
    expect(key).toBeTruthy();
  });

  it('ensures canary is added', async () => {
    const header = await getOrCreateHeader();
    const key = await deriveFromHeader('test-pass', header);
    const out = await ensureCanary(header, key);
    expect(out.canary).toBeTruthy();
    // canary should validate decrypt path if we had decryptJSON mocked here
  });
});
