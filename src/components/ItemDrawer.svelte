
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { copyWithTemporaryOverwrite } from '../lib/utils/clipboard';
  import TagChips from './TagChips.svelte';
  import type { VaultItem, VaultItemPayload } from '../lib/data/types';

  export let selectedId: string | null;
  export let entries: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  const dispatch = createEventDispatcher<{ close: void }>();

  let revealedId: string | null = null;
  let entry: { item: VaultItem; payload: VaultItemPayload } | undefined;

  $: entry = entries.find((e) => e.item.id === selectedId);
  $: if (selectedId && revealedId && revealedId !== selectedId) revealedId = null;

  const AUTO_HIDE_MS = 8000;
  let timer: number | null = null;

  function holdStart() {
    if (!entry) return;
    revealedId = entry.item.id;
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => { revealedId = null; }, AUTO_HIDE_MS);
  }
  function holdEnd() { revealedId = null; if (timer) { clearTimeout(timer); timer = null; } }

  onMount(() => {
    const onBlur = () => { revealedId = null; };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  });

  async function onCopy() {
    if (entry) await copyWithTemporaryOverwrite(entry.payload.password, 15_000);
  }
</script>

<section class="drawer">
  {#if !entry}
    <div class="empty">Select an entry</div>
  {:else}
    <header>
      <h2>{entry.payload.name}</h2>
      <button class="close" on:click={() => dispatch('close')}>Close</button>
    </header>

    <div class="field">
      <label>Username</label>
      <input readonly value={entry.payload.username} />
    </div>

    <div class="field">
      <label>Password</label>
      <div class="pw">
        <input
          readonly
          type={revealedId === entry.item.id ? 'text' : 'password'}
          value={entry.payload.password}
          on:blur={holdEnd}
        />
        <button
          aria-pressed={revealedId === entry.item.id}
          on:mousedown={holdStart}
          on:mouseup={holdEnd}
          on:mouseleave={holdEnd}
          on:touchstart={holdStart}
          on:touchend={holdEnd}
          title="Hold to reveal"
        >👁️</button>
        <button on:click={onCopy} title="Copy password">📋</button>
      </div>
      {#if revealedId === entry.item.id}
        <small>Auto-hides in {AUTO_HIDE_MS/1000}s or on tab blur.</small>
      {/if}
    </div>

    <div class="field">
      <label>Tags</label>
      <TagChips item={entry.item} payload={entry.payload} on:changed={(e) => entry = { ...entry!, payload: e.detail }} />
    </div>
  {/if}
</section>

<style>
  .drawer { padding: 1rem; }
  header { display:flex; justify-content:space-between; align-items:center; }
  .field { display:grid; gap:.25rem; margin:.75rem 0; }
  .pw { display:flex; gap:.5rem; align-items:center; }
  input[readonly] { padding:.5rem; border:1px solid #ddd; border-radius:4px; }
</style>
