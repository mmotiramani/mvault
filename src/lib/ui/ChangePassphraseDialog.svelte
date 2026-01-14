
<script lang="ts">
  import { session } from '../app/session';
  import { changePassphrase } from '../app/session';
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { rekeyProgress, type RekeyState } from '../app/rekeyProgress';

  export let open = false;
  const dispatch = createEventDispatcher<{ close: void }>();

  let current = '';
  let next = '';
  let confirm = '';
  let saving = false;
  let error = '';
  let strength = 0;

  $: isLocked = !get(session).key;

  function estimateStrength(p: string): number {
    let s = 0;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[a-z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 4);
  }
  $: strength = estimateStrength(next);

  function validate(): string | null {
    if (isLocked && !current) return 'Current passphrase is required';
    if (!next) return 'New passphrase is required';
    if (next.length < 10) return 'Use at least 10 characters';
    if (next !== confirm) return 'New passphrase and confirmation do not match';
    if (isLocked && current === next) return 'New passphrase must be different';
    return null;
  }

  async function onSave() {
    error = validate() || '';
    if (error) return;
    saving = true;
    try {
      await changePassphrase(next, isLocked ? current : undefined);
      next = confirm = current = '';
      dispatch('close');
    } catch (e: any) {
      error = e?.message || 'Failed to change passphrase';
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    if (saving) return; // prevent closing mid-rekey; optional
    current = next = confirm = '';
    error = '';
    dispatch('close');
  }
</script>

{#if open}
  <div class="modal-backdrop" on:click|self={onCancel}>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Change passphrase">
      <h3>Change passphrase</h3>

      {#if isLocked}
        <label>Current passphrase</label>
        <input type="password" bind:value={current} autocomplete="current-password" />
      {/if}

      <label>New passphrase</label>
      <input type="password" bind:value={next} autocomplete="new-password" />
      <div class="meter"><div class="bar" style={`width:${(strength/4)*100}%`}></div></div>
      <small class="hint">Use a long passphrase. Add symbols and numbers for more strength.</small>

      <label>Confirm new passphrase</label>
      <input type="password" bind:value={confirm} autocomplete="new-password" />

      {#if error}<div class="error">{error}</div>{/if}

      <!-- Progress (only when active) -->
      {#if $rekeyProgress.active}
        <div class="progress">
          <div class="progress-bar">
            <div class="progress-fill" style={`width:${$rekeyProgress.percent}%`}></div>
          </div>
          <div class="progress-text">
            <span>{$rekeyProgress.phase}</span>
            <span>{$rekeyProgress.done}/{$rekeyProgress.total}</span>
          </div>
        </div>
      {/if}

      <div class="actions">
        <button class="secondary" on:click={onCancel} disabled={saving || $rekeyProgress.active}>Cancel</button>
        <button class="primary" on:click={onSave} disabled={saving || $rekeyProgress.active}>
          {($rekeyProgress.active || saving) ? 'Re-encrypting…' : 'Change'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 2000; }
  .modal { width: min(520px, 92vw); background:#121212; color:#ddd; border: 1px solid #2a2a2a; border-radius: 10px; padding: 16px; display:grid; gap: 10px; }
  label { margin-top: 4px; }
  input { padding:.5rem; border:1px solid #2a2a2a; border-radius:6px; background:#1f1f1f; color:#ddd; }
  .meter { height: 6px; background:#2a2a2a; border-radius: 3px; overflow:hidden; }
  .meter .bar { height: 100%; background: linear-gradient(90deg,#b00020,#f39c12,#27ae60); transition: width .2s ease; }

  .progress { display: grid; gap: 6px; margin-top: 8px; }
  .progress-bar { height: 8px; background:#2a2a2a; border-radius: 6px; overflow:hidden; }
  .progress-fill { height: 100%; background: #0a66c2; transition: width .15s ease; }
  .progress-text { display: flex; justify-content: space-between; color: #aaa; font-size: .9rem; }

  .actions { display:flex; justify-content: flex-end; gap:.5rem; margin-top: 8px; }
  .error { color:#ff6b6b; }
  .hint { color:#aaa; }
</style>
