<script lang="ts">
  import StatusBadge from '../components/StatusBadge.svelte';
  import { LOCATIONS } from '../lib/model/constants';
  import { formatDate } from '../lib/model/dates';
  import { rotationRows } from '../lib/rotation';
  import { store } from '../lib/store.svelte';

  let showAll = $state(false);
  const rows = $derived(rotationRows(store.snapshot!, store.today));
  const shown = $derived(
    showAll ? rows : rows.filter((r) => r.status === 'expired' || r.status === 'use_soon'),
  );
</script>

<a class="back" href="#/dashboard">‹ Dashboard</a>
<h1>Rotation</h1>
<p class="muted">
  Every batch in stock, soonest best-before first. Eat the oldest and replace it: tap <strong>Use now</strong> when
  you move a pack to the kitchen.
</p>
<label class="all">
  <input type="checkbox" bind:checked={showAll} /> Show all batches ({rows.length}), not just expired and use
  soon
</label>

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
        onclick={() =>
          store.run(
            (repo) => repo.recordMovement(r.batch._id, -1, 'used'),
            `Moved 1 × ${r.item.name} to the kitchen.`,
          )}>Use now</button
      >
    </li>
  {:else}
    <li class="muted">Nothing expired or due for use soon.</li>
  {/each}
</ul>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .all {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    margin-bottom: 0.5rem;
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
