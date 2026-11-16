<script lang="ts">
  import DataSettings from './DataSettings.svelte';
  import ScenarioSettings from './ScenarioSettings.svelte';
  import SyncSettings from './SyncSettings.svelte';
  import SyncBadge from '../components/SyncBadge.svelte';
  import { pastDateRule } from '../lib/readiness';
  import { store } from '../lib/store.svelte';

  let { params }: { params: URLSearchParams } = $props();

  type Page = 'store' | 'household' | 'sync' | 'data' | 'about';
  const page = $derived(params.get('s') as Page | null);
  const s = $derived(store.snapshot!.settings);
  const version = __APP_VERSION__;

  const RULE = {
    exclude: 'past-date food not counted',
    taper: 'past-date food tapered',
    include: 'past-date food counted',
  };

  const cards = $derived([
    {
      id: 'store',
      title: 'Your store',
      summary: `${s.targetDays}-day target · ${s.goalDays ?? 14}-day goal · ${RULE[pastDateRule(s)]}`,
      icon: 'M5 21V4h11l-2 4 2 4H5',
    },
    {
      id: 'household',
      title: 'Household',
      summary: `${s.people} ${s.people === 1 ? 'person' : 'people'} · ${s.pets.length} ${s.pets.length === 1 ? 'pet' : 'pets'}`,
      icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 11a2.5 2.5 0 1 0 0-5M17 15c2 .5 4 2 4 5',
    },
    {
      id: 'sync',
      title: 'Sync with the Pi',
      summary: store.syncSettings.enabled ? 'On' : 'Off',
      icon: 'M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a5 5 0 0 0-9 3M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2 2a5 5 0 0 0 9-3',
    },
    {
      id: 'data',
      title: 'Backup and data',
      summary: `Export, import · this device: ${store.deviceName}`,
      icon: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    },
    {
      id: 'about',
      title: 'About',
      summary: `Version ${version} · how it's calculated`,
      icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5',
    },
  ] as const);

  const current = $derived(cards.find((c) => c.id === page));
</script>

{#if !current}
  <h1>Settings</h1>
  <ul class="cards">
    {#each cards as c (c.id)}
      <li>
        <a class="card row" href="#/settings?s={c.id}">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                d={c.icon}
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="text">
            <strong>{c.title}</strong>
            <span class="muted">{c.summary}</span>
          </span>
          {#if c.id === 'sync'}<SyncBadge />{/if}
          <span class="chevron" aria-hidden="true">›</span>
        </a>
      </li>
    {/each}
  </ul>
{:else}
  <a class="back" href="#/settings">‹ Settings</a>
  <h1>{current.title}</h1>
  {#if current.id === 'store' || current.id === 'household'}
    <ScenarioSettings part={current.id} />
  {:else if current.id === 'sync'}
    <SyncSettings />
  {:else if current.id === 'data'}
    <DataSettings />
  {:else}
    <section class="card about">
      <p>PrepApp version {version}</p>
      <p><a href="#/method">How the figures are worked out</a>, with sources.</p>
      <p class="muted">
        Offline-first household preparedness app. Your data stays on your devices and your own Pi.
      </p>
    </section>
  {/if}
{/if}

<style>
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    color: inherit;
    text-decoration: none;
  }

  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--accent);
  }

  .text {
    flex: 1;
    display: grid;
    min-width: 0;
  }

  .text .muted {
    font-size: 0.875rem;
  }

  .chevron {
    font-size: 1.4rem;
    color: var(--text-2);
  }

  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .about p {
    margin: 0 0 0.5rem;
  }

  .about a {
    color: var(--accent);
    font-weight: 600;
  }
</style>
