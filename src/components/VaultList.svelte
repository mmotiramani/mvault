
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
  import onImportUpload from '../App.svelte';

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

    // Reuse one collator (case/locale-aware, natural ordering)
    const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

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
      console.debug('[mvault] before returning length:', visible.length);
      return okText && okTags;

    });
  
    // 2) Sort by NAME only (ascending)
    visible.sort((a, b) =>
      nameCollator.compare(a.payload?.name ?? '', b.payload?.name ?? '')
    );

    console.debug('[mvault] testing sorted length:', visible.length);

    if (selectedId && !visible.some(({ item }) => item.id === selectedId)) {
      selectedId = null;
    }

    
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


function onImportFile(e: Event) {
  //const input = e.target as HTMLInputElement;
  //const file = input.files?.[0];
 
  onImportUpload: (e: Event) => Promise<void>;


  //if (!file) return;
  // your import logic (parse + persist)
  //input.value = ''; // allow re-selecting the same file later
}

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

<div class="vault uses-full-height" style="display:grid; grid-template-columns: 340px 1fr; gap:1rem;">
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
    <div class="tags-bar" role="toolbar" aria-label="Tag filters">
      
      {#if $session.allTags.length > 0}
        {#if selectedTags.length > 0}
          <button class="clear" 
              on:click={() => { selectedTags = []; onFiltersChanged(); }}>
              Clear
            </button>
        {/if}

        {#each $session.allTags as t}
          {#key t}
          <button
            class="t"
            class:on={selectedTags.includes(norm(t))}  
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
        {#if selectedTags.length > 0 && entries.length>20}
          <button class="clear" 
              on:click={() => { selectedTags = []; onFiltersChanged(); }}>
              Clear
            </button>
        {/if}
      {/if}
    </div>

    <!-- ✅ Scrollable LIST: now its own grid row with its own scroll box -->
    <div class="list" role="listbox" aria-activedescendant={selectedId ? `row-${selectedId}` : undefined}>
      {#each visible as { item, payload } (item.id)}
        <div 
          class="row" 
          id={"row-" + item.id}
          class:selected={item.id === selectedId}   
          role="option"
          on:click={() => openItem({ item, payload })}>
        <!-- button class="row {selectedId===item.id?'active':''}" on:click={() => selectedId = item.id} -->
          <div class="name">{payload.name}</div>
          <div class="sub">{payload.username}{#if payload.url} · {payload.url}{/if}</div>
          <!--/button -->
        </div>

      {/each}      
    </div>

<!--  < !-- ✅ Import bar lives in flow; no overlap -- >
    <div class="import-bar">
      < !-- If your Import control is in App.svelte, move it here for zero overlap -- >
      <label class="import">
        <span>Import</span>
        <input type="file" accept=".mvault,application/json" on:change={onImportFile} />
      </label>
    </div>
    < !-- ⬆⬆ end LEFT markup paste ⬆⬆ -- > -->

  </aside>


  <!-- List -->

  <main class="detail">
  <!-- Drawers -->
  <!-- NEW ENTRY -->
  {#if showNew}

   <!-- Drawer hosted inline on desktop; overlay via CSS on mobile -->
   <div class="drawer-shell">
    <NewEntryDrawer 
    on:close={() => showNew = false} 
    on:dirty={markDirty}
    on:created={handleCreated} 
    />
    </div>
    {/if}
  <!-- EDIT ENTRY -->
  {#if selectedId && selectedRow}
    {#key editVersion}
     <div class="drawer-shell">

              <!-- ItemDrawer {selectedId} on:close={() => selectedId = null} {entries} / -->
      <ItemDrawer
        entry={selectedRow}                            
        entryId={selectedId}
        on:close={() => (selectedId = null)}
        on:dirty={markDirty}
        on:save={handleSave}
        />
        <!--entryId={selectedId}-->
     </div>
  {/key}
 {/if}
 </main>
</div>

<style>


/* === Layout: two columns (list + detail), scroll-safe === */
.vault {
  display: grid;
  grid-template-columns: 340px 1fr;     /* left list, right detail */
  gap: 1rem;
  height: 100dvh;                       /* use dvh if you prefer */
  padding: 1rem;
  background: var(--panel);
  color: var(--text);
  min-height: 0;                        /* allow children to scroll */
}

/* Left column uses internal grid to place toolbar/tags/list/import */
.sidebar {
  display: grid;
  grid-template-rows:
    auto   /* mv-toolbar */
    auto   /* toolbar */
    auto   /* count */
    auto   /* tags-bar */
    1fr    /* ✅ list (scrolls) */
    auto;  /* import bar */
  gap: .75rem;
  min-height: 0;                        /* critical for scroll */
}

/* ✅ Scrollable list area (keep your existing row visuals) */
.list {
  position: relative;
  min-height: 0;
  overflow: auto;                       /* list scrolls; page doesn't grow */
  -webkit-overflow-scrolling: touch;
  border-right: 1px solid var(--field-border);
  background: var(--panel);
  padding-right: .25rem;
}
.row {
  display: grid;
  gap: .25rem;
  padding: .5rem .75rem;
  width: 100%;
  text-align: left;
  color: var(--text);
  border-radius: 8px;
  cursor: pointer;
  min-block-size: 44px;
  transition: background 120ms ease, box-shadow 120ms ease;
}
.row:hover { background: color-mix(in oklab, Canvas 92%, Highlight 8%); }
.row.selected {
  background: var(--list-active-bg, color-mix(in oklab, Canvas 86%, Highlight 14%));
  outline: 1px solid var(--chip-border);
  box-shadow: 0 0 0 2px color-mix(in oklab, #2563eb 24%, Canvas 76%) inset;
}
.row .name { font-weight: 600; color: var(--text); }
.row .sub  { color: var(--muted); font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ✅ Import bar never overlaps */
.import-bar {
  padding-block: .5rem;
  border-top: 1px solid var(--field-border);
  background: var(--panel);
  z-index: 0;
}
.import {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  padding: .4rem .6rem;
  border: 1px solid var(--field-border);
  border-radius: 6px;
  background: var(--field-bg);
  color: var(--text);
}
.import input[type="file"] { inline-size: 180px; }

/* RIGHT column: inline drawer on desktop, overlay only on mobile */
.detail {
  min-width: 0;
  min-height: 0;
  position: relative;
  display: grid;
  grid-template-rows: 1fr;
}
.empty {
  display: grid; place-content: center;
  color: var(--muted);
  border-left: 1px solid var(--field-border);
  background: var(--panel);
  border-radius: 8px;
}

/* Host for drawers on desktop */
.drawer-shell {
  position: sticky;                     /* stays visible when list scrolls */
  top: 0;
  max-height: calc(100dvh - 2rem);      /* account for vault padding */
  overflow: auto;
  border-left: 1px solid var(--field-border);
  background: var(--panel);
  border-radius: 8px;
  padding: .75rem;
}

/* Normalize drawer internals if they carry their own .drawer class */
:global(.drawer) {
  position: static;                     /* override any fixed positioning */
  box-shadow: none;                     /* rely on container visuals */
  max-width: 960px;
  margin: 0 auto;
}

/* === Mobile: stack, and overlay the drawer only on small screens === */
@media (max-width: 700px) {
  .vault {
    grid-template-columns: 1fr;         /* single column */
    height: auto;
    gap: .75rem;
    padding: .75rem;
  }
  .detail { display: contents; }        /* don’t reserve right pane space */

  .drawer-shell {
    position: fixed;                     /* ✅ overlay on mobile only */
    inset: 0;
    max-height: none;
    overflow: auto;
    border-left: none;
    border-radius: 0;
    padding: 0;
    z-index: 100;                        /* above list */
  }

  .list {
    max-height: 42dvh;                   /* keep your prior cap */
    overflow: auto;
    border-right: none;
    border-bottom: 1px solid var(--field-border);
    padding-bottom: .5rem;
  }
}

/* If you had a global .drawer z-index earlier, we no longer need to force it high on desktop */

/* === 1) Core layout (ensure list scrolls; import doesn't overlap) === */

/* Allow grid children to create their own scroll areas */
.vault { min-height: 0; }
.sidebar { min-height: 0; }

/* Left column stack:
   mv-toolbar, toolbar, count, tags-bar, LIST(1fr), import-bar */
.sidebar {
  display: grid;
  grid-template-rows: auto auto auto auto 1fr auto;
  gap: .75rem;
}

/* Scrollable list area */
.list {
  position: relative;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  border-right: 1px solid var(--field-border);
  background: var(--panel);
  padding-right: .25rem;
}

/* Import bar stays in flow; never overlaps */
.import-bar {
  padding-block: .5rem;
  border-top: 1px solid var(--field-border);
  background: var(--panel);
  z-index: 0;
}

/* Selected row highlight (kept minimal here) */
.row.selected {
  background: var(--list-active-bg, color-mix(in oklab, Canvas 86%, Highlight 14%));
  outline: 1px solid var(--chip-border);
}

/* === 2) Desktop/laptop: render drawers inline with an opaque background === */

@media (min-width: 700px) {
  /* Right column host for drawers. If you already have <main class="detail">, this styles it.
     If not, these styles still help because we neutralize fixed overlays below. */
  .detail {
    min-width: 0;
    min-height: 0;
    position: relative;
    display: grid;
    grid-template-rows: 1fr;
  }

  /* A wrapper around the drawer (use this if you have one). Gives an OPAQUE background. */
  .drawer-shell {
    position: sticky;
    top: 0;
    max-height: calc(100dvh - 2rem); /* adjust if your outer padding differs */
    overflow: auto;
    background: var(--surface, #131313); /* ✅ opaque background */
    border-left: 1px solid var(--field-border);
    border-radius: 8px;
    padding: .75rem;
    z-index: 0;
  }

  /* If your ItemDrawer/NewEntryDrawer components force themselves as modals (fixed/absolute),
     this section forcibly neutralizes that on DESKTOP so they don't overlay the list.
     We intentionally keep the drawer's own background transparent so the .drawer-shell provides it.
     The attribute/class matches cover common patterns. */
  :global(.drawer),
  :global(.ItemDrawer),
  :global(.item-drawer),
  :global([class*="drawer"]),
  :global([class*="Drawer"]) {
    position: static !important;   /* ✅ behave like normal inline content */
    inset: auto !important;
    top: auto !important; right: auto !important; bottom: auto !important; left: auto !important;
    width: auto !important;
    height: auto !important;
    max-width: none !important;
    max-height: none !important;
    box-shadow: none !important;
    background: transparent !important; /* shell supplies the background */
    backdrop-filter: none !important;
    z-index: 0 !important;               /* avoid covering the list */
  }
}

/* === 3) Mobile: allow full-screen overlay (good UX on small screens) === */
@media (max-width: 699px) {
  /* On phones, it's fine for the drawer to overlay the list.
     If you wrap with .drawer-shell, make it an overlay with opaque background. */
  .drawer-shell {
    position: fixed;
    inset: 0;
    max-height: none;
    overflow: auto;
    border-left: none;
    border-radius: 0;
    padding: 0;
    background: var(--surface, #131313); /* ✅ opaque background; list won't show through */
    z-index: 100;
  }
}


/* ── Compact, space-efficient tag bar ───────────────────────────────────── */

.tags-bar {
  /* Desktop/tablet: wrap, but cap the height to ~2 rows with a tiny inner scroll */
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;                         /* tighter spacing */
  margin: 6px 0;                        /* smaller vertical margin */
  padding-right: 2px;                   /* keep text from hiding under scrollbar */
  max-block-size: 72px;                 /* ≈ two rows; adjust to taste (64–84px) */
  overflow: auto;                       /* internal scroll if tags overflow */
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

/* Mobile: single horizontally scrolling row (saves vertical space) */
@media (max-width: 700px) {
  .tags-bar {
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    max-block-size: 2.4rem;             /* ≈ one line of compact chips */
    gap: 4px;                           /* even tighter on small screens */
  }
}

/* Base chip (compact) */
.tags-bar .t {
  --chip-bg: var(--chip, #222);
  --chip-fg: var(--chip-fg, #ddd);
  --chip-border: var(--border, #2a2a2a);

  font: 500 12.5px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  padding: 2px 8px;                     /* compact pill */
  border-radius: 999px;
  border: 1px solid var(--chip-border);
  background: var(--chip-bg);
  color: var(--chip-fg);
  cursor: pointer;
  user-select: none;
}

/* Selected state — works via .t.on (Svelte class directive) and aria-pressed */
.tags-bar .t.on,
.tags-bar .t[aria-pressed="true"] {
  --accent: var(--chip-selected, #4f6ef7);
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  font-weight: 600;
}

/* Optional hover/focus (kept subtle for dense UI) */
.tags-bar .t:hover { filter: brightness(1.05); }
.tags-bar .t:focus-visible {
  outline: 2px solid color-mix(in oklab, #93c5fd 60%, #000 40%);
  outline-offset: 1px;
}

/* Clear pill — compact and unobtrusive */
.tags-bar .clear {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--danger-fg, #f88);
  background: transparent;
  color: var(--danger-fg, #f88);
  font: 500 12.5px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
}

/* High-contrast / Windows forced-colors support */
@media (forced-colors: active) {
  .tags-bar .t { forced-color-adjust: none; border-color: ButtonText; color: ButtonText; background: ButtonFace; }
  .tags-bar .t.on,
  .tags-bar .t[aria-pressed="true"] { background: Highlight; color: HighlightText; border-color: Highlight; }
  .tags-bar .clear { color: ButtonText; border-color: ButtonText; }
}

</style>
