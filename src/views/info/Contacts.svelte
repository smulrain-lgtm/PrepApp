<script lang="ts">
  import Sheet from '../../components/Sheet.svelte';
  import type { Contact } from '../../lib/model/types';
  import { telHref } from '../../lib/photo';
  import { store } from '../../lib/store.svelte';
  import { slug } from '../../seed/csv';

  const contacts = $derived(store.snapshot!.contacts.filter((c) => !c.deleted));

  let open = $state(false);
  let editing = $state<Contact | null>(null);
  let form = $state({ name: '', role: '', phones: '', notes: '' });

  function edit(contact: Contact | null) {
    editing = contact;
    form = contact
      ? {
          name: contact.name,
          role: contact.role,
          phones: contact.phones.join(', '),
          notes: contact.notes ?? '',
        }
      : { name: '', role: '', phones: '', notes: '' };
    open = true;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return store.notify('Give the contact a name.');
    const phones = form.phones
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const base: Contact = editing ?? {
      _id: `contact:${slug(name)}-${Date.now().toString(36)}`,
      type: 'contact',
      updatedAt: '',
      name,
      role: '',
      phones: [],
      priority: Math.max(0, ...contacts.map((c) => c.priority)) + 1,
    };
    const ok = await store.run(
      (repo) =>
        repo.save({ ...base, name, role: form.role.trim(), phones, notes: form.notes.trim() || undefined }),
      'Saved.',
    );
    if (ok) open = false;
  }

  async function move(index: number, by: -1 | 1) {
    const other = contacts[index + by];
    const me = contacts[index];
    if (!other) return;
    await store.run(async (repo) => {
      await repo.save({ ...me, priority: other.priority });
      await repo.save({ ...other, priority: me.priority });
    });
  }

  async function remove() {
    if (!editing || !confirm(`Delete ${editing.name}?`)) return;
    const ok = await store.run((repo) => repo.softDelete(editing!._id), 'Deleted.');
    if (ok) open = false;
  }
</script>

<div class="toolbar">
  <button class="primary" onclick={() => edit(null)}>Add contact</button>
</div>

<ul class="list">
  {#each contacts as c, i (c._id)}
    <li class="card" data-testid="contact-{c._id}">
      <div class="head">
        <div>
          <strong>{c.name}</strong>
          <span class="muted role">{c.role}</span>
        </div>
        <div class="order">
          <button aria-label="Move {c.name} up" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
          <button
            aria-label="Move {c.name} down"
            disabled={i === contacts.length - 1}
            onclick={() => move(i, 1)}>↓</button
          >
          <button onclick={() => edit(c)}>Edit</button>
        </div>
      </div>
      {#if c.phones.length}
        <div class="phones">
          {#each c.phones as phone (phone)}
            <a class="call" href={telHref(phone)} aria-label="Call {c.name} on {phone}">📞 {phone}</a>
            {#if /^0?7|^\+447/.test(phone.replace(/\s/g, ''))}
              <a class="text" href={telHref(phone, 'sms')} aria-label="Text {c.name}">Text</a>
            {/if}
          {/each}
        </div>
      {:else}
        <button class="link" onclick={() => edit(c)}>Add a number</button>
      {/if}
      {#if c.notes}<p class="muted notes">{c.notes}</p>{/if}
    </li>
  {/each}
</ul>

<Sheet {open} title={editing ? editing.name : 'Add contact'} onclose={() => (open = false)}>
  <form onsubmit={save}>
    <label><span>Name</span><input bind:value={form.name} required /></label>
    <label><span>Role</span><input bind:value={form.role} placeholder="GP, neighbour, vet…" /></label>
    <label>
      <span>Phone numbers</span>
      <input bind:value={form.phones} inputmode="tel" placeholder="Separate several with commas" />
    </label>
    <label><span>Notes</span><textarea rows="2" bind:value={form.notes}></textarea></label>
    <div class="actions">
      <button class="primary" type="submit">Save</button>
      {#if editing}<button type="button" class="danger" onclick={remove}>Delete</button>{/if}
    </div>
  </form>
</Sheet>

<style>
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.75rem;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 0.5rem;
  }

  .role {
    display: block;
    font-size: 0.85rem;
  }

  .order {
    display: flex;
    gap: 0.3rem;
  }

  .order button {
    padding: 0 0.6rem;
  }

  .phones {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .call,
  .text {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
  }

  .call {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .text {
    border: 1px solid var(--border);
    color: var(--text);
  }

  .link {
    border: 0;
    background: none;
    color: var(--accent);
    padding: 0;
    text-decoration: underline;
  }

  .notes {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
  }

  form {
    display: grid;
    gap: 0.8rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input,
  textarea {
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-weight: 400;
  }

  .actions {
    display: flex;
    justify-content: space-between;
  }

  .danger {
    color: var(--bad);
  }
</style>
