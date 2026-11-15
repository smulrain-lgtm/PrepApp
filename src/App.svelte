<script lang="ts">
  import { applyUpdate, pwa } from './lib/pwa.svelte';
  import { isTabId, tabs, type TabId } from './lib/tabs';
  import Placeholder from './views/Placeholder.svelte';
  import Settings from './views/Settings.svelte';

  function tabFromHash(): TabId {
    const id = location.hash.replace(/^#\/?/, '');
    return isTabId(id) ? id : 'dashboard';
  }

  let active = $state<TabId>(tabFromHash());
  let online = $state(navigator.onLine);

  const current = $derived(tabs.find((t) => t.id === active)!);

  function select(id: TabId) {
    active = id;
    history.replaceState(null, '', `#/${id}`);
  }
</script>

<svelte:window
  onhashchange={() => (active = tabFromHash())}
  ononline={() => (online = true)}
  onoffline={() => (online = false)}
/>

<div class="shell">
  <nav class="tabbar" aria-label="Main">
    <div class="brand" aria-hidden="true">PrepApp</div>
    {#each tabs as tab (tab.id)}
      <button
        class="tab"
        class:active={tab.id === active}
        aria-current={tab.id === active ? 'page' : undefined}
        onclick={() => select(tab.id)}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path
            d={tab.icon}
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{tab.label}</span>
      </button>
    {/each}
  </nav>

  <main>
    <header class="status" role="status">
      <span class="pill" class:offline={!online}>{online ? 'Online' : 'Offline'}</span>
      {#if pwa.offlineReady}
        <span class="pill ready">Works offline</span>
      {/if}
    </header>

    {#if pwa.updateAvailable}
      <div class="update card" role="alert">
        <span>A new version of PrepApp is ready.</span>
        <button class="primary" onclick={applyUpdate}>Reload</button>
      </div>
    {/if}

    {#if active === 'settings'}
      <Settings />
    {:else}
      <Placeholder title={current.label} stage={current.stage} />
    {/if}
  </main>
</div>

<style>
  .shell {
    min-height: 100dvh;
  }

  main {
    padding: calc(env(safe-area-inset-top) + 0.75rem) calc(env(safe-area-inset-right) + 1rem)
      calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 1.5rem) calc(env(safe-area-inset-left) + 1rem);
    max-width: 960px;
  }

  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    display: flex;
    justify-content: space-around;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    z-index: 10;
  }

  .brand {
    display: none;
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    height: var(--tabbar-h);
    border: 0;
    border-radius: 0;
    background: none;
    color: var(--text-2);
    font-size: 0.7rem;
    padding: 6px 0 4px;
  }

  .tab.active {
    color: var(--accent);
    font-weight: 600;
  }

  .status {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
  }

  .pill {
    font-size: 0.75rem;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--good-bg);
    color: var(--good);
  }

  .pill.offline {
    background: var(--warn-bg);
    color: var(--warn);
  }

  .pill.ready {
    background: var(--surface-2);
    color: var(--text-2);
  }

  .update {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  /* iPad and Mac: sidebar navigation instead of a bottom tab bar. */
  @media (min-width: 744px) {
    .shell {
      display: grid;
      grid-template-columns: 220px 1fr;
    }

    .tabbar {
      position: sticky;
      top: 0;
      height: 100dvh;
      flex-direction: column;
      justify-content: flex-start;
      gap: 4px;
      border-top: 0;
      border-right: 1px solid var(--border);
      padding: calc(env(safe-area-inset-top) + 1rem) 0.75rem 1rem calc(env(safe-area-inset-left) + 0.75rem);
    }

    .brand {
      display: block;
      font-weight: 700;
      font-size: 1.2rem;
      padding: 0 0.75rem 1rem;
    }

    .tab {
      flex: none;
      flex-direction: row;
      gap: 0.75rem;
      height: 44px;
      padding: 0 0.75rem;
      border-radius: 10px;
      font-size: 1rem;
    }

    .tab.active {
      background: var(--surface-2);
    }

    main {
      padding: calc(env(safe-area-inset-top) + 1rem) 2rem 2rem;
    }
  }
</style>
