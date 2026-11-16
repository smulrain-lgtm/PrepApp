<script lang="ts">
  import DataSettings from './DataSettings.svelte';
  import ScenarioSettings from './ScenarioSettings.svelte';
  import SyncSettings from './SyncSettings.svelte';

  const version = __APP_VERSION__;
</script>

<h1>Settings</h1>

<ScenarioSettings />

<SyncSettings />

<DataSettings />

<section aria-labelledby="about-heading">
  <h2 id="about-heading">About</h2>
  <p class="muted">PrepApp version {version}</p>
</section>
