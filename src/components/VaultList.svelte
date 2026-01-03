
<script lang="ts">
  import { onMount } from 'svelte';
  import { session } from '../lib/app/session';
  import { get } from 'svelte/store';
  import ItemDrawer from './ItemDrawer.svelte';
  import NewEntryDrawer from './NewEntryDrawer.svelte';
  import type { VaultItem, VaultItemPayload } from '../lib/data/types';
  import { listItems } from '../lib/data/store';
  import { startAutoLock } from '../lib/app/autoLock';

  let entries: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  let selectedId: string | null = null;

  // UI state
  let q = '';                       // search query
  let selectedTags: string[] = [];  // filter by tags
  let showNew = false;

  function toggleTag(t: string) {
    t = t.toLowerCase();
    selectedTags = selectedTags.includes(t) ? selectedTags.filter(x => x !== t) : [...selectedTags, t];
  }

  function clearFilters() { q = ''; selectedTags = []; }

  async function refresh() {
    const s = get(session);
    if (!s.key) { entries = []; selectedId = null; return; }
    const all = await listItems<VaultItemPayload>(s.key);
    // sort by name asc
    entries = all.sort((a,b) => a.payload.name.localeCompare(b.payload.name));
  }

  $: visible = entries.filter(({ payload }) => {
    const qok = !q ? true :
      (payload.name?.toLowerCase().includes(q.toLowerCase())
       || payload.username?.toLowerCase().includes(q.toLowerCase())
       || payload.url?.toLowerCase().includes(q.toLowerCase())
       || (payload.tags || []).some(t => t.includes(q.toLowerCase())));
    const tagok = selectedTags.length === 0
      ? true
      : (payload.tags || []).some(t => selectedTags.includes(t.toLowerCase()));
    return qok && tagok;
  });


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

  onMount(() => {
    const stop = startAutoLock(10);
    refresh();
    const unsub = session.subscribe(() => refresh());
    window.addEventListener('keydown', onKey);
    return () => { unsub(); stop(); window.removeEventListener('keydown', onKey); };
  });
</script>

<div class="vault">
  <aside class="sidebar">
    <div class="toolbar">
      <input id="mv-search" type="search" bind:value={q} placeholder="Search (/, name, user, url, tag)" />
      <button class="new" on:click={() => showNew = true} title="New (n)">＋</button>
    </div>

    <!-- Tag filters from session -->
    <div class="filter-tags">
      {#if $session.allTags.length > 0}
        {#each $session.allTags as t}
          <button
            class="t {selectedTags.includes(t) ? 'on' : ''}"
            on:click={() => toggleTag(t)}
          >{t}</button>
        {/each}
        {#if selectedTags.length > 0}
          <button class="clear" on:click={clearFilters}>Clear</button>
        {/if}
      {/if}
    </div>

    <div class="list">
      {#each visible as { item, payload } (item.id)}
        <button class="row {selectedId===item.id?'active':''}" on:click={() => selectedId = item.id}>
          <div class="name">{payload.name}</div>
          <div class="sub">{payload.username}{#if payload.url} · {payload.url}{/if}</div>
        </button>
      {/each}
    </div>
  </aside>

  <!-- Drawers -->
  {#if showNew}
    <NewEntryDrawer on:close={() => showNew = false} on:created={() => refresh()} />
  {/if}
  <ItemDrawer {selectedId} on:close={() => selectedId = null} {entries} />
</div>

<style>
  .vault {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: calc(100vh - 2rem);
    gap: 1rem;
    padding: 1rem;
    background: var(--panel);
    color: var(--text);
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
</style>
