<script lang="ts">
  import { store } from '../lib/store.svelte';

  let { noteId, rev, alt }: { noteId: string; rev: string | undefined; alt: string } = $props();

  let url = $state<string | null>(null);

  $effect(() => {
    void rev; // reload when the note changes
    let cancelled = false;
    let made: string | null = null;
    void store.repo.getPhoto(noteId).then((blob) => {
      if (cancelled || !blob) return;
      made = URL.createObjectURL(blob);
      url = made;
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
      url = null;
    };
  });
</script>

{#if url}<img src={url} {alt} />{/if}

<style>
  img {
    display: block;
    width: 100%;
    max-height: 320px;
    object-fit: contain;
    border-radius: 10px;
    background: var(--surface-2);
    margin-top: 0.5rem;
  }
</style>
