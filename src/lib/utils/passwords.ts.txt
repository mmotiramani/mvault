
// src/lib/utils/password.ts
export type PwdOpts = {
  length?: number;
  upper?: boolean;
  lower?: boolean;
  digits?: boolean;
  symbols?: boolean;
  avoidAmbiguous?: boolean; // 0,O,l,1,5,S,2,Z etc.
};

export function generatePassword({
  length = 20, upper = true, lower = true, digits = true, symbols = true, avoidAmbiguous = true
}: PwdOpts = {}) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const a = 'abcdefghijkmnopqrstuvwxyz';
  const d = '23456789';
  const s = '!@#$%^&*()-_=+[]{};:,.?/';

  const AMB_U = 'IO';
  const AMB_L = 'lo';
  const AMB_D = '01';
  const AMB_S = '|`\'"\\<>';

  let pool = '';
  if (upper) pool += A + (avoidAmbiguous ? '' : AMB_U);
  if (lower) pool += a + (avoidAmbiguous ? '' : AMB_L);
  if (digits) pool += d + (avoidAmbiguous ? '' : AMB_D);
  if (symbols) pool += s + (avoidAmbiguous ? '' : AMB_S);

  if (!pool) pool = a + d;

  const out: string[] = [];
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out.push(pool[bytes[i] % pool.length]);
  return out.join('');
}
