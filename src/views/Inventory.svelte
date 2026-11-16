<script lang="ts">
  import CollapseButton from '../components/CollapseButton.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import { Collapsed } from '../lib/collapse.svelte';
  import ItemSheet, { type ItemPreset } from './ItemSheet.svelte';
  import ScanSheet from './ScanSheet.svelte';
  import type { LookupResult } from '../lib/barcode';
  import { allSubCategories, subCategoriesOf } from '../lib/categories';
  import { formatPackSize, kcalPerUnit } from '../lib/nutrition';
  import { formatDate } from '../lib/model/dates';
  import { LOCATIONS } from '../lib/model/constants';
  import {
    buildItemRows,
    EMPTY_FILTER,
    groupByCategory,
    isFiltered,
    matchesFilter,
    type InventoryFilter,
    type StatusFilter,
  } from '../lib/inventory-view';
  import { store } from '../lib/store.svelte';
  import type { LocationId } from '../lib/model/types';

  let { params }: { params: URLSearchParams } = $props();

  const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Any status' },
    { value: 'expired', label: 'Expired' },
    { value: 'soon30', label: 'Within 30 days' },
    { value: 'use_soon', label: 'Use soon' },
    { value: 'ok', label: 'OK' },
    { value: 'no_date', label: 'No date' },
    { value: 'empty', label: 'None in stock' },
  ];

  let filter = $state<InventoryFilter>({ ...EMPTY_FILTER });

  // A dashboard tile opens this screen with ?status=…
  $effect(() => {
    const status = params.get('status') as StatusFilter | null;
    filter = { ...EMPTY_FILTER, status: STATUS_OPTIONS.some((o) => o.value === status) ? status! : 'all' };
    // "Add to inventory" from the shopping list opens the add sheet with the name filled in.
    const add = params.get('add');
    if (add) {
      preset = { name: add };
      openItem(null);
      history.replaceState(null, '', '#/inventory');
    }
  });

  let preset = $state<ItemPreset>({});

  function addTo(categoryId: string) {
    preset = { categoryId };
    openItem(null);
  }

  let scanOpen = $state(false);

  const byBarcode = (code: string) => snap.items.find((i) => !i.deleted && i.barcode === code);

  function onScan(code: string, lookup: LookupResult | null) {
    scanOpen = false;
    const known = byBarcode(code);
    if (known) {
      openItem(known._id);
      store.notify(`${known.name} is already in the inventory: add a batch.`);
      return;
    }
    if (lookup?.status === 'found') {
      const p = lookup.product;
      const cat = snap.categories.find((c) => c._id === p.categoryId && !c.deleted);
      const kcal = kcalPerUnit(p.packSize, p.nutrition);
      preset = {
        name: p.name,
        barcode: code,
        categoryId: cat?._id,
        packSize: p.packSize,
        nutrition: p.nutrition,
        ...(cat?.defaultMetric === 'kcal' && kcal !== null
          ? { perUnit: { metric: 'kcal', amount: kcal } }
          : {}),
      };
      store.notify(`Found ${p.name || code}. Check the details, then add it.`);
    } else {
      preset = { barcode: code };
      store.notify(
        lookup?.status === 'offline'
          ? `${lookup.message} Fill in the details yourself, or try again later.`
          : `${code} is not on Open Food Facts. Fill in the details yourself.`,
      );
    }
    openItem(null);
  }

  const snap = $derived(store.snapshot!);
  const rows = $derived(buildItemRows(snap, store.today));
  const filtered = $derived(isFiltered(filter));
  const filterCategory = $derived(snap.categories.find((c) => c._id === filter.categoryId));
  const subOptions = $derived(
    filterCategory
      ? subCategoriesOf(filterCategory, snap.items)
      : allSubCategories(snap.categories, snap.items),
  );

  function onFilterCategory() {
    if (filter.subCategory && !subOptions.includes(filter.subCategory)) filter.subCategory = '';
  }
  const groups = $derived(
    groupByCategory(
      rows.filter((r) => matchesFilter(r, filter)),
      snap.categories,
      !filtered, // show empty categories (with their Add button) when nothing is filtered
    ),
  );
  const shown = $derived(groups.reduce((s, g) => s + g.rows.length, 0));

  // Show / hide each category. While a filter is on, every match is shown.
  const collapsed = new Collapsed('inventory');
  const groupIds = $derived(groups.map((g) => g.category?._id ?? 'other'));
  const isOpen = (id: string) => filtered || collapsed.isOpen(id);

  let sheetItemId = $state<string | null>(null);
  let sheetOpen = $state(false);

  function openItem(id: string | null) {
    sheetItemId = id;
    sheetOpen = true;
  }

  async function minusOne(itemId: string, name: string) {
    await store.run((repo) => repo.takeStock(itemId, 1, 'used'), `Used 1 × ${name}`);
  }

  async function plusOne(itemId: string, name: string) {
    let needsDate = false;
    await store.run(async (repo) => {
      needsDate = (await repo.addOneToLatest(itemId)) === null;
    });
    if (needsDate) openItem(itemId);
    else store.notify(`Added 1 × ${name}`);
  }
</script>

<div class="title-row">
  <h1>Inventory</h1>
  <div class="title-actions">
    <button class="scan" onclick={() => (scanOpen = true)} data-testid="scan-button">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 8v8M10 8v8M13 8v8M16 8v8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
      Scan
    </button>
  </div>
</div>

<div class="filters card">
  <label class="search">
    <span class="visually-hidden">Search</span>
    <input type="search" placeholder="Search items" bind:value={filter.query} autocapitalize="off" />
  </label>
  <div class="selects">
    <label>
      <span class="visually-hidden">Category</span>
      <select bind:value={filter.categoryId} onchange={onFilterCategory} data-testid="category-filter">
        <option value="">All categories</option>
        {#each snap.categories.filter((c) => !c.deleted) as c (c._id)}
          <option value={c._id}>{c.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="visually-hidden">Sub-category</span>
      <select bind:value={filter.subCategory} data-testid="subcategory-filter" disabled={!subOptions.length}>
        <option value="">All sub-categories</option>
        {#each subOptions as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="visually-hidden">Location</span>
      <select bind:value={filter.location}>
        <option value="">All locations</option>
        {#each LOCATIONS as l (l.id)}
          <option value={l.id as LocationId}>{l.name}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="visually-hidden">Status</span>
      <select bind:value={filter.status} data-testid="status-filter">
        {#each STATUS_OPTIONS as o (o.value)}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    </label>
  </div>
  {#if filtered}
    <p class="muted count">
      Showing {shown} of {rows.length} items.
      <button class="link" onclick={() => (filter = { ...EMPTY_FILTER })}>Clear filters</button>
    </p>
  {:else}
    <p class="muted count">
      <button class="link" onclick={() => collapsed.setAll(groupIds, collapsed.allClosed(groupIds))}>
        {collapsed.allClosed(groupIds) ? 'Show all categories' : 'Hide all categories'}
      </button>
    </p>
  {/if}
</div>

{#each groups as group (group.category?._id ?? 'other')}
  {@const gid = group.category?._id ?? 'other'}
  {@const name = group.category?.name ?? 'Other'}
  <section aria-labelledby="cat-{gid}">
    <div class="cat-head">
      {#if !filtered}
        <CollapseButton
          open={isOpen(gid)}
          label={name}
          controls="items-{gid}"
          onclick={() => collapsed.toggle(gid)}
        />
      {/if}
      <h2 id="cat-{gid}">{name}</h2>
      <span class="muted n">{group.rows.length}</span>
      <button
        class="add"
        aria-label="Add item to {group.category?.name ?? 'Other'}"
        onclick={() => addTo(group.category?._id ?? '')}>+ Add</button
      >
    </div>
    {#if !isOpen(gid)}{:else if !group.rows.length}
      <p class="card muted empty" id="items-{gid}">No items yet.</p>
    {:else}
      <ul class="list card" id="items-{gid}">
        {#each group.rows as row (row.item._id)}
          <li data-testid="item-{row.item._id}">
            <button class="row-main" onclick={() => openItem(row.item._id)}>
              <span class="name">{row.item.name}</span>
              <span class="meta muted">
                {#if row.item.subCategory}{row.item.subCategory} ·{/if}
                {row.total}
                {row.item.unit}{row.total === 1 ? '' : 's'}
                {#if row.item.packSize}({formatPackSize(row.item.packSize)}){/if}
                {#if row.earliest}· {formatDate(row.earliest)}{/if}
                · {LOCATIONS.find((l) => l.id === row.item.location)?.name}
              </span>
              <StatusBadge status={row.status} />
            </button>
            <div class="quick" role="group" aria-label="Quick change for {row.item.name}">
              <button
                aria-label="Use one {row.item.name}"
                disabled={row.total === 0}
                onclick={() => minusOne(row.item._id, row.item.name)}>−1</button
              >
              <button
                aria-label="Add one {row.item.name}"
                onclick={() => plusOne(row.item._id, row.item.name)}>+1</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <p class="card muted">No items match these filters.</p>
{/each}

<ItemSheet open={sheetOpen} itemId={sheetItemId} {preset} onclose={() => (sheetOpen = false)} />

<ScanSheet
  open={scanOpen}
  onclose={() => (scanOpen = false)}
  onresult={onScan}
  known={(code) => !!byBarcode(code)}
/>

<style>
  .cat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .cat-head .n {
    flex: 1;
    margin-top: 0.75rem;
  }

  .cat-head h2 {
    margin: 1.25rem 0 0.5rem;
  }

  .cat-head .n {
    font-weight: 400;
    font-size: 0.9rem;
  }

  .cat-head :global(.collapse) {
    margin: 0.75rem -0.5rem 0 -0.75rem;
  }

  .add {
    margin-top: 0.75rem;
    padding: 0 0.9rem;
    font-weight: 600;
    color: var(--accent);
  }

  .empty {
    margin: 0;
    font-size: 0.9rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .filters {
    display: grid;
    gap: 0.6rem;
    margin-bottom: 0.5rem;
  }

  input,
  select {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
  }

  .selects {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .title-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .scan {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.9rem;
    font-weight: 600;
    color: var(--accent);
  }

  .count {
    margin: 0;
    font-size: 0.875rem;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent);
    padding: 0 0.25rem;
    min-height: 0;
    text-decoration: underline;
  }

  .list {
    list-style: none;
    margin: 0;
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
    grid-template-columns: 1fr auto;
    gap: 0.15rem 0.5rem;
    align-items: center;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.5rem 0.75rem;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta {
    grid-column: 1;
    font-size: 0.85rem;
  }

  .row-main :global(.badge) {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  .quick {
    display: flex;
    gap: 0.35rem;
  }

  .quick button {
    padding: 0;
    width: 44px;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 700px) {
    .selects {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
