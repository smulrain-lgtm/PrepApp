<script lang="ts">
  import Stepper from '../components/Stepper.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { GOAL_PRESETS, MEAL_TYPES } from '../lib/model/constants';
  import type { DailyNeeds, MealType, Medication, PastDateRule, Person, Pet } from '../lib/model/types';
  import { mealsPerDay } from '../lib/stock-links';
  import { pastDateRule } from '../lib/readiness';
  import { store } from '../lib/store.svelte';

  /** store: target, goal and what counts. household: people, pets, daily needs. */
  let { part }: { part: 'store' | 'household' } = $props();

  const s = $derived(store.snapshot!.settings);
  const rule = $derived(pastDateRule(s));

  const RULES: { value: PastDateRule; label: string; hint: string }[] = [
    { value: 'exclude', label: 'Not counted', hint: 'Food stops counting on its best-before date.' },
    {
      value: 'taper',
      label: 'Taper over a year',
      hint: 'Counted in full for 6 months past the date, then less and less until nothing at 12 months. A best-before on tins and dried food is about quality, not safety.',
    },
    {
      value: 'include',
      label: 'Still counted',
      hint: 'Dates are shown for rotation but do not change the figure.',
    },
  ];

  function setRule(value: PastDateRule) {
    void store.updateSettings({ pastDateRule: value, considerExpiry: value !== 'include' });
  }

  function savePets(pets: Pet[]) {
    void store.updateSettings({ pets });
  }

  function updatePet(index: number, patch: Partial<Pet>) {
    savePets(s.pets.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPet() {
    savePets([
      ...s.pets,
      {
        id: `pet-${Date.now().toString(36)}`,
        name: `Pet ${s.pets.length + 1}`,
        kind: 'dog',
        foodGPerDay: 100,
        waterLPerDay: 1,
      },
    ]);
  }

  function removePet(index: number) {
    if (!confirm(`Remove ${s.pets[index].name}?`)) return;
    savePets(s.pets.filter((_, i) => i !== index));
  }

  function num(value: string, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function updateNeeds(patch: Partial<DailyNeeds>) {
    void store.updateSettings({ dailyNeeds: { ...s.dailyNeeds, ...patch } });
  }

  function setMeals(type: MealType, value: string) {
    const n = num(value, mealsPerDay(s, type));
    void store.updateSettings({ mealsPerDay: { ...s.mealsPerDay, [type]: n } });
  }

  // --- Named people and their medicines -----------------------------------------
  const members = $derived(s.members ?? []);
  const medItems = $derived(
    store
      .snapshot!.items.filter((i) => !i.deleted)
      .sort(
        (a, b) =>
          Number(b.categoryId === 'category:safety-first-aid') -
            Number(a.categoryId === 'category:safety-first-aid') || a.name.localeCompare(b.name),
      ),
  );
  const newId = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  /** Save the people list; the head count is never fewer than the named people. */
  function saveMembers(list: Person[], people = Math.max(s.people, list.length)) {
    void store.updateSettings({ members: list, people });
  }

  function addPerson() {
    const list = [
      ...members,
      { id: newId('person'), name: `Person ${members.length + 1}`, age: null, medications: [] },
    ];
    saveMembers(list, Math.max(s.people, list.length));
  }

  function updatePerson(index: number, patch: Partial<Person>) {
    saveMembers(members.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePerson(index: number) {
    if (!confirm(`Remove ${members[index].name}? The household count goes down by one too.`)) return;
    saveMembers(
      members.filter((_, i) => i !== index),
      Math.max(1, s.people - 1),
    );
  }

  function addMedication(index: number) {
    const p = members[index];
    updatePerson(index, {
      medications: [...p.medications, { id: newId('med'), name: '', dosePerDay: null }],
    });
  }

  function updateMedication(index: number, medIndex: number, patch: Partial<Medication>) {
    const p = members[index];
    updatePerson(index, {
      medications: p.medications.map((m, j) => (j === medIndex ? { ...m, ...patch } : m)),
    });
  }

  function removeMedication(index: number, medIndex: number) {
    const p = members[index];
    updatePerson(index, { medications: p.medications.filter((_, j) => j !== medIndex) });
  }
</script>

{#if part === 'household'}
  <section aria-labelledby="people-heading">
    <h2 id="people-heading">People</h2>
    <div class="card stack">
      <div class="row">
        <span class="label">People</span>
        <Stepper
          label="People"
          value={s.people}
          min={Math.max(1, members.length)}
          max={10}
          onchange={(v) => store.updateSettings({ people: v })}
        />
      </div>
      <p class="muted small flush">
        Name each person (optional) to record their age and any medicines they depend on. The Medicines tile
        on the dashboard then shows the stock of each one.
      </p>
      {#each members as person, i (person.id)}
        <div class="person" data-testid="person-{i}">
          <div class="person-top">
            <label class="grow">
              <span>Name</span>
              <input
                value={person.name}
                onchange={(e) => updatePerson(i, { name: e.currentTarget.value.trim() || person.name })}
              />
            </label>
            <label class="age">
              <span>Age</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="120"
                value={person.age ?? ''}
                onchange={(e) =>
                  updatePerson(i, {
                    age: e.currentTarget.value === '' ? null : num(e.currentTarget.value, 0),
                  })}
              />
            </label>
            <button class="remove" aria-label="Remove {person.name}" onclick={() => removePerson(i)}
              >Remove</button
            >
          </div>
          {#each person.medications as med, j (med.id)}
            <div class="med">
              <label class="grow">
                <span>Medicine</span>
                <input
                  value={med.name}
                  placeholder="e.g. Levothyroxine 50 mcg"
                  onchange={(e) => updateMedication(i, j, { name: e.currentTarget.value.trim() })}
                />
              </label>
              <label class="dose">
                <span>A day</span>
                <input
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="any"
                  value={med.dosePerDay ?? ''}
                  aria-label="{med.name || 'Medicine'} doses a day"
                  onchange={(e) =>
                    updateMedication(i, j, {
                      dosePerDay: e.currentTarget.value === '' ? null : num(e.currentTarget.value, 0),
                    })}
                />
              </label>
              <label class="grow">
                <span>Inventory item</span>
                <select
                  value={med.itemId ?? ''}
                  aria-label="{med.name || 'Medicine'} inventory item"
                  onchange={(e) => updateMedication(i, j, { itemId: e.currentTarget.value || null })}
                >
                  <option value="">Not linked</option>
                  {#each medItems as item (item._id)}<option value={item._id}>{item.name}</option>{/each}
                </select>
              </label>
              <button
                class="remove"
                aria-label="Remove {med.name || 'medicine'}"
                onclick={() => removeMedication(i, j)}>✕</button
              >
            </div>
          {/each}
          <button class="link" onclick={() => addMedication(i)}>+ Add a medicine for {person.name}</button>
        </div>
      {/each}
      <button onclick={addPerson}>+ Add person</button>
    </div>
  </section>

  <section aria-labelledby="needs-heading">
    <h2 id="needs-heading">Daily needs per person</h2>
    <div class="card needs">
      <label>
        <span>Water (L)</span>
        <input
          type="number"
          inputmode="decimal"
          min="0"
          step="0.5"
          value={s.dailyNeeds.waterLPerPerson}
          onchange={(e) =>
            updateNeeds({ waterLPerPerson: num(e.currentTarget.value, s.dailyNeeds.waterLPerPerson) })}
        />
      </label>
      <label>
        <span>Calories (kcal)</span>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          step="100"
          value={s.dailyNeeds.kcalPerPerson}
          onchange={(e) =>
            updateNeeds({ kcalPerPerson: num(e.currentTarget.value, s.dailyNeeds.kcalPerPerson) })}
        />
      </label>
      <label>
        <span>Cooking gas (g)</span>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          value={s.dailyNeeds.gasGPerPerson}
          onchange={(e) =>
            updateNeeds({ gasGPerPerson: num(e.currentTarget.value, s.dailyNeeds.gasGPerPerson) })}
        />
      </label>
    </div>
    <p class="muted small">77 g of gas per person is one 230 g canister a day for three people.</p>
  </section>

  <section aria-labelledby="meals-heading">
    <h2 id="meals-heading">Meals per person per day</h2>
    <div class="card needs meals">
      {#each MEAL_TYPES as m (m.id)}
        <label>
          <span>{m.label}</span>
          <input
            type="number"
            inputmode="decimal"
            min="0"
            step="0.5"
            value={mealsPerDay(s, m.id)}
            onchange={(e) => setMeals(m.id, e.currentTarget.value)}
          />
        </label>
      {/each}
    </div>
    <p class="muted small">
      Targets for the Food box on the Checklist: people × days × meals a day, e.g. 3 people for 3 days with 1
      breakfast a day is 9 breakfasts.
    </p>
  </section>
{:else}
  <section aria-labelledby="target-heading">
    <h2 id="target-heading">Target and goal</h2>
    <div class="card stack">
      <div class="row">
        <span class="label">Target days <span class="muted hint">(the minimum, e.g. Be Ready's 3)</span></span
        >
        <Stepper
          label="Target days"
          value={s.targetDays}
          min={1}
          max={14}
          onchange={(v) => store.updateSettings({ targetDays: v })}
        />
      </div>
      <div class="quick" role="group" aria-label="Quick target">
        {#each [3, 5, 7] as d (d)}
          <button class:selected={s.targetDays === d} onclick={() => store.updateSettings({ targetDays: d })}>
            {d} days
          </button>
        {/each}
      </div>
      <span class="label">Long-term goal</span>
      <div class="quick goal" role="group" aria-label="Long-term goal">
        {#each GOAL_PRESETS as d (d)}
          <button
            class:selected={(s.goalDays ?? 14) === d}
            onclick={() => store.updateSettings({ goalDays: d })}
          >
            {d} days
          </button>
        {/each}
      </div>
      <p class="muted small">
        The dashboard's ruler runs to the goal. The target sets the shortfalls and the colour.
      </p>
    </div>
  </section>
{/if}

{#if part === 'household'}
  <section aria-labelledby="pets-heading">
    <h2 id="pets-heading">Pets</h2>
    <div class="card stack">
      {#each s.pets as pet, i (pet.id)}
        <div class="pet">
          <label class="wide">
            <span>Name</span>
            <input
              value={pet.name}
              onchange={(e) => updatePet(i, { name: e.currentTarget.value.trim() || pet.name })}
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={pet.kind}
              onchange={(e) => updatePet(i, { kind: e.currentTarget.value as Pet['kind'] })}
            >
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            <span>Dry food g/day</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              value={pet.foodGPerDay}
              onchange={(e) => updatePet(i, { foodGPerDay: num(e.currentTarget.value, pet.foodGPerDay) })}
            />
          </label>
          <label>
            <span>Water L/day</span>
            <input
              type="number"
              inputmode="decimal"
              min="0"
              step="0.1"
              value={pet.waterLPerDay}
              onchange={(e) => updatePet(i, { waterLPerDay: num(e.currentTarget.value, pet.waterLPerDay) })}
            />
          </label>
          <button class="remove" aria-label="Remove {pet.name}" onclick={() => removePet(i)}>Remove</button>
        </div>
      {:else}
        <p class="muted">No pets.</p>
      {/each}
      <button onclick={addPet}>Add a pet</button>
    </div>
  </section>
{:else}
  <section aria-labelledby="counting-heading">
    <h2 id="counting-heading">What counts</h2>
    <div class="card stack">
      <fieldset>
        <legend class="label">Food past its best-before</legend>
        <div class="segmented">
          {#each RULES as r (r.value)}
            <label class:selected={rule === r.value}>
              <input
                type="radio"
                name="past-date"
                value={r.value}
                checked={rule === r.value}
                onchange={() => setRule(r.value)}
              />
              {r.label}
            </label>
          {/each}
        </div>
        <p class="muted small">{RULES.find((x) => x.value === rule)?.hint}</p>
      </fieldset>
      <Toggle
        label="Treat “use soon” as at risk"
        description="ON: stock inside the warning window is left out of the readiness figure."
        checked={s.useSoonAtRisk}
        onchange={(v) => store.updateSettings({ useSoonAtRisk: v })}
      />
      <Toggle
        label="Count indoor stock only"
        description="Models losing access to the garage. Grab bags count as indoors."
        checked={s.indoorOnly}
        onchange={(v) => store.updateSettings({ indoorOnly: v })}
      />
      <Toggle
        label="Freezing conditions"
        description="Water and plain-butane gas stored outdoors stop counting."
        checked={s.freezing}
        onchange={(v) => store.updateSettings({ freezing: v })}
      />
      <div class="row">
        <span class="label">Warning window</span>
        <Stepper
          label="Warning window in months"
          value={s.warningMonths}
          min={1}
          max={24}
          unit="mo"
          onchange={(v) => store.updateSettings({ warningMonths: v })}
        />
      </div>
    </div>
  </section>
{/if}

<style>
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }

  .hint {
    font-weight: 400;
    font-size: 0.85rem;
  }

  .goal {
    justify-content: flex-start;
    flex-wrap: wrap;
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
    text-align: center;
    min-height: 44px;
    padding: 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--surface);
    border-right: 1px solid var(--border);
    cursor: pointer;
  }

  .segmented label:last-child {
    border-right: 0;
  }

  .segmented .selected {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .stack {
    display: grid;
    gap: 0.75rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .label {
    font-weight: 600;
  }

  .quick {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .quick .selected {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }

  .pet {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    align-items: end;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .pet .wide {
    grid-column: 1 / span 2;
  }

  .needs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
    font-size: 0.9rem;
  }

  input,
  select {
    width: 100%;
    min-height: 44px;
    padding: 0 0.6rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-weight: 400;
  }

  .remove {
    color: var(--bad);
  }

  .flush {
    margin: 0;
  }

  .person {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
  }

  .person-top,
  .med {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem;
  }

  .grow {
    flex: 1 1 10rem;
  }

  .age,
  .dose {
    flex: 0 0 5rem;
  }

  .med {
    padding-left: 0.75rem;
    border-left: 3px solid var(--surface-2);
  }

  .med .remove {
    width: 44px;
    padding: 0;
  }

  .link {
    justify-self: start;
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 600;
    padding: 0;
  }

  .meals {
    grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  }

  .small {
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
</style>
