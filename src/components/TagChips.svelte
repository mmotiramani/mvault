
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
<!--
<style>
  .tags { display:grid; gap:.5rem; }
  .chips { display:flex; gap:.5rem; flex-wrap:wrap; }
  .chip { background:#eef; border-radius:999px; padding:.25rem .5rem; }
  .chip button { margin-left:.25rem; }
  .suggestions { display:flex; gap:.5rem; flex-wrap:wrap; }
</style>
-->


<!-- replace the existing <style> with: -->
<style>
  .tags { display:grid; gap:.6rem; }
  .chips { display:flex; gap:.6rem; flex-wrap:wrap; }

  .chip {
    display:inline-flex;
    align-items:center;
    gap:.4rem;
 

    height: 32px;                  /* consistent height */
    padding: 0 .6rem;               /* horizontal padding only */
    border-radius: 999px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  
    background: var(--chip-bg);
    color: var(--chip-fg);
    border: 1px solid var(--chip-border);
    border-radius: 999px;
/*    padding: .35rem .6rem; */
    line-height: 1;
  }

  /* Make the “×” readable and tappable */
  .chip button {
    appearance: none;
    border: 1px solid var(--chip-border);
    background: transparent;
    color: var(--chip-fg);
    place-items: center;
    font-weight: 700;
    cursor: pointer;

    box-sizing: border-box;

    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    border-radius: 50%;
    font-size: 12px;                /* keeps × crisp inside 20px */
    line-height: 1;                 /* exact centering */
    padding: 0;
    margin-left: .35rem;
   
  }
  .chip button:hover { filter: brightness(1.1); }
  .chip button:focus { outline: 2px solid var(--chip-border); outline-offset: 2px; }

  /* Suggestions row inherits theme tokens automatically */
  .suggestions { display:flex; gap:.5rem; flex-wrap:wrap; }
  .suggestions > button {
    padding:.3rem .5rem;
    background: var(--field-bg);
    color: var(--text);
    border:1px solid var(--field-border);
    border-radius:6px;
  }

  /* Ensure inputs/placeholders are readable in dark mode */
  input, textarea {
    background: var(--field-bg);
    color: var(--text);
    border: 1px solid var(--field-border);
  }

  /* High contrast mode: rely on system colors */
  @media (forced-colors: active) {
    .chip {
      border: 1px solid CanvasText;
      background: Canvas;
      color: CanvasText;
    }
    .chip button {
      border-color: CanvasText;
      color: CanvasText;
    }
  }
</style>

