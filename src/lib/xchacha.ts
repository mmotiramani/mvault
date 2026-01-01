
// src/lib/xchacha.ts


import { getSodium } from './sodium';


/** Encrypt using XChaCha20-Poly1305 (IETF) with optional AAD. */
export async function xchachaEncrypt(
  key: Uint8Array,                  // 32 bytes
  plaintext: Uint8Array,
  aad?: Uint8Array
) {
  const sodium = await getSodium();
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES); // 24 bytes
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad ?? null,
    null,           // nsec (unused)
    nonce,
    key
  );
  return { nonce, ciphertext };
}

/** Decrypt using XChaCha20-Poly1305 (IETF) with optional AAD. */
export async function xchachaDecrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array
) {
  const sodium = await getSodium();
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    aad ?? null,
    nonce,
    key
  );
  return plaintext;
}

