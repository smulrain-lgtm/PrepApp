<script lang="ts">
  import Photo from '../../components/Photo.svelte';
  import NoteSheet from './NoteSheet.svelte';
  import { GRAB_BAG_TEMPLATE, MEDICAL_TEMPLATE, SLOTS, type Slot } from '../../lib/info-templates';
  import type { InfoNote, InfoSection } from '../../lib/model/types';
  import { store } from '../../lib/store.svelte';

  let { section, intro = '' }: { section: InfoSection; intro?: string } = $props();

  const slots = $derived(SLOTS[section] ?? []);
  const notes = $derived(
    store
      .snapshot!.infoNotes.filter((n) => n.section === section && !n.deleted)
      .sort((a, b) => a.order - b.order),
  );
  const slotIds = $derived(new Set(slots.map((s) => s.id)));
  const extras = $derived(notes.filter((n) => !slotIds.has(n._id)));

  /** Sections where each person gets their own note. */
  const perPerson = $derived(section === 'grabbag' || section === 'medical');
  const addLabel = $derived(
    section === 'grabbag' ? 'Add a person’s bag' : section === 'medical' ? 'Add a person' : 'Add a note',
  );
  const template = $derived(
    section === 'grabbag' ? GRAB_BAG_TEMPLATE : section === 'medical' ? MEDICAL_TEMPLATE : '',
  );
  const allowPhoto = $derived(section === 'shutoffs' || section === 'documents');

  let open = $state(false);
  let noteId = $state<string | null>(null);
  let slot = $state<Slot | null>(null);

  function edit(id: string | null, s: Slot | null = null) {
    noteId = id;
    slot = s;
    open = true;
  }

  const noteFor = (id: string): InfoNote | undefined => notes.find((n) => n._id === id);
</script>

{#if intro}<p class="muted">{intro}</p>{/if}

<ul class="list">
  {#each slots as s (s.id)}
    {@const note = noteFor(s.id)}
    <li class="card">
      <button class="open" onclick={() => edit(s.id, s)}>
        <strong>{s.title}</strong>
        {#if note?.body}
          <span class="body">{note.body}</span>
        {:else}
          <span class="muted empty">{s.hint} — tap to fill in</span>
        {/if}
      </button>
      {#if note?.hasPhoto}<Photo noteId={note._id} rev={note._rev} alt="Photo: {s.title}" />{/if}
    </li>
  {/each}
  {#each extras as note (note._id)}
    <li class="card">
      <button class="open" onclick={() => edit(note._id)}>
        <strong>{note.title}</strong>
        <span class="body">{note.body}</span>
      </button>
      {#if note.hasPhoto}<Photo noteId={note._id} rev={note._rev} alt="Photo: {note.title}" />{/if}
    </li>
  {/each}
</ul>

{#if perPerson || !slots.length || section === 'documents'}
  <button class="add" onclick={() => edit(null)}>{addLabel}</button>
{/if}

<NoteSheet
  {open}
  {section}
  {noteId}
  {slot}
  {template}
  {allowPhoto}
  titleLabel={perPerson ? 'Person' : 'Title'}
  order={notes.length + slots.length}
  onclose={() => (open = false)}
/>

<style>
  .list {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }

  .open {
    display: grid;
    gap: 0.3rem;
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    padding: 0;
    min-height: 44px;
  }

  .body {
    white-space: pre-line;
  }

  .empty {
    font-size: 0.9rem;
  }
</style>
