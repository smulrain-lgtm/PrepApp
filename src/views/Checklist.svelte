<script lang="ts">
  import ChecklistSheet from './ChecklistSheet.svelte';
  import CollapseButton from '../components/CollapseButton.svelte';
  import { Collapsed } from '../lib/collapse.svelte';
  import { FOOD_SECTION_ID } from '../lib/model/constants';
  import { formatNumber } from '../lib/format';
  import { mealCounts } from '../lib/stock-links';
  import {
    groupChecklist,
    isCheckDue,
    STATUS_WORD,
    targetText,
    type ChecklistFilter,
  } from '../lib/checklist-view';
  import { store } from '../lib/store.svelte';
  import type { ChecklistStatus } from '../lib/model/types';

  const FILTERS: { value: ChecklistFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'need', label: 'Need' },
    { value: 'check', label: 'Check' },
    { value: 'have', label: 'Have' },
    { value: 'due', label: 'Checks due' },
  ];

  let filter = $state<ChecklistFilter>('all');
  const snap = $derived(store.snapshot!);
  const summary = $derived(store.checklist!);
  const resolved = $derived(store.resolvedChecklist!);
  const groups = $derived(
    groupChecklist(
      snap.checklistSections,
      resolved.lines,
      filter,
      store.today,
      filter === 'all' ? [FOOD_SECTION_ID] : [],
    ),
  );
  const meals = $derived(mealCounts(snap, snap.settings, store.today));
  const mealsMet = $derived(meals.filter((m) => m.count >= m.target).length);

  const collapsed = new Collapsed('checklist');
  const sectionIds = $derived(groups.map((g) => g.section._id));

  /** Tap a status: cycle it, or for a line linked to stock, open its details. */
  async function cycle(line: (typeof resolved.lines)[number]) {
    if (resolved.links.has(line._id)) {
      store.notify(`${line.name} follows its inventory stock.`);
      open(line._id);
      return;
    }
    const next = NEXT[line.status];
    const original = snap.checklistItems.find((l) => l._id === line._id) ?? line;
    const ok = await store.run((repo) => repo.save({ ...original, status: next }));
    if (ok && next === 'have')
      store.notify(`${line.name}: Have. Tap the line to link it to inventory items.`);
  }

  let sheetLineId = $state<string | null>(null);
  let sheetOpen = $state(false);
  let sheetSectionId = $state<string>('');

  function open(lineId: string | null, sectionId = '') {
    sheetLineId = lineId;
    sheetSectionId = sectionId;
    sheetOpen = true;
  }

  const NEXT: Record<ChecklistStatus, ChecklistStatus> = { need: 'check', check: 'have', have: 'need' };
</script>

<div class="title-row">
  <h1>Checklist</h1>
  <button class="link" onclick={() => collapsed.setAll(sectionIds, collapsed.allClosed(sectionIds))}>
    {collapsed.allClosed(sectionIds) ? 'Show all' : 'Hide all'}
  </button>
</div>
<p class="muted">
  {summary.have} of {summary.total} marked Have.
  {#if summary.dueChecks.length}
    {summary.dueChecks.length} recurring {summary.dueChecks.length === 1 ? 'check is' : 'checks are'} due.
  {/if}
  Targets scale with {snap.settings.people} people, {snap.settings.pets.length} pets and {snap.settings
    .targetDays} days.
</p>

<div class="filters" role="group" aria-label="Show">
  {#each FILTERS as f (f.value)}
    <button
      class:selected={filter === f.value}
      aria-pressed={filter === f.value}
      onclick={() => (filter = f.value)}
    >
      {f.label}
    </button>
  {/each}
</div>

{#each groups as group (group.section._id)}
  {@const sid = group.section._id}
  {@const isFood = sid === FOOD_SECTION_ID}
  <section aria-labelledby="sec-{sid}">
    <div class="sec-head">
      <CollapseButton
        open={collapsed.isOpen(sid)}
        label={group.section.name}
        controls="lines-{sid}"
        onclick={() => collapsed.toggle(sid)}
      />
      <h2 id="sec-{sid}">
        {group.section.name}
        <span class="muted count">{group.have}/{group.total}</span>
      </h2>
      <button class="add" aria-label="Add line to {group.section.name}" onclick={() => open(null, sid)}
        >+ Add</button
      >
    </div>
    {#if collapsed.isOpen(sid)}
      <div id="lines-{sid}">
        {#if isFood && filter === 'all'}
          <div class="meals" data-testid="meal-box">
            <p class="muted small meals-intro">
              Meals in the inventory against {snap.settings.people}
              {snap.settings.people === 1 ? 'person' : 'people'} × {snap.settings.targetDays} days ({mealsMet} of
              {meals.length}
              at target).
            </p>
            <ul class="meal-tiles">
              {#each meals as m (m.type)}
                <li class="meal {m.band}" data-testid="meal-{m.type}">
                  <span class="meal-name">{m.label}</span>
                  <span class="meal-value"><strong>{m.count}</strong> of {m.target}</span>
                  <span class="meal-detail"
                    >{m.count >= m.target ? 'Target reached' : `${m.target - m.count} more needed`} · {formatNumber(
                      m.perDay,
                    )} a day each</span
                  >
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if group.lines.length}
          <ul class="card list">
            {#each group.lines as line (line._id)}
              {@const due = isCheckDue(line, store.today)}
              {@const link = resolved.links.get(line._id)}
              <li data-testid="line-{line._id}">
                <button class="main" onclick={() => open(line._id)}>
                  <span class="name">{line.name}</span>
                  <span class="meta muted">
                    Target {targetText(line, snap.settings)}
                    {#if link}· <span class="linked">In stock {formatNumber(link.amount)}</span>{/if}
                    {#if due}· <span class="due">Check due</span>{/if}
                  </span>
                </button>
                <button
                  class="status {line.status}"
                  aria-label="{line.name}: {STATUS_WORD[line.status]}. {link
                    ? 'Set by inventory'
                    : 'Change status'}"
                  onclick={() => cycle(line)}
                >
                  <span aria-hidden="true"
                    >{line.status === 'have' ? '✓' : line.status === 'check' ? '?' : '!'}</span
                  >
                  {STATUS_WORD[line.status]}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>
{:else}
  <p class="card muted">Nothing to show for this filter.</p>
{/each}
<p class="muted small">
  Tap a status to cycle Need → Check → Have. Tap a line for details, notes, check dates and to link it to
  inventory items: a linked line's status then follows the stock.
</p>

<ChecklistSheet
  open={sheetOpen}
  lineId={sheetLineId}
  sectionId={sheetSectionId}
  onclose={() => (sheetOpen = false)}
/>

<style>
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.5rem 0;
  }

  .filters button {
    border-radius: 999px;
    padding: 0 0.9rem;
  }

  .filters .selected {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }

  .sec-head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .sec-head h2 {
    flex: 1;
    margin: 1rem 0 0.5rem;
  }

  .sec-head :global(.collapse) {
    margin: 0.5rem 0 0 -0.75rem;
  }

  .add,
  .link {
    padding: 0 0.9rem;
    font-weight: 600;
    color: var(--accent);
  }

  .link {
    border: 0;
    background: none;
  }

  .linked {
    color: var(--accent);
    font-weight: 600;
  }

  .meals {
    margin-bottom: 0.75rem;
  }

  .meals-intro {
    margin: 0 0 0.5rem;
  }

  .meal-tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.5rem;
  }

  .meal {
    display: grid;
    gap: 0.1rem;
    padding: 0.7rem 0.8rem;
    border-radius: 14px;
    border: 1px solid transparent;
  }

  .meal.green {
    background: var(--good-bg);
    color: var(--good);
  }

  .meal.amber {
    background: var(--warn-bg);
    color: var(--warn);
  }

  .meal.red {
    background: var(--bad-bg);
    color: var(--bad);
  }

  .meal-name {
    font-weight: 600;
  }

  .meal-value strong {
    font-size: 1.5rem;
  }

  .meal-detail {
    font-size: 0.8rem;
  }

  h2 .count {
    font-weight: 400;
    font-size: 0.9rem;
    margin-left: 0.4rem;
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
    padding-right: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .list li:last-child {
    border-bottom: 0;
  }

  .main {
    flex: 1;
    display: grid;
    gap: 0.1rem;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.6rem 0.75rem;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta {
    font-size: 0.85rem;
  }

  .due {
    color: var(--warn);
    font-weight: 600;
  }

  .status {
    flex: none;
    min-width: 84px;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 0 0.7rem;
  }

  .status.have {
    background: var(--good-bg);
    color: var(--good);
    border-color: transparent;
  }

  .status.check {
    background: var(--warn-bg);
    color: var(--warn);
    border-color: transparent;
  }

  .status.need {
    background: var(--bad-bg);
    color: var(--bad);
    border-color: transparent;
  }

  .small {
    font-size: 0.85rem;
  }
</style>
