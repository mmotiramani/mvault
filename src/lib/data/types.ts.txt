
// src/lib/data/types.ts
export type VaultItemPayload = {
  name: string;
  username: string;
  password: string;
  url?: string;
  tags: string[];
  notes?: string; // soft limit 4000
};

export type Encrypted = { v: 2; iv: number[]; ct: number[] };

export type VaultItem = {
  id: string;           // uuid
  createdAt: number;
  updatedAt: number;
  enc: Encrypted;       // encrypted payload
};

export type VaultHeader = {
  version: 1;
  kdf: { type: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: number[] };
};
