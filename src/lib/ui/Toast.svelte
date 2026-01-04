
<!-- src/lib/ui/Toast.svelte -->
<script lang="ts">
  import { toasts } from './toast';
</script>

<style>
  .toast-wrap { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 9999; }
  .toast {
    min-width: 240px; margin-top: .5rem; padding: .6rem .8rem; border-radius: 8px; color: #fff;
    font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  .info { background: #374151; }
  .success { background: #059669; }
  .error { background: #dc2626; }
</style>

<div class="toast-wrap">
  {#each $toasts as t}
    <div class="toast {t.kind || 'info'}" role="status">{t.text}</div>
  {/each}
</div>
