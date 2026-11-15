<script lang="ts">
  import Stepper from '../components/Stepper.svelte';
  import Toggle from '../components/Toggle.svelte';
  import type { DailyNeeds, Pet } from '../lib/model/types';
  import { store } from '../lib/store.svelte';

  const s = $derived(store.snapshot!.settings);

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
</script>

<section aria-labelledby="scenario-heading">
  <h2 id="scenario-heading">Scenario</h2>
  <div class="card stack">
    <div class="row">
      <span class="label">People</span>
      <Stepper
        label="People"
        value={s.people}
        min={1}
        max={10}
        onchange={(v) => store.updateSettings({ people: v })}
      />
    </div>
    <div class="row">
      <span class="label">Target days</span>
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
  </div>
</section>

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

<section aria-labelledby="counting-heading">
  <h2 id="counting-heading">What counts</h2>
  <div class="card stack">
    <Toggle
      label="Consider expiry dates"
      description="OFF: expired stock still counts and expiry badges are only for information. Some ration packs are safe well past their date."
      checked={s.considerExpiry}
      onchange={(v) => store.updateSettings({ considerExpiry: v })}
    />
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

<style>
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

  .small {
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
</style>
