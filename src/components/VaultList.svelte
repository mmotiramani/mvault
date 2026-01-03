
<script lang="ts">
  import { onMount } from 'svelte';
  import { session } from '../lib/app/session';
  import { get } from 'svelte/store';
  import ItemDrawer from './ItemDrawer.svelte';
  import type { VaultItem, VaultItemPayload } from '../lib/data/types';
  import { listItems } from '../lib/data/store';
  import { startAutoLock } from '../lib/app/autoLock';

  let entries: Array<{ item: VaultItem; payload: VaultItemPayload }> = [];
  let selectedId: string | null = null;

  async function refresh() {
    const s = get(session);
    if (!s.key) { entries = []; selectedId = null; return; }
    entries = await listItems<VaultItemPayload>(s.key);
  }

  onMount(() => {
    const stop = startAutoLock(10);
    refresh();
    const unsub = session.subscribe(() => refresh());
    return () => { unsub(); stop(); };
  });
</script>

<div class="vault">
  <aside class="list">
    {#each entries as { item, payload } (item.id)}
      <button class="row {selectedId===item.id?'active':''}" on:click={() => selectedId = item.id}>
        <div class="name">{payload.name}</div>
        <div class="sub">{payload.username}</div>
      </button>
    {/each}
  </aside>
  <ItemDrawer {selectedId} on:close={() => selectedId = null} {entries} />
</div>

<style>
  .vault { display: grid; grid-template-columns: 280px 1fr; height: calc(100vh - 2rem); gap: 1rem; padding: 1rem; }
  .list { overflow: auto; border-right: 1px solid #eee; }
  .row { display: grid; gap: .25rem; padding: .5rem .75rem; width: 100%; text-align: left; }
  .row.active { background: #f5f7ff; }
  .name { font-weight: 600; }
  .sub { color: #666; font-size: .85rem; }
</style>
