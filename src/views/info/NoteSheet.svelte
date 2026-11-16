<script lang="ts">
  import Photo from '../../components/Photo.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { Slot } from '../../lib/info-templates';
  import type { InfoNote, InfoSection } from '../../lib/model/types';
  import { compressPhoto } from '../../lib/photo';
  import { store } from '../../lib/store.svelte';
  import { slug } from '../../seed/csv';

  let {
    open,
    section,
    noteId,
    slot,
    template,
    allowPhoto,
    titleLabel,
    order,
    onclose,
  }: {
    open: boolean;
    section: InfoSection;
    noteId: string | null;
    slot: Slot | null;
    template: string;
    allowPhoto: boolean;
    titleLabel: string;
    order: number;
    onclose: () => void;
  } = $props();

  const existing = $derived(noteId ? store.snapshot!.infoNotes.find((n) => n._id === noteId) : undefined);

  let title = $state('');
  let body = $state('');
  let loadedFor = $state<string | null | undefined>(undefined);
  let fileInput: HTMLInputElement | undefined = $state();
  let busy = $state(false);

  $effect(() => {
    if (!open) {
      loadedFor = undefined;
      return;
    }
    if (loadedFor === noteId) return;
    loadedFor = noteId;
    title = existing?.title ?? slot?.title ?? '';
    body = existing?.body ?? (slot ? '' : template);
  });

  function docToSave(): InfoNote {
    const id =
      existing?._id ?? slot?.id ?? `info:${section}:${slug(title) || 'note'}-${Date.now().toString(36)}`;
    return {
      ...(existing ?? { _id: id, type: 'infoNote', updatedAt: '', order, locked: section === 'medical' }),
      section,
      title: title.trim(),
      body: body.trim(),
    } as InfoNote;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim()) return store.notify(`Fill in the ${titleLabel.toLowerCase()}.`);
    const ok = await store.run((repo) => repo.save(docToSave()), 'Saved.');
    if (ok) onclose();
  }

  async function addPhoto(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    try {
      const photo = await compressPhoto(file);
      const doc = docToSave();
      await store.run(async (repo) => {
        await repo.save(doc);
        await repo.putPhoto(doc._id, photo);
      }, 'Photo saved.');
    } catch (error) {
      store.notify(`Photo not saved: ${(error as Error).message}`);
    } finally {
      busy = false;
    }
  }

  async function removePhoto() {
    if (!existing || !confirm('Remove the photo?')) return;
    await store.run((repo) => repo.removePhoto(existing._id), 'Photo removed.');
  }

  async function remove() {
    if (!existing || !confirm(`Delete “${existing.title}”?`)) return;
    const ok = await store.run((repo) => repo.softDelete(existing._id), 'Deleted.');
    if (ok) onclose();
  }
</script>

<Sheet {open} title={slot?.title ?? existing?.title ?? 'New note'} {onclose}>
  <form onsubmit={save}>
    {#if !slot}
      <label><span>{titleLabel}</span><input bind:value={title} required /></label>
    {:else}
      <p class="muted">{slot.hint}</p>
    {/if}
    <label>
      <span>Details</span>
      <textarea rows="7" bind:value={body}></textarea>
    </label>

    {#if allowPhoto}
      <div class="photo">
        {#if existing?.hasPhoto}
          <Photo noteId={existing._id} rev={existing._rev} alt="Photo: {title}" />
          <button type="button" class="danger" onclick={removePhoto}>Remove photo</button>
        {/if}
        <button type="button" onclick={() => fileInput?.click()} disabled={busy}>
          {busy ? 'Saving photo…' : existing?.hasPhoto ? 'Replace photo' : 'Add photo'}
        </button>
        <input
          bind:this={fileInput}
          class="visually-hidden"
          type="file"
          accept="image/*"
          tabindex="-1"
          aria-label="Photo"
          onchange={addPhoto}
        />
      </div>
    {/if}

    <div class="actions">
      <button class="primary" type="submit">Save</button>
      {#if existing && !slot}<button type="button" class="danger" onclick={remove}>Delete</button>{/if}
    </div>
  </form>
</Sheet>

<style>
  form {
    display: grid;
    gap: 0.8rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input,
  textarea {
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-weight: 400;
  }

  .photo {
    display: grid;
    gap: 0.5rem;
    justify-items: start;
  }

  .actions {
    display: flex;
    justify-content: space-between;
  }

  .danger {
    color: var(--bad);
  }
</style>
