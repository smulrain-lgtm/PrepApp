<script lang="ts">
  import CollapseButton from '../components/CollapseButton.svelte';
  import EntrySheet from './EntrySheet.svelte';
  import ItemSheet, { type ItemPreset } from './ItemSheet.svelte';
  import { Collapsed } from '../lib/collapse.svelte';
  import { countOf, entriesOn, groupEntries, inventoryHint, listText, liveLists } from '../lib/lists';
  import { RECENT_LIST_ID, SHOPPING_LIST_ID } from '../lib/model/constants';
  import type { ListDoc, Purchase } from '../lib/model/types';
  import { buildShoppingList, shoppingText } from '../lib/shopping';
  import { store } from '../lib/store.svelte';
  import { slug } from '../seed/csv';

  let { params }: { params: URLSearchParams } = $props();

  const LAST_KEY = 'prepapp.list';
  function lastList(): string {
    try {
      return localStorage.getItem(LAST_KEY) ?? SHOPPING_LIST_ID;
    } catch {
      return SHOPPING_LIST_ID;
    }
  }

  const snap = $derived(store.snapshot!);
  const lists = $derived(liveLists(snap));
  let selectedId = $state(lastList());
  // A link such as #/lists?list=list:recently-used opens that list.
  $effect(() => {
    const wanted = params.get('list');
    if (wanted) selectedId = wanted;
  });
  const list = $derived(lists.find((l) => l._id === selectedId) ?? lists[0]);

  function select(id: string) {
    selectedId = id;
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* per-device convenience only */
    }
  }

  const entries = $derived(list ? entriesOn(snap, list._id) : []);
  const toBuy = $derived(entries.filter((e) => e.status === 'to_buy'));
  const bought = $derived(entries.filter((e) => e.status === 'bought'));
  const groups = $derived(groupEntries(toBuy));
  const shopping = $derived(buildShoppingList(snap, store.readiness!, store.today));
  const isShopping = $derived(list?.kind === 'shopping');

  const collapsed = new Collapsed('lists');
  const groupKey = (name: string) => `${list?._id}:${name}`;
  const allKeys = $derived([
    ...groups.map((g) => groupKey(g.category)),
    ...(isShopping ? ['target', 'need', 'check'].map(groupKey) : []),
  ]);

  // --- Lists: new, rename, delete -------------------------------------------------
  let naming = $state<'new' | 'rename' | null>(null);
  let listName = $state('');

  function startNaming(mode: 'new' | 'rename') {
    naming = mode;
    listName = mode === 'rename' ? (list?.name ?? '') : '';
  }

  async function saveList(event: SubmitEvent) {
    event.preventDefault();
    const name = listName.trim();
    if (!name) return;
    if (naming === 'rename' && list) {
      await store.run((repo) => repo.save({ ...list, name }), `Renamed to ${name}.`);
    } else {
      const ids = new Set(snap.lists.map((l) => l._id));
      let id = `list:${slug(name) || 'list'}`;
      for (let n = 2; ids.has(id); n++) id = `list:${slug(name) || 'list'}-${n}`;
      const doc: ListDoc = {
        _id: id,
        type: 'list',
        updatedAt: '',
        name,
        kind: 'custom',
        order: Math.max(0, ...snap.lists.map((l) => l.order)) + 1,
      };
      const ok = await store.run((repo) => repo.save(doc), `Added the list ${name}.`);
      if (ok) select(id);
    }
    naming = null;
  }

  async function deleteList() {
    if (!list || list.kind !== 'custom') return;
    if (!confirm(`Delete the list ${list.name} and its ${entries.length} entries?`)) return;
    const target = list;
    const doomed = entries;
    const ok = await store.run(async (repo) => {
      for (const e of doomed) await repo.softDelete(e._id);
      await repo.softDelete(target._id);
    }, `Deleted ${target.name}.`);
    if (ok) select(SHOPPING_LIST_ID);
  }

  // --- Entries ---------------------------------------------------------------------
  let entryOpen = $state(false);
  let editing = $state<Purchase | null>(null);
  let newCategory = $state('');

  function addEntry(category = '') {
    editing = null;
    newCategory = category === 'Other' ? '' : category;
    entryOpen = true;
  }

  function editEntry(e: Purchase) {
    editing = e;
    entryOpen = true;
  }

  // "Purchased": add it to the inventory, then tick it off.
  let buying = $state<Purchase | null>(null);
  let itemOpen = $state(false);
  let itemId = $state<string | null>(null);
  let preset = $state<ItemPreset>({});
  let presetQuantity = $state(1);

  function purchased(e: Purchase) {
    buying = e;
    const item = e.itemId ? snap.items.find((i) => i._id === e.itemId && !i.deleted) : undefined;
    itemId = item?._id ?? null;
    const hint = inventoryHint(e, snap.categories);
    preset = item ? {} : { name: e.name, categoryId: hint.categoryId, subCategory: hint.subCategory };
    presetQuantity = countOf(e.quantity) ?? 1;
    itemOpen = true;
  }

  async function onAdded(id: string, quantity: number) {
    const entry = buying;
    itemOpen = false;
    if (!entry) return;
    await store.run(
      (repo) => repo.save({ ...entry, status: 'bought', itemId: id }),
      quantity
        ? `Bought ${entry.name}: ${quantity} added to the inventory.`
        : `Bought ${entry.name}: added to the inventory.`,
    );
    buying = null;
  }

  async function backOnList(e: Purchase) {
    await store.run((repo) => repo.save({ ...e, status: 'to_buy' }));
  }

  async function clearBought() {
    if (!confirm(`Remove the ${bought.length} bought entries from ${list?.name}?`)) return;
    const doomed = bought;
    await store.run(async (repo) => {
      for (const e of doomed) await repo.softDelete(e._id);
    }, 'Cleared.');
  }

  async function share() {
    if (!list) return;
    const text = isShopping
      ? shoppingText(shopping, store.today, snap.settings.targetDays)
      : listText(list, entries);
    try {
      if (navigator.share) {
        await navigator.share({ title: list.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      store.notify(`${list.name} copied.`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') store.notify('Could not share the list.');
    }
  }

  /** "To reach the target": readiness shortfalls, then meals short of the Food box. */
  function shortRows() {
    return [
      ...shopping.shortfalls.map((s) => ({ key: s.label, label: s.label, value: `${s.amount} more` })),
      ...shopping.meals.map((m) => ({ key: `meal-${m.label}`, label: m.label, value: `${m.more} more` })),
    ];
  }

  const countFor = (l: ListDoc) => entriesOn(snap, l._id).filter((e) => e.status === 'to_buy').length;
</script>

<div class="title-row">
  <h1>Lists</h1>
  <button class="primary" onclick={share}>Share</button>
</div>

<div class="chips" role="group" aria-label="Lists">
  {#each lists as l (l._id)}
    <button
      class:selected={l._id === list?._id}
      aria-pressed={l._id === list?._id}
      onclick={() => select(l._id)}
    >
      {l.name} <span class="n">{countFor(l)}</span>
    </button>
  {/each}
  <button class="new" onclick={() => startNaming('new')}>+ New list</button>
</div>

{#if naming}
  <form class="card naming" onsubmit={saveList}>
    <label>
      <span>{naming === 'new' ? 'New list' : 'Rename list'}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={listName} autofocus placeholder="e.g. Camping, Car kit" data-testid="list-name" />
    </label>
    <button class="primary" type="submit">{naming === 'new' ? 'Add list' : 'Rename'}</button>
    <button type="button" onclick={() => (naming = null)}>Cancel</button>
  </form>
{/if}

{#if list}
  <div class="list-head">
    <p class="muted">
      {#if isShopping}
        What to buy to reach {snap.settings.targetDays} days for {snap.settings.people} people, plus anything you
        add.
      {:else if list._id === RECENT_LIST_ID}
        Packs used from the Rotation screen. Tap <strong>Purchased</strong> when you have replaced one.
      {:else}
        Your own list. Add, change and tick off entries.
      {/if}
    </p>
    <div class="list-actions">
      {#if allKeys.length}
        <button class="link" onclick={() => collapsed.setAll(allKeys, collapsed.allClosed(allKeys))}>
          {collapsed.allClosed(allKeys) ? 'Show all' : 'Hide all'}
        </button>
      {/if}
      {#if list.kind === 'custom'}
        <button class="link" onclick={() => startNaming('rename')}>Rename</button>
        <button class="link danger" onclick={deleteList}>Delete list</button>
      {/if}
    </div>
  </div>

  {#if isShopping}
    {#if shopping.shortfalls.length || shopping.meals.length}
      {@render computed('target', 'To reach the target', shortRows())}
    {/if}
    {#if shopping.need.length}
      {@render computed(
        'need',
        `Equipment and supplies needed (${shopping.need.length})`,
        shopping.need.map((n) => ({ key: n.line._id, label: n.line.name, sub: n.section, value: n.target })),
      )}
    {/if}
    {#if shopping.check.length}
      {@render computed(
        'check',
        `To check at home (${shopping.check.length})`,
        shopping.check.map((c) => ({ key: c.line._id, label: c.line.name, sub: c.section, value: 'Check' })),
      )}
    {/if}
  {/if}

  {#each groups as g (g.category)}
    {@const key = groupKey(g.category)}
    {@const id = `grp-${slug(key)}`}
    <section aria-labelledby="{id}-h">
      <div class="group-head">
        <CollapseButton
          open={collapsed.isOpen(key)}
          label={g.category}
          controls={id}
          onclick={() => collapsed.toggle(key)}
        />
        <h2 id="{id}-h">{g.category}</h2>
        <span class="muted count">{g.entries.length}</span>
        <button class="add" aria-label="Add to {g.category}" onclick={() => addEntry(g.category)}
          >+ Add</button
        >
      </div>
      {#if collapsed.isOpen(key)}
        <ul class="card list" {id}>
          {#each g.entries as e (e._id)}
            <li data-testid="entry-{e._id}">
              <button class="main" onclick={() => editEntry(e)}>
                <span class="name">{e.name}</span>
                <span class="muted small"
                  >{[e.quantity, e.fillsGap, e.notes].filter(Boolean).join(' · ')}</span
                >
              </button>
              <button class="buy" aria-label="Purchased {e.name}" onclick={() => purchased(e)}
                >Purchased</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}

  {#if !groups.length}
    <p class="card muted">Nothing on {list.name} yet.</p>
  {/if}
  <button class="primary wide" onclick={() => addEntry()}>+ Add to {list.name}</button>

  {#if bought.length}
    <details class="card bought">
      <summary>Bought ({bought.length})</summary>
      <ul class="list">
        {#each bought as e (e._id)}
          <li>
            <span class="name">{e.name}</span>
            <button class="link" onclick={() => backOnList(e)}>Back on list</button>
          </li>
        {/each}
      </ul>
      <button class="link danger" onclick={clearBought}>Clear bought</button>
    </details>
  {/if}
{/if}

{#snippet computed(
  name: string,
  title: string,
  rows: { key: string; label: string; sub?: string; value: string }[],
)}
  {@const key = groupKey(name)}
  <section aria-labelledby="c-{name}-h">
    <div class="group-head">
      <CollapseButton
        open={collapsed.isOpen(key)}
        label={title}
        controls="c-{name}"
        onclick={() => collapsed.toggle(key)}
      />
      <h2 id="c-{name}-h">{title}</h2>
    </div>
    {#if collapsed.isOpen(key)}
      <ul class="card list" id="c-{name}">
        {#each rows as r (r.key)}
          <li>
            <span
              >{r.label}{#if r.sub}<span class="muted small"> · {r.sub}</span>{/if}</span
            >
            <strong>{r.value}</strong>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

<EntrySheet
  open={entryOpen}
  entry={editing}
  listId={list?._id ?? SHOPPING_LIST_ID}
  category={newCategory}
  onclose={() => (entryOpen = false)}
/>

<ItemSheet
  open={itemOpen}
  {itemId}
  {preset}
  {presetQuantity}
  onclose={() => (itemOpen = false)}
  onadded={onAdded}
/>

<style>
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.25rem 0 0.5rem;
  }

  .chips button {
    border-radius: 999px;
    padding: 0 0.9rem;
  }

  .chips .selected {
    background: var(--accent);
    color: var(--accent-contrast);
    border-color: var(--accent);
  }

  .chips .n {
    font-size: 0.8rem;
    opacity: 0.8;
    margin-left: 0.2rem;
  }

  .chips .new {
    color: var(--accent);
    font-weight: 600;
  }

  .naming {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .naming label {
    flex: 1 1 12rem;
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  .naming input {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .list-head p {
    margin: 0.25rem 0;
  }

  .list-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 1rem;
  }

  .group-head .count {
    flex: 1;
  }

  .group-head h2 {
    margin: 0.5rem 0;
    font-size: 1.1rem;
  }

  .count {
    font-weight: 400;
    font-size: 0.9rem;
  }

  .add {
    padding: 0 0.9rem;
    font-weight: 600;
    color: var(--accent);
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
    gap: 0.75rem;
    min-height: 44px;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
  }

  .list li:last-child {
    border-bottom: 0;
  }

  .main {
    flex: 1;
    display: grid;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.25rem 0;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .buy {
    flex: none;
    padding: 0 0.8rem;
    font-weight: 600;
    color: var(--good);
  }

  .small {
    font-size: 0.85rem;
  }

  .wide {
    width: 100%;
    margin-top: 1rem;
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent);
    padding: 0;
    min-height: 44px;
    font-weight: 600;
  }

  .danger {
    color: var(--bad);
  }

  .bought {
    margin-top: 1rem;
  }

  .bought summary {
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
</style>
