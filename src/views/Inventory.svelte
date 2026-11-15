<script lang="ts">
  import StatusBadge from '../components/StatusBadge.svelte';
  import ItemSheet from './ItemSheet.svelte';
  import { formatDate } from '../lib/model/dates';
  import { LOCATIONS } from '../lib/model/constants';
  import {
    buildItemRows,
    EMPTY_FILTER,
    groupByCategory,
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
  });

  const snap = $derived(store.snapshot!);
  const rows = $derived(buildItemRows(snap, store.today));
  const groups = $derived(
    groupByCategory(
      rows.filter((r) => matchesFilter(r, filter)),
      snap.categories,
    ),
  );
  const shown = $derived(groups.reduce((s, g) => s + g.rows.length, 0));
  const filtered = $derived(
    filter.query !== '' || filter.categoryId !== '' || filter.location !== '' || filter.status !== 'all',
  );

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
  <button class="primary" onclick={() => openItem(null)}>Add item</button>
</div>

<div class="filters card">
  <label class="search">
    <span class="visually-hidden">Search</span>
    <input type="search" placeholder="Search items" bind:value={filter.query} autocapitalize="off" />
  </label>
  <div class="selects">
    <label>
      <span class="visually-hidden">Category</span>
      <select bind:value={filter.categoryId}>
        <option value="">All categories</option>
        {#each snap.categories.filter((c) => !c.deleted) as c (c._id)}
          <option value={c._id}>{c.name}</option>
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
  {/if}
</div>

{#each groups as group (group.category?._id ?? 'other')}
  <section aria-labelledby="cat-{group.category?._id ?? 'other'}">
    <h2 id="cat-{group.category?._id ?? 'other'}">{group.category?.name ?? 'Other'}</h2>
    <ul class="list card">
      {#each group.rows as row (row.item._id)}
        <li data-testid="item-{row.item._id}">
          <button class="row-main" onclick={() => openItem(row.item._id)}>
            <span class="name">{row.item.name}</span>
            <span class="meta muted">
              {row.total}
              {row.item.unit}{row.total === 1 ? '' : 's'}
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
            <button aria-label="Add one {row.item.name}" onclick={() => plusOne(row.item._id, row.item.name)}
              >+1</button
            >
          </div>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="card muted">No items match these filters.</p>
{/each}

<ItemSheet open={sheetOpen} itemId={sheetItemId} onclose={() => (sheetOpen = false)} />

<style>
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
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
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

  @media (max-width: 400px) {
    .selects {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
