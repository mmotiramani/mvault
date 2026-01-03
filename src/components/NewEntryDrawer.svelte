<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { session } from '../lib/app/session';
  import { get } from 'svelte/store';
  import { createItem } from '../lib/data/store';
  import type { VaultItemPayload } from '../lib/data/types';
  import { generatePassword, type PwdOpts } from '../lib/utils/passwords';

  const dispatch = createEventDispatcher<{ close: void; created: void }>();

  let name = '';
  let username = '';
  let password = '';
  let url = '';
  let tagInput = '';
  let tags: string[] = [];
  let notes = '';

  let pwdOpts: PwdOpts = { length: 20, symbols: true, upper: true, lower: true, digits: true, avoidAmbiguous: true };


  const MAX_TAG = 32;
  const norm = (s: string) => s.trim().toLowerCase().slice(0, MAX_TAG);

  function addTag(t: string) {
    const v = t.trim().toLowerCase();
    if (!v) return;
    if (!tags.includes(v)) tags = [...tags, v];
    tagInput = '';
  }

  function removeTag(t: string) { tags = tags.filter(x => x !== t); }

  function onTagKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
  }


// ⬇ suggestions derived from session.allTags
  $: suggestions = (() => {
    const all = get(session).allTags || [];
    const v = norm(tagInput);
    return v
      ? all.filter(t => t.startsWith(v) && !tags.includes(t)).slice(0, 8)
      : [];
  })();


  function gen() { password = generatePassword(pwdOpts); }

  async function save() {
    const key = get(session).key;
    if (!key) return;
    const payload: VaultItemPayload = { name: name.trim(), username: username.trim(), password, url: url.trim(), tags, notes };
    if (!payload.name) return; // minimal guard
    const id = crypto.randomUUID();
    await createItem(key, id, payload);
    dispatch('created');
    dispatch('close');
  }

  function close() { dispatch('close'); }

  // put focus on Name immediately
  let nameEl: HTMLInputElement;
  onMount(() => { setTimeout(() => nameEl?.focus(), 0); });
</script>

<section class="drawer">
  <header>
    <h2>New Entry</h2>
    <button class="close" on:click={close}>Close</button>
  </header>

  <div class="field">
    <label>Name</label>
    <input bind:this={nameEl} bind:value={name} placeholder="e.g., GitHub" />
  </div>

  <div class="field">
    <label>Username</label>
    <input bind:value={username} />
  </div>

  <div class="field">
    <label>Password</label>
    <div class="pw">
      <input bind:value={password} type="text" placeholder="Generate or paste" />
      <button type="button" on:click={gen} title="Generate">🔁</button>
    </div>
    <small>Length {pwdOpts.length} • symbols {pwdOpts.symbols ? 'on' : 'off'} • ambiguous {pwdOpts.avoidAmbiguous ? 'off' : 'on'}</small>
  </div>

  <div class="field">
    <label>URL</label>
    <input bind:value={url} placeholder="https://..." />
  </div>

  <div class="field">
    <label>Tags</label>
    <div class="chips">
      {#each tags as t}
        <span class="chip">{t}<button on:click={() => removeTag(t)} aria-label={`remove ${t}`}>×</button></span>
      {/each}
    </div>
    <input bind:value={tagInput} placeholder="Add a tag" on:keydown={onTagKey} />

  
    {#if suggestions.length > 0}
        <div class="suggestions">
            {#each suggestions as s}
                <button on:click={() => addTag(s)}>{s}</button>
            {/each}
        </div>
    {/if}

  </div>
  


  <div class="field">
    <label>Notes</label>
    <textarea bind:value={notes} rows="5" maxlength="4000" placeholder="Optional"></textarea>
  </div>

  <footer class="actions">
    <button class="primary" on:click={save} disabled={!name.trim()}>Save</button>
    <button on:click={close}>Cancel</button>
  </footer>
</section>

<style>
  .drawer { padding: 1rem; color: var(--text); }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem; }
  .close { border:1px solid var(--field-border); background:var(--field-bg); color:var(--text); padding:.4rem .6rem; border-radius:6px; }
  .field { display:grid; gap:.35rem; margin:.8rem 0; }
  input, textarea { background:var(--field-bg); color:var(--text); border:1px solid var(--field-border); border-radius:6px; padding:.55rem; }
  .pw { display:flex; gap:.5rem; align-items:center; }
  .pw button { border:1px solid var(--field-border); background:var(--field-bg); color:var(--text); border-radius:6px; padding:.4rem .6rem; }
  .chips { display:flex; gap:.5rem; flex-wrap:wrap; }
  .chip {
    display:inline-flex; align-items:center; gap:.35rem; height:28px; padding:0 .55rem;
    background:var(--chip-bg); color:var(--chip-fg); border:1px solid var(--chip-border); border-radius:999px; line-height:1;
  }
  .chip button {
    width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center;
    border-radius:50%; border:1px solid var(--chip-border); background:transparent; color:var(--chip-fg);
    font-size:11px; line-height:1; padding:0; cursor:pointer;
  }
  .suggestions { display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.45rem; }
  .suggestions > button {
    padding:.3rem .5rem; border-radius:6px;
    background: var(--field-bg); color: var(--text);
    border: 1px solid var(--field-border); cursor:pointer;
  }

  footer.actions { display:flex; gap:.6rem; margin-top:1rem; }
  .primary { background:#4f6ef7; color:white; border:0; border-radius:6px; padding:.5rem .9rem; }
</style>
