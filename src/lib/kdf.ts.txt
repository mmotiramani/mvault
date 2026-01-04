
// src/lib/kdf.ts


/** KDF parameters */
export type KdfParams = {
  salt: Uint8Array;      // 16 bytes random
  opslimit: number;      // e.g., 3
  memlimitMB: number;    // e.g., 64..128
  parallelism: number;   // e.g., 2
};

import { getSodium } from './sodium';


/** Derive a 256-bit master key (MK) from the password using Argon2id. */
export async function deriveMasterKey(
  password: string,
  params: KdfParams
): Promise<Uint8Array> {
  const sodium = await getSodium();

  // Guard rails: ensure salt has correct type and length
  const salt = params.salt;
  if (!(salt instanceof Uint8Array)) {
    throw new TypeError('Salt must be a Uint8Array');
  }
  const required = 16; // libsodium.crypto_pwhash_SALTBYTES is 16 in libsodium.js dist
  if (salt.length !== required) {
    throw new TypeError(`Salt must be ${required} bytes, got ${salt.length}`);
  }

  // Derive the key using Argon2id
  const key: Uint8Array = sodium.crypto_pwhash(
    32,                              // outlen (we need a 256-bit MK)
    password,                        // string or Uint8Array
    salt,                            // Uint8Array(16)
    Math.trunc(params.opslimit),     // integer
    Math.trunc(params.memlimitMB) * 1024 * 1024, // integer bytes
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
  return key;
}


/** Generate `n` cryptographically secure random bytes via libsodium. */
export async function randomBytes(n: number) : Promise<Uint8Array> {
  const sodium = await getSodium();
    return sodium.randombytes_buf(Math.trunc(n));
}
