
<script lang="ts">
  import { initHeader, unlock } from '../lib/app/session';
  import { onMount } from 'svelte';
  let pass = '';
  let passEl: HTMLInputElement | null = null; // <-- ref to the input
  let busy = false;
  let err: string | null = null;
  let showPass = false;

  onMount(() => { 
    initHeader(); 


    // Edge-friendly: ensure focus after paint
    setTimeout(() => {
      if (passEl) {
        (passEl as HTMLInputElement).focus();
        // Optional: pre-select in case user wants to overwrite quickly
        (passEl as HTMLInputElement).select?.();
      }
    }, 0);


});

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

<!-- Passphrase field with show/hide eye -->
<div class="field passphrase">
  <label for="mv-pass">Passphrase</label>

  <div class="input-wrap">
    <input
      id="mv-pass"
      type={showPass ? 'text' : 'password'}
      bind:value={pass}
      placeholder="Enter your passphrase"
      autocomplete="current-password"
     
      autocapitalize="off"    
      spellcheck="false"
      inputmode="text"
      required
      aria-describedby="mv-pass-help"
    />

    <!-- Eye toggle; keeps focus in the input -->
    <button
      type="button"
      class="eye"
      aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
      aria-pressed={showPass}
      title={showPass ? 'Hide passphrase' : 'Show passphrase'}
      on:mousedown|preventDefault
      on:touchstart|preventDefault
      on:click={() => (showPass = !showPass)}
    >
      {#if showPass}
        <!-- eye-off icon -->
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor"
            d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l2.14 2.14C2.59 7.02 1.41 8.74 1 9.4a1.8 1.8 0 0 0 0 1.2C3.06 14.1 6.98 17.5 12 17.5c2.01 0 3.8-.44 5.36-1.2l3.11 3.11a.75.75 0 1 0 1.06-1.06L3.53 2.47ZM12 15.99c-4.3 0-7.7-2.86-9.65-5.99C3.36 7.71 5.9 5.8 8.77 5.2l1.82 1.82A4.5 4.5 0 0 0 12 6.5a4.5 4.5 0 0 0 4.5 4.5c.05 0 .09 0 .14-.01l1.65 1.65A10.3 10.3 0 0 1 12 15.99Zm1.29-5.18 2.39 2.39c.2-.36.32-.78.32-1.22A3 3 0 0 0 13.29 10.81Z"/>
          <path fill="currentColor"
            d="M12 4.5c-2.02 0-3.85.44-5.44 1.21l1.2 1.2A10.3 10.3 0 0 1 12 6c4.3 0 7.7 2.86 9.65 5.99-.65 1.04-1.5 2.06-2.5 2.93l1.06 1.06c1.42-1.22 2.54-2.64 3.2-3.79a1.8 1.8 0 0 0 0-1.2C20.94 6.9 17.02 3.5 12 3.5c-.34 0-.68.01-1.01.04L12 4.5Z" opacity=".6"/>
        </svg>
      {:else}
        <!-- eye icon -->
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor"
            d="M12 5c-5.02 0-8.94 3.4-10.99 6.81a1.8 1.8 0 0 0 0 1.38C3.06 16.6 6.98 20 12 20s8.94-3.4 10.99-6.81a1.8 1.8 0 0 0 0-1.38C20.94 8.4 17.02 5 12 5Zm0 12.5c-4.3 0-7.7-2.86-9.65-5.99C4.3 8.36 7.7 5.5 12 5.5s7.7 2.86 9.65 5.99C19.7 14.14 16.3 17.5 12 17.5Zm0-8.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
        </svg>
      {/if}
    </button>
  </div>

  <p id="mv-pass-help" class="hint">Your passphrase never leaves this device.</p>
</div>

  <!-- label>
    Passphrase
    <input type="password" bind:value={pass} autocomplete="current-password" aria-describedby="pass-help" />
  </label>
  <small id="pass-help">Your passphrase never leaves this device.</small -->
  <button disabled={busy || !pass}>Unlock</button>
  {#if err}<div role="alert">{err}</div>{/if}
</form>

<style>
  .unlock { display: grid; gap: .75rem; max-width: 420px; margin: 2rem auto; }
  input { width: 100%; padding: .5rem; }

  .field.passphrase { display: grid; gap: .35rem; }
  .field.passphrase label { font-weight: 600; }

  .input-wrap { 
    position: relative; 
    display: grid; 

  /* 1) Drive spacing from variables so input padding = eye size + gap (no extra space) */

    --eye-size: 32px;   /* desktop/laptop default (tweak 30–36 if you prefer) */
    --eye-gap: 8px;     /* space between eye and input’s right edge */
    --eye-pad: 6px;     /* breathing room inside the text field before the eye */
  }

  .input-wrap input {
    background: var(--field-bg, #0f0f0f);
    color: var(--text, #eaeaea);
    border: 1px solid var(--field-border, #2a2a2a);
    border-radius: 6px;
    padding: .6rem .75rem;
    font-size: 16px;          /* avoid iOS zoom */
    padding-right: calc(var(--eye-size) + var(--eye-gap) + var(--eye-pad));   /* space for the eye button */
    position: relative;
    z-index: 0;
  }


  /* 2) Eye button: perfectly centered and square hover area */
  .eye {
    position: absolute;
    top: 50%;
    right: var(--eye-gap);
    transform: translateY(calc(-50% - 1px));
    inline-size: var(--eye-size +10px);  /* extra width to visually center with input field */
    block-size: var(--eye-size +10px);  /* extra height to visually center with input field */
    display: grid;
    place-items: center;   /* centers the SVG */
    border: 0;
    background: transparent;
    color: var(--muted, #9aa0a6);
    border-radius: 8px;    /* rounded hover shape */
    cursor: pointer;
    z-index: 1;                      /* ✅ sits above input */
    pointer-events: auto;
    touch-action: manipulation;       /* ✅ faster tap handling */
    -webkit-tap-highlight-color: transparent;
  }


  /* Make sure the SVG itself doesn’t add inline spacing */
  .eye svg { display: block; }


  /* Hover/focus states: now centered because the button itself is centered & square */
  .eye:hover {
    background: color-mix(in oklab, Canvas 92%, Highlight 8%);
    color: var(--text, #eaeaea);
  }
  .eye:focus-visible {
    outline: 2px solid var(--focus-ring, #2563eb);
    outline-offset: 2px;
  }

  .hint { color: var(--muted, #9aa0a6); font-size: .85rem; margin: 0; }

  /* Keep your existing .eye styles. Add this for mobile-friendly size */
  @media (max-width: 700px) {
    .eye {
      inline-size: 44px;   /* ✅ recommended touch target */
      block-size: 44px;
      right: .2rem;
    }
  }
  /* 3) Mobile touch target: bigger eye, input padding follows automatically */
  @media (max-width: 700px) {
    .input-wrap { --eye-size: 44px; --eye-gap: 8px; --eye-pad: 6px; }
  }
/* slightly inflate the invisible hitbox of the eye without changing how it looks:Clicks still go to the button itself; the pseudo‑element just extends the target.*/
  .eye::after {
    content: '';
    position: absolute;
    inset: -6px;           /* expands the clickable area by 6px on all sides */
    border-radius: 10px;   /* keep roundish hitbox */
  }

</style>
