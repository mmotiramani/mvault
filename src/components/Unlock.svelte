
<script lang="ts">
  import { initHeader, unlock } from '../lib/app/session';
  import { onMount } from 'svelte';
  let pass = '';
  let passEl: HTMLInputElement | null = null; // <-- ref to the input
  let busy = false;
  let err: string | null = null;
  let showPass = false;

  let passInput: HTMLInputElement | null = null;

  function toggleShow() {
    showPass = !showPass;
    // keep typing flow nice: refocus the input without scrolling
    passInput?.focus({ preventScroll: true });
  }



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

  <!-- Segmented input: input + trailing eye button -->
  <div class="input-group">
    <input
      id="mv-pass"
      bind:this={passInput}
      type={showPass ? 'text' : 'password'}
      bind:value={pass}
      placeholder="Enter your passphrase"
      autocomplete="current-password"
      autocapitalize="off"
      spellcheck="false"
      inputmode="text"
      required
    />
        <button
          aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
          aria-pressed={showPass}
          on:click={toggleShow}
          title="Click to reveal"
          type="button"
        >👁️</button>
    <!-- button
      type="button"
      class="eye-btn"
      aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
      aria-pressed={showPass}
      on:click={toggleShow}
      on:touchstart|preventDefault  
    >
      {#if showPass}
        < !-- eye-off -- >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor"
            d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l2.14 2.14C2.59 7.02 1.41 8.74 1 9.4a1.8 1.8 0 0 0 0 1.2C3.06 14.1 6.98 17.5 12 17.5c2.01 0 3.8-.44 5.36-1.2l3.11 3.11a.75.75 0 1 0 1.06-1.06L3.53 2.47ZM12 15.99c-4.3 0-7.7-2.86-9.65-5.99C3.36 7.71 5.9 5.8 8.77 5.2l1.82 1.82A4.5 4.5 0 0 0 12 6.5a4.5 4.5 0 0 0 4.5 4.5c.05 0 .09 0 .14-.01l1.65 1.65A10.3 10.3 0 0 1 12 15.99Z"/>
          <path fill="currentColor"
            d="M12 4.5c-2.02 0-3.85.44-5.44 1.21l1.2 1.2A10.3 10.3 0 0 1 12 6c4.3 0 7.7 2.86 9.65 5.99-.65 1.04-1.5 2.06-2.5 2.93l1.06 1.06c1.42-1.22 2.54-2.64 3.2-3.79a1.8 1.8 0 0 0 0-1.2C20.94 6.9 17.02 3.5 12 3.5c-.34 0-.68.01-1.01.04L12 4.5Z" opacity=".6"/>
        </svg>
      {:else}
        < !-- eye -- >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor"
            d="M12 5c-5.02 0-8.94 3.4-10.99 6.81a1.8 1.8 0 0 0 0 1.38C3.06 16.6 6.98 20 12 20s8.94-3.4 10.99-6.81a1.8 1.8 0 0 0 0-1.38C20.94 8.4 17.02 5 12 5Zm0 12.5c-4.3 0-7.7-2.86-9.65-5.99C4.3 8.36 7.7 5.5 12 5.5s7.7 2.86 9.65 5.99C19.7 14.14 16.3 17.5 12 17.5Zm0-8.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
        </svg>
      {/if}
    </button -->
  </div>

  <p class="hint">Your passphrase never leaves this device.</p>
</div>


  <!-- label>
    Passphrase
    <input type="password" bind:value={pass} autocomplete="current-password" aria-describedby="pass-help" />
  </label>
  <small id="pass-help">Your passphrase never leaves this device.</small -->
  <button disabled={busy || !pass} type="submit">Unlock</button>
  {#if err}<div role="alert">{err}</div>{/if}
</form>


<style>
  .unlock {
    display: grid;
    gap: .75rem;
    max-width: 420px;
    margin: 2rem auto;
  }

  /* Keep generic input rule minimal so it doesn't fight the passphrase field */
  .unlock input {
    width: 80%;
    box-sizing: border-box;
  }

  .field.passphrase { display: grid; gap: .4rem; }
  .field.passphrase label { font-weight: 600; }

  /* Container for input + eye (absolute eye) */
  .input-wrap {
    position: relative;
    display: grid;

    /* Drive sizes from variables so spacing always lines up */
    --eye-size: 32px;   /* desktop/laptop eye button size */
    --eye-gap: 8px;     /* distance from input's right edge */
    --eye-pad: 6px;     /* breathing room before the eye inside the field */
  }

  /* Passphrase input */
  .input-wrap input {
    background: var(--field-bg, #0f0f0f);
    color: var(--text, #eaeaea);
    border: 1px solid var(--field-border, #2a2a2a);
    border-radius: 6px;
    padding: .6rem .75rem;
    font-size: 16px; /* avoid iOS zoom */
    /* Exact space for the eye: width + gap + inner pad (no dead space) */
    padding-right: calc(var(--eye-size) + var(--eye-gap) + var(--eye-pad));
    position: relative;
    z-index: 0;
  }

  /* Eye button: square, centered, above the input */
  .eye {
    position: absolute;
    top: 50%;
    right: var(--eye-gap);
    transform: translateY(-50%); /* remove -1px nudge for true centering */

    /* Square tap target – change only --eye-size to scale both dimensions */
    inline-size: var(--eye-size);
    block-size: var(--eye-size);

    display: grid;
    place-items: center; /* center the SVG */
    border: 0;
    background: transparent;
    color: var(--muted, #9aa0a6);
    border-radius: 8px;
    cursor: pointer;

    z-index: 1;                       /* sits above the input */
    touch-action: manipulation;       /* better tap response */
    -webkit-tap-highlight-color: transparent;
  }

  /* Make sure SVG doesn't add stray inline space */
  .eye svg { display: block; pointer-events: none; }

  /* Centered hover/focus visuals */
  .eye:hover {
    background: color-mix(in oklab, Canvas 92%, Highlight 8%);
    color: var(--text, #eaeaea);
  }
  .eye:focus-visible {
    outline: 2px solid var(--focus-ring, #2563eb);
    outline-offset: 2px;
  }

  .hint { color: var(--muted, #9aa0a6); font-size: .85rem; margin: 0; }

  /* Expand invisible hitbox slightly without changing how it looks */
  .eye::after {
    content: '';
    position: absolute;
    inset: -6px;           /* +6px around for easier taps */
    border-radius: 10px;
  }

  /* Mobile: enforce at least 44x44 target; input padding updates automatically */
  @media (max-width: 700px) {
    .input-wrap { --eye-size: 44px; --eye-gap: 8px; --eye-pad: 6px; }
    .eye { right: var(--eye-gap); }
  }
</style>

