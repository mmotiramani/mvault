
// src/lib/vault.ts
import { getSodium } from './sodium';
import { deriveMasterKey, randomBytes, type KdfParams } from './kdf';

export type Base64String = string;

export const VAULT_MAGIC = 'MVAULT' as const;
export const VAULT_VERSION = 1 as const;

export type AeadAlgo = 'XCHACHA20-POLY1305';
export type KdfAlgo = 'argon2id';

export interface Entry {
  id: string;
  app: string;
  url?: string;
  username: string;
  password: string;
  notes?: string;
}

export interface VaultData {
  entries: Entry[];
}

export interface VaultKdf {
  algo: KdfAlgo;
  salt_b64: Base64String;   // 16 bytes base64
  opslimit: number;
  memlimit_mb: number;      // MB
  parallelism: number;
}

export interface VaultSection {
  algo: AeadAlgo;           // XChaCha20-Poly1305
  nonce_b64: Base64String;  // 24 bytes base64
  ciphertext_b64: Base64String; // payload + 16-byte tag
}

export interface VaultFile {
  magic: typeof VAULT_MAGIC;
  version: typeof VAULT_VERSION;
  kdf: VaultKdf;
  dek_wrap: VaultSection;   // DEK wrapped with MK
  payload: VaultSection;    // encrypted VaultData JSON
}

/** AAD that binds header/version to the AEAD operations. */
export function getHeaderAAD(): Uint8Array {
  return new TextEncoder().encode(`${VAULT_MAGIC}_v${VAULT_VERSION}`);
}

/** Type guard for VaultFile shape (shallow). */
export function isVaultFile(v: unknown): v is VaultFile {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, any>;
  return (
    o.magic === VAULT_MAGIC &&
    o.version === VAULT_VERSION &&
    typeof o.kdf?.algo === 'string' &&
    typeof o.kdf?.salt_b64 === 'string' &&
    typeof o.dek_wrap?.nonce_b64 === 'string' &&
    typeof o.dek_wrap?.ciphertext_b64 === 'string' &&
    typeof o.payload?.nonce_b64 === 'string' &&
    typeof o.payload?.ciphertext_b64 === 'string'
  );
}

/** Throw if not a VaultFile (shallow check). */
export function assertVaultFile(v: unknown, msg: string = 'Invalid vault file'): asserts v is VaultFile {
  if (!isVaultFile(v)) throw new Error(msg);
}

/** Create a new VaultFile from data, protected by the master password. */
export async function createVaultFile(
  password: string,
  data: VaultData,
  kdfOverrides?: Partial<Omit<KdfParams, 'salt'>>
): Promise<VaultFile> {
  const sodium = await getSodium();

  // KDF params (salt must be 16 bytes for libsodium crypto_pwhash)
  const salt: Uint8Array = await randomBytes(16);
  const kdf: KdfParams = {
    salt,
    opslimit: Math.trunc(kdfOverrides?.opslimit ?? 3),
    memlimitMB: Math.trunc(kdfOverrides?.memlimitMB ?? 64),
    parallelism: Math.trunc(kdfOverrides?.parallelism ?? 2)
  };

  // Master key (MK) from password
  const mk: Uint8Array = await deriveMasterKey(password, kdf);

  // Data Encryption Key (DEK)
  const dek: Uint8Array = await randomBytes(32);

  const aad: Uint8Array = getHeaderAAD();

  // Wrap DEK with MK using XChaCha20-Poly1305 (24-byte nonce)
  const wrapNonce: Uint8Array = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  const wrappedDek: Uint8Array = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    dek, aad, null, wrapNonce, mk
  );

  // Encrypt payload (entries JSON) with DEK
  const plaintext: Uint8Array = new TextEncoder().encode(JSON.stringify(data));
  const payNonce: Uint8Array = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  const payloadCT: Uint8Array = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext, aad, null, payNonce, dek
  );

  const vf: VaultFile = {
    magic: VAULT_MAGIC,
    version: VAULT_VERSION,
    kdf: {
      algo: 'argon2id',
      salt_b64: sodium.to_base64(salt),
      opslimit: kdf.opslimit,
      memlimit_mb: kdf.memlimitMB,
      parallelism: kdf.parallelism
    },
    dek_wrap: {
      algo: 'XCHACHA20-POLY1305',
      nonce_b64: sodium.to_base64(wrapNonce),
      ciphertext_b64: sodium.to_base64(wrappedDek)
    },
    payload: {
      algo: 'XCHACHA20-POLY1305',
      nonce_b64: sodium.to_base64(payNonce),
      ciphertext_b64: sodium.to_base64(payloadCT)
    }
  };
  return vf;
}

/** Open an existing VaultFile with the master password and return decrypted data. */
export async function openVaultFile(password: string, vf: VaultFile): Promise<VaultData> {
  const sodium = await getSodium();
  assertVaultFile(vf, 'Bad vault header');

  // Derive MK from file KDF
  const salt: Uint8Array = sodium.from_base64(vf.kdf.salt_b64);
  const mk: Uint8Array = await deriveMasterKey(password, {
    salt,
    opslimit: vf.kdf.opslimit,
    memlimitMB: vf.kdf.memlimit_mb,
    parallelism: vf.kdf.parallelism
  });

  const aad: Uint8Array = getHeaderAAD();

  // Unwrap DEK
  const wrapNonce: Uint8Array = sodium.from_base64(vf.dek_wrap.nonce_b64);
  const wrappedDek: Uint8Array = sodium.from_base64(vf.dek_wrap.ciphertext_b64);
  const dek: Uint8Array = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, wrappedDek, aad, wrapNonce, mk
  );

  // Decrypt payload
  const payNonce: Uint8Array = sodium.from_base64(vf.payload.nonce_b64);
  const payloadCT: Uint8Array = sodium.from_base64(vf.payload.ciphertext_b64);
  const plaintext: Uint8Array = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, payloadCT, aad, payNonce, dek
  );

  const json: string = new TextDecoder().decode(plaintext);
  const data: VaultData = JSON.parse(json) as VaultData;
  return data;
}

/** Change the master password by re-wrapping the DEK (payload unchanged). */
export async function rewrapMasterPassword(
  oldPassword: string,
  newPassword: string,
  vf: VaultFile
): Promise<VaultFile> {
  const sodium = await getSodium();
  assertVaultFile(vf, 'Invalid vault file');

  // Old MK
  const oldSalt: Uint8Array = sodium.from_base64(vf.kdf.salt_b64);
  const oldMK: Uint8Array = await deriveMasterKey(oldPassword, {
    salt: oldSalt,
    opslimit: vf.kdf.opslimit,
    memlimitMB: vf.kdf.memlimit_mb,
    parallelism: vf.kdf.parallelism
  });

  const aad: Uint8Array = getHeaderAAD();

  // Recover current DEK
  const currentDEK: Uint8Array = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    sodium.from_base64(vf.dek_wrap.ciphertext_b64),
    aad,
    sodium.from_base64(vf.dek_wrap.nonce_b64),
    oldMK
  );

  // New KDF + MK
  const newSalt: Uint8Array = await randomBytes(16);
  const newKdf: KdfParams = {
    salt: newSalt,
    opslimit: 3,
    memlimitMB: 64,
    parallelism: 2
  };
  const newMK: Uint8Array = await deriveMasterKey(newPassword, newKdf);

  // Re-wrap DEK
  const newWrapNonce: Uint8Array = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  const newWrappedDek: Uint8Array = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    currentDEK, aad, null, newWrapNonce, newMK
  );

  const updated: VaultFile = {
    ...vf,
    kdf: {
      algo: 'argon2id',
      salt_b64: sodium.to_base64(newSalt),
      opslimit: newKdf.opslimit,
      memlimit_mb: newKdf.memlimitMB,
      parallelism: newKdf.parallelism
    },
    dek_wrap: {
      algo: 'XCHACHA20-POLY1305',
      nonce_b64: sodium.to_base64(newWrapNonce),
      ciphertext_b64: sodium.to_base64(newWrappedDek)
    }
    // payload unchanged
  };
  return updated;
}

/** Serialize vault to JSON string. */
export function serializeVaultFile(vf: VaultFile): string {
  return JSON.stringify(vf);
}

/** Parse JSON string into VaultFile and assert shape. */
export function deserializeVaultFile(json: string): VaultFile {
  const parsed: unknown = JSON.parse(json);
  assertVaultFile(parsed, 'Malformed vault JSON');
  return parsed;
}
