<script lang="ts">
  import Toggle from '../components/Toggle.svelte';
  import { formatDate } from '../lib/model/dates';
  import { store } from '../lib/store.svelte';
  import { testConnection, type ConnectionResult } from '../lib/sync-endpoint';
  import { syncState } from '../lib/sync/sync.svelte';
  import SyncBadge from '../components/SyncBadge.svelte';

  const initial = store.syncSettings;
  let addresses = $state(initial.endpoints.join('\n'));
  let database = $state(initial.database);
  let username = $state(initial.username);
  let password = $state(initial.password);
  let enabled = $state(initial.enabled);
  let showPassword = $state(false);
  let testing = $state(false);
  let result = $state<ConnectionResult | null>(null);

  const endpoints = $derived(
    addresses
      .split(/\n|,/)
      .map((a) => a.trim())
      .filter(Boolean),
  );

  const tone = $derived(
    result === null
      ? ''
      : result.kind === 'ok' || result.kind === 'reachable'
        ? 'good'
        : result.kind === 'invalid'
          ? 'warn'
          : 'bad',
  );

  function save(enable = enabled) {
    enabled = enable;
    store.saveSyncSettings({
      endpoints,
      database: database.trim(),
      username: username.trim(),
      password,
      enabled,
    });
  }

  async function runTest() {
    testing = true;
    result = null;
    result = await testConnection(endpoints[0] ?? '', {
      database: database.trim(),
      username: username.trim(),
      password,
    });
    testing = false;
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    save();
    store.notify(enabled ? 'Saved. Syncing…' : 'Saved.');
  }

  function time(iso: string | null): string {
    if (!iso) return 'never';
    const d = new Date(iso);
    const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const day = formatDate(iso.slice(0, 10));
    return iso.slice(0, 10) === store.today ? `today at ${hm}` : `${day} at ${hm}`;
  }
</script>

<section aria-labelledby="sync-heading">
  <h2 id="sync-heading">Sync with the Pi</h2>
  <p class="muted">
    Keeps every device's copy the same. Sync runs while the app is open, at home or away over OpenVPN. iOS
    does not let web apps sync in the background.
  </p>

  <div class="card status-card" data-testid="sync-status">
    <div class="row">
      <SyncBadge />
      <button onclick={() => store.syncNow()} disabled={!store.syncSettings.enabled}>Sync now</button>
    </div>
    <p class="muted small">
      Last synced {time(syncState.lastSyncedAt)}{#if syncState.endpoint}
        · via {syncState.endpoint}{/if}
    </p>
    {#if syncState.message}<p class="small message">{syncState.message}</p>{/if}
  </div>

  <form class="card form" onsubmit={onSubmit}>
    <Toggle
      label="Sync this device"
      checked={enabled}
      onchange={(v) => {
        save(v);
        store.notify(v ? 'Sync turned on.' : 'Sync turned off.');
      }}
    />
    <label>
      <span>Sync addresses <span class="muted">(one per line, tried in order)</span></span>
      <textarea
        bind:value={addresses}
        rows="2"
        inputmode="url"
        autocapitalize="off"
        spellcheck="false"
        placeholder="https://prep.mulras.uk"></textarea>
    </label>
    <div class="two">
      <label>
        <span>Database</span>
        <input bind:value={database} autocapitalize="off" spellcheck="false" />
      </label>
      <label>
        <span>Username</span>
        <input bind:value={username} autocomplete="username" autocapitalize="off" spellcheck="false" />
      </label>
    </div>
    <label>
      <span>Password <span class="muted">(stored on this device only)</span></span>
      <div class="password">
        <input
          bind:value={password}
          type={showPassword ? 'text' : 'password'}
          autocomplete="current-password"
        />
        <button type="button" onclick={() => (showPassword = !showPassword)}
          >{showPassword ? 'Hide' : 'Show'}</button
        >
      </div>
    </label>
    <div class="buttons">
      <button class="primary" type="submit">Save</button>
      <button type="button" onclick={runTest} disabled={testing}
        >{testing ? 'Testing…' : 'Test connection'}</button
      >
    </div>

    {#if result}
      <p class="result {tone}" role="status">
        <strong>{result.kind === 'ok' || result.kind === 'reachable' ? 'Success' : 'Not connected'}:</strong>
        {result.message}
      </p>
    {/if}
  </form>

  {#if store.conflictLog.length}
    <details class="card log">
      <summary>Edited on two devices ({store.conflictLog.length})</summary>
      <p class="muted small">When the same record was changed on two devices, the newest change was kept.</p>
      <ul>
        {#each store.conflictLog.slice(0, 20) as c (c.at + c.docId)}
          <li>
            <strong>{c.label}</strong> · {time(c.at)}<br />
            <span class="muted small">
              Kept the version from {time(c.kept.updatedAt)}; the other {c.discarded
                .map((d) => d.summary)
                .join('; ')}.
            </span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .status-card {
    margin-bottom: 0.75rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .small {
    font-size: 0.85rem;
    margin: 0.4rem 0 0;
  }

  .message {
    color: var(--warn);
  }

  .form {
    display: grid;
    gap: 0.9rem;
  }

  label {
    display: grid;
    gap: 0.3rem;
    font-weight: 600;
  }

  label .muted {
    font-weight: 400;
  }

  input,
  textarea {
    min-height: 44px;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-weight: 400;
  }

  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .password {
    display: flex;
    gap: 0.5rem;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .result {
    margin: 0;
    padding: 0.75rem;
    border-radius: 10px;
  }

  .result.good {
    background: var(--good-bg);
    color: var(--good);
  }

  .result.warn {
    background: var(--warn-bg);
    color: var(--warn);
  }

  .result.bad {
    background: var(--bad-bg);
    color: var(--bad);
  }

  .log {
    margin-top: 0.75rem;
  }

  .log summary {
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .log ul {
    margin: 0.5rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.5rem;
  }
</style>
