
// src/lib/data/types.ts
export type VaultItemPayload = {
  name: string;
  username: string;
  password: string;
  url?: string;
  tags: string[];
  notes?: string; // soft limit 4000
};

// Each item stores its encrypted payload here
export type VaultItem = {
  id: string;           // uuid
  createdAt: number;
  updatedAt: number;
  enc: Encrypted;       // encrypted VaultItemPayload
};

// File/header metadata + optional canary (also an Encrypted blob
export type VaultHeader = {
  version: 1;
  kdf: { type: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: number[] };
  /** Optional canary encrypted with the passphrase-derived key for fast validation */
  canary?: Encrypted;
};


// One canonical encrypted blob schema (used everywhere)
export type Encrypted = { v: 2; iv: number[]; ct: number[] };
