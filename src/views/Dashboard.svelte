<script lang="ts">
  import Gauge from '../components/Gauge.svelte';
  import { formatAmount, formatDays } from '../lib/format';
  import { METRIC_INFO } from '../lib/model/constants';
  import { band } from '../lib/readiness';
  import { store } from '../lib/store.svelte';
  import { buildShoppingList, shoppingCount } from '../lib/shopping';
  import { formatDate } from '../lib/model/dates';
  import { nextCheckDue } from '../lib/checklist-view';

  const r = $derived(store.readiness!);
  const settings = $derived(store.snapshot!.settings);
  const bars = $derived(r.metrics.filter((m) => m.critical && m.days !== null));
  const limitingLabel = $derived(METRIC_INFO.find((m) => m.id === r.limiting)?.label);

  const scenario = $derived(
    [
      `${settings.people} ${settings.people === 1 ? 'person' : 'people'}`,
      settings.pets.length ? `${settings.pets.length} ${settings.pets.length === 1 ? 'pet' : 'pets'}` : null,
      `${settings.targetDays}-day target`,
      `expiry dates ${settings.considerExpiry ? 'ON' : 'OFF'}`,
      settings.useSoonAtRisk ? 'use-soon at risk' : null,
      settings.indoorOnly ? 'indoor stock only' : null,
      settings.freezing ? 'freezing' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  const checklist = $derived(store.checklist!);
  const checklistPct = $derived(checklist.total ? Math.round((checklist.have / checklist.total) * 100) : 0);

  const shopping = $derived(buildShoppingList(store.snapshot!, r));
  const dueChecks = $derived(checklist.dueChecks);

  const tiles = $derived([
    { label: 'Expired', count: r.expiry.expired, status: 'expired', tone: 'bad' },
    { label: 'Within 30 days', count: r.expiry.within30Days, status: 'soon30', tone: 'warn' },
    {
      label: `Within ${settings.warningMonths} months`,
      count: r.expiry.withinWarning,
      status: 'use_soon',
      tone: 'warn',
    },
    { label: 'No date', count: r.expiry.noDate, status: 'no_date', tone: 'neutral' },
  ]);
</script>

<h1>Dashboard</h1>
<p class="muted scenario" data-testid="scenario">{scenario}</p>

<div class="grid">
  <section class="card hero" aria-labelledby="readiness-heading">
    <h2 id="readiness-heading" class="visually-hidden">Days of readiness</h2>
    <Gauge days={r.readinessDays} target={r.targetDays} fraction={r.readinessFraction} band={r.band} />
    {#if limitingLabel}
      <p class="limiting" data-testid="limiting">
        <strong>{limitingLabel}</strong> runs out first.
      </p>
    {/if}
  </section>

  <section aria-labelledby="days-heading">
    <h2 id="days-heading">Days by category</h2>
    <ul class="bars card">
      {#each bars as m (m.metric)}
        {@const b = band(m.days! / r.targetDays)}
        <li data-testid="bar-{m.metric}">
          <div class="bar-head">
            <span class="name">
              {m.label}
              {#if m.metric === r.limiting}<span class="tag">Limiting</span>{/if}
            </span>
            <span class="value"><strong>{formatDays(m.days)}</strong> days</span>
          </div>
          <div
            class="track"
            role="meter"
            aria-label="{m.label}: {formatDays(m.days)} of {r.targetDays} days"
            aria-valuemin="0"
            aria-valuemax={r.targetDays}
            aria-valuenow={Math.min(m.days!, r.targetDays)}
          >
            <div class="fill {b}" style:width="{Math.min(100, (m.days! / r.targetDays) * 100)}%"></div>
          </div>
          <p class="detail muted">
            {#if m.metric === 'med_days' || m.metric === 'light_days'}
              Have {formatAmount(m.metric, m.stock)} of cover
            {:else}
              Have {formatAmount(m.metric, m.stock)} · need {formatAmount(m.metric, m.dailyDemand)} a day
            {/if}
            {#if m.shortfall > 0}
              · <span class="short">short {formatAmount(m.metric, m.shortfall)}</span>
            {/if}
          </p>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="expiry-heading">
    <h2 id="expiry-heading">Expiry</h2>
    <div class="tiles">
      {#each tiles as t (t.status)}
        <a class="tile card {t.count > 0 ? t.tone : ''}" href="#/inventory?status={t.status}">
          <span class="count">{t.count}</span>
          <span class="label">{t.label}</span>
        </a>
      {/each}
    </div>
    <p class="muted small">
      Counts are packs and units in stock. Tap a box to see them, or open the
      <a href="#/rotation">rotation list</a> to use the oldest first.
    </p>
  </section>

  <section aria-labelledby="shopping-heading">
    <h2 id="shopping-heading">Shopping list</h2>
    <a class="card link-card" href="#/shopping" data-testid="shopping-card">
      <span><strong>{shoppingCount(shopping)}</strong> things to buy</span>
      <span class="muted small">
        {shopping.shortfalls.length} shortfalls · {shopping.toBuy.length} planned food · {shopping.need
          .length} equipment
      </span>
      <span class="more">Open and share ›</span>
    </a>
  </section>

  {#if dueChecks.length}
    <section aria-labelledby="due-heading">
      <h2 id="due-heading">Checks due</h2>
      <ul class="card due">
        {#each dueChecks as line (line._id)}
          <li>
            <span>
              <strong>{line.name}</strong>
              <span class="muted small">
                {line.lastChecked ? `Due since ${formatDate(nextCheckDue(line))}` : 'Never checked'}
              </span>
            </span>
            <button
              aria-label="{line.name} checked today"
              onclick={() =>
                store.run(
                  (repo) => repo.save({ ...line, lastChecked: store.today }),
                  `${line.name}: checked.`,
                )}>Checked</button
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section aria-labelledby="checklist-heading">
    <h2 id="checklist-heading">Equipment checklist</h2>
    <div class="card">
      <p>
        <strong>{checklist.have} of {checklist.total}</strong> items marked Have ({checklistPct}%).
        {#if checklist.dueChecks.length}
          {checklist.dueChecks.length} recurring {checklist.dueChecks.length === 1
            ? 'check is'
            : 'checks are'} due.
        {/if}
      </p>
      <a class="more" href="#/checklist">Open the checklist ›</a>
    </div>
  </section>
</div>

<style>
  .scenario {
    margin-top: -0.25rem;
  }

  .grid {
    display: grid;
    gap: 0 1.25rem;
    align-items: start;
  }

  /* iPad landscape and Mac: two columns of cards. */
  @media (min-width: 1000px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  .link-card {
    display: grid;
    gap: 0.2rem;
    color: inherit;
    text-decoration: none;
  }

  .due {
    list-style: none;
    margin: 0;
    padding: 0.25rem 1rem;
  }

  .due li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .due li:last-child {
    border-bottom: 0;
  }

  .due li > span {
    display: grid;
  }

  .hero {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
  }

  .limiting {
    margin: 0;
    text-align: center;
  }

  .bars {
    list-style: none;
    margin: 0;
    padding: 0.5rem 1rem;
  }

  .bars li {
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }

  .bars li:last-child {
    border-bottom: 0;
  }

  .bar-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.35rem;
  }

  .name {
    font-weight: 600;
  }

  .tag {
    margin-left: 0.4rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--bad-bg);
    color: var(--bad);
  }

  .value {
    font-variant-numeric: tabular-nums;
  }

  .track {
    height: 10px;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 999px;
    min-width: 2px;
  }

  .fill.red {
    background: var(--bad);
  }
  .fill.amber {
    background: var(--warn);
  }
  .fill.green {
    background: var(--good);
  }

  .detail {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
  }

  .short {
    color: var(--bad);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .tile {
    display: grid;
    gap: 0.15rem;
    text-decoration: none;
    color: inherit;
    min-height: 44px;
  }

  .tile .count {
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .tile.bad .count {
    color: var(--bad);
  }

  .tile.warn .count {
    color: var(--warn);
  }

  .small {
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }

  .more {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  @media (min-width: 744px) {
    .tiles {
      grid-template-columns: repeat(4, 1fr);
    }
  }
</style>
