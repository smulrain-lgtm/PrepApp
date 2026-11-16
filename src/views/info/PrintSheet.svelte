<script lang="ts">
  import Photo from '../../components/Photo.svelte';
  import { SLOTS } from '../../lib/info-templates';
  import { formatDate } from '../../lib/model/dates';
  import { store } from '../../lib/store.svelte';

  const snap = $derived(store.snapshot!);
  const contacts = $derived(snap.contacts.filter((c) => !c.deleted && c.phones.length));
  const notes = $derived(snap.infoNotes.filter((n) => !n.deleted));
  const filled = (section: 'plan' | 'shutoffs') => {
    const slotIds = (SLOTS[section] ?? []).map((s) => s.id);
    return notes
      .filter((n) => n.section === section && n.body)
      .sort((a, b) => {
        const ia = slotIds.indexOf(a._id);
        const ib = slotIds.indexOf(b._id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.order - b.order;
      });
  };
  const plan = $derived(filled('plan'));
  const shutoffs = $derived(filled('shutoffs'));
</script>

<p class="muted no-print">
  This page prints as one sheet: contacts, the household plan and shut-offs. The medical list is not included.
</p>
<button class="primary no-print" onclick={() => window.print()}>Print or save as PDF</button>

<article class="sheet">
  <header>
    <h2>Household emergency sheet</h2>
    <p>
      Printed {formatDate(store.today)} · {snap.settings.people} people · {snap.settings.pets.length} pets
    </p>
  </header>

  <section>
    <h3>Contacts</h3>
    <table>
      <tbody>
        {#each contacts as c (c._id)}
          <tr>
            <th scope="row">{c.name}</th>
            <td>{c.phones.join(' · ')}</td>
            <td class="role">{c.role}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section>
    <h3>Household plan</h3>
    {#each plan as n (n._id)}
      <p><strong>{n.title}:</strong> {n.body}</p>
    {:else}
      <p class="muted">Not filled in yet (Emergency info › Household plan).</p>
    {/each}
  </section>

  <section>
    <h3>Shut-offs</h3>
    <div class="shutoffs">
      {#each shutoffs as n (n._id)}
        <div>
          <p><strong>{n.title}:</strong> {n.body}</p>
          {#if n.hasPhoto}<Photo noteId={n._id} rev={n._rev} alt="Photo: {n.title}" />{/if}
        </div>
      {:else}
        <p class="muted">Not filled in yet (Emergency info › Shut-offs).</p>
      {/each}
    </div>
  </section>
</article>

<style>
  .sheet {
    margin-top: 1rem;
    background: #fff;
    color: #111;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    font-size: 0.9rem;
  }

  .sheet h2 {
    margin: 0;
    font-size: 1.3rem;
  }

  .sheet h3 {
    font-size: 1rem;
    margin: 1rem 0 0.4rem;
    border-bottom: 2px solid #111;
  }

  .sheet p {
    margin: 0.2rem 0;
  }

  .sheet .muted {
    color: #555;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    text-align: left;
    padding: 0.2rem 0.4rem 0.2rem 0;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
  }

  .role {
    color: #555;
  }

  .shutoffs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .shutoffs :global(img) {
    max-height: 140px;
  }

  @media print {
    .no-print {
      display: none !important;
    }

    .sheet {
      border: 0;
      padding: 0;
      margin: 0;
    }
  }
</style>
