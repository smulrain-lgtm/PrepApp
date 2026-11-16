<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import Stepper from '../components/Stepper.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { buildItemRows, EXCLUSION_LABEL } from '../lib/inventory-view';
  import { DEFAULT_KCAL, LOCATIONS } from '../lib/model/constants';
  import { formatDate } from '../lib/model/dates';
  import type { Item, LocationId, Metric } from '../lib/model/types';
  import { store } from '../lib/store.svelte';
  import { slug } from '../seed/csv';

  let {
    open,
    itemId,
    presetName = '',
    presetCategoryId = '',
    onclose,
  }: {
    open: boolean;
    itemId: string | null;
    presetName?: string;
    /** Adding from a category's Add button: start in that category. */
    presetCategoryId?: string;
    onclose: () => void;
  } = $props();

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
  const existing = $derived(itemId ? snap.items.find((i) => i._id === itemId) : undefined);
  const row = $derived(
    itemId ? buildItemRows(snap, store.today).find((r) => r.item._id === itemId) : undefined,
  );

  type Form = Omit<Item, '_id' | '_rev' | 'type' | 'updatedAt'>;
  let form = $state<Form>(blank());
  let loadedFor = $state<string | null | undefined>(undefined);

  function blank(): Form {
    const first = store.snapshot?.categories[0];
    return {
      name: '',
      categoryId: first?._id ?? '',
      subCategory: '',
      unit: 'pack',
      perUnit: { metric: first?.defaultMetric ?? 'none', amount: 1 },
      location: 'garage',
      supplier: '',
      notes: '',
      countsTowardReadiness: true,
      freezeSensitive: false,
    };
  }

  // Load the form when the sheet opens for an item (not on every data refresh).
  $effect(() => {
    if (!open) {
      loadedFor = undefined;
      return;
    }
    if (loadedFor === itemId) return;
    loadedFor = itemId;
    if (existing) {
      const item = $state.snapshot(existing) as Item;
      form = {
        ...blank(),
        name: item.name,
        categoryId: item.categoryId,
        subCategory: item.subCategory ?? '',
        unit: item.unit,
        perUnit: { ...item.perUnit },
        location: item.location,
        supplier: item.supplier ?? '',
        notes: item.notes ?? '',
        countsTowardReadiness: item.countsTowardReadiness,
        freezeSensitive: item.freezeSensitive,
      };
    } else {
      const cat = snap.categories.find((c) => c._id === presetCategoryId);
      form = {
        ...blank(),
        name: presetName,
        ...(cat ? { categoryId: cat._id, perUnit: { metric: cat.defaultMetric, amount: 1 } } : {}),
      };
      newBatch = { date: '', undated: false, quantity: 1 };
    }
  });

  function onCategoryChange() {
    const cat = snap.categories.find((c) => c._id === form.categoryId);
    if (!cat || existing) return;
    form.perUnit.metric = cat.defaultMetric;
  }

  function onSubCategoryChange() {
    const kcal = DEFAULT_KCAL[form.subCategory ?? ''];
    if (kcal && form.perUnit.metric === 'kcal' && !existing) {
      form.perUnit.amount = kcal;
      form.perUnit.estimated = true;
    }
  }

  let newBatch = $state({ date: '', undated: false, quantity: 1 });
  let saving = $state(false);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return store.notify('Give the item a name.');
    saving = true;
    let id = existing?._id ?? `item:${slug(name)}`;
    if (!existing && snap.items.some((i) => i._id === id)) id = `${id}-${Date.now().toString(36)}`;
    const doc: Item = {
      ...(existing ?? { _id: id, type: 'item', updatedAt: '' }),
      ...$state.snapshot(form),
      name,
      subCategory: form.subCategory?.trim() || undefined,
      supplier: form.supplier?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      perUnit: { ...form.perUnit, amount: Number(form.perUnit.amount) || 0 },
    } as Item;
    const ok = await store.run(
      async (repo) => {
        await repo.save(doc);
        if (!existing && (newBatch.undated || newBatch.date) && newBatch.quantity > 0) {
          await repo.addStock(id, newBatch.undated ? null : newBatch.date, newBatch.quantity);
        }
      },
      existing ? 'Saved.' : `Added ${name}.`,
    );
    saving = false;
    if (ok && !existing) onclose();
  }

  async function addBatch() {
    if (!existing) return;
    if (!newBatch.undated && !newBatch.date) return store.notify('Pick a best-before date, or tick No date.');
    const date = newBatch.undated ? null : newBatch.date;
    const ok = await store.run(
      (repo) => repo.addStock(existing._id, date, newBatch.quantity),
      `Added ${newBatch.quantity} × ${existing.name}.`,
    );
    if (ok) newBatch = { date: '', undated: false, quantity: 1 };
  }

  async function changeBatch(batchId: string, delta: number) {
    await store.run((repo) => repo.recordMovement(batchId, delta, delta > 0 ? 'added' : 'used'));
  }

  async function discard(batchId: string, quantity: number, label: string) {
    if (!confirm(`Discard all ${quantity} from the batch ${label}?`)) return;
    await store.run((repo) => repo.recordMovement(batchId, -quantity, 'discarded'), 'Discarded.');
  }

  async function remove() {
    if (!existing) return;
    if (!confirm(`Delete ${existing.name}? It will no longer appear or count towards readiness.`)) return;
    const ok = await store.run((repo) => repo.softDelete(existing._id), `Deleted ${existing.name}.`);
    if (ok) onclose();
  }
</script>

<Sheet {open} title={existing ? existing.name : 'Add item'} {onclose}>
  {#if existing && row}
    <section aria-labelledby="batches-heading">
      <h3 id="batches-heading">In stock: {row.total} {existing.unit}{row.total === 1 ? '' : 's'}</h3>
      {#if row.batches.length}
        <ul class="batches">
          {#each row.batches as b (b.batch._id)}
            <li data-testid="batch-{b.batch._id}">
              <div class="batch-info">
                <strong>{formatDate(b.batch.bestBefore)}</strong>
                <StatusBadge status={b.status} />
                {#if b.batch.note}<span class="muted small">{b.batch.note}</span>{/if}
                {#if b.excluded}<span class="muted small">{EXCLUSION_LABEL[b.excluded]}</span>{/if}
              </div>
              <div class="batch-actions">
                <button
                  aria-label="Use one from {formatDate(b.batch.bestBefore)}"
                  onclick={() => changeBatch(b.batch._id, -1)}>−</button
                >
                <span class="qty" aria-label="Quantity">{b.quantity}</span>
                <button
                  aria-label="Add one to {formatDate(b.batch.bestBefore)}"
                  onclick={() => changeBatch(b.batch._id, 1)}>+</button
                >
                <button
                  class="discard"
                  onclick={() => discard(b.batch._id, b.quantity, formatDate(b.batch.bestBefore))}
                  >Discard</button
                >
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">None in stock. Add a batch below.</p>
      {/if}
    </section>
  {/if}

  <section class="add-batch card" aria-labelledby="add-batch-heading">
    <h3 id="add-batch-heading">{existing ? 'Add a batch' : 'First batch (optional)'}</h3>
    <div class="add-row">
      <label>
        <span>Best before</span>
        <input type="date" bind:value={newBatch.date} disabled={newBatch.undated} />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={newBatch.undated} /> No date
      </label>
      <Stepper label="Quantity" value={newBatch.quantity} min={1} onchange={(v) => (newBatch.quantity = v)} />
      {#if existing}<button class="primary" onclick={addBatch}>Add</button>{/if}
    </div>
  </section>

  <form class="details" onsubmit={save}>
    <h3>Details</h3>
    <label>
      <span>Name</span>
      <input bind:value={form.name} required />
    </label>
    <div class="two">
      <label>
        <span>Category</span>
        <select bind:value={form.categoryId} onchange={onCategoryChange}>
          {#each snap.categories.filter((c) => !c.deleted) as c (c._id)}
            <option value={c._id}>{c.name}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Sub-category</span>
        <input bind:value={form.subCategory} list="subcats" onchange={onSubCategoryChange} />
        <datalist id="subcats">
          {#each Object.keys(DEFAULT_KCAL) as s (s)}<option value={s}></option>{/each}
        </datalist>
      </label>
    </div>
    <fieldset>
      <legend>Location</legend>
      <div class="segmented">
        {#each LOCATIONS as l (l.id)}
          <label class:selected={form.location === l.id}>
            <input type="radio" name="location" value={l.id as LocationId} bind:group={form.location} />
            {l.name}
          </label>
        {/each}
      </div>
    </fieldset>
    <div class="two">
      <label>
        <span>One unit is a…</span>
        <input bind:value={form.unit} placeholder="pack, bottle, canister" />
      </label>
      <label>
        <span>Supplier</span>
        <input bind:value={form.supplier} />
      </label>
    </div>
    <div class="two">
      <label>
        <span>Counts as</span>
        <select bind:value={form.perUnit.metric}>
          {#each Object.entries(METRIC_LABEL) as [value, label] (value)}
            <option {value}>{label}</option>
          {/each}
        </select>
      </label>
      {#if form.perUnit.metric !== 'none'}
        <label>
          <span>Per unit{form.perUnit.estimated ? ' (estimate)' : ''}</span>
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            bind:value={form.perUnit.amount}
            oninput={() => (form.perUnit.estimated = false)}
          />
        </label>
      {/if}
    </div>
    <Toggle
      label="Counts towards readiness"
      checked={form.countsTowardReadiness}
      onchange={(v) => (form.countsTowardReadiness = v)}
    />
    <Toggle
      label="Can freeze"
      description="Water or plain-butane gas: unreliable outdoors in a frost."
      checked={form.freezeSensitive}
      onchange={(v) => (form.freezeSensitive = v)}
    />
    <label>
      <span>Notes</span>
      <textarea rows="2" bind:value={form.notes}></textarea>
    </label>
    <div class="actions">
      <button class="primary" type="submit" disabled={saving}>{existing ? 'Save changes' : 'Add item'}</button
      >
      {#if existing}<button type="button" class="danger" onclick={remove}>Delete item</button>{/if}
    </div>
  </form>
</Sheet>

<style>
  h3 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }

  section,
  form {
    margin-bottom: 1.25rem;
  }

  .batches {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .batches li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .batch-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .batch-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .batch-actions button {
    padding: 0;
    width: 44px;
  }

  .batch-actions .discard {
    width: auto;
    padding: 0 0.75rem;
    color: var(--bad);
  }

  .qty {
    min-width: 2rem;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .small {
    font-size: 0.8rem;
  }

  .add-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.75rem;
  }

  .details {
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
    min-height: 44px;
    font-weight: 400;
  }

  input:not([type='checkbox']):not([type='radio']),
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

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
  }

  legend {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  .segmented label {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 44px;
    font-weight: 500;
    font-size: 0.9rem;
    background: var(--surface);
    border-right: 1px solid var(--border);
    cursor: pointer;
  }

  .segmented label:last-child {
    border-right: 0;
  }

  .segmented label.selected {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
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
