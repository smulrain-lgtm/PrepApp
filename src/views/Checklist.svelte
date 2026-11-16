<script lang="ts">
  import ChecklistSheet from './ChecklistSheet.svelte';
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
  const groups = $derived(groupChecklist(snap.checklistSections, snap.checklistItems, filter, store.today));

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
  <button class="primary" onclick={() => open(null, snap.checklistSections[0]?._id ?? '')}>Add line</button>
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
  <section aria-labelledby="sec-{group.section._id}">
    <h2 id="sec-{group.section._id}">
      {group.section.name}
      <span class="muted count">{group.have}/{group.total}</span>
    </h2>
    <ul class="card list">
      {#each group.lines as line (line._id)}
        {@const due = isCheckDue(line, store.today)}
        <li data-testid="line-{line._id}">
          <button class="main" onclick={() => open(line._id)}>
            <span class="name">{line.name}</span>
            <span class="meta muted">
              Target {targetText(line, snap.settings)}
              {#if due}· <span class="due">Check due</span>{/if}
            </span>
          </button>
          <button
            class="status {line.status}"
            aria-label="{line.name}: {STATUS_WORD[line.status]}. Change status"
            onclick={() => store.run((repo) => repo.save({ ...line, status: NEXT[line.status] }))}
          >
            <span aria-hidden="true"
              >{line.status === 'have' ? '✓' : line.status === 'check' ? '?' : '!'}</span
            >
            {STATUS_WORD[line.status]}
          </button>
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="card muted">Nothing to show for this filter.</p>
{/each}
<p class="muted small">
  Tap a status to cycle Need → Check → Have. Tap a line for details, notes and check dates.
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
