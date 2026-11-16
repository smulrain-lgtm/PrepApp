<script lang="ts">
  import { DEFAULT_KCAL } from '../lib/model/constants';
  import { store } from '../lib/store.svelte';

  const s = $derived(store.snapshot!.settings);
  const petWater = $derived(s.pets.reduce((t, p) => t + p.waterLPerDay, 0));
  const petFood = $derived(s.pets.reduce((t, p) => t + p.foodGPerDay, 0));
</script>

<a class="back" href="#/dashboard">‹ Dashboard</a>
<h1>How it's calculated</h1>
<p class="lead">
  The household lasts as long as whatever runs out first. Each category is worked out in days, and the
  headline is the shortest of them.
</p>

<section class="card">
  <h2>Days for each category</h2>
  <p><strong>Days = usable stock ÷ what the household needs in a day.</strong></p>
  <table>
    <thead
      ><tr
        ><th scope="col">Category</th><th scope="col">A day, for your household now</th><th scope="col"
          >From</th
        ></tr
      ></thead
    >
    <tbody>
      <tr>
        <th scope="row">Water</th>
        <td>{s.people} × {s.dailyNeeds.waterLPerPerson} L{petWater ? ` + ${petWater} L for pets` : ''}</td>
        <td>
          {s.dailyNeeds.waterLPerPerson} L a person covers drinking and cooking. The government's Be Ready advice
          asks for at least 3 L of drinking water per person per day. Only stored water counts: the taps are assumed
          off.
        </td>
      </tr>
      <tr>
        <th scope="row">Food</th>
        <td>{s.people} × {s.dailyNeeds.kcalPerPerson.toLocaleString('en-GB')} kcal</td>
        <td>
          A typical adult figure; change it in Settings › Household. With the pack size and kcal per 100 g
          from the label (typed in, or filled in by scanning the barcode), a pack counts pack size × kcal ÷
          100. Packs without a calorie figure use an estimate by type: {Object.entries(DEFAULT_KCAL)
            .map(([k, v]) => `${k.toLowerCase()} ${v}`)
            .join(', ')} kcal.
        </td>
      </tr>
      <tr>
        <th scope="row">Pet food</th>
        <td>{petFood} g dry food</td>
        <td>Each pet's own daily amount, from Settings › Household.</td>
      </tr>
      <tr>
        <th scope="row">Cooking gas</th>
        <td>{s.people} × {s.dailyNeeds.gasGPerPerson} g</td>
        <td
          >77 g a person is one 230 g canister a day for three people. Camping stoves are for outdoors only.</td
        >
      </tr>
      <tr>
        <th scope="row">Lighting</th>
        <td>1 day of cover</td>
        <td>Counts only in the Power cut scenario.</td>
      </tr>
    </tbody>
  </table>
  <p class="muted small">
    Medicines are not counted in days: the Medicines tile shows how many essentials on the checklist are
    marked Have.
  </p>
</section>

<section class="card">
  <h2>What counts as usable</h2>
  <ul>
    <li>
      <strong>Food past its best-before:</strong> by your choice in Settings › Your store: not counted, counted
      in full for 6 months then tapering to nothing at 12, or still counted. A best-before on tins, dried food and
      bottled water is about quality, not safety. This is a planning assumption, not advice about what is safe to
      eat.
    </li>
    <li><strong>Use soon at risk</strong> (optional): stock inside the warning window is left out.</li>
    <li>
      <strong>Indoor stock only</strong> and the <strong>Garage lost</strong> scenario: garage and car stock is
      left out.
    </li>
    <li><strong>Freezing conditions:</strong> water and plain-butane gas stored outdoors are left out.</li>
    <li>Items marked "does not count towards readiness" (equipment) never count.</li>
  </ul>
</section>

<section class="card">
  <h2>Scenarios</h2>
  <ul>
    <li><strong>Home:</strong> everything as set in Settings.</li>
    <li><strong>Power cut:</strong> lighting also counts.</li>
    <li><strong>Garage lost:</strong> only indoor and grab-bag stock.</li>
    <li>
      <strong>Go bag:</strong> only what is in the grab bags, against 72 hours, eaten cold (no cooking gas).
    </li>
  </ul>
</section>

<section class="card">
  <h2>The figure</h2>
  <ul>
    <li>Days are rounded down, so the app never overstates how long you'd last.</li>
    <li>Red below half the target, amber up to it, green at or past it.</li>
    <li>
      The figure can go down without anyone using anything: when packs pass their best-before, or when someone
      joins the household. The dashboard says which.
    </li>
  </ul>
  <p class="muted small">
    A planning estimate, not medical or dietary advice. Needs differ with age, health, pregnancy and hot
    weather.
  </p>
</section>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .lead {
    font-size: 1.05rem;
  }

  section {
    margin-bottom: 0.9rem;
  }

  h2 {
    margin-top: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.45rem 0.5rem 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }

  ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.4rem;
  }

  .small {
    font-size: 0.85rem;
    margin: 0.6rem 0 0;
  }
</style>
