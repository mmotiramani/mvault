
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

  let selectedId: string | null;
  let entries: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  //export let item: VaultItem; // incoming item (for consistency with your props)

  // If not already declared, declare entry like this:
  export let entry: { item: any; payload: any } | null;
  export let entryId: string;   // used by your reveal logic
  
 let allTags: string[] = []; // pass from parent or compute


  // Props provided by parent
//  export let entry;     // { payload: { name, username, password, url, tags, notes, ... }, ... }
  export let fieldErrors: { name?: string; url?: string; notes?: string ;tags?: string; username?: string } = {};
  //name, username, password, url, tags, notes
  export let saving: boolean = false;     // parent controls while persisting

  const dispatch = createEventDispatcher();


  // Local editable copies (re-init when a different entry loads)
  let username = '';
  let name = '';
  
  let password = '';
  let url      = '';
  let notes    = '';
   // Tags: local copy bound to TagChips; write back on change
  let tags: string[] = [];

  $: if (entry?.payload) {
    name = entry.payload.name ?? '';
    username = entry.payload.username ?? '';
    password = entry.payload.password ?? '';
    url      = entry.payload.url ?? '';
    notes    = entry.payload.notes ?? '';
    tags     = entry.payload.tags ?? [];
  }

 
  //$: if (entry?.payload) tags = entry.payload.tags ?? [];
  $: allTags = $session.allTags ?? [];


  // ---------- Helpers ----------
  function onFieldInput(field: 'username'|'password'|'url'|'notes'|'name', value: string) {
    if (!entry?.payload) return;
    entry.payload[field] = value;
    if (field === 'password') password = value;
    if (field === 'url') url = value;
    if (field === 'username') username = value;
    if (field === 'name') name = value;
    if (field === 'notes') notes = value;
    dispatch('dirty');
  }

  function onTagsChange() {
    if (entry?.payload) entry.payload.tags = tags;
    dispatch('dirty');
  }

  const close = () => dispatch('close');
  const save  = () => dispatch('save');

  function normalizedHref(raw: string) {
    if (!raw) return '#';
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    return hasScheme ? raw : `https://${raw}`;

  /* 
  method 2
   if (!u) return '';
    try { return new URL(u, location.origin).href; }
    catch { return `https://${u}`; }

    method 3
   if (!u) return '';
    try {
      const url = new URL(u, location.origin);
      return url.href;
    } catch {
      return `https://${u}`;
    }
  */
  }

    // ------------ URL helpers ------------
  

  async function copyToClipboard(text: string) {
    try { await navigator.clipboard?.writeText(text); } catch {}
  }

  

  // Add this reactive derived id:
  $: entryId = entry?.item.id ?? '';

   // Local entry (selected)
  //$: entry = entries.find((e) => e.item.id === selectedId);
 

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
 // const dispatch = createEventDispatcher<{ close: void; updated: { id: string; item: VaultItem; payload: VaultItemPayload } }>();

  
  const s = get(session);
  let key: CryptoKey | null = get(session).key;
  // key = s.key;
  // Session key
  const unsubSession = session.subscribe(ss => (key = ss.key));


  // Editable fields (bind to inputs)

  //let key: CryptoKey | null = null;
  //let name = '';
  //let username = '';
  //let password = '';
  //let url = '';
  //let tags: string[] = [];
  //let notes = '';

  // UI State
  let loading = true;
//  let saving = false;
  let errorMsg = '';
  //let fieldErrors: Record<string, string> = {};
  let isDirty = false;


 
// Initialize form when entry changes
  $: if (entry?.payload) {
    name = entry.payload.name ?? '';
    username = entry.payload.username ?? '';
    password = entry.payload.password ?? '';
    url = entry.payload.url ?? '';
    const incoming = entry.payload.tags ?? [];
    // Only copy if different (avoids loops)
    if (JSON.stringify(incoming) !== JSON.stringify(tags)) {
      tags = [...incoming];
    }
    //tags = (entry.payload.tags ?? []).slice();
    notes = entry.payload.notes ?? '';
    fieldErrors = {};
    isDirty = false;
  }


  // Keep payload in sync with local edits
  $: if (entry?.payload) {
    entry.payload.tags = tags;
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
    // temporary commenting : for (const e of errs) fieldErrors[e.field] = e.message;
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


  // TEMP DEBUG — log when entry and allTags change
  $: console.debug('[ItemDrawer] entry name =', entry?.payload?.name);
  $: console.debug('[ItemDrawer] allTags length =', allTags?.length, allTags?.slice?.(0, 10));

</script>



<section class="drawer">
  {#if !entry}
    <div class="empty">Select an entry</div>
  {:else}
    <header>
      <h2>Name : {entry.payload.name}</h2>
      <button class="close" 
        on:click={() => dispatch('close')}> X </button>
      {#if fieldErrors?.name}<div class="error">{fieldErrors.name}</div>{/if}
      <!-- button class="close" on:click={() => dispatch('close')}>Close</button -->
    </header>

   <div>
      <!-- Editable Name -->
      <input
        class="title-input"
        type="text"
        bind:value={name}
        on:input={(e) => onFieldInput('name', (e.target as HTMLInputElement).value)}
        placeholder="Entry name"
        aria-label="Entry name"
      />
    </div>
    <div class="field">
      <label>Username</label>
      <input
        type="text"
        bind:value={username}
        on:input={(e) => onFieldInput('username', (e.target as HTMLInputElement).value)}
        autocomplete="username"
        placeholder="Username"
        aria-label="Entry username"
      />
    </div>

    <div class="field">
      <label>Password</label>
      <div class="pw">
        <input
          type={$revealedId === entryId ? 'text' : 'password'}
          bind:value={password}
          on:input={(e) => onFieldInput('password', (e.target as HTMLInputElement).value)}
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

  <section class="field">
    <label for="url">URL</label>
    <div class="row">
      <input id="url" class="text"
        bind:value={url}
        on:input={(e) => onFieldInput('url', (e.target as HTMLInputElement).value)}
        inputmode="url" enterkeyhint="go" />
      <a class="btn" href={normalizedHref(url)} on:click={(e) => { if (!url) e.preventDefault(); }}>Open</a>
      <button class="btn" type="button" on:click={() => copyToClipboard(url)} disabled={!url}>Copy</button>
    </div>
    {#if fieldErrors?.url}<div class="error">{fieldErrors.url}</div>{/if}
  </section>

  <section class="field">
    <label for="tags">Tags</label>
    <TagChips bind:tags={tags} {allTags} on:change={onTagsChange} />
  </section>

  <section class="field">
    <label for="notes">Notes</label>
    <textarea id="notes" class="notes"
      bind:value={notes}
      on:input={(e) => onFieldInput('notes', (e.target as HTMLTextAreaElement).value)}
      maxlength={4000} rows={6} />
    <div class="muted">{(notes ?? '').length}/4000</div>
    {#if fieldErrors?.notes}<div class="error">{fieldErrors.notes}</div>{/if}
  </section>


    <!-- NEW: URL -->
    <!-- div class="field">
      <label>URL</label>
      <div class="url">
        <input 
          type="text"
          bind:value={url}
          on:input={markDirty}
          on:input={(e) => onFieldInput('url', (e.target as HTMLInputElement).value)}
                inputmode="url" enterkeyhint="go" />
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
      <TagChips
        bind:tags={tags}
        {allTags}
        on:change={() => {onTagsChange
          // push local edits back to payload
          //if (entry?.payload) entry.payload.tags = tags;
          //isDirty = true;
        }}
      /-->
      <!-- TagChips bind:tags on:change={() => { isDirty = true; }} / -->
      <!-- TagChips 
            item={entry.item} 
            payload={{ ...entry.payload, tags }}
            on:changed={onTagsChanged}/ -->
        <!--</TagChips>>    payload={entry.payload} 
            on:changed={(e) => entry = { ...entry!, payload: e.detail }} --> 
    <!--/div -->

    <!-- NEW: Notes -->
    <!--div class="field">
      <label>Notes</label>
      <textarea
        bind:value={notes}
        rows="6"
        maxlength="4000"
        on:focus={ensureVisible}
        on:input={(e) => onFieldInput('notes', (e.target as HTMLTextAreaElement).value)}
        placeholder="Add notes (up to ~4000 chars)"
      />
      <small>{(notes || '').length}/4000</small>
      {#if fieldErrors.notes}<small class="error">{fieldErrors.notes}</small>{/if}
    </div -->


    <!-- Validation messages (name/url shown near fields) -->
    {#if fieldErrors.name}<div class="error">Name: {fieldErrors.name}</div>{/if}
    <!-- Actions -->
    <footer class="mv-drawer-actions">
 
      <button class="btn secondary" on:click={close}>Cancel</button>
      <button class="btn primary" on:click|preventDefault={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>

    <!--button class="btn ghost"    on:click={onCancel} disabled={saving}>Cancel</button>
      <button class="btn primary"  on:click={onSave}   disabled={!isDirty || saving || Object.keys(fieldErrors).length > 0}>
        {saving ? 'Saving…' : 'Save'}</button -->
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

/* ✅ Opaque background so list never shows through */
  .itemdrawer {
    background: var(--surface, #111);
    color: var(--text, #eee);
  }

  /* ✅ Laptop/desktop: behave INLINE (no overlay) */
  @media (min-width: 700px) {
    .itemdrawer {
      position: static;                /* behave like normal content */
      inset: auto;
      z-index: 0;                      /* don't cover the list */
      box-shadow: none;                /* rely on container's visuals */
      border-left: 1px solid var(--field-border, #2a2a2a);
      border-radius: 8px;
      max-height: calc(100dvh - 2rem); /* adjust for outer padding */
      overflow: auto;                  /* drawer content scrolls */
      padding: .75rem;
    }
  }

  /* ✅ Mobile: overlay is fine (full-screen) */
  @media (max-width: 699px) {
    .itemdrawer {
      position: fixed;
      inset: 0;
      z-index: 100;                    /* above the list on phones */
      max-height: none;
      overflow: auto;
      border: 0;
      border-radius: 0;
    }
  }

 :global(.drawer),
  :global(.drawer-content),
  :global(.drawer-body) {
    position: relative;
    overflow: visible;
    z-index: 0;
  }
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


  .drawer-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .title { margin:0; font-size:1.1rem; }
  .icon-btn { background:none; border:0; font-size:20px; cursor:pointer; color:inherit; }
  .field { margin:14px 0; display:flex; flex-direction:column; gap:8px; }
  .text, .notes { width:100%; font-size:16px; }
  .row { display:flex; align-items:center; gap:8px; }
  .gen { display:grid; gap:8px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); padding:8px; border:1px solid var(--border, #2a2a2a); border-radius:8px; }
  .gen .len { display:flex; align-items:center; gap:8px; grid-column:1/-1; }
  .btn { padding:6px 10px; }
  .btn.small { padding:4px 8px; font-size:0.9rem; }
  .error { color: var(--danger, #d33); font-size: 0.9rem; }
  .muted { color: var(--muted, #888); font-size: 0.85rem; }
  .drawer-footer { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
  :global(.drawer), :global(.drawer-content), :global(.drawer-body) { position: relative; overflow: visible; z-index: 0; }

</style>

