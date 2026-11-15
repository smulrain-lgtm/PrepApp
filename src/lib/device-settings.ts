/**
 * Per-device settings, kept in this device's localStorage and never synced:
 * the sync address and login, and this device's name.
 * The sync password is deliberately not stored yet; Stage 4 decides how it is kept.
 */

export interface SyncSettings {
  endpoint: string;
  database: string;
  username: string;
}

const SYNC_KEY = 'prepapp.sync';
const DEVICE_KEY = 'prepapp.deviceName';

export const defaultSyncSettings: SyncSettings = {
  endpoint: '',
  database: 'prepapp',
  username: 'household',
};

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return { ...defaultSyncSettings };
    return { ...defaultSyncSettings, ...(JSON.parse(raw) as Partial<SyncSettings>) };
  } catch {
    return { ...defaultSyncSettings };
  }
}

export function saveSyncSettings(settings: SyncSettings): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage blocked: the settings simply won't persist.
  }
}

/** A first guess at the device name: iPhone, iPad or Mac. */
export function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'This device';
}

export function loadDeviceName(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) || guessDeviceName();
  } catch {
    return guessDeviceName();
  }
}

export function saveDeviceName(name: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, name.trim());
  } catch {
    // Not persisted; the guess is used next time.
  }
}
