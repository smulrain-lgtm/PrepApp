<script lang="ts">
  import Sheet from '../components/Sheet.svelte';
  import {
    CHECK_INTERVALS,
    isCheckDue,
    nextCheckDue,
    SCALE_LABEL,
    STATUS_WORD,
    targetBasis,
    targetText,
  } from '../lib/checklist-view';
  import { formatDate } from '../lib/model/dates';
  import type { ChecklistItem, ChecklistStatus, ScaleBy } from '../lib/model/types';
  import { store } from '../lib/store.svelte';
  import { slug } from '../seed/csv';

  let {
    open,
    lineId,
    sectionId,
    onclose,
  }: { open: boolean; lineId: string | null; sectionId: string; onclose: () => void } = $props();

  const snap = $derived(store.snapshot!);
  const existing = $derived(lineId ? snap.checklistItems.find((l) => l._id === lineId) : undefined);

  interface Form {
    name: string;
    sectionId: string;
    status: ChecklistStatus;
    amount: number;
    unit: string;
    scaleBy: ScaleBy;
    notes: string;
    checkIntervalDays: number | null;
  }

  let form = $state<Form>(blank());
  let loadedFor = $state<string | null | undefined>(undefined);

  function blank(): Form {
    return {
      name: '',
      sectionId,
      status: 'need',
      amount: 1,
      unit: '',
      scaleBy: 'fixed',
      notes: '',
      checkIntervalDays: null,
    };
  }

  $effect(() => {
    if (!open) {
      loadedFor = undefined;
      return;
    }
    if (loadedFor === lineId) return;
    loadedFor = lineId;
    const l = existing;
    form = l
      ? {
          name: l.name,
          sectionId: l.sectionId,
          status: l.status,
          amount: l.target.amount,
          unit: l.target.unit,
          scaleBy: l.target.scaleBy,
          notes: l.notes ?? '',
          checkIntervalDays: l.checkIntervalDays ?? null,
        }
      : blank();
  });

  // Preview of the target with the values being edited.
  const preview = $derived({
    ...(existing ?? ({ _id: '', type: 'checklistItem', updatedAt: '', order: 0 } as ChecklistItem)),
    name: form.name,
    target: { amount: Number(form.amount) || 0, unit: form.unit, scaleBy: form.scaleBy },
  } as ChecklistItem);

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return store.notify('Give the line a name.');
    const base: ChecklistItem = existing ?? {
      _id: `checklist:${Date.now().toString(36)}-${slug(name).slice(0, 40)}`,
      type: 'checklistItem',
      updatedAt: '',
      order: Math.max(0, ...snap.checklistItems.map((l) => l.order)) + 1,
      lastChecked: null,
      name,
      sectionId: form.sectionId,
      status: form.status,
      target: { amount: 1, unit: '', scaleBy: 'fixed' },
    };
    const doc: ChecklistItem = {
      ...base,
      name,
      sectionId: form.sectionId,
      status: form.status,
      target: { amount: Number(form.amount) || 0, unit: form.unit.trim(), scaleBy: form.scaleBy },
      notes: form.notes.trim() || undefined,
      checkIntervalDays: form.checkIntervalDays,
    };
    const ok = await store.run((repo) => repo.save(doc), existing ? 'Saved.' : `Added ${name}.`);
    if (ok) onclose();
  }

  async function checkedToday() {
    if (!existing) return;
    await store.run(
      (repo) => repo.save({ ...existing, lastChecked: store.today }),
      `${existing.name}: checked ${formatDate(store.today)}.`,
    );
  }

  async function remove() {
    if (!existing || !confirm(`Remove “${existing.name}” from the checklist?`)) return;
    const ok = await store.run((repo) => repo.softDelete(existing._id), 'Removed.');
    if (ok) onclose();
  }
</script>

<Sheet {open} title={existing ? existing.name : 'Add checklist line'} {onclose}>
  {#if existing}
    <section class="card checks">
      <p>
        <strong>Last checked:</strong>
        {existing.lastChecked ? formatDate(existing.lastChecked) : 'never'}
        {#if existing.checkIntervalDays}
          <br /><strong>Next check:</strong>
          {nextCheckDue(existing) ? formatDate(nextCheckDue(existing)) : 'now'}
          {#if isCheckDue(existing, store.today)}<span class="due"> (due)</span>{/if}
        {/if}
      </p>
      <button class="primary" onclick={checkedToday}>Checked today</button>
    </section>
  {/if}

  <form onsubmit={save}>
    <fieldset>
      <legend>Status</legend>
      <div class="segmented">
        {#each ['have', 'check', 'need'] as const as st (st)}
          <label class="{st} " class:selected={form.status === st}>
            <input type="radio" name="status" value={st} bind:group={form.status} />
            {STATUS_WORD[st]}
          </label>
        {/each}
      </div>
    </fieldset>

    <label>
      <span>Name</span>
      <input bind:value={form.name} required />
    </label>

    <label>
      <span>Section</span>
      <select bind:value={form.sectionId}>
        {#each snap.checklistSections as s (s._id)}<option value={s._id}>{s.name}</option>{/each}
      </select>
    </label>

    <fieldset class="target">
      <legend>Target: <strong>{targetText(preview, snap.settings)}</strong></legend>
      <label>
        <span>How it scales</span>
        <select bind:value={form.scaleBy}>
          {#each Object.entries(SCALE_LABEL) as [value, label] (value)}<option {value}>{label}</option>{/each}
        </select>
      </label>
      <div class="two">
        {#if form.scaleBy !== 'water' && form.scaleBy !== 'pet_food'}
          <label>
            <span>Amount</span>
            <input type="number" inputmode="decimal" min="0" step="any" bind:value={form.amount} />
          </label>
        {/if}
        <label>
          <span>Unit</span>
          <input bind:value={form.unit} placeholder="tins, L, per person" />
        </label>
      </div>
      {#if targetBasis(preview, snap.settings)}
        <p class="muted small">= {targetBasis(preview, snap.settings)}</p>
      {/if}
    </fieldset>

    <label>
      <span>Recurring check</span>
      <select bind:value={form.checkIntervalDays}>
        {#each CHECK_INTERVALS as c (c.label)}<option value={c.days}>{c.label}</option>{/each}
      </select>
    </label>

    <label>
      <span>Notes</span>
      <textarea rows="3" bind:value={form.notes}></textarea>
    </label>

    <div class="actions">
      <button class="primary" type="submit">{existing ? 'Save changes' : 'Add line'}</button>
      {#if existing}<button type="button" class="danger" onclick={remove}>Remove line</button>{/if}
    </div>
  </form>
</Sheet>

<style>
  form {
    display: grid;
    gap: 0.9rem;
  }

  .checks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .checks p {
    margin: 0;
  }

  .due {
    color: var(--warn);
    font-weight: 600;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input:not([type='radio']),
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

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  legend {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }

  .segmented label {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    cursor: pointer;
  }

  .segmented label:last-child {
    border-right: 0;
  }

  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .segmented .selected.have {
    background: var(--good-bg);
    color: var(--good);
  }
  .segmented .selected.check {
    background: var(--warn-bg);
    color: var(--warn);
  }
  .segmented .selected.need {
    background: var(--bad-bg);
    color: var(--bad);
  }

  .small {
    font-size: 0.85rem;
    margin: 0;
    font-weight: 400;
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
