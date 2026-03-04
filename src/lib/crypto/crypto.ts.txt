// src/lib/crypto/crypto.ts
import type { Encrypted } from '../data/types';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Live vault KDF (unchanged) */
export const DEFAULT_ITERATIONS = 250_000;
/** Stronger KDF used ONLY for exported files (offline resistance) */
export const EXPORT_KDF_ITERATIONS = 600_000;

/** Ensure we have a concrete ArrayBuffer (not just ArrayBufferLike/SharedArrayBuffer) */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Clone into a fresh ArrayBuffer to satisfy strict WebCrypto typings
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

/** Accepts common array shapes and returns Uint8Array. */
function toU8(src: number[] | Uint8Array | ArrayBuffer): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  return new Uint8Array(src as number[]);
}

/** Base64 helpers for compact export packages */
function u8ToB64(u8: Uint8Array): string {
  return btoa(String.fromCharCode(...u8));
}
function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2 (SHA-256).
 * All inputs are normalized to ArrayBuffer to avoid TS lib.dom BufferSource issues.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array | ArrayBuffer,
  iterations = DEFAULT_ITERATIONS
) {
  // Passphrase → ArrayBuffer
  const passBytes = enc.encode(passphrase);
  const passBuf: ArrayBuffer = passBytes.buffer.slice(0);

  const baseKey = await crypto.subtle.importKey('raw', passBuf, 'PBKDF2', false, ['deriveKey']);

  // Salt → ArrayBuffer
  const saltView = salt instanceof Uint8Array ? salt : new Uint8Array(salt);
  const saltBuf = toArrayBuffer(saltView);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuf, iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function randIV() {
  return crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
}

/**
 * Encrypts arbitrary JSON with AES-GCM.
 * Feeds WebCrypto a real ArrayBuffer for data and a cloned Uint8Array for iv.
 */
export async function encryptJSON(key: CryptoKey, obj: unknown): Promise<Encrypted> {
  const ivU8 = crypto.getRandomValues(new Uint8Array(12));
  const ivForParams = new Uint8Array(ivU8.buffer.slice(0)); // ensure ArrayBuffer-backed view

  const dataU8 = enc.encode(JSON.stringify(obj));
  const dataBuf = dataU8.buffer.slice(0); // concrete ArrayBuffer

  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivForParams }, key, dataBuf);
  const ctU8 = new Uint8Array(ctBuf);

  return { v: 2, iv: Array.from(ivU8), ct: Array.from(ctU8) };
}

/**
 * Robust AES-GCM decrypt for JSON payloads.
 * Normalizes iv/ct and hands ArrayBuffers to WebCrypto to satisfy strict typings.
 */
export async function decryptJSON<T>(
  key: CryptoKey,
  ivArr: number[] | Uint8Array | ArrayBuffer,
  ctArr: number[] | Uint8Array | ArrayBuffer,
  opts?: { label?: string }
): Promise<T> {
  try {
    if (!key) throw new Error('Missing CryptoKey');

    const ivU8 = toU8(ivArr);
    if (ivU8.length !== 12) throw new Error(`Bad AES-GCM IV length: ${ivU8.length} (expected 12)`);

    const ctU8 = toU8(ctArr);
    if (ctU8.length < 16) throw new Error(`Ciphertext too short: ${ctU8.length} (expected ≥ 16 incl. tag)`);

    const ivForParams = new Uint8Array(toArrayBuffer(ivU8)); // ensure concrete ArrayBuffer
    const ctBuf = toArrayBuffer(ctU8);

    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivForParams }, key, ctBuf);
    const jsonText = dec.decode(new Uint8Array(ptBuf));
    return JSON.parse(jsonText) as T;
  } catch (err: any) {
    const where = opts?.label ? `decryptJSON(${opts.label})` : 'decryptJSON';
    const msg = err?.message ?? String(err);
    throw new Error(`${where} failed: ${msg}`);
  }
}

/**
 * Self-contained encrypted export package (compact Base64 iv/cipher).
 * Uses EXPORT_KDF_ITERATIONS (600k) to harden offline cracking of exported files.
 */
export async function createEncryptedPackage(obj: unknown, pass: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = EXPORT_KDF_ITERATIONS;
  const key = await deriveKey(pass, salt, iterations);

  const sealed = await encryptJSON(key, obj); // returns arrays
  const ivB64 = u8ToB64(toU8(sealed.iv as any));
  const ctB64 = u8ToB64(toU8(sealed.ct as any));

  return {
    version: 1,
    kdf: { type: 'PBKDF2', hash: 'SHA-256', iterations, salt: Array.from(salt) },
    iv: ivB64,
    cipher: ctB64,
  };
}

/** Decrypts a Base64-only export package produced by createEncryptedPackage(...) */
export async function decryptPackage<T = unknown>(pkg: {
  version: number;
  kdf: { type: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: number[] };
  iv: string;        // base64
  cipher: string;    // base64
}, pass: string): Promise<T> {
  if (!pkg) throw new Error('Invalid package: empty');
  if (!pkg.cipher || !pkg.iv) throw new Error('Invalid package: missing iv/cipher');
  if (!pkg.kdf?.salt) throw new Error('Invalid package: missing kdf.salt');

  const saltU8 = toU8(pkg.kdf.salt);
  const ivU8 = b64ToU8(pkg.iv);
  const ctU8 = b64ToU8(pkg.cipher);

  const iterations = pkg.kdf?.iterations ?? EXPORT_KDF_ITERATIONS;
  const key = await deriveKey(pass, saltU8, iterations);

  // Hand ArrayBuffers to WebCrypto
  const ivForParams = new Uint8Array(toArrayBuffer(ivU8));
  const ctBuf = toArrayBuffer(ctU8);

  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivForParams }, key, ctBuf);
  const json = dec.decode(new Uint8Array(ptBuf));
  return JSON.parse(json) as T;
}