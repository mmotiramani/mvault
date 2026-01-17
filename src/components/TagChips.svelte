
<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { session } from '../lib/app/session'; // note: path from src/lib/ui

  /** Two-way bound list of tags (lowercase, deduped) */
  export let tags: string[] = [];

  /** Optional UX props */
  export let allTags: string[] = [];
  export let placeholder = 'Add tags…';  
  /** Disable input */
  export let disabled = false;

  export let maxSuggestions = 8;
  const normalize = (t:string) => t.trim().toLowerCase();
  //function normalize(t: string) { return (t || '').trim().toLowerCase(); }
 /** Comma variants: ASCII ',', full‑width '，', ideographic '、' */
  const DELIM_RE = /[,\uFF0C\u3001]+/g;

  const dispatch = createEventDispatcher<{ change: {tags: string[] } }>();

  // Global unique tags across the vault (maintained by session)

   // Input & suggestions state
  let q = '';
  let composing = false;    // IME composition in progress?
  let show = false;        // dropdown visibility
  let activeIdx = -1;      // keyboard focus within suggestions
  let inputEl: HTMLInputElement | null = null;

  const unsub = session.subscribe(s => { allTags = s.allTags || []; });

 
  function emitChange() {
    // bubble up so drawers can mark dirty
    dispatch('change', { tags });
  }

  function setTags(next: string[]) {
    // ensure normalized + unique + sorted
    const set = new Set(next.map(normalize).filter(Boolean));
    tags = Array.from(set).sort();
    dispatch('change', tags);
  }

  function addTag(t: string) {
    const v = normalize(t);
    if (!v) return false;
    if (!tags.includes(v)) {
      tags = ([...tags, v]);
      emitChange();
      //return true;
    }
    //return false;
  }

  function removeTag(t: string) {
    tags = tags.filter(x => x !== t);
    emitChange();
    // keep focus for fast multi-remove
    inputEl?.focus();
  }

  function tokenizeInput() {
    // Split by any delimiter found and add all except the trailing fragment
    const parts = q.split(DELIM_RE);
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) addTag(parts[i]);
      q = parts[parts.length - 1]; // keep unfinished token
      // keep suggestions open while tokenizing
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
    if (!composing) {
      tokenizeInput();  // <- critical for mobile comma behavior
    }    
    //q = (e.target as HTMLInputElement).value;
    //show = true;
    //activeIdx = -1;
  }
   function toggleTag(t: string) {
    tags.includes(t) ? removeTag(t) : addTag(t);
  }

  function candidateList() {
    const needle = normalize(q);
    const src = allTags || [];
    const filtered = needle
      ? src.filter(t => t.startsWith(needle))
      : src.slice(); // on focus with empty query: show popular/all (session already sorted if you choose)
    // exclude already chosen
    const out = filtered.filter(t => !tags.includes(t));
    // dedupe + clamp
    return Array.from(new Set(out)).slice(0, maxSuggestions);
  }

  $: suggestions = candidateList();

  function onFocus() {
    // Show suggestions immediately on focus (even with empty query)
    show = true;
    activeIdx = -1;
  }



  function onKeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (composing) return;  
    //if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
    switch (e.key) {
      case 'Enter':
      case 'Tab':  
        e.preventDefault();
        if (activeIdx >= 0 && filtered[activeIdx]) {
          addTag(filtered[activeIdx]);
          //activeIdx < suggestions.length) {
        //const s = suggestions[activeIdx];
        //addTag(s);
        // Keep dropdown open for multi-select; keep query same to add more
        // Optionally clear query to broaden choices:
          q = '';
          activeIdx = -1;
          show = true;
          inputEl?.focus();
      } else {
          commitQ();
        }
        break;
    case 'ArrowDown' :
     {
      if (filtered.length) {
      e.preventDefault();

      activeIdx = (activeIdx + 1) % filtered.length;
      show = true;
      }
      break;
    } else if (e.key === 'Backspace' && !q) {
      // remove last chip when input empty
      if (tags.length) {
        setTags(tags.slice(0, -1));
      }
    }
  case 'ArrowUp':
    {
      e.preventDefault();
      show = true;
      activeIdx = suggestions.length ? (activeIdx - 1 + suggestions.length) % suggestions.length : -1;

    } else if (e.key === 'Escape') {
      show = false;
      activeIdx = -1;
    }
  }

  function onBlur() {
    // Small delay so clicks on suggestions still register
    // setTimeout(() => { show = false; activeIdx = -1; }, 100);
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

 // Keep popover open when mouse/touch interacts with options
  function chooseSuggestion(s: string) {
    addTag(s);
    q = '';
    activeIdx = -1;
    show = true;
    inputEl?.focus();
  }
    function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!text || (!text.includes(',') && !text.includes(' '))) return;
    e.preventDefault();
    const parts = text.split(/[, ]+/).map(normalize).filter(Boolean);
    if (parts.length) {
      setTags([...tags, ...parts]);
      q = '';
      show = true;
      activeIdx = -1;
    }
  }

  onDestroy(() => unsub());
</script>

<div class="chips" on:click={() => inputEl?.focus()}>
  {#each tags as t (t)}
    <span class="chip">{t}
      <button class="x" on:click={() => removeTag(t)} aria-label={`remove ${t}`}>×</button>
    </span>
  {/each}

  <input
    bind:this={inputEl}
    class="chip-input"
    type="text"
    bind:value={q}
    placeholder={placeholder}
    on:focus={onFocus}
    on:input={onInput}
    on:keydown={onKeydown}
    on:blur={onBlur}
    on:paste={onPaste}
    autocomplete="off"
    autocapitalize="none"
    spellcheck="false"
  />

  {#if show}
    <div class="suggestions" role="listbox" aria-label="tag suggestions">
      {#if suggestions.length === 0 && normalize(q)}
        <div class="hint">Press Enter to add “{normalize(q)}”</div>
      {:else}
        {#each suggestions as s, i (s)}
          <button
            type="button"
            class:selected={i === activeIdx}
            role="option"
            aria-selected={i === activeIdx}
            title={tags.includes(s) ? 'Already added' : `Add ${s}`}
            on:mousedown|preventDefault={() => {
              // Multi-select: click adds; keep open
              addTag(s);
              q = '';
              activeIdx = -1;
              show = true;
              inputEl?.focus();
            }}
          >{s}</button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .chips {
    display: flex; flex-wrap: wrap; gap: .5rem;
    align-items: center; position: relative;
  }
  .chip {
    display: inline-flex; align-items: center; gap: .35rem;
    padding: .25rem .5rem; border-radius: 12px;
    background: var(--chip-bg, #2a2a2a); color: #ddd;
  }
  .x { background: none; border: none; color: #b00020; cursor: pointer; }

  .chip-input {
    min-width: 140px; padding: .4rem .5rem;
    border: 1px solid #2a2a2a; border-radius: 6px;
    background: #1f1f1f; color: #ddd;
    outline: none;
  }

  .suggestions {
    position: absolute; left: 0; top: calc(100% + 4px); z-index: 10;
    display: grid; gap: 2px; min-width: 240px; max-height: 220px; overflow: auto;
    background: #1b1b1b; border: 1px solid #2a2a2a; border-radius: 6px; padding: 4px;
    box-shadow: 0 6px 18px rgba(0,0,0,.35);
  }
  .suggestions > button {
    text-align: left; background: none; border: none; color: #ddd;
    padding: .35rem .5rem; border-radius: 4px; cursor: pointer;
  }
  .suggestions > button.selected,
  .suggestions > button:hover { background: #2a2a2a; }
  .hint { color: #aaa; padding: .35rem .5rem; }
</style>
