/**
 * App state shared by every screen: the on-device database, the latest
 * snapshot of all records, and the readiness figures derived from it.
 * Screens call the methods here; nothing else writes to the database.
 */
import { backupFileName, createBackup, parseBackup, type Backup } from './backup';
import { openLocalDb, LOCAL_DB_NAME } from './db/open';
import { Repository, type Db } from './db/repository';
import {
  loadDeviceName,
  loadSyncSettings,
  saveDeviceName,
  saveSyncSettings,
  type SyncSettings,
} from './device-settings';
import { readConflictLog, resolveConflicts, type ConflictRecord } from './sync/conflicts';
import { SyncManager, syncState } from './sync/sync.svelte';
import { todayIso } from './model/dates';
import type { AnyDoc, Settings, Snapshot } from './model/types';
import { computeReadiness, summariseChecklist } from './readiness';
import seed from '../seed/seed.json';

class AppStore {
  ready = $state(false);
  error = $state<string | null>(null);
  /** A short message shown after an action (saved, restored...). */
  notice = $state<string | null>(null);
  snapshot = $state.raw<Snapshot | null>(null);
  today = $state(todayIso());
  deviceName = $state(loadDeviceName());
  syncSettings = $state(loadSyncSettings());
  /** Conflicts resolved on this device, newest first. */
  conflictLog = $state.raw<ConflictRecord[]>([]);

  readiness = $derived(this.snapshot ? computeReadiness(this.snapshot, this.today) : null);
  checklist = $derived(
    this.snapshot
      ? summariseChecklist(this.snapshot.checklistItems, this.snapshot.settings, this.today)
      : null,
  );

  private db: Db | null = null;
  private repoInstance: Repository | null = null;
  private feed: PouchDB.Core.Changes<AnyDoc> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private sync = new SyncManager(() => this.db);

  get repo(): Repository {
    if (!this.repoInstance) throw new Error('The database is not open yet');
    return this.repoInstance;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    try {
      await this.open();
      await this.repo.seedIfEmpty(seed as AnyDoc[]);
      await this.refresh();
      this.conflictLog = await readConflictLog(this.db!);
      this.ready = true;
    } catch (error) {
      this.error = `Could not open the data on this device: ${(error as Error).message}`;
      return;
    }
    void this.sync.start(this.syncSettings);

    // iOS pauses web apps in the background: catch up when the app comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.today = todayIso(); // a new day changes what counts as expired
      this.resumeSync();
    });
    window.addEventListener('online', () => this.resumeSync());
    window.addEventListener('offline', () => {
      if (!this.syncSettings.enabled) return;
      this.sync.stop('offline');
      syncState.message = 'This device is offline.';
    });
  }

  /** Restart sync if it is not running (after coming online or back to the foreground). */
  private resumeSync(): void {
    if (!this.syncSettings.enabled) return;
    if (syncState.status === 'syncing' || syncState.status === 'connecting') return;
    if (this.sync.running && syncState.status === 'synced') return;
    void this.sync.start(this.syncSettings);
  }

  syncNow(): void {
    void this.sync.start(this.syncSettings);
  }

  saveSyncSettings(settings: SyncSettings): void {
    this.syncSettings = settings;
    saveSyncSettings(settings);
    if (settings.enabled) void this.sync.start(settings);
    else this.sync.stop();
  }

  private async open(): Promise<void> {
    this.db = openLocalDb();
    this.repoInstance = new Repository(this.db, { deviceName: this.deviceName });
    // Any change, made here or arriving from the Pi, reloads the snapshot.
    // A change that arrives in conflict with this device's version is resolved
    // straight away (newest edit wins, the other is logged).
    const db = this.db;
    this.feed = db
      .changes({ since: 'now', live: true, conflicts: true, include_docs: true })
      .on('change', (change) => {
        this.scheduleRefresh();
        if ((change.doc as { _conflicts?: string[] } | undefined)?._conflicts?.length) {
          void resolveConflicts(db, change.id).then(async (record) => {
            if (!record) return;
            this.conflictLog = await readConflictLog(db);
            this.notify(`Edited on two devices: kept the newest “${record.label}”.`);
          });
        }
      })
      .on('error', () => undefined);
  }

  private async close(): Promise<void> {
    this.feed?.cancel();
    this.feed = null;
    this.repoInstance = null;
    this.db = null;
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), 60);
  }

  async refresh(): Promise<void> {
    this.snapshot = await this.repo.loadSnapshot();
  }

  private writeQueue: Promise<unknown> = Promise.resolve();

  /**
   * Run a write, then reload. Writes run one at a time, in the order they were
   * asked for, so quick repeated taps (−1, −1) each see the previous result.
   * Errors become a visible notice instead of a crash.
   */
  run(action: (repo: Repository) => Promise<unknown>, done?: string): Promise<boolean> {
    const next = this.writeQueue.then(async () => {
      try {
        await action(this.repo);
        await this.refresh();
        if (done) this.notify(done);
        return true;
      } catch (error) {
        this.notify(`Not saved: ${(error as Error).message}`);
        return false;
      }
    });
    this.writeQueue = next;
    return next;
  }

  notify(message: string): void {
    this.notice = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), 4000);
  }

  /**
   * Change settings. The screen updates at once, so quick repeated taps build
   * on each other; the saves queue behind any other write.
   */
  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const snap = this.snapshot;
    if (!snap) return;
    const next: Settings = { ...snap.settings, ...patch };
    this.snapshot = { ...snap, settings: next };
    await this.run((repo) => {
      // Without _rev, save() picks up the latest revision, so queued saves never clash.
      const { _rev, ...doc } = next;
      void _rev;
      return repo.save(doc as Settings);
    });
  }

  setDeviceName(name: string): void {
    const clean = name.trim();
    if (!clean) return;
    saveDeviceName(clean);
    this.deviceName = clean;
    // New movements carry the new name.
    if (this.db) this.repoInstance = new Repository(this.db, { deviceName: clean });
  }

  async exportBackup(): Promise<{ file: File; backup: Backup }> {
    const exportedAt = new Date().toISOString();
    const backup = createBackup(await this.repo.exportDocs(), {
      exportedAt,
      appVersion: __APP_VERSION__,
      device: this.deviceName,
    });
    const file = new File([JSON.stringify(backup, null, 1)], backupFileName(exportedAt), {
      type: 'application/json',
    });
    return { file, backup };
  }

  /** Check a backup file without changing anything. Throws BackupError. */
  readBackup(text: string): Backup {
    return parseBackup(text);
  }

  /** Replace every record on this device with the given ones. */
  async replaceAll(docs: AnyDoc[], done: string): Promise<boolean> {
    try {
      this.sync.stop();
      const old = this.db;
      await this.close();
      await old?.destroy();
      await this.open();
      await this.repo.importDocs(docs);
      await this.refresh();
      this.conflictLog = [];
      this.notify(done);
      // With sync on, the Pi's records flow back in: a restore merges with the household data.
      void this.sync.start(this.syncSettings);
      return true;
    } catch (error) {
      this.error = `Restoring failed: ${(error as Error).message}. Reload the app and try again.`;
      return false;
    }
  }

  resetToSeed(): Promise<boolean> {
    return this.replaceAll(seed as AnyDoc[], 'Reset to the starting data.');
  }
}

export const store = new AppStore();
export { LOCAL_DB_NAME };
