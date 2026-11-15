/**
 * Per-device settings kept in localStorage until Stage 1 moves them into PouchDB.
 * The password is deliberately not stored yet; Stage 4 decides how it is kept.
 */

export interface SyncSettings {
  endpoint: string;
  database: string;
  username: string;
}

const KEY = 'prepapp.sync';

export const defaultSyncSettings: SyncSettings = {
  endpoint: '',
  database: 'prepapp',
  username: 'household',
};

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSyncSettings };
    return { ...defaultSyncSettings, ...(JSON.parse(raw) as Partial<SyncSettings>) };
  } catch {
    return { ...defaultSyncSettings };
  }
}

export function saveSyncSettings(settings: SyncSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage blocked: the settings simply won't persist.
  }
}
