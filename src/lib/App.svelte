
<script lang="ts">
  import sodium from 'libsodium-wrappers-sumo';
  import { createVaultFile, openVaultFile, type VaultFile, type VaultData } from './lib/vault';
  import { loadVaultFile, saveVaultFile } from './lib/store';
  import { generatePassword } from './lib/passwords';

  let master = '';
  let state: 'locked' | 'unlocked' | 'new' = 'locked';
  let vaultFile: VaultFile | undefined;
  let data: VaultData = { entries: [] };
  let filter = '';

  // on mount, try to load an existing vault
  (async () => {
    await sodium.ready;
    vaultFile = await loadVaultFile();
    state = vaultFile ? 'locked' : 'new';
  })();

  async function createNew() {
    const vf = await createVaultFile(master, { entries: [] });
    await saveVaultFile(vf);
    vaultFile = vf;
    data = { entries: [] };
    state = 'unlocked';
  }

  async function unlock() {
    if (!vaultFile) return;
    data = await openVaultFile(master, vaultFile);
    state = 'unlocked';
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
    if (!master) return;
    const vf = await createVaultFile(master, data); // re-encrypt entire payload with same master
    await saveVaultFile(vf);
    vaultFile = vf;
    alert('Saved');
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    // clear clipboard after 15s (best-effort)
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
      const vf = JSON.parse(String(reader.result)) as VaultFile;
      await saveVaultFile(vf);
      vaultFile = vf;
      state = 'locked';
      master = '';
      alert('Imported. Please unlock with your master password.');
    };
    reader.readAsText(file);
  }

  $: filtered = data.entries.filter(e =>
    [e.app, e.url, e.username].join(' ').toLowerCase().includes(filter.toLowerCase())
  );
</script>

<style>
  main { max-width: 900px; margin: 2rem auto; padding: 1rem; font: 14px/1.4 system-ui, sans-serif; }
  input, textarea { width: 100%; padding: .5rem; margin: .25rem 0 .75rem; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .actions { display: flex; gap: .5rem; flex-wrap: wrap; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { border-bottom: 1px solid #eee; padding: .5rem; text-align: left; }
</style>

<main>
  {#if state === 'new'}
    <h2>Create new vault</h2>
    <input type="password" placeholder="Master password (use a long passphrase)"
           bind:value={master} />
    <button on:click={createNew} disabled={!master}>Create</button>
    <hr />
    <p>Or import an existing vault file:</p>
    <input type="file" accept=".mvault,application/json" on:change={importVault} />
  {:else if state === 'locked'}
    <h2>Unlock vault</h2>
    <input type="password" placeholder="Master password" bind:value={master} />
    <div class="actions">
      <button on:click={unlock} disabled={!master || !vaultFile}>Unlock</button>
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
