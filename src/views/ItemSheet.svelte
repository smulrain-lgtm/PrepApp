<script lang="ts" module>
  import type { Item as ItemDoc } from '../lib/model/types';
  /** Values to start a new item with (from a category's Add button, the shopping list or a scan). */
  export type ItemPreset = Partial<Omit<ItemDoc, '_id' | '_rev' | 'type' | 'updatedAt'>>;
</script>

<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import Stepper from '../components/Stepper.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { listedSubCategories, subCategoriesOf } from '../lib/categories';
  import { buildItemRows, EXCLUSION_LABEL } from '../lib/inventory-view';
  import { DEFAULT_KCAL, LOCATIONS } from '../lib/model/constants';
  import { formatDate } from '../lib/model/dates';
  import type { Item, LocationId, Metric, Nutrition, PackUnit } from '../lib/model/types';
  import { cleanBarcode } from '../lib/barcode';
  import { cleanNutrition, cleanPackSize, kcalPerUnit, NUTRIENTS, num } from '../lib/nutrition';
  import { store } from '../lib/store.svelte';
  import { slug } from '../seed/csv';

  let {
    open,
    itemId,
    preset = {},
    onclose,
  }: {
    open: boolean;
    itemId: string | null;
    preset?: ItemPreset;
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

  /** Chosen in the sub-category list to type a new one. */
  const NEW_SUB = '__new__';

  const snap = $derived(store.snapshot!);
  const existing = $derived(itemId ? snap.items.find((i) => i._id === itemId) : undefined);
  const row = $derived(
    itemId ? buildItemRows(snap, store.today).find((r) => r.item._id === itemId) : undefined,
  );

  type Form = Omit<Item, '_id' | '_rev' | 'type' | 'updatedAt' | 'packSize' | 'nutrition'>;
  let form = $state<Form>(blank());
  /** Label fields as typed (strings or numbers; blanks allowed). */
  interface LabelForm {
    size: number | string | null;
    unit: PackUnit;
    per100: Record<keyof Nutrition, number | string | null>;
  }
  let label = $state<LabelForm>(blankLabel());
  let newSub = $state('');
  let loadedFor = $state<string | null | undefined>(undefined);

  const category = $derived(snap.categories.find((c) => c._id === form.categoryId));
  const subOptions = $derived.by(() => {
    const list = category ? subCategoriesOf(category, snap.items) : [];
    const current = form.subCategory?.trim();
    return current && current !== NEW_SUB && !list.includes(current) ? [...list, current] : list;
  });
  const labelKcal = $derived(
    kcalPerUnit(cleanPackSize(label.size, label.unit), cleanNutrition(label.per100)),
  );
  /** Show the label fields for food, or whenever something is already filled in. */
  const showLabel = $derived(
    form.perUnit.metric === 'kcal' ||
      category?.defaultMetric === 'kcal' ||
      !!form.barcode ||
      num(label.size) !== undefined ||
      Object.values(label.per100).some((v) => num(v) !== undefined),
  );

  function blank(): Form {
    const first = store.snapshot?.categories.find((c) => !c.deleted);
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
      barcode: '',
    };
  }

  function blankLabel(): LabelForm {
    return {
      size: null,
      unit: 'g',
      per100: { kcal: null, protein: null, fat: null, carbs: null, salt: null },
    };
  }

  function labelFrom(item: Partial<Item>): LabelForm {
    const l = blankLabel();
    if (item.packSize) {
      l.size = item.packSize.amount;
      l.unit = item.packSize.unit;
    }
    for (const { key } of NUTRIENTS) l.per100[key] = item.nutrition?.[key] ?? null;
    return l;
  }

  // Load the form when the sheet opens for an item (not on every data refresh).
  $effect(() => {
    if (!open) {
      loadedFor = undefined;
      return;
    }
    if (loadedFor === itemId) return;
    loadedFor = itemId;
    newSub = '';
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
        barcode: item.barcode ?? '',
      };
      label = labelFrom(item);
    } else {
      const p = $state.snapshot(preset) as ItemPreset;
      const cat = snap.categories.find((c) => c._id === p.categoryId && !c.deleted);
      const { packSize, nutrition, ...rest } = p;
      form = {
        ...blank(),
        ...(cat ? { categoryId: cat._id, perUnit: { metric: cat.defaultMetric, amount: 1 } } : {}),
        ...rest,
        categoryId: cat?._id ?? blank().categoryId,
        name: p.name ?? '',
      };
      label = labelFrom({ packSize, nutrition });
      newBatch = { date: '', undated: false, quantity: 1 };
    }
  });

  function onCategoryChange() {
    const cat = snap.categories.find((c) => c._id === form.categoryId);
    if (!cat) return;
    if (form.subCategory && !subCategoriesOf(cat, snap.items).includes(form.subCategory))
      form.subCategory = '';
    if (existing) return;
    form.perUnit.metric = cat.defaultMetric;
    recalc();
  }

  function onSubCategoryChange() {
    if (form.subCategory === NEW_SUB) return;
    const kcal = DEFAULT_KCAL[form.subCategory ?? ''];
    if (kcal && form.perUnit.metric === 'kcal' && !existing && labelKcal === null) {
      form.perUnit.amount = kcal;
      form.perUnit.estimated = true;
    }
  }

  /** Calories per unit follow the label once pack size and kcal per 100 g are both in. */
  function recalc() {
    const kcal = kcalPerUnit(cleanPackSize(label.size, label.unit), cleanNutrition(label.per100));
    if (kcal !== null && form.perUnit.metric === 'kcal') {
      form.perUnit.amount = kcal;
      form.perUnit.estimated = false;
    }
  }

  let newBatch = $state({ date: '', undated: false, quantity: 1 });
  let saving = $state(false);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return store.notify('Give the item a name.');
    const sub = (form.subCategory === NEW_SUB ? newSub : form.subCategory)?.trim() || undefined;
    if (form.subCategory === NEW_SUB && !sub) return store.notify('Type the new sub-category, or pick one.');
    const barcode = cleanBarcode(form.barcode ?? '') || undefined;
    if (barcode) {
      const other = snap.items.find((i) => !i.deleted && i.barcode === barcode && i._id !== existing?._id);
      if (other && !confirm(`${other.name} already has the barcode ${barcode}. Use it for this item too?`))
        return;
    }
    saving = true;
    let id = existing?._id ?? `item:${slug(name)}`;
    if (!existing && snap.items.some((i) => i._id === id)) id = `${id}-${Date.now().toString(36)}`;
    const doc: Item = {
      ...(existing ?? { _id: id, type: 'item', updatedAt: '' }),
      ...$state.snapshot(form),
      name,
      subCategory: sub,
      supplier: form.supplier?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      barcode,
      packSize: cleanPackSize(label.size, label.unit),
      nutrition: cleanNutrition(label.per100),
      perUnit: { ...form.perUnit, amount: Number(form.perUnit.amount) || 0 },
    } as Item;
    // A sub-category typed here joins its category's list.
    const cat = snap.categories.find((c) => c._id === doc.categoryId);
    const listed = cat ? subCategoriesOf(cat, snap.items) : [];
    const catDoc =
      cat && sub && !listedSubCategories(cat).includes(sub)
        ? { ...cat, subCategories: [...listed.filter((n) => n !== sub), sub] }
        : null;
    const ok = await store.run(
      async (repo) => {
        await repo.save(doc);
        if (catDoc) await repo.save(catDoc);
        if (!existing && (newBatch.undated || newBatch.date) && newBatch.quantity > 0) {
          await repo.addStock(id, newBatch.undated ? null : newBatch.date, newBatch.quantity);
        }
      },
      existing ? 'Saved.' : `Added ${name}.`,
    );
    saving = false;
    if (ok && sub) {
      form.subCategory = sub;
      newSub = '';
    }
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
        <select bind:value={form.subCategory} onchange={onSubCategoryChange} data-testid="item-subcategory">
          <option value="">None</option>
          {#each subOptions as name (name)}<option value={name}>{name}</option>{/each}
          <option value={NEW_SUB}>New sub-category…</option>
        </select>
      </label>
    </div>
    {#if form.subCategory === NEW_SUB}
      <label>
        <span>New sub-category</span>
        <input bind:value={newSub} placeholder="e.g. Tins & jars" />
      </label>
    {/if}
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
    {#if showLabel}
      <fieldset class="label-box" data-testid="label-fields">
        <legend>From the label</legend>
        <div class="label-top">
          <label>
            <span>Barcode</span>
            <input bind:value={form.barcode} inputmode="numeric" autocomplete="off" placeholder="Optional" />
          </label>
          <div class="pack">
            <label>
              <span>Pack size</span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                bind:value={label.size}
                oninput={recalc}
                aria-label="Pack size"
              />
            </label>
            <label>
              <span class="visually-hidden">Pack size unit</span>
              <select bind:value={label.unit} onchange={recalc} aria-label="Pack size unit">
                <option value="g">g</option>
                <option value="ml">ml</option>
              </select>
            </label>
          </div>
        </div>
        <p class="per100-head">Per 100 {label.unit}</p>
        <div class="per100">
          {#each NUTRIENTS as n (n.key)}
            <label>
              <span>{n.label} <span class="muted">({n.unit})</span></span>
              <input
                type="number"
                inputmode="decimal"
                min="0"
                step="any"
                bind:value={label.per100[n.key]}
                oninput={n.key === 'kcal' ? recalc : undefined}
                aria-label="{n.label} per 100 {label.unit}"
              />
            </label>
          {/each}
        </div>
        {#if labelKcal !== null && form.perUnit.metric === 'kcal'}
          <p class="muted small" data-testid="label-kcal">
            {labelKcal.toLocaleString('en-GB')} kcal per {form.unit || 'unit'}, worked out from the label.
          </p>
        {:else if form.perUnit.metric === 'kcal'}
          <p class="muted small">
            Fill in the pack size and energy to work out the calories per {form.unit || 'unit'}.
          </p>
        {/if}
      </fieldset>
    {/if}
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

  .label-box {
    display: grid;
    gap: 0.6rem;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .label-box legend {
    padding: 0 0.25rem;
  }

  .label-top {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }

  .pack {
    display: grid;
    grid-template-columns: 1fr 5rem;
    gap: 0.4rem;
    align-items: end;
  }

  .per100-head {
    margin: 0;
    font-weight: 600;
  }

  .per100 {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
    gap: 0.5rem;
  }

  .per100 label span {
    font-size: 0.85rem;
  }
</style>
