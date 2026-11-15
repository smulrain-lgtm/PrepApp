<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open,
    title,
    onclose,
    children,
  }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} aria-label={title} {onclose}>
  <header>
    <h2>{title}</h2>
    <button type="button" class="close" onclick={onclose}>Done</button>
  </header>
  <div class="body">
    {#if open}{@render children()}{/if}
  </div>
</dialog>

<style>
  dialog {
    border: 0;
    padding: 0;
    margin: auto 0 0;
    width: 100%;
    max-width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top) - 24px);
    border-radius: 16px 16px 0 0;
    background: var(--bg);
    color: var(--text);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.35);
  }

  header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    z-index: 1;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .close {
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
  }

  .body {
    padding: 1rem 1rem calc(1.5rem + env(safe-area-inset-bottom));
  }

  @media (min-width: 744px) {
    dialog {
      margin: auto;
      width: min(640px, 90vw);
      border-radius: 16px;
      max-height: 85dvh;
    }
  }
</style>
