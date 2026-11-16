<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { syncState, type SyncStatus } from '../lib/sync/sync.svelte';

  let { online = true, link = false }: { online?: boolean; link?: boolean } = $props();

  function hm(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  const status = $derived<SyncStatus>(
    !store.syncSettings.enabled ? 'off' : !online ? 'offline' : syncState.status,
  );

  const text = $derived(
    {
      off: online ? 'Sync off' : 'Offline',
      connecting: 'Syncing…',
      syncing: 'Syncing…',
      synced: `Synced ${hm(syncState.lastSyncedAt)}`,
      offline: 'Offline',
      error: 'Sync error',
    }[status],
  );

  const tone = $derived(
    status === 'synced'
      ? 'good'
      : status === 'error'
        ? 'bad'
        : status === 'offline' || (status === 'off' && !online)
          ? 'warn'
          : 'neutral',
  );
</script>

{#if link}
  <a class="pill {tone}" href="#/settings" aria-label="Sync status: {text}. Open sync settings">{text}</a>
{:else}
  <span class="pill {tone}" aria-label="Sync status: {text}">{text}</span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 999px;
    text-decoration: none;
    white-space: nowrap;
  }

  .good {
    background: var(--good-bg);
    color: var(--good);
  }

  .warn {
    background: var(--warn-bg);
    color: var(--warn);
  }

  .bad {
    background: var(--bad-bg);
    color: var(--bad);
  }

  .neutral {
    background: var(--surface-2);
    color: var(--text-2);
  }
</style>
