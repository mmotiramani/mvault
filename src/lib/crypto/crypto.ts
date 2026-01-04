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

/**
 * Create a full encrypted package from a passphrase and object.
 * Produces { version, kdf: { type, iterations, salt }, iv, cipher }
 */
export async function createEncryptedPackage(obj: unknown, pass: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = DEFAULT_ITERATIONS;
  const key = await deriveKey(pass, salt, iterations);
  const { iv, ct } = await encryptJSON(key, obj);
  return {
    version: 1,
    kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations, salt: Array.from(salt) },
    iv,
    cipher: ct, // use 'cipher' (array) for compatibility with importer
  };
}

export async function decryptJSON(pkg: any, pass: string) {
  if (!pkg) throw new Error('Invalid package: empty');

  function toUint8Array(input: any): Uint8Array {
    if (input == null) throw new Error('Missing binary data');
    if (Array.isArray(input)) return new Uint8Array(input);
    if (typeof input === 'string') {
      try {
        const bin = atob(input);
        return Uint8Array.from(bin, c => c.charCodeAt(0));
      } catch {
        if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0) {
          const out = new Uint8Array(input.length / 2);
          for (let i = 0; i < out.length; i++) out[i] = parseInt(input.substr(i * 2, 2), 16);
          return out;
        }
        throw new Error('Unable to parse binary data');
      }
    }
    throw new TypeError('Invalid binary input');
  }

  // Accept either `cipher` (preferred) or `ct` (legacy)
  const cipherField = pkg.cipher ?? pkg.ct;
  if (!cipherField) throw new Error('Invalid package format: missing cipher');
  if (!pkg.kdf?.salt) throw new Error('Invalid package format: missing kdf salt');

  try {
    const salt = toUint8Array(pkg.kdf.salt);
    const iv = toUint8Array(pkg.iv);
    const ct = toUint8Array(cipherField);
    const iterations = pkg.kdf?.iterations ?? DEFAULT_ITERATIONS;
    const key = await deriveKey(pass, salt, iterations);
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    return JSON.parse(dec.decode(pt));
  } catch (e) {
    console.error('decryptJSON error', e);
    throw new Error('Decryption failed: incorrect passphrase or corrupted package');
  }
}
