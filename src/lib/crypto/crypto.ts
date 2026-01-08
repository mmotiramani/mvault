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



/** Accepts common array shapes and returns Uint8Array. */
function toUint8(src: number[] | Uint8Array | ArrayBuffer | ArrayLike<number>): Uint8Array {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (Array.isArray(src) || (src && typeof (src as any).length === 'number')) {
    const len = (src as ArrayLike<number>).length as number;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = ((src as ArrayLike<number>)[i] as number) & 0xff;
    return out;
  }
  throw new TypeError('Unsupported buffer source for toUint8');
}


/**
 * Robust AES-GCM decrypt for JSON payloads.
 * Encryption side uses: IV=12 bytes, NO AAD, tag appended in ct.
 */
export async function decryptJSON<T>(
  key: CryptoKey,
  ivArr: number[] | Uint8Array | ArrayBuffer,
  ctArr: number[] | Uint8Array | ArrayBuffer,
  opts?: { label?: string }   // optional: pass item id/name for better error messages
): Promise<T> {
  try {
    if (!key) throw new Error('Missing CryptoKey');

    // Normalize to Uint8Array
    const iv = ivArr instanceof Uint8Array
      ? ivArr
      : ivArr instanceof ArrayBuffer
      ? new Uint8Array(ivArr)
      : new Uint8Array(ivArr as number[]);

    if (iv.length !== 12) {
      throw new Error(`Bad AES-GCM IV length: ${iv.length} (expected 12)`);
    }

    const ct = ctArr instanceof Uint8Array
      ? ctArr
      : ctArr instanceof ArrayBuffer
      ? new Uint8Array(ctArr)
      : new Uint8Array(ctArr as number[]);

    if (ct.length < 16) {
      // GCM outputs ciphertext + 16-byte tag; anything shorter is invalid/corrupt
      throw new Error(`Ciphertext too short: ${ct.length} (expected ≥ 16 incl. tag)`);
    }

    // No additionalData (AAD) on encrypt side, so none here
    // Create a concrete ArrayBuffer to avoid SharedArrayBuffer typing issues
    const ctBuf = new ArrayBuffer(ct.byteLength);
    new Uint8Array(ctBuf).set(ct);
    const ivBuf = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivBuf).set(iv);
    const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(ivBuf) }, key, ctBuf);
    const jsonText = dec.decode(new Uint8Array(ptBuf));
    return JSON.parse(jsonText) as T;
  } catch (err: any) {
    const where = opts?.label ? `decryptJSON(${opts.label})` : 'decryptJSON';
    const msg = err?.message || String(err);
    throw new Error(`${where} failed: ${msg}`);
  }
}

/*
export async function decryptJSON<T>(key: CryptoKey, ivArr: number[], ctArr: number[]): Promise<T> {
  const iv = new Uint8Array(ivArr);
  const ct = new Uint8Array(ctArr);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(new Uint8Array(pt))) as T;
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
*/