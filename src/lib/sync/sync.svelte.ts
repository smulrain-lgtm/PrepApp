/**
 * Live two-way sync between this device's database and CouchDB on the Pi.
 *
 * iOS gives web apps no background time, so sync runs while the app is open:
 * it starts when the app opens, restarts when the device comes back online or
 * the app returns to the foreground, and retries with back-off.
 */
import PouchDB from 'pouchdb-core';
import type { SyncSettings } from '../device-settings';
import { nowIso } from '../model/dates';
import type { AnyDoc } from '../model/types';
import { normaliseEndpoint, testConnection } from '../sync-endpoint';
import { resolveAllConflicts } from './conflicts';

export type SyncStatus = 'off' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';

const LAST_SYNC_KEY = 'prepapp.lastSync';

function loadLastSync(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export const syncState = $state({
  status: 'off' as SyncStatus,
  /** When this device last finished a sync with nothing left to send or fetch. */
  lastSyncedAt: loadLastSync(),
  /** The address in use, e.g. https://prep.mulras.uk */
  endpoint: null as string | null,
  /** Why sync is offline or failing, in plain words. */
  message: '',
  /** Documents sent and received since sync started. */
  pushed: 0,
  pulled: 0,
});

const RETRY_MS = 60_000;

export class SyncManager {
  private handler: PouchDB.Replication.Sync<AnyDoc> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(private readonly localDb: () => PouchDB.Database<AnyDoc> | null) {}

  get running(): boolean {
    return this.handler !== null;
  }

  stop(status: SyncStatus = 'off'): void {
    this.generation++;
    clearTimeout(this.retryTimer);
    this.handler?.cancel();
    this.handler = null;
    syncState.status = status;
    if (status === 'off') {
      syncState.endpoint = null;
      syncState.message = '';
    }
  }

  async start(settings: SyncSettings): Promise<void> {
    this.stop();
    const generation = this.generation;
    const local = this.localDb();
    if (!settings.enabled || !settings.endpoints.length || !local) return;

    if (!navigator.onLine) return this.offline(settings, 'This device is offline.');

    syncState.status = 'connecting';
    syncState.message = '';
    const creds = settings.password
      ? { database: settings.database, username: settings.username, password: settings.password }
      : {};

    let chosen: string | null = null;
    let lastProblem = 'The Pi did not answer. Are you at home or on the VPN?';
    for (const address of settings.endpoints) {
      const result = await testConnection(address, { ...creds, timeoutMs: 5000 });
      if (generation !== this.generation) return; // stopped or restarted meanwhile
      if (result.kind === 'ok' || (result.kind === 'reachable' && !settings.password)) {
        const n = normaliseEndpoint(address);
        chosen = n.ok ? n.url : null;
        break;
      }
      if (result.kind === 'unauthorised' || result.kind === 'no-database') {
        syncState.status = 'error';
        syncState.message = result.message;
        return; // retrying will not help until the settings change
      }
      lastProblem = result.message;
    }
    if (!chosen) return this.offline(settings, lastProblem);

    syncState.endpoint = chosen;
    const remote = new PouchDB<AnyDoc>(`${chosen}/${encodeURIComponent(settings.database)}`, {
      adapter: 'http',
      skip_setup: true,
      ...(settings.password ? { auth: { username: settings.username, password: settings.password } } : {}),
    });

    // Settle anything left over from an earlier sync before carrying on.
    await resolveAllConflicts(local).catch(() => undefined);
    if (generation !== this.generation) return;

    syncState.pushed = 0;
    syncState.pulled = 0;
    this.handler = local
      .sync(remote, {
        live: true,
        retry: true,
        back_off_function: (delay) => (delay === 0 ? 1000 : Math.min(delay * 2, RETRY_MS)),
      })
      .on('active', () => {
        syncState.status = 'syncing';
        syncState.message = '';
      })
      .on('change', (info) => {
        if (info.direction === 'push') syncState.pushed += info.change.docs_written;
        else syncState.pulled += info.change.docs_written;
      })
      .on('paused', (error) => {
        if (generation !== this.generation) return;
        if (error) {
          syncState.status = 'offline';
          syncState.message = 'Lost the connection to the Pi. Retrying…';
        } else {
          syncState.status = 'synced';
          syncState.message = '';
          syncState.lastSyncedAt = nowIso();
          try {
            localStorage.setItem(LAST_SYNC_KEY, syncState.lastSyncedAt);
          } catch {
            /* not persisted */
          }
        }
      })
      .on('denied', () => {
        syncState.status = 'error';
        syncState.message = 'The Pi refused a change (permission denied).';
      })
      .on('error', (error) => {
        if (generation !== this.generation) return;
        const status = (error as { status?: number }).status;
        this.handler = null;
        syncState.status = 'error';
        syncState.message =
          status === 401 || status === 403
            ? 'The Pi rejected the username or password.'
            : `Sync stopped: ${(error as Error).message ?? 'unknown error'}`;
      }) as PouchDB.Replication.Sync<AnyDoc>;
  }

  private offline(settings: SyncSettings, message: string): void {
    syncState.status = 'offline';
    syncState.message = message;
    const generation = this.generation;
    this.retryTimer = setTimeout(() => {
      if (generation === this.generation && document.visibilityState === 'visible') void this.start(settings);
    }, RETRY_MS);
  }
}
