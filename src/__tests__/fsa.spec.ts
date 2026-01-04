
// src/__tests__/fsa.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { saveBlobFallback } from '../lib/io/fsa';

describe('saveBlobFallback', () => {
  it('creates an <a> and revokes blob URL', async () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      if (tag === 'a') (el as any).click = clickSpy;
      return el;
    });
    const blob = new Blob(['{}'], { type: 'application/json' });
    await saveBlobFallback(blob, 'vault.mvault');
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });
});
