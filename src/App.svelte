<script lang="ts">

  import Toast from './lib/ui/Toast.svelte';
  import { showToast } from './lib/ui/toast';
 // import { openFromFileFSA, saveVaultFSA, saveVaultAsFSA, serializeVaultJSON } from './lib/bridge/vault-file';
  
  import { importFromText, exportToDownload } from './lib/bridge/vault-file';

  // ... keep your existing imports and logic (Unlock, VaultList, session, autoLock, etc.)

  //import { startAutoLock } from './lib/app/autoLock'; // your file
  // ... keep your existing imports (Unlock, VaultList, session, etc.)

  import { onMount } from 'svelte';
  //import { loadVaultFile, saveVaultFile } from './lib/data/fileStore';
  import { createVaultFile, openVaultFile, type VaultFile, type VaultData } from './lib/vault';
  import { generatePassword } from './lib/utils/passwords';

  import Unlock from './components/Unlock.svelte';
  import VaultList from './components/VaultList.svelte';
  import { session } from './lib/app/session';
  $: unlocked = !!$session.key;

//passphrase change option

import ChangePassphraseDialog from './lib/ui/ChangePassphraseDialog.svelte';

  // local state that controls the dialog visibility
  let showChangePass = false;

  // OPTIONAL: hotkey to open it quickly (Ctrl/Cmd + Shift + P)
  function onKeydown(e: KeyboardEvent) {
    const isCmd = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
    if (isCmd && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      showChangePass = true;
    }
  }


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
      //vaultFile = await loadVaultFile();
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

  /*
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
*/

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


  export async function onImportUpload(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0]; if (!file) return;
    const pass = prompt('Enter passphrase to import:'); if (!pass) return;
    const text = await file.text();
    // Default MERGE; allow REPLACE if user confirms
    const replace = confirm('Replace current vault with file? Click OK to Replace, Cancel to Merge.');
    await importFromText(text, pass, replace);
    (ev.target as HTMLInputElement).value = ''; // reset input
  }


  async function onExportClick() {
    console.log('goingto call exportToDownload');
    await exportToDownload('vault.mvault');
  }

/*
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
*/
  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setTimeout(async () => {
      const blank = '\u200B';
      await navigator.clipboard.writeText(blank);
    }, 15000);
  }


  // optional: autosave on blur/idle for FSA handle
  /*
  function autosave() {
    saveVaultFSA().catch(()=>{ 
    // ignore 
    // });
  }
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave();
  });
*/

  function exportVault() {
    if (!vaultFile) return;
    const blob = new Blob([JSON.stringify(vaultFile, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'vault.mvault';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /*
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
    */

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

  /* ADD: top actions row (mobile-friendly) */
  .top-actions {
    display:flex; justify-content:flex-end; gap:.5rem;
    margin-bottom: .75rem; flex-wrap: wrap;
  }
  .link {
    background: none; border: 1px solid #2a2a2a; color: #ddd;
    padding:.4rem .6rem; border-radius: 6px;
  }
  .link:active { transform: scale(.98); }

  /* ADD: floating action button for passphrase change */
.fab-change {
  position: fixed; right: 16px; bottom: 16px; z-index: 1500;
  background: #0a66c2; color: #fff; border: none;
  border-radius: 999px; padding: .6rem .9rem; box-shadow: 0 6px 14px rgba(0,0,0,.35);
}
.fab-change:active { transform: translateY(1px); }

</style>

<main>
  <!-- ADD: Show the Change Passphrase button whenever the app is ready (locked or unlocked) -->
  {#if initStatus === 'ready'}
    <div class="top-actions">
      <!-- button class="fab-change" on:click={() => (showChangePass = true)}>Change</button -->
      <!-- button class="link" on:click={() => (showChangePass = true)}>Change passphrase</button -->
    </div>
  {/if}

  <!-- Diagnostic banner -->
  {#if initStatus === 'loading'}

    <div class="splash">
      <img alt="MVault logo" src="./icons/icon-192-maskable.png" />
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

    <!-- <button on:click={() => openFromFileFSA()}>Open (file)</button> -->
    <label class="import">
      <!-- <span>Import (.mvault)</span> -->
      <input type="file" accept=".mvault,application/json" on:change={onImportUpload} />
    </label>

    <!-- button on:click={onExportClick}>Export .mvault</button -->

    <section class="home"></section>

  {/if}
</main>

<!-- ADD: Mount the dialog once at root so it overlays everything -- >
<ChangePassphraseDialog bind:open={showChangePass} on:close={() => (showChangePass = false)} / -->

<Toast />









