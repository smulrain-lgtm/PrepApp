<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import { liveLists, listIdOf, newEntryId } from '../lib/lists';
  import type { Purchase } from '../lib/model/types';
  import { store } from '../lib/store.svelte';

  /** Add or edit one entry on a list. */
  let {
    open,
    entry,
    listId,
    category = '',
    onclose,
  }: {
    open: boolean;
    /** The entry to edit, or null to add one. */
    entry: Purchase | null;
    /** The list a new entry goes on. */
    listId: string;
    /** Category a new entry starts in (from a group's Add button). */
    category?: string;
    onclose: () => void;
  } = $props();

  const snap = $derived(store.snapshot!);
  const lists = $derived(liveLists(snap));
  const items = $derived(snap.items.filter((i) => !i.deleted).sort((a, b) => a.name.localeCompare(b.name)));
  /** Suggestions: inventory categories and the categories already used on lists. */
  const categoryNames = $derived([
    ...new Set([
      ...snap.categories.filter((c) => !c.deleted).map((c) => c.name),
      ...snap.purchases.filter((p) => !p.deleted && p.category).map((p) => p.category),
    ]),
  ]);

  let form = $state({
    name: '',
    quantity: '1',
    category: '',
    notes: '',
    itemId: '',
    listId: '',
    bought: false,
  });
  let loaded = $state(false);

  $effect(() => {
    if (!open) {
      loaded = false;
      return;
    }
    if (loaded) return;
    loaded = true;
    form = entry
      ? {
          name: entry.name,
          quantity: entry.quantity,
          category: entry.category,
          notes: entry.notes ?? '',
          itemId: entry.itemId ?? '',
          listId: listIdOf(entry),
          bought: entry.status === 'bought',
        }
      : { name: '', quantity: '1', category, notes: '', itemId: '', listId, bought: false };
  });

  /** Linking an inventory item fills in a blank name and category. */
  function onItemChange() {
    const item = snap.items.find((i) => i._id === form.itemId);
    if (!item) return;
    if (!form.name.trim()) form.name = item.name;
    if (!form.category.trim())
      form.category = snap.categories.find((c) => c._id === item.categoryId)?.name ?? '';
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return store.notify('Give the entry a name.');
    const now = new Date().toISOString();
    const doc: Purchase = {
      ...(entry ?? {
        _id: newEntryId(name, now),
        type: 'purchase',
        updatedAt: now,
        order: Math.max(0, ...snap.purchases.map((p) => p.order)) + 1,
      }),
      name,
      quantity: form.quantity.trim(),
      category: form.category.trim(),
      notes: form.notes.trim() || undefined,
      itemId: form.itemId || undefined,
      listId: form.listId,
      status: form.bought ? 'bought' : 'to_buy',
    } as Purchase;
    const ok = await store.run((repo) => repo.save(doc), entry ? 'Saved.' : `Added ${name}.`);
    if (ok) onclose();
  }

  async function remove() {
    if (!entry || !confirm(`Remove “${entry.name}” from the list?`)) return;
    const ok = await store.run((repo) => repo.softDelete(entry._id), 'Removed.');
    if (ok) onclose();
  }
</script>

<Sheet {open} title={entry ? entry.name : 'Add to list'} {onclose}>
  <form onsubmit={save}>
    <label>
      <span>Name</span>
      <input bind:value={form.name} required data-testid="entry-name" />
    </label>
    <div class="two">
      <label>
        <span>Quantity</span>
        <input
          bind:value={form.quantity}
          placeholder="e.g. 4, or 2 large jars"
          data-testid="entry-quantity"
        />
      </label>
      <label>
        <span>Category</span>
        <input bind:value={form.category} list="entry-categories" data-testid="entry-category" />
        <datalist id="entry-categories">
          {#each categoryNames as c (c)}<option value={c}></option>{/each}
        </datalist>
      </label>
    </div>
    <label>
      <span>Inventory item <span class="muted hint">(optional: Purchased then adds to it)</span></span>
      <select bind:value={form.itemId} onchange={onItemChange}>
        <option value="">Not linked</option>
        {#each items as i (i._id)}<option value={i._id}>{i.name}</option>{/each}
      </select>
    </label>
    <label>
      <span>List</span>
      <select bind:value={form.listId}>
        {#each lists as l (l._id)}<option value={l._id}>{l.name}</option>{/each}
      </select>
    </label>
    <label>
      <span>Notes</span>
      <textarea rows="2" bind:value={form.notes}></textarea>
    </label>
    {#if entry}
      <label class="check">
        <input type="checkbox" bind:checked={form.bought} /> Bought (without adding it to the inventory)
      </label>
    {/if}
    <div class="actions">
      <button class="primary" type="submit">{entry ? 'Save changes' : 'Add to list'}</button>
      {#if entry}<button type="button" class="danger" onclick={remove}>Remove</button>{/if}
    </div>
  </form>
</Sheet>

<style>
  form {
    display: grid;
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  label.check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    font-weight: 400;
  }

  .hint {
    font-weight: 400;
    font-size: 0.85rem;
  }

  input:not([type='checkbox']),
  select,
  textarea {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-weight: 400;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .danger {
    color: var(--bad);
  }
</style>
