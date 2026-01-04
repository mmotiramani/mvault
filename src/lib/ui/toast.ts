
// src/lib/ui/toast.ts
import { writable } from 'svelte/store';

export type Toast = { id: number; text: string; kind?: 'info'|'success'|'error'; ttl?: number };
export const toasts = writable<Toast[]>([]);

let nextId = 1;
export function showToast(text: string, kind: Toast['kind'] = 'info', ttl = 4000) {
  const id = nextId++;
  toasts.update(list => [...list, { id, text, kind, ttl }]);
  setTimeout(() => {
    toasts.update(list => list.filter(t => t.id !== id));
  }, ttl);
}
