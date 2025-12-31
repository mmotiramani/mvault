
// src/lib/passwords.ts
export function generatePassword(len = 20, symbols = true) : string{
  const alpha = 'abcdefghijklmnopqrstuvwxyz';
  const ALPHA = alpha.toUpperCase();
  const digits = '0123456789';
  const sym = '!@#$%^&*()-_=+[]{};:,.<>?';
  const charset = alpha + ALPHA + digits + (symbols ? sym : '');
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += charset[arr[i] % charset.length];
  }
  return out;
}
``
