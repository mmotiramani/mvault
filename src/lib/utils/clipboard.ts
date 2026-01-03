
// src/lib/utils/clipboard.ts
export async function copyWithTemporaryOverwrite(secret: string, ms: number) {
  try {
    await navigator.clipboard.writeText(secret);
    window.setTimeout(async () => {
      try { await navigator.clipboard.writeText(''); } catch { /* ignore */ }
    }, ms);
  } catch (e) {
    console.warn('Clipboard error:', e);
  }
}
``
