
// src/__tests__/bridge.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { validatePassphrase } from '../lib/bridge/vault-file';
import type { VaultHeader, VaultItem, Encrypted } from '../lib/data/types';

// Mock deriveFromHeader & crypto decrypt to avoid WebCrypto complexity
vi.mock('../lib/crypto/header', () => ({
  deriveFromHeader: async (_pass: string, _h: any) => ({} as CryptoKey),
}));
vi.mock('../lib/crypto/crypto', () => ({
  decryptJSON: async (_key: CryptoKey, _iv: number[], _ct: number[]) => ({ ok: true }),
}));

describe('validatePassphrase', () => {
  it('passes with canary', async () => {
    const header: VaultHeader = {
      version: 1,
      kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations: 250000, salt: Array.from(new Uint8Array(16)) },
      canary: { v:2, iv:[1,2,3], ct:[4,5,6] } as Encrypted
    };
    const items: VaultItem[] = [];
    const key = await validatePassphrase(header, items, 'pass');
    expect(key).toBeTruthy();
  });

  it('passes by decrypting first item when no canary', async () => {
    const header: VaultHeader = {
      version: 1,
      kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations: 250000, salt: Array.from(new Uint8Array(16)) },
    };
    const items: VaultItem[] = [{ id:'x', createdAt:0, updatedAt:0, enc:{ v:2, iv:[1], ct:[2] } as Encrypted }];
    const key = await validatePassphrase(header, items, 'pass');
    expect(key).toBeTruthy();
  });
});
