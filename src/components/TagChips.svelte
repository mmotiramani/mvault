
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { session, refreshTags } from '../lib/app/session';
  import type { VaultItem, VaultItemPayload } from '../lib/data/types';
  import { updateItem } from '../lib/data/store';
  import { get } from 'svelte/store';

  export let item: VaultItem;
  export let payload: VaultItemPayload;
  const dispatch = createEventDispatcher<{ changed: VaultItemPayload }>();

  const MAX_LEN = 32;
  let input = '';

  function norm(s: string) { return s.trim().toLowerCase().slice(0, MAX_LEN); }

  async function addTag(s: string) {
    const t = norm(s);
    if (!t) return;
    const next = Array.from(new Set([...(payload.tags || []).map(norm), t]));
    const updated = { ...payload, tags: next };
    const key = get(session).key!;
    const upd = await updateItem<VaultItemPayload>(key, item, updated);
    payload = updated;
    dispatch('changed', updated);
    await refreshTags();
    input = '';
  }

  async function removeTag(t: string) {
    const next = (payload.tags || []).filter(x => x !== t);
    const updated = { ...payload, tags: next };
    const key = get(session).key!;
    await updateItem<VaultItemPayload>(key, item, updated);
    payload = updated;
    dispatch('changed', updated);
    await refreshTags();
  }

  $: suggestions = (() => {
    const all = get(session).allTags;
    const n = norm(input);
    return n ? all.filter(t => t.startsWith(n) && !(payload.tags || []).includes(t)).slice(0, 6) : [];
  })();
</script>

<div class="tags">
  <div class="chips">
    {#each payload.tags || [] as t}
      <span class="chip">{t}<button on:click={() => removeTag(t)} aria-label={`remove ${t}`}>×</button></span>
    {/each}
  </div>
  <input
    bind:value={input}
    placeholder="Add a tag"
    on:keydown={(e) => { if (e.key === 'Enter') addTag(input); }}
  />
  {#if suggestions.length > 0}
    <div class="suggestions">
      {#each suggestions as s}
        <button on:click={() => addTag(s)}>{s}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tags { display:grid; gap:.5rem; }
  .chips { display:flex; gap:.5rem; flex-wrap:wrap; }
  .chip { background:#eef; border-radius:999px; padding:.25rem .5rem; }
  .chip button { margin-left:.25rem; }
  .suggestions { display:flex; gap:.5rem; flex-wrap:wrap; }
</style>
``
