<script lang="ts">
  import { loadSyncSettings, saveSyncSettings } from '../lib/device-settings';
  import { testConnection, type ConnectionResult } from '../lib/sync-endpoint';

  const initial = loadSyncSettings();
  let endpoint = $state(initial.endpoint);
  let database = $state(initial.database);
  let username = $state(initial.username);
  let password = $state('');
  let testing = $state(false);
  let result = $state<ConnectionResult | null>(null);

  const tone = $derived(
    result === null
      ? ''
      : result.kind === 'ok' || result.kind === 'reachable'
        ? 'good'
        : result.kind === 'invalid'
          ? 'warn'
          : 'bad',
  );

  async function runTest(event: SubmitEvent) {
    event.preventDefault();
    testing = true;
    result = null;
    saveSyncSettings({ endpoint, database, username });
    result = await testConnection(endpoint, { database, username, password });
    testing = false;
  }

  const version = __APP_VERSION__;
</script>

<h1>Settings</h1>

<section aria-labelledby="sync-heading">
  <h2 id="sync-heading">Sync with the Pi</h2>
  <p class="muted">
    Sync works at home, or away over OpenVPN. The address and login are stored on this device only.
  </p>

  <form class="card form" onsubmit={runTest}>
    <label>
      <span>Sync address</span>
      <input
        bind:value={endpoint}
        type="url"
        inputmode="url"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        placeholder="https://prep.mulras.uk"
      />
    </label>
    <label>
      <span>Database</span>
      <input bind:value={database} autocapitalize="off" spellcheck="false" />
    </label>
    <label>
      <span>Username</span>
      <input bind:value={username} autocomplete="username" autocapitalize="off" spellcheck="false" />
    </label>
    <label>
      <span>Password <span class="muted">(optional for this test, not saved)</span></span>
      <input bind:value={password} type="password" autocomplete="current-password" />
    </label>
    <button class="primary" type="submit" disabled={testing}>
      {testing ? 'Testing…' : 'Test connection'}
    </button>

    {#if result}
      <p class="result {tone}" role="status">
        <strong>{result.kind === 'ok' || result.kind === 'reachable' ? 'Success' : 'Not connected'}:</strong>
        {result.message}
      </p>
    {/if}
  </form>
</section>

<section aria-labelledby="about-heading">
  <h2 id="about-heading">About</h2>
  <p class="muted">PrepApp version {version}</p>
</section>

<style>
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

  input {
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-weight: 400;
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
</style>
