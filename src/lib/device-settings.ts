/**
 * Per-device settings, kept in this device's localStorage and never synced:
 * how to reach the Pi, the sync login, and this device's name.
 *
 * The sync password is stored here so sync can start by itself when the app
 * opens. It never leaves the device except to log in to the Pi over HTTPS.
 */

export interface SyncSettings {
  /** Tried in order; the first that answers is used. */
  endpoints: string[];
  database: string;
  username: string;
  password: string;
  enabled: boolean;
}

const SYNC_KEY = 'prepapp.sync';
const DEVICE_KEY = 'prepapp.deviceName';

export const defaultSyncSettings: SyncSettings = {
  endpoints: [],
  database: 'prepapp',
  username: 'household',
  password: '',
  enabled: false,
};

export function loadSyncSettings(): SyncSettings {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (!raw) return { ...defaultSyncSettings };
    const stored = JSON.parse(raw) as Partial<SyncSettings> & { endpoint?: string };
    // Stage 0 stored a single `endpoint`.
    const endpoints = stored.endpoints ?? (stored.endpoint ? [stored.endpoint] : []);
    return { ...defaultSyncSettings, ...stored, endpoints };
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
