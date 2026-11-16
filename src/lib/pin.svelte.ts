/**
 * App PIN: a soft lock for the medical list on this device. It stops a casual
 * look; it is not encryption (the data is stored and synced as normal).
 * The PIN is kept only as a salted SHA-256 hash in this device's localStorage.
 */

const KEY = 'prepapp.pin';
/** Unlocked for this long, or until the app goes to the background. */
const UNLOCK_MS = 5 * 60 * 1000;

interface Stored {
  salt: string;
  hash: string;
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

async function digest(salt: string, pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const pinState = $state({ unlockedUntil: 0, hasPin: read() !== null });

export function isUnlocked(): boolean {
  return pinState.unlockedUntil > Date.now();
}

export function lock(): void {
  pinState.unlockedUntil = 0;
}

export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export async function setPin(pin: string): Promise<void> {
  if (!validPin(pin)) throw new Error('Use 4 to 8 digits.');
  const salt = crypto.randomUUID();
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: await digest(salt, pin) }));
  pinState.hasPin = true;
  pinState.unlockedUntil = Date.now() + UNLOCK_MS;
}

export async function unlock(pin: string): Promise<boolean> {
  const stored = read();
  if (!stored) return false;
  const ok = (await digest(stored.salt, pin)) === stored.hash;
  if (ok) pinState.unlockedUntil = Date.now() + UNLOCK_MS;
  return ok;
}

/** Forgetting the PIN removes it; the medical list stays (this is a soft lock). */
export function clearPin(): void {
  localStorage.removeItem(KEY);
  pinState.hasPin = false;
  lock();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lock();
  });
}
