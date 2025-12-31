
// src/lib/sodium.ts
let sodiumPromise: Promise<any> | null = null;

export async function getSodium() : Promise<any> {
  if (!sodiumPromise) {
    sodiumPromise = (async () => {
      const mod = await import('libsodium-wrappers-sumo');
      await mod.default.ready;
      return mod.default;
    })();
  }
  console.log('sodium ready; has xchacha?', !!sodiumPromise.crypto_aead_xchacha20poly1305_ietf_encrypt);
  return sodiumPromise;
}
