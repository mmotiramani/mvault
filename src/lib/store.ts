
// src/lib/store.ts
import { get, set } from 'idb-keyval';
import type { VaultFile } from './vault';

const VAULT_KEY = 'mvault:file';

export function saveVaultFile(vf: VaultFile) : Promise<void>{ return set(VAULT_KEY, vf); }
export function loadVaultFile(): Promise<VaultFile | undefined> { return get(VAULT_KEY); }
``
