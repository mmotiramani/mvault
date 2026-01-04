
// src/lib/app/session.ts
import { writable } from 'svelte/store';
import type { VaultHeader, VaultItemPayload, VaultItem } from '../data/types';
import { getOrCreateHeader, deriveFromHeader } from '../crypto/header';
import { listItems } from '../data/store';

export type SessionState = {
  header: VaultHeader | null;
  key: CryptoKey | null;
  unlockedAt: number | null;
  allTags: string[];
};

const initial: SessionState = { header: null, key: null, unlockedAt: null, allTags: [] };
export const session = writable<SessionState>(initial);

export async function initHeader() {
  const header = await getOrCreateHeader();
  session.update((s) => ({ ...s, header }));
}

export async function unlock(passphrase: string) {
  let hdr: VaultHeader | null = null;
  session.update((s) => (hdr = s.header, s));
  if (!hdr) hdr = await getOrCreateHeader();
  const key = await deriveFromHeader(passphrase, hdr!);
  const unlockedAt = Date.now();
  const allTags = await computeAllTags(key);
  session.set({ header: hdr!, key, unlockedAt, allTags });
}

export function lock() {
  session.update((s) => ({ header: s.header, key: null, unlockedAt: null, allTags: [] }));
}

export async function computeAllTags(key: CryptoKey): Promise<string[]> {
  const entries = await listItems<VaultItemPayload>(key);
  const tagSet = new Set<string>();
  for (const e of entries) for (const t of e.payload.tags || []) tagSet.add(t.toLowerCase());
  return Array.from(tagSet).sort();
}

export async function refreshTags() {
  let key: CryptoKey | null = null;
  session.update((s) => (key = s.key, s));
  if (!key) return;
  const allTags = await computeAllTags(key);
  session.update((s) => ({ ...s, allTags }));
}
