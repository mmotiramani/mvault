
// src/lib/crypto/crypto.ts
const enc = new TextEncoder();
const dec = new TextDecoder();

export const DEFAULT_ITERATIONS = 250_000;

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2 (SHA-256).
 * Ensures `salt` is a concrete ArrayBuffer to satisfy Web Crypto's BufferSource typing.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array | ArrayBuffer,
  iterations = DEFAULT_ITERATIONS
) {
  // Prepare raw passphrase bytes (workaround in case your DOM lib types complain about ArrayBufferLike).
  const passBytes = enc.encode(passphrase);
  const passBuf: ArrayBuffer = passBytes.buffer.slice(0); // concrete ArrayBuffer

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passBuf, // BufferSource (ArrayBuffer) avoids generics mismatch
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Normalize `salt` to a concrete ArrayBuffer for Pbkdf2Params.salt
 
  const saltView = salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  const saltBuf = new ArrayBuffer(saltView.byteLength);
  new Uint8Array(saltBuf).set(saltView);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBuf,       // BufferSource backed by ArrayBuffer
      iterations,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function randIV() {
  return crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
}

export async function encryptJSON(key: CryptoKey, obj: unknown) {
  const iv = randIV();
  const data = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

export async function decryptJSON<T>(key: CryptoKey, ivArr: number[], ctArr: number[]): Promise<T> {
  const iv = new Uint8Array(ivArr);
  const ct = new Uint8Array(ctArr);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(new Uint8Array(pt))) as T;
}
