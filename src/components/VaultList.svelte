
<script lang="ts">
  import { onMount } from 'svelte';
  import ItemDrawer from './ItemDrawer.svelte';
  import NewEntryDrawer from './NewEntryDrawer.svelte';
  import type { VaultItem, VaultItemPayload } from '../lib/data/types';
  import { 
    listItems,
    updateItemPayload,
    createItemFromPayload // <-- the helper you just added in store.ts
 } from '../lib/data/store';
  import { startAutoLock } from '../lib/app/autolock';
  import ChangePassphraseDialog from '../lib/ui/ChangePassphraseDialog.svelte';
  import { importFromText, exportToDownload } from '../lib/bridge/vault-file';
//  import { isDirty } from 'zod/v3';

//make tags availability generic for mobile/desktop and make the unified drawer Item and New
  import { get, writable } from 'svelte/store';
  import { refreshTags, session } from '../lib/app/session';

  const uiDirty = writable(false);
  const markDirty = () => uiDirty.set(true);
  const resetDirty = () => uiDirty.set(false);



  import Toast from '../lib/ui/Toast.svelte';
  import { showToast } from '../lib/ui/toast';

  // local state that controls the dialog visibility
  let showChangePass = false;


// ---- Filtering helpers ----
  const norm = (s: unknown) =>
    (s == null ? '' : String(s))
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '');
  // UI state
  let q = '';                       // search query
  let selectedTags: string[] = [];  // filter by tags

  function toggleTag(t: string) {
    t = t.toLowerCase();
    selectedTags = selectedTags.includes(t) ? selectedTags.filter(x => x !== t) : [...selectedTags, t];
    resetEditContext();
    void refresh();

  }
  //let entries: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  let selectedId: string | null = null;
  let matchAll = false; // false = OR, true = AND
  function toggleMatchMode() { 
    matchAll = !matchAll; 
    resetEditContext();
    void refresh();
  
  }
  
  // ...

  //make tags availability generic for mobile/desktop and make the unified drawer Item and New
  // Your own state (examples; keep your real ones)
   // Page state
  let showNew = false;
  //let selectedId = null;
  //let selectedEntry:string | null = null;   // ensure you set this when user picks an item
  //let editVersion = 0;        // if you already use keyed re-mounts


  // Every row is { item: VaultItem, payload: VaultItemPayload }
  let entries: Array<{ item: any; payload: any }> = [];
  let visible: Array<{ item: any; payload: any }> = [];

  // The row currently opened in ItemDrawer
  let selectedRow: { item: any; payload: any } | null = null;


  // Your existing helpers (replace with your real functions)
  // async function refresh() { /* re-query items and set visible list */ }
  //async function createItem(payload) { /* persist new item */ }
  //async function saveExistingItem(id, payload) { /* persist changes */ }
/*
  async function handleCreated(e) {
    await createItem(e.detail.payload);
    await refresh();
    await refreshTags();   // keep $session.allTags up to date for TagChips
    showNew = false;
    resetDirty();
  }
*/

/*
  async function handleSave() {
    if (!selectedId || !selectedEntry) return;
    await saveExistingItem(selectedId, selectedEntry.payload);
    await refresh();
    await refreshTags();   // suggestions refresh globally
    resetDirty();
  }
*/

// derive the selected entry whenever selectedId or entries changes
//$: selectedEntry =
  // selectedId ? (entries.find(r => r.item.id === selectedId) ?? null) : null;




  function clearFilters() { 
    q = ''; 
    selectedTags = []; 
    resetEditContext();
    void refresh();

  }


  function computeVisible(opts?: { text?: string }) {
    const text = norm(opts?.text ?? q);
    const tokens = text.split(/\s+/).filter(Boolean);
    const want = (selectedTags ?? []).map(norm);
    visible = (entries ?? []).filter(({ payload }) => {
      // build haystack
      const hay = norm(
        `${payload.name} ${payload.username ?? ''} ${payload.url ?? ''} ${payload.notes ?? ''} ${(payload.tags ?? []).join(' ')}`
      );

      // Text: AND across tokens
      const okText = tokens.length === 0 || tokens.every(t => hay.includes(t));

      // Tags: ANY vs ALL (using your matchAll + selectedTags)
      const pTags = new Set((payload.tags ?? []).map(norm));
      const want  = (selectedTags ?? []).map(norm);

      const okTags =
        want.length === 0 ||
        (matchAll ? want.every(t => pTags.has(t)) : want.some(t => pTags.has(t)));

      return okText && okTags;
    });
  }


  // --- Close & rollback drawers when filters change ---
  function closeDrawersAndRollback() {
    // Close New Entry drawer
    if (showNew) showNew = false;

    // Close Item drawer + clear selection
    if (selectedId) {
      selectedId = null;
      selectedRow = null;
      // optional: force remount next time
      editVersion = (editVersion ?? 0) + 1;
    }
  }

  // --- Called by UI (search, tag chips, ALL/ANY) ---
  function onFiltersChanged(opts?: { text?: string }) {
    computeVisible(opts);
    closeDrawersAndRollback();
  }


//tiny “edit context reset” + a key to remount the drawer
let editVersion = 0;  // bumping this forces the drawer to remount (discarding unsaved state)
function resetEditContext() {
  selectedId = null;
  showNew = false;
  editVersion += 1;
}


async function refresh() {

  const key = get(session).key as CryptoKey | null;
  if (!key) { entries = visible = []; selectedRow = null; return; }
  entries = await listItems<any>(key);
  visible = entries;
  if (selectedId) selectedRow = entries.find(e => e.item.id === selectedId) ?? null;
  // ✅ Recompute filtered list now that entries changed
    computeVisible(); // will use current `search`, `selectedTags`, `matchAll`

  /*const s = get(session);
  if (!s.key) { 
    entries = []; 
    selectedId = null;
    visible = [];
    selectedRow = null;  
    return; 
  }

  const all = await listItems<VaultItemPayload>(s.key);

  // Sort by the DECRYPTED payload name (guarded to avoid undefined errors)
  entries = all.sort((a, b) =>
    (a.payload?.name ?? '').localeCompare(b.payload?.name ?? '', undefined, { sensitivity: 'base' })
  );

  // Keep selectedRow up to date if the selection is still valid
  if (selectedId) {
    selectedRow = entries.find(e => e.item.id === selectedId) ?? null;
  } 
    
  async function refresh() {
  const s = get(session);
  if (!s.key) { entries = []; selectedId = null; return; }

  const all = await listItems<VaultItemPayload>(s.key);

  // Sort by the DECRYPTED payload name (guarded to avoid undefined errors)
  entries = all.sort((a, b) =>
    (a.payload?.name ?? '').localeCompare(b.payload?.name ?? '', undefined, { sensitivity: 'base' })
  );

  
  }

  $: visible = entries.filter(({ payload }) => {
    const qok = !q ? true :
      (payload.name?.toLowerCase().includes(q.toLowerCase())
       || payload.username?.toLowerCase().includes(q.toLowerCase())
       || payload.url?.toLowerCase().includes(q.toLowerCase())
       || (payload.tags || []).some(t => t.includes(q.toLowerCase())));

    const plTags = (payload.tags || []).map(t => t.toLowerCase());
    const tagok =
      selectedTags.length === 0 
      ? true 
      : matchAll
        ? selectedTags.every(t => plTags.includes(t))  // AND
        : selectedTags.some(t => plTags.includes(t));  // OR

    return qok && tagok;
  });*/
}


  // Handle create from NewEntryDrawer
  async function handleCreated(e: CustomEvent<{ payload: any }>) {
    const key = get(session).key as CryptoKey | null;
    if (!key) return;

    await createItemFromPayload(key, e.detail.payload);
    // createItemFromPayload already calls refreshTags()
    await refresh();

    showNew = false;
    resetDirty();
  }

  
// Handle save from ItemDrawer
  async function handleSave() {
    const key = get(session).key as CryptoKey | null;
    if (!key || !selectedRow) return;

    await updateItemPayload(selectedRow.item, selectedRow.payload, key);
    // updateItemPayload already calls refreshTags()
    await refresh();

    resetDirty();
  }

 
  // When user opens an item from the list
  function openItem(row: { item: any; payload: any }) {
    selectedId  = row.item.id;
    selectedRow = row;
  }
 
/*
  $: visible = entries.filter(({ payload }) => {
    const qok = !q ? true :
      (payload.name?.toLowerCase().includes(q.toLowerCase())
       || payload.username?.toLowerCase().includes(q.toLowerCase())
       || payload.url?.toLowerCase().includes(q.toLowerCase())
       || (payload.tags || []).some(t => t.includes(q.toLowerCase())));

    const plTags = (payload.tags || []).map(t => t.toLowerCase());
    const tagok =
      selectedTags.length === 0 
      ? true 
      : matchAll
        ? selectedTags.every(t => plTags.includes(t))  // AND
        : selectedTags.some(t => plTags.includes(t));  // OR

    return qok && tagok;
  });
  */


  function isEditableTarget(el: Element | null) {
    if (!el) return false;
    const tag = (el as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return (el as HTMLElement).isContentEditable === true;
  }

  function onKey(e: KeyboardEvent) {


    // Do nothing if event already handled or if user is typing
    if (e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (isEditableTarget(document.activeElement)) return;

    if (e.key === '/') {
      e.preventDefault();
      (document.getElementById('mv-search') as HTMLInputElement)?.focus();
      return
    } else if (e.key === 'n') {
      e.preventDefault();
      showNew = true;
      return
    }
  }


  function openChangePassphrase() {
    // open your ChangePassphrase dialog; or dispatch to parent, depending on your current UI
    showChangePass = true;
  }

  async function onExport() {
    // Assuming you already use this elsewhere:
   // await exportToDownload('vault.mvault');   // or with your own filename pattern

    console.log('goingto call exportToDownload');
    await exportToDownload('vault.mvault');

  }
  function onImport() {
    // Trigger your import flow (file picker + importFromText)
    // Keep as-is if you already have this elsewhere; this is only a button hook.
    /*const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    const pass = prompt('Enter passphrase to import:'); if (!pass) return;
    const text = await file.text();
    // Default MERGE; allow REPLACE if user confirms
    const replace = confirm('Replace current vault with file? Click OK to Replace, Cancel to Merge.');
    await importFromText(text, pass, replace);
    (ev.target as HTMLInputElement).value = ''; // reset input
    */
  }

  onMount(() => {
    const stop = startAutoLock(10);
    refresh();
    const unsub = session.subscribe(() => refresh());
    window.addEventListener('keydown', onKey);
    return () => { unsub(); stop(); window.removeEventListener('keydown', onKey); };
  });
</script>

<div class="vault uses-full-height">
  <aside class="sidebar">
    
    <div class="mv-toolbar">
      <button class="btn ghost"   on:click={openChangePassphrase}>Change Passphrase</button>
      <!-- ADD: Mount the dialog once at root so it overlays everything -->
    <ChangePassphraseDialog bind:open={showChangePass} on:close={() => (showChangePass = false)} />
<!--button class="link" on:click={() => (showChangePass = true)}>Change passphrase</button -->

<!-- ADD: Mount the dialog once at root so it overlays everything -->
<ChangePassphraseDialog bind:open={showChangePass} on:close={() => (showChangePass = false)} on:changed= {()=>(showToast('Passphrase changed', 'success'))} />

      <!-- button class="btn ghost"   on:click={onImport}>Import</button -->
      <button class="btn ghost"   on:click={onExport}>Export</button>
    </div>

    <div class="toolbar">
      <input id="mv-search" type="search" 
        bind:value={q} 
        placeholder="Search (/, name, user, url, tag)"         
        on:input={() => onFiltersChanged({ text: q  })} 
        autocapitalize="off" autocorrect="off" spellcheck="false"
        inputmode="search" enterkeyhint="search"
      />
      <button class="new" on:click={() => showNew = true} title="New (n)">＋</button>


      <button class="toggle" on:click={() => { matchAll = !matchAll; onFiltersChanged(); }}>
        {matchAll ? 'Match: ALL' : 'Match: ANY'}
      </button>

      <!--button class="match" on:click={toggleMatchMode} title="Toggle tag match mode">
        {matchAll ? 'Match: ALL' : 'Match: ANY'}
      </button-->
    </div>
    <div class="count">
      {visible.length} {visible.length <= 1 ? 'entry' : 'entries'} / {entries.length>0 ? entries.length : 'no entries'}
      <!-- or if you prefer: {visible.length} / {entries.length} -->
    </div>


    <!-- Tag filters from session -->
    <div class="tags-bar">
      {#if $session.allTags.length > 0}
        {#each $session.allTags as t}
          {#key t}
          <button
            class:selected={selectedTags.includes(norm(t))}
            aria-pressed={selectedTags.includes(norm(t))}
            on:click={() => {
              const v = norm(t);
              selectedTags = selectedTags.includes(v)
                ? selectedTags.filter(x => x !== v)
                : [...selectedTags, v];
              onFiltersChanged();      
            }}>
            

           <!-- on:click={() => toggleTag(t)} -->
          {t}</button>
          {/key}
        {/each}
        {#if selectedTags.length > 0}
          <button class="clear" 
              on:click={() => { selectedTags = []; onFiltersChanged(); }}>
              Clear
            </button>
        {/if}
      {/if}
    </div>

    <div class="list">
      {#each visible as { item, payload } (item.id)}
        <div class="row" on:click={() => openItem({ item, payload })}>
        <!-- button class="row {selectedId===item.id?'active':''}" on:click={() => selectedId = item.id} -->
          <div class="name">{payload.name}</div>
          <div class="sub">{payload.username}{#if payload.url} · {payload.url}{/if}</div>
          <!--/button -->
        </div>

      {/each}      
    </div>
  </aside>


<!-- List -->


  <!-- Drawers -->
  <!-- NEW ENTRY -->
  {#if showNew}
    <NewEntryDrawer 
    on:close={() => showNew = false} 
    on:dirty={markDirty}
    on:created={handleCreated} 
    />
  {/if}
  <!-- EDIT ENTRY -->
  {#if selectedId && selectedRow}
    {#key editVersion}
      <!-- ItemDrawer {selectedId} on:close={() => selectedId = null} {entries} / -->
      <ItemDrawer
        entry={selectedRow}                            
        entryId={selectedId}
        on:close={() => (selectedId = null)}
        on:dirty={markDirty}
        on:save={handleSave}
        />
        <!--entryId={selectedId}-->
  {/key}
{/if}

</div>

<style>

.tags-bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .tags-bar button {
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border, #2a2a2a);
    background: var(--chip, #222);
    color: var(--chip-fg, #ddd);
    cursor: pointer;
  }
  .tags-bar button.selected {
    background: var(--chip-selected, rgb(151, 155, 153));
    color: #080707;
    border-color: var(--chip-selected, #2a6);
  }
  .tags-bar button.clear {
    background: transparent;
    color: var(--danger-fg, #f88);
    border-color: var(--danger-fg, #f88);
  }

  .active-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
  .active-filters .chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: var(--chip, #333);
    color: var(--chip-fg, #eaeaea);
    border: 1px solid var(--border, #2a2a2a);
  }
  .active-filters .chip .x {
    border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px;
  }

  .count { margin-left: auto; color: var(--muted, #aaa); }

  .vault {
    display: grid;
    grid-template-columns: 320px 1fr;
    /* mobile: use 100dvh if available via utility applied above */
    height: calc(100vh - 2rem); /* desktop fallback; mobile will use 100dvh */
    gap: 1rem;
    padding: 1rem;
    background: var(--panel);
    color: var(--text);
  }

/* --- Mobile: stack list and drawer --- */
  @media (max-width: 700px) {
    .vault {
      grid-template-columns: 1fr;       /* single column */
      height: auto;                      /* let content size itself */
      gap: .75rem;
      padding: .75rem;
    }
    .list {
      /* give the list a reasonable height; drawer follows below */
      max-height: 42dvh;
      overflow: auto;
      border-right: none;                /* no inner divider on mobile */
      border-bottom: 1px solid var(--field-border);
      padding-bottom: .5rem;
    }
  }

  .sidebar { display:grid; grid-template-rows: auto auto 1fr; gap:.75rem; }
  .toolbar { display:flex; gap:.5rem; align-items:center; }
  #mv-search {
    flex: 1;
    background: var(--field-bg); color: var(--text);
    border:1px solid var(--field-border); border-radius:6px; padding:.5rem .6rem;
  }
  .new {
    width: 36px; height: 36px; border-radius:8px; cursor: pointer;
    border:1px solid var(--field-border); background: var(--field-bg); color: var(--text);
    font-size: 20px; line-height: 1;
  }
  .filter-tags { display:flex; gap:.4rem; flex-wrap:wrap; }
  .filter-tags .t {
    padding:.25rem .5rem; border-radius:999px; border:1px solid var(--chip-border);
    background: var(--chip-bg); color: var(--chip-fg); cursor: pointer; line-height:1;
  }
  .filter-tags .t.on { outline:2px solid var(--chip-border); }
  .filter-tags .clear {
    padding:.25rem .5rem; border-radius:6px; border:1px solid var(--field-border);
    background: var(--field-bg); color: var(--text);
  }

  .list { overflow: auto; border-right: 1px solid var(--field-border); background: var(--panel); padding-right:.25rem; }
  .row {
    display: grid; gap: .25rem; padding: .5rem .75rem; width: 100%; text-align: left; color: var(--text);
    border-radius: 8px;
  }
  .row.active { background: var(--list-active-bg); outline: 1px solid var(--chip-border); }
  .row .name { font-weight: 600; color: var(--text); }
  .row .sub  { color: var(--muted); font-size: .85rem; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }

  .match {
    border: 1px solid var(--field-border);
    background: var(--field-bg);
    color: var(--text);
    border-radius: 6px;
    padding: .4rem .6rem;
  }


/* Base tag pill */
.filter-tags { display:flex; gap:.4rem; flex-wrap:wrap; }

.filter-tags .t {
  padding:.28rem .6rem;
  border-radius:999px;
  border:1px solid var(--chip-border);
  background: var(--chip-bg);
  color: var(--chip-fg);
  line-height:1;
  cursor:pointer;
}

/* Focus ring for keyboard users */
.filter-tags .t:focus-visible {
  outline: 2px solid var(--chip-border);
  outline-offset: 2px;
}

/* Selected (ON) — filled pill + checkmark */
.filter-tags .t.on {
  /* Accent color: adjust if you prefer a different hue */
  --mv-accent: #4f6ef7;
  background: var(--mv-accent);
  border-color: var(--mv-accent);
  color: #fff;
  font-weight: 600;
  position: relative;
}

/* Prepend a subtle ✓ to selected tags */
.filter-tags .t.on::before {
  content: '✓';
  font-size: 12px;
  margin-right: .4rem;
  display: inline-block;
  transform: translateY(-1px); /* optical centering */
}

/* High Contrast mode (Edge/Windows) — use system colors */
@media (forced-colors: active) {
  .filter-tags .t.on {
    background: Highlight;
    color: HighlightText;
    border-color: Highlight;
  }
  .filter-tags .t.on::before { content: '✓'; }
}

/* Match button visuals */
.match {
  border: 1px solid var(--field-border);
  background: var(--field-bg);
  color: var(--text);
  border-radius: 6px;
  padding: .4rem .6rem;
}

  .tags-bar button { margin: 0 6px 6px 0; }
  .tags-bar button.selected {
    background: var(--chip-selected, #2a6);
    color: white;
  }
  .tags-bar button.clear {
    background: var(--danger-bg, #333);
    color: var(--danger-fg, #f88);
  }


</style>
