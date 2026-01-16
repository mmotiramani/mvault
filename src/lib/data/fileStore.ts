
// src/lib/store.ts
/*

import { createStore, get, set } from 'idb-keyval';
import type { VaultFile } from '../vault';


// Use a dedicated small DB for the export blob.
// This avoids coordinating objectStore creation/version with our 'mvault' DB.
const kv = createStore('mvault_files', 'files');
const VAULT_KEY = 'vaultFile';


export function saveVaultFile(vf: VaultFile) : Promise<void>{ return set(VAULT_KEY, vf, kv); }
export function loadVaultFile(): Promise<VaultFile | undefined> { return get(VAULT_KEY,kv); }

*/