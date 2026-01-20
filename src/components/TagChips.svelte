
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** Two-way bound list of tags */
  export let tags: string[] = [];

  /** Universe of known tags to suggest (pass from the drawer) */
  export let allTags: string[] = [];

  /** Placeholder text */
  export let placeholder = 'Add tags…';

  /** Disable input */
  export let disabled = false;

  /** Normalize/canonicalize a tag token; tweak if you need different casing */
  const normalize = (s: string) => s.trim().toLowerCase();

  /** Comma variants: ASCII ',', full‑width '，'(U+FF0C), ideographic '、'(U+3001) */
  const DELIM_RE = /[,\uFF0C\u3001]+/g;

  const dispatch = createEventDispatcher<{ change: { tags: string[] } }>();

  let q = '';               // current input text
  let composing = false;    // IME composition in progress?
  let show = false;         // show suggestions popover?
  let activeIdx = -1;       // keyboard-highlighted suggestion
  let inputEl: HTMLInputElement | null = null;

  function emitChange() {
    dispatch('change', { tags });
  }

  function addTag(raw: string) {
    const t = normalize(raw);
    if (!t) return;
    if (!tags.includes(t)) {
      tags = [...tags, t];
      emitChange();
    }
  }

  function removeTag(t: string) {
    tags = tags.filter(x => x !== t);
    emitChange();
    inputEl?.focus();
  }

  function tokenizeInput() {
    // Split by any delimiter found and add all except the trailing fragment
    const parts = q.split(DELIM_RE);
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) addTag(parts[i]);
      q = parts[parts.length - 1]; // keep unfinished token
      show = true;
    }
  }

  function commitQ() {
    if (q.trim()) {
      addTag(q);
      q = '';
    }
    activeIdx = -1;
    show = false;
  }

  function onInput() {
    if (!composing) tokenizeInput();   // <- critical for mobile comma behavior
  }

  function onKeydown(e: KeyboardEvent) {
    if (disabled || composing) return;

    switch (e.key) {
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (activeIdx >= 0 && filtered[activeIdx]) {
          addTag(filtered[activeIdx]);
          q = '';
          activeIdx = -1;
          show = true;
          inputEl?.focus();
        } else {
          commitQ();
        }
        break;
      case 'ArrowDown':
        if (filtered.length) {
          e.preventDefault();
          activeIdx = (activeIdx + 1) % filtered.length;
          show = true;
        }
        break;
      case 'ArrowUp':
        if (filtered.length) {
          e.preventDefault();
          activeIdx = (activeIdx - 1 + filtered.length) % filtered.length;
          show = true;
        }
        break;
      case 'Escape':
        if (show) {
          e.preventDefault();
          show = false;
          activeIdx = -1;
        }
        break;
      case 'Backspace':
        if (!q && tags.length) {
          e.preventDefault();
          removeTag(tags[tags.length - 1]);
        }
        break;
      default:
        show = true; // keep popover visible while typing
    }
  }

  function onFocus() {
    show = !!q;
  }

  function onBlur() {
    // Commit trailing text on blur so user input isn’t lost
    commitQ();
  }

  // Suggestions derived from q
  $: needle = normalize(q);
  $: filtered = needle
    ? Array.from(new Set(allTags))
        .map(normalize)
        .filter(t => t.includes(needle) && !tags.includes(t))
        .slice(0, 8)
    : [];

  function chooseSuggestion(s: string) {
    addTag(s);
    q = '';
    activeIdx = -1;
    show = true;
    inputEl?.focus();
  }
</script>

<div class="tag-input" on:focusin={onFocus}>
  <div class="pill" aria-label="tags">
    {#each tags as t (t)}
      <span class="tag">
        {t}
        <button
          type="button"
          class="x"
          on:click={() => removeTag(t)}
          aria-label={`remove ${t}`}
        >×</button>
      </span>
    {/each}

    <input
      bind:this={inputEl}
      class="tag-text-input"
      bind:value={q}
      placeholder={placeholder}
      {disabled}
      on:input={onInput}
      on:keydown={onKeydown}
      on:blur={onBlur}
      on:compositionstart={() => (composing = true)}
      on:compositionend={() => { composing = false; tokenizeInput(); }}

      autocapitalize="off" autocorrect="off" autocomplete="off"
      inputmode="text" enterkeyhint="done" spellcheck="false"
      aria-autocomplete="list"
      aria-expanded={show && filtered.length > 0}
      aria-haspopup="listbox"
    />
  </div>

  {#if show}
    {#if filtered.length === 0 && needle}
      <!-- div class="suggestion-hint">Press Enter to add “{needle}”</div -->
      <div class="suggestion-hint"></div>
    {:else if filtered.length > 0}
      <ul class="suggestions" role="listbox">
        {#each filtered as s, i (s)}
          <li
            role="option"
            aria-selected={i === activeIdx}
            class:selected={i === activeIdx}
            on:mousedown|preventDefault={() => chooseSuggestion(s)}
            on:touchstart|preventDefault={() => chooseSuggestion(s)}
          >{s}</li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  /* Let the UA use proper colors for form controls in both themes */
  .tag-input { position: relative; color-scheme: light dark; }

  /* ---------- Light defaults ---------- */
  .pill {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 8px;
    border: 1px solid var(--mv-border, #ddd);
    border-radius: 10px;
    background: var(--mv-surface, #fff);
    color: var(--mv-text, #111);
  }
  .tag {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--mv-chip, #eee);
    color: var(--mv-chip-fg, #222);
    max-width: 100%;
    font-size: 14px;
  }
  .tag .x {
    border: 0; background: transparent; color: inherit;
    cursor: pointer; line-height: 1; font-size: 14px; padding: 0 2px;
  }
  .tag-text-input {
    min-width: 120px; flex: 1 0 120px;
    border: 0; outline: 0; background: transparent;
    font: inherit; font-size: 16px; /* avoid iOS zoom */
    padding: 4px 0;
    color: var(--mv-input-fg, #111);
    caret-color: var(--mv-input-fg, #111);
  }
  .tag-text-input::placeholder {
    color: var(--mv-muted, #6b7280);
  }

  .suggestion-hint,
  .suggestions {
    position: absolute;
    left: 8px; right: 8px; top: calc(100% + 4px);
    border-radius: 12px;
    z-index: var(--mv-z-popover, 1400); /* raise above drawer */
  }
  .suggestion-hint {
    padding: 10px 12px;
    color: var(--mv-muted, #666);
    background: var(--mv-surface, #fff);
    border: 1px dashed var(--mv-border, #ddd);
  }
  .suggestions {
    max-height: min(40svh, 240px);
    overflow: auto;
    background: var(--mv-menu, #fff);
    border: 1px solid var(--mv-border, #ddd);
    box-shadow: 0 10px 24px rgba(0,0,0,0.18);
    color: var(--mv-text, #111);
  }
  .suggestions li {
    padding: 10px 12px;
    cursor: pointer;
    list-style: none;
  }
  .suggestions li.selected,
  .suggestions li:hover,
  .suggestions li:focus {
    background: var(--mv-hover, #f3f3f3);
    outline: none;
  }

  /* ---------- Dark theme (system) ---------- */
  @media (prefers-color-scheme: dark) {
    .pill {
      border-color: var(--mv-border, #2a2a2a);
      background: var(--mv-surface, #121212);
      color: var(--mv-text, #eaeaea);
    }
    .tag { background: var(--mv-chip, #2a2a2a); color: var(--mv-chip-fg, #eaeaea); }
    .tag .x { color: var(--mv-chip-fg, #cfcfcf); }

    .tag-text-input {
      color: var(--mv-input-fg, #f5f5f5);
      caret-color: var(--mv-input-fg, #f5f5f5);
    }
    .tag-text-input::placeholder { color: var(--mv-muted, #9aa0a6); }

    .suggestion-hint {
      background: var(--mv-menu, #1b1b1b);
      border-color: var(--mv-border, #2a2a2a);
      color: var(--mv-muted, #9aa0a6);
    }
    .suggestions {
      background: var(--mv-menu, #1b1b1b);
      border-color: var(--mv-border, #2a2a2a);
      color: var(--mv-text, #eaeaea);
    }
    .suggestions li.selected,
    .suggestions li:hover,
    .suggestions li:focus {
      background: var(--mv-hover, #242424);
    }
  }

  /* ---------- Dark theme (app toggle) ---------- */
  :global([data-theme="dark"]) .pill {
    border-color: var(--mv-border, #2a2a2a);
    background: var(--mv-surface, #121212);
    color: var(--mv-text, #eaeaea);
  }
  :global([data-theme="dark"]) .tag {
    background: var(--mv-chip, #2a2a2a);
    color: var(--mv-chip-fg, #eaeaea);
  }
  :global([data-theme="dark"]) .tag .x { color: var(--mv-chip-fg, #cfcfcf); }
  :global([data-theme="dark"]) .tag-text-input {
    color: var(--mv-input-fg, #f5f5f5);
    caret-color: var(--mv-input-fg, #f5f5f5);
  }
  :global([data-theme="dark"]) .tag-text-input::placeholder { color: var(--mv-muted, #9aa0a6); }
  :global([data-theme="dark"]) .suggestion-hint {
    background: var(--mv-menu, #1b1b1b);
    border-color: var(--mv-border, #2a2a2a);
    color: var(--mv-muted, #9aa0a6);
  }
  :global([data-theme="dark"]) .suggestions {
    background: var(--mv-menu, #1b1b1b);
    border-color: var(--mv-border, #2a2a2a);
    color: var(--mv-text, #eaeaea);
  }
  :global([data-theme="dark"]) .suggestions li.selected,
  :global([data-theme="dark"]) .suggestions li:hover,
  :global([data-theme="dark"]) .suggestions li:focus {
    background: var(--mv-hover, #242424);
  }
</style>
