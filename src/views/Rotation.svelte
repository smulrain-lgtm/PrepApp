<script lang="ts">
  import StatusBadge from '../components/StatusBadge.svelte';
  import { recentEntry } from '../lib/lists';
  import { LOCATIONS } from '../lib/model/constants';
  import { formatDate } from '../lib/model/dates';
  import { filterRotation, rotationRows, type RotationRow, type RotationView } from '../lib/rotation';
  import { store } from '../lib/store.svelte';

  const KEY = 'prepapp.rotation';
  function load(): { view: RotationView; foodOnly: boolean } {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { view?: RotationView; foodOnly?: boolean };
      return { view: v.view ?? 'due', foodOnly: v.foodOnly ?? true };
    } catch {
      return { view: 'due', foodOnly: true };
    }
  }
  const saved = load();
  let view = $state<RotationView>(saved.view);
  let foodOnly = $state(saved.foodOnly);
  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ view, foodOnly }));
    } catch {
      /* per-device convenience only */
    }
  });

  const VIEWS: { id: RotationView; label: string }[] = [
    { id: 'due', label: 'Due' },
    { id: 'dated', label: 'All batches' },
    { id: 'all', label: 'Everything' },
  ];
  const EMPTY: Record<RotationView, string> = {
    due: 'Nothing expired or due for use soon.',
    dated: 'No batches with a best-before date.',
    all: 'Nothing in stock.',
  };

  const snap = $derived(store.snapshot!);
  const rows = $derived(rotationRows(snap, store.today));
  const shown = $derived(filterRotation(rows, view, foodOnly, snap.categories));

  /** Use one now: one less in stock, one more on the Recently used list. */
  async function useNow(r: RotationRow) {
    const category = snap.categories.find((c) => c._id === r.item.categoryId);
    await store.run(async (repo) => {
      await repo.recordMovement(r.batch._id, -1, 'used');
      // The latest snapshot, so quick repeated taps each add one.
      await repo.save(recentEntry(store.snapshot!, r.item, category, new Date().toISOString()));
    }, `Moved 1 × ${r.item.name} to the kitchen. Added to Recently used.`);
  }
</script>

<h1>Rotation</h1>
<p class="muted">
  Stock in best-before order, oldest first. Eat the oldest and replace it: tap <strong>Use now</strong> when
  you move a pack to the kitchen, and it goes on the
  <a href="#/lists?list=list:recently-used">Recently used</a> list.
</p>

<div class="controls">
  <div class="segmented" role="group" aria-label="Which items">
    <button class:selected={foodOnly} aria-pressed={foodOnly} onclick={() => (foodOnly = true)}
      >Food items</button
    >
    <button class:selected={!foodOnly} aria-pressed={!foodOnly} onclick={() => (foodOnly = false)}
      >All items</button
    >
  </div>
  <div class="segmented" role="group" aria-label="Show">
    {#each VIEWS as v (v.id)}
      <button class:selected={view === v.id} aria-pressed={view === v.id} onclick={() => (view = v.id)}
        >{v.label}</button
      >
    {/each}
  </div>
</div>
<p class="muted small" data-testid="rotation-count">
  Showing {shown.length}
  {shown.length === 1 ? 'batch' : 'batches'}{view === 'due'
    ? ': expired and use soon'
    : view === 'dated'
      ? ' with a best-before date'
      : ', dated and undated'}.
</p>

<ul class="card list">
  {#each shown as r (r.batch._id)}
    <li data-testid="rot-{r.batch._id}">
      <div class="info">
        <strong>{r.item.name}</strong>
        <span class="muted small">
          {formatDate(r.batch.bestBefore)} · {r.quantity}
          {r.item.unit}{r.quantity === 1 ? '' : 's'} · {LOCATIONS.find((l) => l.id === r.item.location)?.name}
        </span>
      </div>
      <StatusBadge status={r.status} />
      <button
        aria-label="Use one {r.item.name} dated {formatDate(r.batch.bestBefore)} now"
        onclick={() => useNow(r)}>Use now</button
      >
    </li>
  {:else}
    <li class="muted">{EMPTY[view]}</li>
  {/each}
</ul>

<style>
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin: 0.5rem 0;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  .segmented button {
    border: 0;
    border-radius: 0;
    border-right: 1px solid var(--border);
    padding: 0 0.9rem;
    background: var(--surface);
  }

  .segmented button:last-child {
    border-right: 0;
  }

  .segmented .selected {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  a {
    color: var(--accent);
    font-weight: 600;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 1rem;
  }

  .list li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .list li:last-child {
    border-bottom: 0;
  }

  .info {
    flex: 1;
    display: grid;
    min-width: 0;
  }

  .small {
    font-size: 0.85rem;
  }
</style>
