// ItemDrawer.svelte

<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { copyWithTemporaryOverwrite } from '../lib/utils/clipboard';
  import TagChips from './TagChips.svelte';
  import type { VaultItem, VaultItemPayload } from '../lib/data/types';

  // NEW imports for saving notes
  import { updateItem, updateItemPayload, validatePayload } from '../lib/data/store';
  import { session, refreshTags } from '../lib/app/session';
  import { get } from 'svelte/store';
  import { decryptJSON } from '../lib/crypto/crypto';
  import { showToast } from '../lib/ui/toast';

  // >>> NEW: reveal store & helpers
  import { revealedId, toggleReveal, hideAll, attachRevealAutoHideHandlers } from '../lib/ui/reveal';

  export let selectedId: string | null;
  export let entries: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  //export let item: VaultItem; // incoming item (for consistency with your props)

  // If not already declared, declare entry like this:
  export let entry: { item: VaultItem; payload: VaultItemPayload } | null | undefined;

  // Add this reactive derived id:
  $: entryId = entry?.item.id ?? '';

   // Local entry (selected)
  $: entry = entries.find((e) => e.item.id === selectedId);
 

  // Keep a snapshot of the original payload, 
  // This snapshot is used to restore all fields on Cancel
  let original: VaultItemPayload | null = null;
  let lastLoadedId: string | null = null;

  // Whenever the selected entry changes, capture a fresh snapshot
  $: if (entry?.item?.id && entry.item.id !== lastLoadedId) {
    original = structuredClone(entry.payload);
    lastLoadedId = entry.item.id;
    // (Optional) also initialize UI fields from entry.payload here if you don’t already do that.
  }

  //helper to reset all local fields from the snapshot
  function resetFieldsFromOriginal() {
    if (!original) return;
    name = original.name;
    username = original.username;
    password = original.password;
    url = original.url ?? '';
    tags = [...(original.tags ?? [])];
    notes = original.notes ?? '';
  }


 // Events
  const dispatch = createEventDispatcher<{ close: void; updated: { id: string; item: VaultItem; payload: VaultItemPayload } }>();

  
  const s = get(session);
  let key: CryptoKey | null = get(session).key;
  // key = s.key;
  // Session key
  const unsubSession = session.subscribe(ss => (key = ss.key));


  // Editable fields (bind to inputs)

  //let key: CryptoKey | null = null;
  let name = '';
  let username = '';
  let password = '';
  let url = '';
  let tags: string[] = [];
  let notes = '';

  // UI State
  let loading = true;
  let saving = false;
  let errorMsg = '';
  let fieldErrors: Record<string, string> = {};
  let isDirty = false;


 
// Initialize form when entry changes
  $: if (entry) {
    name = entry.payload.name ?? '';
    username = entry.payload.username ?? '';
    password = entry.payload.password ?? '';
    url = entry.payload.url ?? '';
    tags = (entry.payload.tags ?? []).slice();
    notes = entry.payload.notes ?? '';
    fieldErrors = {};
    isDirty = false;
  }

  
  // Attach global auto-hide handlers (use your preferred timeout; you used 8000ms)
  const REVEAL_MS = 8000;
  let detachReveal: (() => void) | null = null;
  onMount(() => { detachReveal = attachRevealAutoHideHandlers(REVEAL_MS); });
  onDestroy(() => { detachReveal?.(); unsubSession(); });

  function ensureVisible(e: FocusEvent) {
    (e.target as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
  }


  function markDirty() {
    isDirty = true;
    validate();
  }

  function validate() {
    fieldErrors = {};
    const errs = validatePayload({ name, username, password, url, tags, notes });
    for (const e of errs) fieldErrors[e.field] = e.message;
  }


  // Tag helpers (mirror TagChips)
  function onTagsChanged(ev: CustomEvent<VaultItemPayload>) {
    const next = ev.detail;
    tags = (next.tags ?? []).slice();
    isDirty = true;
    validate();
    // also update local entry.view so chips reflect
    entry = { ...entry!, payload: { ...entry!.payload, tags } };
  }

  // Copy helpers
  async function onCopyPassword() {
    if (password) await copyWithTemporaryOverwrite(password, 15_000);
  }
 

  async function onSave() {
    if (!entry) return;
    if (!key) { showToast('Unlock the vault to save.', 'error'); return; }

    validate();
    if (Object.keys(fieldErrors).length) {
      showToast('Fix validation errors', 'error');
      return;
    }

    saving = true;
    try {
      const next: VaultItemPayload = { name, username, password, url, tags, notes };
      const updatedItem = await updateItemPayload(entry.item, next, key);

      // Keep local view in sync
      entry = { item: updatedItem, payload: next };
      isDirty = false;
      hideAll();           // re-mask password
      // refreshTag already ahppenign in updateItem hecne no need here.
      // await refreshTags(); // recompute tag cache

      // Notify parent in case it needs to refresh list
      dispatch('updated', { id: updatedItem.id, item: updatedItem, payload: next });
      showToast('Saved', 'success');
    } catch (e: any) {
      console.error(e);
      showToast(e?.code === 'invalid-payload' ? 'Invalid input' : 'Save failed', 'error');
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    if (!entry) return;
    // Reset to original payload

  resetFieldsFromOriginal();
    isDirty = false;     // if you derive `isDirty` reactively, ensure it updates from fields above
    hideAll();           // re-mask password / sensitive bits
    dispatch('close');   // let the parent close the drawer or clear `selectedId`
    /*
    name = entry.payload.name ?? '';
    username = entry.payload.username ?? '';
    password = entry.payload.password ?? '';
    url = entry.payload.url ?? '';
    tags = (entry.payload.tags ?? []).slice();
    notes = entry.payload.notes ?? '';
    */
    fieldErrors = {};

  }

  async function onCopy() {
    if (entry) await copyWithTemporaryOverwrite(entry.payload.password, 15_000);
  }

  // ------------ URL helpers ------------
  function normalizedHref(u?: string) {

    if (!u) return '';
    try { return new URL(u, location.origin).href; }
    catch { return `https://${u}`; }

/*    if (!u) return '';
    try {
      const url = new URL(u, location.origin);
      return url.href;
    } catch {
      return `https://${u}`;
    }
  */
    }

  async function onCopyUrl() {
    if (url) await copyWithTemporaryOverwrite(url, 8_000);
   /*    if (entry?.payload.url) {
      await copyWithTemporaryOverwrite(entry.payload.url, 8_000);
    }
   */
  }

  // ------------ Notes editing ------------
  //let notes = '';
  $: notes = entry?.payload?.notes ?? '';

  function debounce<T extends (...args: any[]) => void>(fn: T, wait = 600) {
    let t: number | null = null;
    return (...args: Parameters<T>) => {
      if (t) clearTimeout(t);
      t = window.setTimeout(() => fn(...args), wait);
    };
  }

  const saveNotesDebounced = debounce(async () => {
    if (!entry) return;
    const key = get(session).key!;
    const updated = { ...entry.payload, notes };
    await updateItem<VaultItemPayload>(key, entry.item, updated);
    // keep local view in sync
    entry = { ...entry, payload: updated };
    await refreshTags(); // refresh tag cache if tags can change elsewhere
  });
</script>



<section class="drawer">
  {#if !entry}
    <div class="empty">Select an entry</div>
  {:else}
    <header>
      <h2>Name : {entry.payload.name}</h2>
      <button class="close" on:click={() => dispatch('close')}>Close</button>
      <!-- button class="close" on:click={() => dispatch('close')}>Close</button -->
    </header>

   <div>
      <!-- Editable Name -->
      <input
        class="title-input"
        type="text"
        bind:value={name}
        on:input={markDirty}
        placeholder="Entry name"
        aria-label="Entry name"
      />
    </div>
    <div class="field">
      <label>Username</label>
      <input
        type="text"
        bind:value={username}
        on:input={markDirty}
        autocomplete="username"
        placeholder="Username"
      />
    </div>

    <div class="field">
      <label>Password</label>
      <div class="pw">
        <input
          type={$revealedId === entryId ? 'text' : 'password'}
          bind:value={password}
          on:input={markDirty}
          on:blur={() => hideAll()}
        />
        <!-- Toggle on press-and-hold: reveal on press, hide on release/leave -->
        <!-- button
          aria-pressed={$revealedId === entry.item.id}
          on:mousedown={() => toggleReveal(entry.item.id, { autoHideMs: REVEAL_MS })}
          on:mouseup={hideAll}
          on:mouseleave={hideAll}
          on:touchstart={() => toggleReveal(entry.item.id, { autoHideMs: REVEAL_MS })}
          on:touchend={hideAll}
          title="Hold to reveal"
        >👁️</button -->

        <!-- Toggle on click: reveal on click, -->
        <button
          aria-pressed={$revealedId === entryId}
          on:click={() => entryId && toggleReveal(entryId, { autoHideMs: REVEAL_MS })}
          title="Click to reveal"
        >👁️</button>
        <button on:click={onCopyPassword} title="Copy password">📋</button>
      </div>
      {#if $revealedId === entryId}
        <small>Auto-hides in {REVEAL_MS/1000}s or on tab blur.</small>
      {/if}
    </div>

    <!-- NEW: URL -->
    <div class="field">
      <label>URL</label>
      <div class="url">
        <input 
          type="text"
          bind:value={url}
          on:input={markDirty}
          on:focus={ensureVisible}
          placeholder="https://example.com"
        />
        <a
          class="btn"
          href={normalizedHref(url)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open URL"
          aria-disabled={!url}
          on:click={(e) => { if (!url) e.preventDefault(); }}
        >Open</a>
        <button on:click={onCopyUrl} title="Copy URL" disabled={!url}>📋</button>
      </div>
      {#if fieldErrors.url}<small class="error">{fieldErrors.url}</small>{/if}
    </div>

    <div class="field">
      <label>Tags</label>
      <TagChips bind:tags on:change={() => { isDirty = true; }} />
      <!-- TagChips 
            item={entry.item} 
            payload={{ ...entry.payload, tags }}
            on:changed={onTagsChanged}/ -->
        <!--</TagChips>>    payload={entry.payload} 
            on:changed={(e) => entry = { ...entry!, payload: e.detail }} --> 
    </div>

    <!-- NEW: Notes -->
    <div class="field">
      <label>Notes</label>
      <textarea
        bind:value={notes}
        rows="6"
        maxlength="4000"
        on:focus={ensureVisible}
        on:input={markDirty}
        placeholder="Add notes (up to ~4000 chars)"
      />
      <small>{(notes || '').length}/4000</small>
      {#if fieldErrors.notes}<small class="error">{fieldErrors.notes}</small>{/if}
    </div>


    <!-- Validation messages (name/url shown near fields) -->
    {#if fieldErrors.name}<div class="error">Name: {fieldErrors.name}</div>{/if}
    <!-- Actions -->
    <footer class="mv-drawer-actions">
      <button class="btn ghost"    on:click={onCancel} disabled={saving}>Cancel</button>
      <button class="btn primary"  on:click={onSave}   disabled={!isDirty || saving || Object.keys(fieldErrors).length > 0}>
        {saving ? 'Saving…' : 'Save'}</button>
    </footer>

    <!-- Actions 
    <div class="actions">
      <button class="secondary" on:click={onCancel}>Cancel</button>
      <button class="primary" on:click={onSave} disabled={!isDirty || saving || Object.keys(fieldErrors).length > 0}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
    -->
  {/if}
</section>


<style>
  .drawer { padding: 1rem; overscroll-behavior: contain; }
  header { display:flex; justify-content:space-between; align-items:center; gap:.75rem; }
  .title-input {
    flex: 1;
    padding:.5rem;
    border:1px solid #2a2a2a;
    border-radius:6px;
    background:#1f1f1f; color:#ddd;
    font-size:1rem; font-weight:600;
  }

  .field { display:grid; gap:.25rem; margin:.75rem 0; }
  .pw { display:flex; gap:.5rem; align-items:center; }
  .url { display:flex; gap:.5rem; align-items:center; }

  input, textarea { padding:.5rem; border:1px solid #2a2a2a; border-radius:6px; background:#1f1f1f; color:#ddd; }
  textarea { resize: vertical; }

  .btn { padding:.4rem .6rem; border-radius:6px; background:#2a2a2a; color:#ddd; text-decoration:none; }
  .btn[aria-disabled="true"] { pointer-events:none; opacity:0.5; }

  .actions { display:flex; gap:.5rem; justify-content:flex-end; margin-top: 1rem; }
  .error { color:#b00020; }


  .mv-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem;
    justify-content: flex-end;
    margin-block: .5rem 1rem;
  }

  .mv-drawer-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: .5rem;
    justify-content: flex-end;
    padding: .75rem .5rem;
    background: var(--surface, #fff);
    border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }

  .btn {
    appearance: none;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: .5rem;
    padding: .5rem .75rem;
    font: inherit;
    background: transparent;
    cursor: pointer;
  }
  .btn.ghost   { background: transparent; }
  .btn.primary { background: var(--accent, #2563eb); color: white; border-color: transparent; }
  .btn:disabled { opacity: .6; cursor: default; }
</style>

