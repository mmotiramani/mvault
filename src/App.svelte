<script lang="ts">
  import { onMount } from 'svelte';
  import { loadVaultFile, saveVaultFile } from './lib/data/fileStore';
  import { createVaultFile, openVaultFile, type VaultFile, type VaultData } from './lib/vault';
  import { generatePassword } from './lib/utils/passwords';

  import Unlock from './components/Unlock.svelte';
  import VaultList from './components/VaultList.svelte';
  import { session } from './lib/app/session';
  $: unlocked = !!$session.key;

  // --- diagnostic state shown on screen ---
  let initStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let initError: string | null = null;

  // --- app state ---
  let master = '';
  let state: 'locked' | 'unlocked' | 'new' = 'locked';
  let vaultFile: VaultFile | undefined;
  let data: VaultData = { entries: [] };
  let filter = '';

  onMount(async () => {
    initStatus = 'loading';
    try {
      // Load libsodium at runtime
      const sodium = await import('libsodium-wrappers-sumo' as any);
      await sodium.default.ready;            // wait for WASM/JS init
      // Quick sanity log
      console.log('libsodium loaded; version major=', sodium.default.SODIUM_LIBRARY_VERSION_MAJOR );

      // Load any existing vault
      vaultFile = await loadVaultFile();
      state = vaultFile ? 'locked' : 'new';
      initStatus = 'ready';

      const params = new URLSearchParams(location.search);
      const action = params.get('action');
      if (initStatus === 'ready') {
        if (action === 'unlock' && vaultFile) state = 'locked';
        if (action === 'new-entry') { state = 'unlocked'; addEntry(); }
      }

    } catch (err: any) {
      // Surface the error everywhere
      console.error('Initialization error:', err);
      initError = err?.message ?? String(err);
      initStatus = 'error';
    }
  });

  async function createNew() {
    try {
      const vf = await createVaultFile(master, { entries: [] });
      await saveVaultFile(vf);
      vaultFile = vf;
      data = { entries: [] };
      state = 'unlocked';
    } catch (e) {
      console.error('createNew error', e);
      alert('Failed to create vault: ' + (e as any)?.message);
    }
  }

  async function unlock() {
    try {
      if (!vaultFile) return;
      data = await openVaultFile(master, vaultFile);
      state = 'unlocked';
    } catch (e) {
      console.error('unlock error', e);
      alert('Unlock failed: ' + (e as any)?.message);
    }
  }

  function addEntry() {
    data.entries = [
      ...data.entries,
      { id: crypto.randomUUID(), app: '', url: '', username: '', password: '', notes: '' }
    ];
  }

  function removeEntry(id: string) {
    data.entries = data.entries.filter(e => e.id !== id);
  }

  async function save() {
    try {
      if (!master) return;
      const vf = await createVaultFile(master, data);
      await saveVaultFile(vf);
      vaultFile = vf;
      alert('Saved');
    } catch (e) {
      console.error('save error', e);
      alert('Save failed: ' + (e as any)?.message);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setTimeout(async () => {
      const blank = '\u200B';
      await navigator.clipboard.writeText(blank);
    }, 15000);
  }

  function exportVault() {
    if (!vaultFile) return;
    const blob = new Blob([JSON.stringify(vaultFile, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vault.mvault';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importVault(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const vf = JSON.parse(String(reader.result)) as VaultFile;
        await saveVaultFile(vf);
        vaultFile = vf;
        state = 'locked';
        master = '';
        alert('Imported. Please unlock with your master password.');
      } catch (e) {
        console.error('import error', e);
        alert('Import failed: ' + (e as any)?.message);
      }
    };
    reader.readAsText(file);
  }

  $: filtered = data.entries.filter(e =>
    [e.app, e.url, e.username].join(' ').toLowerCase().includes(filter.toLowerCase())
  );
</script>

{#if unlocked}
  <VaultList />
{:else}
  <Unlock />
{/if}

<style>
  main { max-width: 900px; margin: 2rem auto; padding: 1rem; font: 14px/1.4 system-ui, sans-serif; }
  input, textarea { width: 100%; padding: .5rem; margin: .25rem 0 .75rem; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { border-bottom: 1px solid #eee; padding: .5rem; text-align: left; }
  .status { padding: .75rem; border-radius: 6px; margin-bottom: 1rem; }
  .loading { background: #fff3cd; color: #856404; }
  .error { background: #f8d7da; color: #721c24; }
  .ready { background: #d4edda; color: #155724; }

  /* App.svelte – splash styling */
  .splash {
    position: fixed; inset: 0; z-index: 9999;
    display: grid; place-items: center;
    background: #111111; color: #fff;
    text-align: center;
  }
  .splash img { width: 96px; height: 96px; margin-bottom: .75rem; }

.home { padding: 2rem 0; }
.home .actions { display:flex; flex-wrap:wrap; gap:.75rem; }
.import input[type="file"] { display:block; }

</style>

<main>
  <!-- Diagnostic banner -->
  {#if initStatus === 'loading'}

    <div class="splash">
      <img alt="MVault logo" src="/icons/icon-192-maskable.png" />
      <h1>MVault</h1>
      <p>Initializing secure crypto…</p>
    </div>
    <div class="status loading">Initializing… (loading libsodium)</div>

  {:else if initStatus === 'error'}
    <div class="status error">
      <strong>Initialization error</strong><br />
      {initError}
    </div>

  {:else if initStatus === 'ready' && (state === 'new' || state === 'locked')}
  <section class="home">
    <h2>Welcome to MVault</h2>
    <div class="actions">
      {#if state === 'locked'}
        <input type="password" placeholder="Master password" bind:value={master} />
        <button on:click={unlock} disabled={!master}>Unlock</button>
      {/if}

      {#if state === 'new'}
        <input type="password" placeholder="Set master password" bind:value={master} />
        <button on:click={createNew} disabled={!master}>Create Vault</button>
      {/if}

      <label class="import">
        <span>Import vault file</span>
        <input type="file" accept=".mvault,application/json" on:change={importVault} />
      </label>
      <button on:click={exportVault} disabled={!vaultFile}>Export .mvault</button>
    </div>
  </section>
{/if}


  {#if initStatus !== 'ready'}
    <!-- Keep page visible even while initializing or on error -->
    <p>If this persists, open DevTools (⌘⌥I) & check the console.</p>
  {/if}

  {#if state === 'new'}
    <h2>Create new vault</h2>
    <input type="password" placeholder="Master password (use a long passphrase)"
           bind:value={master} />
    <button on:click={createNew} disabled={!master || initStatus!=='ready'}>Create</button>
    <hr />
    <p>Or import an existing vault file:</p>
    <input type="file" accept=".mvault,application/json" on:change={importVault} />
  {:else if state === 'locked'}
    <h2>Unlock vault</h2>
    <input type="password" placeholder="Master password" bind:value={master} />
    <div class="actions">
      <button on:click={unlock} disabled={!master || !vaultFile || initStatus!=='ready'}>Unlock</button>
      <input type="file" accept=".mvault,application/json" on:change={importVault} />
    </div>
  {:else}
    <h2>Password Vault</h2>
    <div class="actions">
      <button on:click={addEntry}>Add</button>
      <button on:click={save}>Save (re-encrypt)</button>
      <button on:click={exportVault}>Export .mvault</button>
      <input placeholder="Search" bind:value={filter} />
    </div>

    <table>
      <thead>
        <tr><th>App / URL</th><th>Username</th><th>Password</th><th>Notes</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {#each filtered as e (e.id)}
        <tr>
          <td>
            <input placeholder="App name" bind:value={e.app} />
            <input placeholder="URL" bind:value={e.url} />
          </td>
          <td><input placeholder="username" bind:value={e.username} /></td>
          <td class="row">
            <input placeholder="password" bind:value={e.password} />
            <button on:click={() => e.password = generatePassword()}>Generate</button>
            <button on:click={() => copy(e.password)} disabled={!e.password}>Copy</button>
          </td>
          <td><textarea rows="2" bind:value={e.notes}></textarea></td>
          <td><button on:click={() => removeEntry(e.id)}>Delete</button></td>
        </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</main>
