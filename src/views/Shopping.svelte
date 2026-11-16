<script lang="ts">
  import { buildShoppingList, shoppingText } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import type { Purchase } from '../lib/model/types';

  const snap = $derived(store.snapshot!);
  const list = $derived(buildShoppingList(snap, store.readiness!));

  async function share() {
    const text = shoppingText(list, store.today, snap.settings.targetDays);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'PrepApp shopping list', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      store.notify('Shopping list copied.');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') store.notify('Could not share the list.');
    }
  }

  async function setBought(p: Purchase, bought: boolean) {
    await store.run(
      (repo) => repo.save({ ...p, status: bought ? 'bought' : 'to_buy' }),
      bought ? `Bought: ${p.name}. Add it to the inventory when it is stored.` : undefined,
    );
  }
</script>

<a class="back" href="#/dashboard">‹ Dashboard</a>
<div class="title-row">
  <h1>Shopping list</h1>
  <button class="primary" onclick={share}>Share list</button>
</div>
<p class="muted">What to buy to reach {snap.settings.targetDays} days for {snap.settings.people} people.</p>

{#if list.shortfalls.length}
  <section aria-labelledby="short-heading">
    <h2 id="short-heading">To reach the target</h2>
    <ul class="card list">
      {#each list.shortfalls as s (s.label)}
        <li><span>{s.label}</span><strong>{s.amount} more</strong></li>
      {/each}
    </ul>
  </section>
{/if}

{#if list.toBuy.length}
  <section aria-labelledby="buy-heading">
    <h2 id="buy-heading">Planned food ({list.toBuy.length})</h2>
    <ul class="card list">
      {#each list.toBuy as p (p._id)}
        <li class="purchase">
          <label>
            <input type="checkbox" onchange={() => setBought(p, true)} />
            <span>
              <strong>{p.name}</strong>
              <span class="muted small">{p.quantity}{p.fillsGap ? ` · ${p.fillsGap}` : ''}</span>
            </span>
          </label>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if list.need.length}
  <section aria-labelledby="need-heading">
    <h2 id="need-heading">Equipment and supplies needed ({list.need.length})</h2>
    <ul class="card list">
      {#each list.need as n (n.line._id)}
        <li>
          <span>{n.line.name} <span class="muted small">· {n.section}</span></span>
          <strong>{n.target}</strong>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if list.check.length}
  <section aria-labelledby="check-heading">
    <h2 id="check-heading">To check at home ({list.check.length})</h2>
    <ul class="card list">
      {#each list.check as c (c.line._id)}
        <li><span>{c.line.name}</span><a href="#/checklist">Checklist ›</a></li>
      {/each}
    </ul>
  </section>
{/if}

{#if list.bought.length}
  <details class="card bought">
    <summary>Bought ({list.bought.length})</summary>
    <ul class="list">
      {#each list.bought as p (p._id)}
        <li class="purchase">
          <label>
            <input type="checkbox" checked onchange={() => setBought(p, false)} />
            <span>{p.name}</span>
          </label>
          <a href="#/inventory?add={encodeURIComponent(p.name)}">Add to inventory</a>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0.25rem 1rem;
  }

  .list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 44px;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
  }

  .list li:last-child {
    border-bottom: 0;
  }

  .purchase label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
  }

  .purchase label span {
    display: grid;
  }

  .purchase input {
    width: 22px;
    height: 22px;
    flex: none;
  }

  .small {
    font-size: 0.85rem;
  }

  a {
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
  }

  .bought summary {
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
</style>
