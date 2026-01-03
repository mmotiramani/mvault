
<script lang="ts">
  import { initHeader, unlock } from '../lib/app/session';
  import { onMount } from 'svelte';
  let pass = '';
  let busy = false;
  let err: string | null = null;

  onMount(() => { initHeader(); });

  async function onSubmit() {
    busy = true; err = null;
    try {
      await unlock(pass);
      pass = '';
    } catch (e) {
      console.error(e);
      err = 'Unable to unlock. Check passphrase.';
    } finally {
      busy = false;
    }
  }
</script>

<form on:submit|preventDefault={onSubmit} class="unlock">
  <label>
    Passphrase
    <input type="password" bind:value={pass} autocomplete="current-password" aria-describedby="pass-help" />
  </label>
  <small id="pass-help">Your passphrase never leaves this device.</small>
  <button disabled={busy || !pass}>Unlock</button>
  {#if err}<div role="alert">{err}</div>{/if}
</form>

<style>
  .unlock { display: grid; gap: .75rem; max-width: 420px; margin: 2rem auto; }
  input { width: 100%; padding: .5rem; }
</style>
