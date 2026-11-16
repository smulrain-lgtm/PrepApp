<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import {
    itemsIn,
    moveCategory,
    newCategoryId,
    planSubCategories,
    subCategoriesOf,
    type SubCategoryEdit,
  } from '../lib/categories';
  import type { Category, Metric } from '../lib/model/types';
  import { store } from '../lib/store.svelte';

  const METRIC_LABEL: Record<Metric, string> = {
    water_l: 'Litres of water',
    kcal: 'Calories (kcal)',
    pet_food_g: 'Grams of pet food',
    fuel_g: 'Grams of cooking gas',
    med_days: 'Days of medicine cover',
    light_days: 'Days of lighting',
    none: 'Does not count (equipment)',
  };

  const snap = $derived(store.snapshot!);
  const categories = $derived(snap.categories.filter((c) => !c.deleted));

  // --- Editor ----------------------------------------------------------------
  let editing = $state<Category | null>(null);
  let sheetOpen = $state(false);
  let name = $state('');
  let metric = $state<Metric>('none');
  let subs = $state<SubCategoryEdit[]>([]);
  let newSub = $state('');

  const editingItems = $derived(editing ? itemsIn(editing._id, snap.items) : []);
  const useCount = (sub: string | null) =>
    sub === null ? 0 : editingItems.filter((i) => i.subCategory?.trim() === sub).length;

  function openEditor(category: Category | null) {
    editing = category;
    name = category?.name ?? '';
    metric = category?.defaultMetric ?? 'none';
    subs = category ? subCategoriesOf(category, snap.items).map((n) => ({ original: n, name: n })) : [];
    newSub = '';
    sheetOpen = true;
  }

  function addSub(event?: Event) {
    event?.preventDefault();
    const n = newSub.trim();
    if (!n) return;
    if (subs.some((s) => s.name.trim().toLowerCase() === n.toLowerCase()))
      return store.notify(`“${n}” is already listed.`);
    subs = [...subs, { original: null, name: n }];
    newSub = '';
  }

  function moveSub(index: number, direction: -1 | 1) {
    const to = index + direction;
    if (to < 0 || to >= subs.length) return;
    const next = [...subs];
    [next[index], next[to]] = [next[to], next[index]];
    subs = next;
  }

  function removeSub(index: number) {
    subs = subs.filter((_, i) => i !== index);
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return store.notify('Give the category a name.');
    if (categories.some((c) => c._id !== editing?._id && c.name.trim().toLowerCase() === clean.toLowerCase()))
      return store.notify(`There is already a category called “${clean}”.`);
    const pending = newSub.trim() ? [...subs, { original: null, name: newSub }] : subs;
    const id = editing?._id ?? newCategoryId(clean, snap.categories);
    const plan = planSubCategories(id, $state.snapshot(pending), snap.items);
    if (plan.errors.length) return store.notify(plan.errors[0]);
    if (plan.removedInUse.length) {
      const list = plan.removedInUse
        .map((r) => `“${r.name}” (${r.count} item${r.count === 1 ? '' : 's'})`)
        .join(', ');
      if (!confirm(`Remove ${list}? Those items will have no sub-category.`)) return;
    }
    const maxOrder = Math.max(-1, ...snap.categories.map((c) => c.order));
    const doc: Category = {
      ...(editing ?? {
        _id: id,
        type: 'category',
        updatedAt: '',
        icon: 'box',
        order: Math.floor(maxOrder) + 1,
      }),
      name: clean,
      defaultMetric: metric,
      subCategories: plan.list,
    };
    const ok = await store.run(
      async (repo) => {
        await repo.save(doc);
        for (const item of plan.items) await repo.save(item);
      },
      editing ? `Saved ${clean}.` : `Added ${clean}.`,
    );
    if (ok) sheetOpen = false;
  }

  async function remove() {
    if (!editing) return;
    if (editingItems.length) return;
    if (!confirm(`Delete the category ${editing.name}?`)) return;
    const target = editing;
    const ok = await store.run((repo) => repo.softDelete(target._id), `Deleted ${target.name}.`);
    if (ok) sheetOpen = false;
  }

  async function move(category: Category, direction: -1 | 1) {
    const changed = moveCategory(snap.categories, category._id, direction);
    if (!changed.length) return;
    await store.run(async (repo) => {
      for (const c of changed) await repo.save(c);
    });
  }
</script>

<p class="muted intro">
  Categories group the inventory; each has its own sub-categories. The measure is what new items in the
  category count as (they can still be changed per item).
</p>

<ul class="list card" data-testid="category-list">
  {#each categories as c, i (c._id)}
    {@const items = itemsIn(c._id, snap.items).length}
    {@const subCount = subCategoriesOf(c, snap.items).length}
    <li>
      <button class="row-main" onclick={() => openEditor(c)} aria-label="Edit {c.name}">
        <span class="name">{c.name}</span>
        <span class="muted meta">
          {items} item{items === 1 ? '' : 's'} · {subCount} sub-categor{subCount === 1 ? 'y' : 'ies'}
        </span>
      </button>
      <div class="order" role="group" aria-label="Move {c.name}">
        <button aria-label="Move {c.name} up" disabled={i === 0} onclick={() => move(c, -1)}>↑</button>
        <button
          aria-label="Move {c.name} down"
          disabled={i === categories.length - 1}
          onclick={() => move(c, 1)}>↓</button
        >
      </div>
    </li>
  {/each}
</ul>
<button class="primary add" onclick={() => openEditor(null)}>+ Add category</button>

<Sheet open={sheetOpen} title={editing ? editing.name : 'Add category'} onclose={() => (sheetOpen = false)}>
  <form class="editor" onsubmit={save}>
    <label>
      <span>Name</span>
      <input bind:value={name} required data-testid="category-name" />
    </label>
    <label>
      <span>New items count as</span>
      <select bind:value={metric}>
        {#each Object.entries(METRIC_LABEL) as [value, label] (value)}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>

    <fieldset>
      <legend>Sub-categories</legend>
      {#if subs.length}
        <ul class="subs">
          {#each subs as sub, i (i)}
            {@const used = useCount(sub.original)}
            <li>
              <label class="sub-name">
                <span class="visually-hidden">Sub-category {i + 1}</span>
                <input bind:value={sub.name} data-testid="sub-{i}" />
              </label>
              <span class="muted uses" title="Items using it">{used}</span>
              <button
                type="button"
                aria-label="Move {sub.name} up"
                disabled={i === 0}
                onclick={() => moveSub(i, -1)}>↑</button
              >
              <button
                type="button"
                aria-label="Move {sub.name} down"
                disabled={i === subs.length - 1}
                onclick={() => moveSub(i, 1)}>↓</button
              >
              <button type="button" class="danger" aria-label="Remove {sub.name}" onclick={() => removeSub(i)}
                >✕</button
              >
            </li>
          {/each}
        </ul>
        <p class="muted small">The number is how many items use each one. Renaming updates those items.</p>
      {:else}
        <p class="muted small">No sub-categories yet.</p>
      {/if}
      <div class="add-sub">
        <label>
          <span class="visually-hidden">New sub-category</span>
          <input
            bind:value={newSub}
            placeholder="New sub-category"
            data-testid="new-sub"
            onkeydown={(e) => e.key === 'Enter' && addSub(e)}
          />
        </label>
        <button type="button" onclick={() => addSub()}>Add</button>
      </div>
    </fieldset>

    <div class="actions">
      <button class="primary" type="submit">{editing ? 'Save changes' : 'Add category'}</button>
      {#if editing}
        <button
          type="button"
          class="danger"
          onclick={remove}
          disabled={editingItems.length > 0}
          title={editingItems.length ? 'Move or delete its items first' : undefined}>Delete category</button
        >
      {/if}
    </div>
    {#if editing && editingItems.length}
      <p class="muted small">
        To delete this category, first move its {editingItems.length} item{editingItems.length === 1
          ? ''
          : 's'} to another category.
      </p>
    {/if}
  </form>
</Sheet>

<style>
  .intro {
    margin: 0 0 0.75rem;
  }

  .list {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
  }

  .list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem 0.25rem 0;
    border-bottom: 1px solid var(--border);
  }

  .list li:last-child {
    border-bottom: 0;
  }

  .row-main {
    flex: 1;
    display: grid;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.5rem 0.75rem;
    min-width: 0;
  }

  .name {
    font-weight: 600;
  }

  .meta {
    font-size: 0.85rem;
  }

  .order {
    display: flex;
    gap: 0.35rem;
  }

  .order button,
  .subs button {
    width: 44px;
    padding: 0;
  }

  .add {
    width: 100%;
  }

  .editor {
    display: grid;
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input,
  select {
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-weight: 400;
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }

  legend {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .subs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }

  .subs li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .sub-name {
    flex: 1;
    min-width: 0;
  }

  .uses {
    min-width: 1.5rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .add-sub {
    display: flex;
    gap: 0.5rem;
  }

  .add-sub label {
    flex: 1;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .danger {
    color: var(--bad);
  }

  .small {
    font-size: 0.85rem;
    margin: 0;
  }
</style>
