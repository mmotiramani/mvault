
// src/lib/utils/passwords.ts

// ---------- Password generator (same in both drawers) ----------
  let showGen = false;
  let genUpper = true;
  let genLower = true;
  let genDigits = true;      // digits 2–9 (no 0/1 if avoid ambiguous)
  let genSymbols = true;     // symbols !@#$
  let genAvoidAmbig = true;  // avoid similar-looking chars
  let genLen = 16;

  const CHAR = {
    U: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    L: 'abcdefghijklmnopqrstuvwxyz',
    D: '23456789',           // 2–9 per your earlier text
    S: '!@#$'
  };
  const AMBIG = new Set(['O','0','I','l','1','S','5','B','8','G','6','Z','2','o','s']); // conservative

  function buildCharset() {
    let set = '';
    if (genUpper) set += CHAR.U;
    if (genLower) set += CHAR.L;
    if (genDigits) set += CHAR.D;
    if (genSymbols) set += CHAR.S;
    if (genAvoidAmbig && set) {
      set = Array.from(set).filter(c => !AMBIG.has(c)).join('');
    }
    return set;
  }


  function generatePasswordInDrawer() {
    const charset = buildCharset();
    if (!charset) return;
    const arr = new Uint32Array(genLen);
    crypto.getRandomValues(arr);
    let out = '';
    for (let i = 0; i < genLen; i++) {
      out += charset[arr[i] % charset.length];
    }
    //password = out;
    // write back & dirty
    //if (entry?.payload) entry.payload.password = password;
    //dispatch('dirty');
  }

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
