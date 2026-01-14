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
    let tags: string[] = [];
    let notes = '';
    let tagInput = '';
    let pwdOpts = {
        length: 20,
        upper: true,
        lower: true,
        digits: true,
        symbols: true,
        avoidAmbiguous: true
    };

    let nameEl: HTMLInputElement;
    let tagInputEl: HTMLInputElement;
    let suggestions: string[] = [];
    let showSuggestions = false;
    let selectedSuggestionIndex = -1;
    let isSelectingSuggestion = false;

    onMount(() => {
        nameEl?.focus();
    });

    function normalizeTag(s: string): string {
        return s.trim().toLowerCase().slice(0, 32);
    }

    function filterSuggestions(input: string): string[] {
        if (!input.trim()) return [];
        
        const normalized = normalizeTag(input);
        const allTags = $session.allTags || [];
        
        return allTags
            .filter(
                (t) =>
                    t.includes(normalized) &&
                    !tags.includes(t)
            )
            .slice(0, 8);
    }

    function onTagInput(e: Event) {
        const target = e.target as HTMLInputElement;
        tagInput = target.value;
        selectedSuggestionIndex = -1;
        suggestions = filterSuggestions(tagInput);
        showSuggestions = suggestions.length > 0;
    }

    function addTag(t: string) {
        const normalized = normalizeTag(t);
        if (normalized && !tags.includes(normalized)) {
            tags = [...tags, normalized];
            tagInput = '';
            suggestions = [];
            showSuggestions = false;
            selectedSuggestionIndex = -1;
            tagInputEl?.focus();
        }
    }

    function addSuggestionTag(suggestion: string) {
        isSelectingSuggestion = true;
        addTag(suggestion);
        isSelectingSuggestion = false;
        tagInputEl?.focus();
    }

    function removeTag(t: string) {
        tags = tags.filter((x) => x !== t);
        suggestions = filterSuggestions(tagInput);
        showSuggestions = suggestions.length > 0;
    }

    function onTagKey(e: KeyboardEvent) {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            
            if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
                addSuggestionTag(suggestions[selectedSuggestionIndex]);
            } else if (tagInput.trim()) {
                addTag(tagInput);
            }
            
            selectedSuggestionIndex = -1;
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (showSuggestions) {
                selectedSuggestionIndex = Math.min(
                    selectedSuggestionIndex + 1,
                    suggestions.length - 1
                );
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        } else if (e.key === ',' || e.key === ' ') {
            e.preventDefault();
            if (tagInput.trim()) {
                addTag(tagInput);
            }
        } else if (e.key === 'Escape') {
            showSuggestions = false;
            selectedSuggestionIndex = -1;
        }
    }

    function onTagBlur() {
        // Only hide suggestions if not selecting a suggestion
        /*if (!isSelectingSuggestion) {
            setTimeout(() => {
                showSuggestions = false;
                selectedSuggestionIndex = -1;
            }, 150);
        }*/
    }

    function gen() {
        password = generatePassword(pwdOpts);
    }

    async function save() {
        if (!name.trim() || !$session.key) return;

        try {
            const payload: VaultItemPayload = {
                name: name.trim(),
                username: username.trim(),
                password: password.trim(),
                url: url.trim() || undefined,
                tags: tags.map((t) => normalizeTag(t)),
                notes: notes.trim() || undefined
            };

            const id = crypto.randomUUID();
            await createItem($session.key, id, payload);

            await $session.refreshTags?.();

            dispatch('created');
            close();
        } catch (err) {
            console.error('Failed to create item:', err);
        }
    }

    function close() {
        dispatch('close');
    }
</script>

<div class="drawer-overlay" on:click={close} role="presentation">
    <div class="drawer" on:click|stopPropagation role="dialog" aria-label="New Entry">
        <div class="drawer-header">
            <h2>New Entry</h2>
            <button class="close-btn" on:click={close} aria-label="Close">✕</button>
        </div>

        <div class="drawer-content">
            <div class="form-group">
                <label for="name">Name *</label>
                <input
                    id="name"
                    bind:this={nameEl}
                    bind:value={name}
                    type="text"
                    placeholder="e.g., GitHub"
                    required
                />
            </div>

            <div class="form-group">
                <label for="username">Username</label>
                <input
                    id="username"
                    bind:value={username}
                    type="text"
                    placeholder="your username or email"
                />
            </div>

            <div class="form-group">
                <label for="password">Password</label>
                <div class="pwd-row">
                    <input
                        id="password"
                        bind:value={password}
                        type="text"
                        placeholder="enter or generate"
                    />
                    <button type="button" class="gen-btn" on:click={gen} title="Generate password">
                        ⚡
                    </button>
                </div>
            </div>

            <div class="form-group pwd-opts">
                <label>
                    <input type="checkbox" bind:checked={pwdOpts.upper} />
                    Upper (A-Z)
                </label>
                <label>
                    <input type="checkbox" bind:checked={pwdOpts.lower} />
                    Lower (a-z)
                </label>
                <label>
                    <input type="checkbox" bind:checked={pwdOpts.digits} />
                    Digits (2-9)
                </label>
                <label>
                    <input type="checkbox" bind:checked={pwdOpts.symbols} />
                    Symbols (!@#$)
                </label>
                <label>
                    <input type="checkbox" bind:checked={pwdOpts.avoidAmbiguous} />
                    Avoid Ambiguous
                </label>
                <label>
                    Length:
                    <input type="number" bind:value={pwdOpts.length} min="4" max="128" />
                </label>
            </div>

            <div class="form-group">
                <label for="url">URL</label>
                <input
                    id="url"
                    bind:value={url}
                    type="url"
                    placeholder="https://example.com"
                />
            </div>

            <div class="form-group">
                <label for="tag-input">Tags</label>
                <div class="tag-input-wrapper">
                    <div class="tag-chips">
                        {#each tags as tag (tag)}
                            <div class="tag-chip">
                                <span>{tag}</span>
                                <button
                                    type="button"
                                    class="tag-remove"
                                    on:click={() => removeTag(tag)}
                                    aria-label="Remove tag {tag}"
                                >
                                    ×
                                </button>
                            </div>
                        {/each}
                    </div>
                    <div class="tag-input-container">
                        <input
                            id="tag-input"
                            bind:this={tagInputEl}
                            bind:value={tagInput}
                            type="text"
                            placeholder="Add tags (press Enter or comma)"
                            on:input={onTagInput}
                            on:keydown={onTagKey}
                            on:blur={onTagBlur}
                            autocomplete="off"
                        />
                        {#if showSuggestions && suggestions.length > 0}
                            <div class="tag-suggestions">
                                {#each suggestions as suggestion, idx (suggestion)}
                                    <button
                                        type="button"
                                        class="suggestion-item"
                                        class:selected={idx === selectedSuggestionIndex}
                                        on:click={() => addSuggestionTag(suggestion)}
                                        on:mouseenter={() => (selectedSuggestionIndex = idx)}
                                        on:mouseleave={() => (selectedSuggestionIndex = -1)}
                                        on:mousedown={(e) => e.preventDefault()}
                                    >
                                        {suggestion}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label for="notes">Notes</label>
                <textarea
                    id="notes"
                    bind:value={notes}
                    placeholder="Additional notes (max 4000 chars)"
                    maxlength="4000"
                    rows="4"
                />
                <small>{notes.length}/4000</small>
            </div>
        </div>

        <div class="drawer-footer">
            <button class="btn btn-secondary" on:click={close}>Cancel</button>
            <button class="btn btn-primary" on:click={save} disabled={!name.trim()}>
                Create Entry
            </button>
        </div>
    </div>
</div>

<style>
    .drawer-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: flex-end;
        z-index: 100;
        animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    .drawer {
        width: 100%;
        max-width: 500px;
        max-height: 90vh;
        background: var(--panel);
        border-radius: 12px 12px 0 0;
        display: flex;
        flex-direction: column;
        box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
        animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
        from {
            transform: translateY(100%);
        }
        to {
            transform: translateY(0);
        }
    }

    @media (min-width: 600px) {
        .drawer {
            border-radius: 12px;
            margin: auto;
            max-height: 85vh;
        }

        .drawer-overlay {
            align-items: center;
            justify-content: center;
        }
    }

    .drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border, #e0e0e0);
    }

    .drawer-header h2 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--text);
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--muted);
        padding: 4px 8px;
        border-radius: 4px;
    }

    .close-btn:hover {
        background: var(--hover-bg, rgba(0, 0, 0, 0.05));
    }

    .drawer-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .form-group label {
        font-weight: 500;
        color: var(--text);
        font-size: 0.9rem;
    }

    .form-group input[type='text'],
    .form-group input[type='email'],
    .form-group input[type='url'],
    .form-group textarea {
        padding: 10px 12px;
        border: 1px solid var(--field-border, #d0d0d0);
        border-radius: 6px;
        font-size: 1rem;
        font-family: inherit;
        background: var(--field-bg, #fff);
        color: var(--text);
        min-width: 0;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .form-group input:focus,
    .form-group textarea:focus {
        outline: none;
        border-color: var(--primary, #007bff);
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    }

    .form-group textarea {
        resize: vertical;
        min-height: 80px;
    }

    .form-group small {
        font-size: 0.8rem;
        color: var(--muted);
        margin-top: 4px;
    }

    .pwd-row {
        display: flex;
        gap: 8px;
    }

    .pwd-row input {
        flex: 1;
    }

    .gen-btn {
        padding: 10px 12px;
        border: 1px solid var(--field-border, #d0d0d0);
        border-radius: 6px;
        background: var(--field-bg, #fff);
        color: var(--text);
        cursor: pointer;
        font-size: 1.1rem;
        transition: all 0.2s;
    }

    .gen-btn:hover {
        background: var(--hover-bg, rgba(0, 0, 0, 0.05));
    }

    .gen-btn:active {
        transform: scale(0.95);
    }

    .pwd-opts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        padding: 12px;
        background: var(--bg, #fafafa);
        border-radius: 6px;
    }

    .pwd-opts label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: normal;
        font-size: 0.85rem;
        cursor: pointer;
    }

    .pwd-opts input[type='checkbox'] {
        cursor: pointer;
    }

    .pwd-opts input[type='number'] {
        width: 60px;
        padding: 4px;
        border: 1px solid var(--field-border, #d0d0d0);
        border-radius: 4px;
        font-size: 0.85rem;
    }

    .tag-input-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .tag-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-height: 32px;
    }

    .tag-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        background: var(--chip-bg, #e0e7ff);
        color: var(--chip-fg, #1e3a8a);
        border: 1px solid var(--chip-border, #bfdbfe);
        border-radius: 16px;
        font-size: 0.85rem;
        white-space: nowrap;
    }

    .tag-remove {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 1.1rem;
        padding: 0;
        display: flex;
        align-items: center;
        opacity: 0.7;
        transition: opacity 0.2s;
    }

    .tag-remove:hover {
        opacity: 1;
    }

    .tag-input-container {
        position: relative;
    }

    .tag-input-container input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--field-border, #d0d0d0);
        border-radius: 6px;
        font-size: 1rem;
        font-family: inherit;
        background: var(--field-bg, #fff);
        color: var(--text);
    }

    .tag-input-container input:focus {
        outline: none;
        border-color: var(--primary, #007bff);
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
    }

    .tag-suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 4px;
        background: var(--panel);
        border: 1px solid var(--field-border, #d0d0d0);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        z-index: 200;
        max-height: 200px;
        overflow-y: auto;
    }

    .suggestion-item {
        display: block;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: transparent;
        color: var(--text);
        text-align: left;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background-color 0.15s;
    }

    .suggestion-item:hover,
    .suggestion-item.selected {
        background-color: var(--hover-bg, rgba(0, 0, 0, 0.05));
    }

    .suggestion-item:first-child {
        border-radius: 5px 5px 0 0;
    }

    .suggestion-item:last-child {
        border-radius: 0 0 5px 5px;
    }

    .drawer-footer {
        display: flex;
        gap: 12px;
        padding: 20px;
        border-top: 1px solid var(--border, #e0e0e0);
        background: var(--bg, #fafafa);
        border-radius: 0 0 12px 12px;
    }

    @media (min-width: 600px) {
        .drawer-footer {
            border-radius: 0 0 12px 12px;
        }
    }

    .btn {
        flex: 1;
        padding: 12px 16px;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
    }

    .btn-primary {
        background: var(--primary, #007bff);
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        background: var(--primary-dark, #0056b3);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
    }

    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-secondary {
        background: var(--secondary, #f0f0f0);
        color: var(--text);
        border: 1px solid var(--border, #e0e0e0);
    }

    .btn-secondary:hover {
        background: var(--hover-bg, #e8e8e8);
    }

    @media (prefers-color-scheme: dark) {
        .drawer {
            background: var(--panel, #1e1e1e);
        }

        .drawer-header {
            border-bottom-color: var(--border, #333);
        }

        .tag-input-container input,
        .form-group input,
        .form-group textarea {
            background: var(--field-bg, #2a2a2a);
            color: var(--text, #e0e0e0);
            border-color: var(--field-border, #444);
        }

        .tag-suggestions {
            background: var(--panel, #1e1e1e);
            border-color: var(--field-border, #444);
        }
    }

    @media (pointer: coarse) {
        .tag-chip {
            min-height: 40px;
        }

        input,
        textarea,
        button {
            font-size: 16px;
        }
    }
</style>
