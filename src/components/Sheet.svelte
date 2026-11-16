<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open,
    title,
    onclose,
    children,
  }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  /** iPad landscape and Mac: a detail pane beside the list instead of a modal sheet. */
  const wide = () => window.matchMedia('(min-width: 1024px)').matches;
  let asPane = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      asPane = wide();
      if (asPane) dialog.show();
      else dialog.showModal();
      document.body.classList.toggle('pane-open', asPane);
    }
    if (!open && dialog.open) {
      closingByApp = true;
      dialog.close();
      document.body.classList.remove('pane-open');
    }
  });

  /**
   * Set while the app closes the dialog itself. The browser reports that close
   * a moment later; by then the sheet may have been opened again (a quick tap
   * on another row), so that report must not close it.
   */
  let closingByApp = false;

  function onDialogClose() {
    if (closingByApp) {
      closingByApp = false;
      return;
    }
    onclose(); // closed by the person (Escape)
  }

  function onkeydown(event: KeyboardEvent) {
    // A non-modal pane does not close on Escape by itself.
    if (asPane && event.key === 'Escape') onclose();
  }
</script>

<dialog bind:this={dialog} class:pane={asPane} aria-label={title} onclose={onDialogClose} {onkeydown}>
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

  /* Detail pane: fixed to the right, the list stays usable beside it. */
  dialog.pane {
    position: fixed;
    inset: 0 0 0 auto;
    margin: 0;
    width: 420px;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border-left: 1px solid var(--border);
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.08);
    overflow-y: auto;
    z-index: 30;
    padding-top: env(safe-area-inset-top);
  }
</style>
