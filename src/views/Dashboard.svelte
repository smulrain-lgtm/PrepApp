<script lang="ts">
  import { changeNote, loadSeen, saveSeen, type SeenReadiness } from '../lib/change-note';
  import { nextCheckDue } from '../lib/checklist-view';
  import { formatAmount, formatDays } from '../lib/format';
  import { MEDICINE_ESSENTIALS, METRIC_INFO } from '../lib/model/constants';
  import { formatDate } from '../lib/model/dates';
  import { computeReadiness, medicineEssentials, pastDateRule, type Band } from '../lib/readiness';
  import { applyScenario, loadScenario, saveScenario, SCENARIOS, type Scenario } from '../lib/scenario';
  import { buildShoppingList, shoppingCount } from '../lib/shopping';
  import { medicationCover } from '../lib/stock-links';
  import { store } from '../lib/store.svelte';

  const snap = $derived(store.snapshot!);
  const settings = $derived(snap.settings);
  const home = $derived(store.readiness!);

  // Scenario: the same store judged for a different situation (viewing only).
  let scenario = $state<Scenario>(loadScenario());
  function pick(s: Scenario) {
    scenario = s;
    saveScenario(s);
  }
  const scenarioInfo = $derived(SCENARIOS.find((s) => s.id === scenario)!);
  const r = $derived(
    scenario === 'home'
      ? home
      : computeReadiness({ ...snap, settings: applyScenario(settings, scenario) }, store.today),
  );

  const tiles = $derived(r.metrics.filter((m) => m.critical && m.days !== null));
  const limitingLabel = $derived(METRIC_INFO.find((m) => m.id === r.limiting)?.label);
  const essentials = $derived(medicineEssentials(store.resolvedChecklist!.lines, MEDICINE_ESSENTIALS));
  const meds = $derived(medicationCover(snap, r.targetDays));

  function medText(m: (typeof meds)[number]): string {
    const name = m.medication.name || 'Medicine';
    if (m.stock === null) return `${m.person.name}: ${name} – not linked to the inventory`;
    if (m.stock === 0) return `${m.person.name}: ${name} – none in stock`;
    const units = `${m.stock} ${m.item!.unit}${m.stock === 1 ? '' : 's'}`;
    return m.days === null
      ? `${m.person.name}: ${name} – ${units}`
      : `${m.person.name}: ${name} – ${units}, ${formatDays(m.days)} days`;
  }

  // Ruler: 0 → the goal (or further, if the store already lasts longer).
  const scale = $derived(Math.max(r.goalDays, Math.ceil(r.readinessDays)));
  const pct = (days: number) => `${Math.min(100, (days / scale) * 100)}%`;
  const toGoal = $derived(r.goalDays - r.readinessDays);

  const BAND_WORD: Record<Band, string> = { red: 'Not ready', amber: 'Partly ready', green: 'Ready' };

  function tileStatus(days: number): string {
    if (days >= r.goalDays) return 'Past your goal';
    if (days >= r.targetDays)
      return `${formatDays(r.goalDays - days)} days short of your ${r.goalDays}-day goal`;
    return `${formatDays(r.targetDays - days)} days short of the ${r.targetDays}-day target`;
  }

  const ICON: Record<string, string> = {
    water_l: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
    kcal: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1-3 4-3 7h3v11',
    pet_food_g:
      'M8 6.5a1.5 2 0 1 1-.01 0zM16 6.5a1.5 2 0 1 1-.01 0zM4.5 11.5a1.5 2 0 1 1-.01 0zM19.5 11.5a1.5 2 0 1 1-.01 0zM12 13c-3 0-5 3-5 5s2 2 5 2 5 0 5-2-2-5-5-5z',
    fuel_g: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5',
    light_days: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
    med: 'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z',
  };

  // "Why did my number go down?" — compared with what this device last showed (Home only).
  const previous = loadSeen();
  const seenNow = $derived<SeenReadiness>({
    date: store.today,
    days: home.readinessDays,
    people: settings.people,
    pets: settings.pets.length,
    rule: pastDateRule(settings),
    expiredUnits: home.expiry.expired,
  });
  const note = $derived(changeNote(previous, seenNow));
  $effect(() => saveSeen(seenNow));

  const RULE_WORD = { exclude: 'not counted', taper: 'tapered', include: 'counted' } as const;
  const scenarioLine = $derived(
    [
      `${settings.people} ${settings.people === 1 ? 'person' : 'people'}`,
      settings.pets.length ? `${settings.pets.length} ${settings.pets.length === 1 ? 'pet' : 'pets'}` : null,
      `${r.targetDays}-day target`,
      `past-date food ${RULE_WORD[pastDateRule(settings)]}`,
      settings.useSoonAtRisk ? 'use-soon at risk' : null,
      settings.indoorOnly ? 'indoor stock only' : null,
      settings.freezing ? 'freezing' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );

  const checklist = $derived(store.checklist!);
  const checklistPct = $derived(checklist.total ? Math.round((checklist.have / checklist.total) * 100) : 0);
  const shopping = $derived(buildShoppingList(snap, home, store.today));
  const dueChecks = $derived(checklist.dueChecks);

  const expiryTiles = $derived([
    { label: 'Expired', count: home.expiry.expired, status: 'expired', tone: 'bad' },
    { label: 'Within 30 days', count: home.expiry.within30Days, status: 'soon30', tone: 'warn' },
    {
      label: `Within ${settings.warningMonths} months`,
      count: home.expiry.withinWarning,
      status: 'use_soon',
      tone: 'warn',
    },
    { label: 'No date', count: home.expiry.noDate, status: 'no_date', tone: 'neutral' },
  ]);
</script>

<h1>Dashboard</h1>
<p class="muted scenario-line" data-testid="scenario">{scenarioLine}</p>

<div class="switcher" role="group" aria-label="Scenario">
  {#each SCENARIOS as s (s.id)}
    <button class:selected={scenario === s.id} aria-pressed={scenario === s.id} onclick={() => pick(s.id)}>
      {s.label}
    </button>
  {/each}
</div>
{#if scenario !== 'home'}<p class="muted small scenario-desc">{scenarioInfo.description}</p>{/if}

<div class="grid">
  <div class="col">
    <section class="hero {r.band}" aria-labelledby="readiness-heading">
      <h2 id="readiness-heading" class="lead">
        {scenario === 'go_bag' ? 'Your go bag lasts' : 'Your store lasts'}
        <span class="word">{BAND_WORD[r.band]}</span>
      </h2>
      <p
        class="number"
        role="img"
        aria-label="Readiness {formatDays(r.readinessDays)} of {r.targetDays} days. {BAND_WORD[r.band]}."
      >
        <span class="big" aria-hidden="true">{formatDays(r.readinessDays)}</span>
        <span class="unit" aria-hidden="true">days</span>
      </p>
      <div class="ruler" aria-hidden="true">
        <div class="ruler-fill" style:width={pct(r.readinessDays)}></div>
        <div class="mark target" style:left={pct(r.targetDays)}><span>{r.targetDays}-day target</span></div>
        <div class="mark goal" style:left={pct(r.goalDays)}><span>⚑ {r.goalDays}</span></div>
      </div>
      <p class="caption">
        {#if toGoal <= 0}Goal reached{:else}{formatDays(toGoal)} days to your {r.goalDays}-day goal{/if}
      </p>
      {#if limitingLabel}
        <div class="limit-row">
          <p class="limiting" data-testid="limiting"><strong>{limitingLabel}</strong> runs out first.</p>
          {#if scenario !== 'go_bag'}<a class="restock" href="#/lists">Restock ›</a>{/if}
        </div>
      {/if}
    </section>

    {#if note}<p class="note" role="status">{note}</p>{/if}
  </div>

  <section class="col" aria-labelledby="days-heading">
    <h2 id="days-heading" class="visually-hidden">Days by category</h2>
    <ul class="cat-tiles">
      {#each tiles as m (m.metric)}
        <li class="cat {m.metric}" data-testid="bar-{m.metric}">
          <div class="cat-head">
            <span class="name">
              {m.label}
              {#if m.metric === r.limiting}<span class="tag">Limiting</span>{/if}
            </span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d={ICON[m.metric]}
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <span class="value"><strong>{formatDays(m.days)}</strong> days</span>
          <span class="status">{tileStatus(m.days!)}</span>
          <span class="detail">
            {#if m.metric === 'light_days'}
              Have {formatAmount(m.metric, m.stock)} of cover
            {:else}
              Have {formatAmount(m.metric, m.stock)} · need {formatAmount(m.metric, m.dailyDemand)} a day
            {/if}{#if m.shortfall > 0}{` · short ${formatAmount(m.metric, m.shortfall)}`}{/if}
          </span>
        </li>
      {/each}
      <li class="cat med" data-testid="tile-medicine">
        <a href="#/checklist">
          <div class="cat-head">
            <span class="name">Medicines</span>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d={ICON.med}
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <span class="value"><strong>{essentials.covered}</strong> of {essentials.total}</span>
          <span class="status">essentials covered</span>
          {#if essentials.missing.length}
            <span class="detail">Still need: {essentials.missing.join(', ')}</span>
          {/if}
          {#if meds.length}
            <ul class="meds" data-testid="med-cover">
              {#each meds as m (m.medication.id)}
                <li>
                  <span aria-hidden="true">{m.band === 'green' ? '✓' : m.band === 'amber' ? '!' : '✕'}</span>
                  {medText(m)}{m.band === 'green' ? '' : m.band === 'amber' ? ' (low)' : ' (short)'}
                </li>
              {/each}
            </ul>
          {/if}
        </a>
      </li>
    </ul>
    <p class="muted small">
      <a href="#/method">How is this worked out?</a>
    </p>
  </section>

  <section aria-labelledby="expiry-heading">
    <h2 id="expiry-heading">Expiry</h2>
    <div class="tiles">
      {#each expiryTiles as t (t.status)}
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
    <a class="card link-card" href="#/lists" data-testid="shopping-card">
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
  .scenario-line {
    margin-top: -0.25rem;
  }

  .switcher {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 4px;
    gap: 4px;
    border-radius: 14px;
    background: var(--surface-2);
    margin: 0.5rem 0 0.25rem;
  }

  .switcher button {
    border: 0;
    background: none;
    border-radius: 10px;
    padding: 0 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-2);
  }

  .switcher .selected {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  }

  .scenario-desc {
    margin: 0.25rem 0 0;
  }

  .grid {
    display: grid;
    gap: 0 1.25rem;
    align-items: start;
    margin-top: 0.75rem;
  }

  @media (min-width: 1000px) {
    .grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* --- Hero ---------------------------------------------------------------- */
  .hero {
    border-radius: 20px;
    padding: 1.1rem 1.25rem 1rem;
    color: #fff;
    background: linear-gradient(160deg, #24603f, #173f29);
  }

  .hero.red {
    background: linear-gradient(160deg, #a3261d, #761a14);
  }

  .hero.amber {
    background: linear-gradient(160deg, #9a5b00, #6f4100);
  }

  .lead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .word {
    font-size: 0.8rem;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.18);
  }

  .number {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0.1rem 0 0.4rem;
  }

  .big {
    font-size: 5.5rem;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }

  .unit {
    font-size: 1.6rem;
    font-weight: 700;
  }

  .ruler {
    position: relative;
    height: 14px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.2);
    margin: 0.4rem 0 1.6rem;
  }

  .ruler-fill {
    height: 100%;
    border-radius: 999px;
    background: #fff;
    min-width: 4px;
  }

  .mark {
    position: absolute;
    top: -4px;
    height: 22px;
    border-left: 2px solid #fff;
  }

  .mark span {
    position: absolute;
    top: 24px;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .mark.goal span {
    transform: translateX(-90%);
  }

  .caption {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .limit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgb(255 255 255 / 0.25);
  }

  .limiting {
    margin: 0;
  }

  .restock {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 999px;
    background: #fff;
    color: #173f29;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }

  .note {
    margin: 0.75rem 0 0;
    padding: 0.6rem 0.9rem;
    border-radius: 12px;
    background: var(--warn-bg);
    color: var(--warn);
    font-size: 0.9rem;
  }

  /* --- Category tiles --------------------------------------------------------- */
  .cat-tiles {
    list-style: none;
    margin: 1rem 0 0.5rem;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  @media (min-width: 1000px) {
    .cat-tiles {
      margin-top: 0;
    }
  }

  .cat {
    border-radius: 16px;
    padding: 0.8rem 0.9rem;
    color: #fff;
    display: grid;
    gap: 0.1rem;
    align-content: start;
  }

  .cat a {
    display: grid;
    gap: 0.1rem;
    color: inherit;
    text-decoration: none;
  }

  .cat-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 0.5rem;
  }

  .cat .name {
    font-weight: 700;
  }

  .cat .value {
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }

  .cat .value strong {
    font-size: 1.9rem;
    font-weight: 800;
  }

  .cat .status {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .cat .detail {
    font-size: 0.78rem;
    margin-top: 0.2rem;
  }

  .meds {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0.35rem 0 0;
    border-top: 1px solid rgb(255 255 255 / 0.35);
    display: grid;
    gap: 0.15rem;
    font-size: 0.78rem;
  }

  .meds span {
    display: inline-block;
    width: 1.1em;
    font-weight: 800;
  }

  .tag {
    display: inline-block;
    margin-left: 0.3rem;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 6px;
    background: #fff;
    color: #761a14;
    vertical-align: middle;
  }

  /* Fixed, dark category colours: white text passes WCAG AA on each. */
  .water_l {
    background: #1d4ed8;
  }
  .kcal {
    background: #15803d;
  }
  .pet_food_g {
    background: #6d28d9;
  }
  .fuel_g {
    background: #b45309;
  }
  .light_days {
    background: #a16207;
  }
  .med {
    background: #be185d;
  }

  /* --- Lower cards (unchanged) ------------------------------------------------- */
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
