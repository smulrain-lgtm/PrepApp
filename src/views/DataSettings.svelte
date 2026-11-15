<script lang="ts">
  import { BackupError } from '../lib/backup';
  import { formatDate } from '../lib/model/dates';
  import { store } from '../lib/store.svelte';

  let busy = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  async function exportJson() {
    busy = true;
    try {
      const { file } = await store.exportBackup();
      // On iPhone/iPad the share sheet can save to Files, AirDrop or mail it.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'PrepApp backup' });
          store.notify('Backup shared.');
          return;
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          // Fall through to a download.
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      store.notify(`Saved ${file.name}.`);
    } catch (error) {
      store.notify(`Export failed: ${(error as Error).message}`);
    } finally {
      busy = false;
    }
  }

  async function importJson(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const backup = store.readBackup(await file.text());
      const when = backup.exportedAt ? formatDate(backup.exportedAt.slice(0, 10)) : 'an unknown date';
      const from = backup.device ? ` from ${backup.device}` : '';
      if (
        !confirm(
          `Replace ALL data on this device with the backup made ${when}${from}? ` +
            'Anything changed since that backup will be lost.',
        )
      )
        return;
      busy = true;
      await store.replaceAll(backup.docs, `Restored the backup made ${when}.`);
    } catch (error) {
      store.notify(
        error instanceof BackupError ? error.message : `Import failed: ${(error as Error).message}`,
      );
    } finally {
      busy = false;
    }
  }

  async function reset() {
    if (!confirm('Reset to the starting data? Every change made on this device will be lost.')) return;
    if (!confirm('Are you sure? Consider exporting a backup first.')) return;
    busy = true;
    await store.resetToSeed();
    busy = false;
  }
</script>

<section aria-labelledby="data-heading">
  <h2 id="data-heading">Backup and data</h2>
  <div class="card stack">
    <label>
      <span>This device's name</span>
      <input
        value={store.deviceName}
        onchange={(e) => store.setDeviceName(e.currentTarget.value)}
        autocomplete="off"
      />
      <span class="muted small">Recorded on each stock change, so you can see who used what.</span>
    </label>
    <div class="buttons">
      <button class="primary" onclick={exportJson} disabled={busy}>Export backup (JSON)</button>
      <button onclick={() => fileInput?.click()} disabled={busy}>Import backup…</button>
      <input
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        class="visually-hidden"
        tabindex="-1"
        aria-label="Backup file"
        data-testid="import-file"
        onchange={importJson}
      />
    </div>
    <p class="muted small">
      The backup holds everything, including the medical list. Keep it somewhere private. Importing replaces
      all data on this device.
    </p>
    <button class="danger" onclick={reset} disabled={busy}>Reset to starting data…</button>
  </div>
</section>

<style>
  .stack {
    display: grid;
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  input:not([type='file']) {
    min-height: 44px;
    padding: 0 0.75rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    font-weight: 400;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .small {
    font-size: 0.85rem;
    font-weight: 400;
    margin: 0;
  }

  .danger {
    color: var(--bad);
    justify-self: start;
  }
</style>
