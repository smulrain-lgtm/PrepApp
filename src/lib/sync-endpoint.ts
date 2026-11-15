/**
 * Sync endpoint helpers: validate the address typed in Settings and check that
 * the CouchDB server behind Caddy on the Pi can be reached from this device.
 *
 * Nothing about the server is hard-coded: the address, database name and
 * credentials come from Settings and stay on the device.
 */

export type NormalisedUrl = { ok: true; url: string } | { ok: false; error: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Turn user input into a clean base URL (https, no trailing slash). */
export function normaliseEndpoint(input: string): NormalisedUrl {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter the sync address, for example https://prep.mulras.uk' };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That is not a valid web address.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'The address must start with https://' };
  }
  if (parsed.protocol === 'http:' && !LOCAL_HOSTS.has(parsed.hostname)) {
    // An HTTPS app may not call a plain-HTTP address (mixed content), and iOS enforces it.
    return { ok: false, error: 'Use https:// – the app cannot sync over plain http.' };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: 'Remove anything after ? or # from the address.' };
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  return { ok: true, url: `${parsed.protocol}//${parsed.host}${path}` };
}

export type ConnectionResult =
  | { kind: 'invalid'; message: string }
  | { kind: 'unreachable'; message: string }
  | { kind: 'reachable'; message: string }
  | { kind: 'unauthorised'; message: string }
  | { kind: 'no-database'; message: string }
  | { kind: 'ok'; message: string };

export interface ConnectionOptions {
  database?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function timedFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Step 1: GET <base>/_up, which CouchDB answers without credentials.
 * Step 2 (when a database and credentials are given): GET <base>/<db>.
 */
export async function testConnection(
  input: string,
  options: ConnectionOptions = {},
): Promise<ConnectionResult> {
  const normalised = normaliseEndpoint(input);
  if (!normalised.ok) return { kind: 'invalid', message: normalised.error };

  const base = normalised.url;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;

  try {
    const up = await timedFetch(fetchImpl, `${base}/_up`, { method: 'GET', cache: 'no-store' }, timeoutMs);
    if (!up.ok) {
      return {
        kind: 'unreachable',
        message: `The server answered with HTTP ${up.status}. Check the address and the Caddy setup on the Pi.`,
      };
    }
  } catch (error) {
    const detail = describeError(error);
    if (isTimeout(error)) {
      return {
        kind: 'unreachable',
        message: `No answer from ${base} within ${timeoutMs / 1000} seconds. Are you at home or on the VPN? (${detail})`,
      };
    }
    // Tell "the network can't get there" apart from "the browser got there but
    // refused to hand the reply to the app" (cross-site / local-network rules).
    // A no-cors request skips those checks: if it gets through, the Pi is reachable.
    const reachedAnyway = await timedFetch(
      fetchImpl,
      `${base}/_up`,
      { method: 'GET', mode: 'no-cors', cache: 'no-store' },
      timeoutMs,
    ).then(
      () => true,
      () => false,
    );
    return {
      kind: 'unreachable',
      message: reachedAnyway
        ? `The Pi at ${base} answered, but this device blocked the app from reading the reply. ` +
          `Check Settings › Safari for content blockers, iCloud Private Relay or Lockdown Mode. (${detail})`
        : `Could not reach ${base}. Check you are at home or on the VPN, and that the address is exactly right. (${detail})`,
    };
  }

  const { database, username, password } = options;
  if (!database || !username || !password) {
    return { kind: 'reachable', message: 'The Pi is reachable. Add the database and login to check access.' };
  }

  try {
    const res = await timedFetch(
      fetchImpl,
      `${base}/${encodeURIComponent(database)}`,
      { method: 'GET', headers: { Authorization: basicAuth(username, password) } },
      timeoutMs,
    );
    if (res.ok) return { kind: 'ok', message: 'Connected: the database is reachable with these details.' };
    if (res.status === 401 || res.status === 403) {
      return {
        kind: 'unauthorised',
        message: 'The Pi is reachable, but the username or password was rejected.',
      };
    }
    if (res.status === 404) {
      return {
        kind: 'no-database',
        message: `The Pi is reachable, but there is no database called "${database}".`,
      };
    }
    return { kind: 'unreachable', message: `The database check answered with HTTP ${res.status}.` };
  } catch {
    return { kind: 'unreachable', message: 'The Pi answered once, then the database check failed.' };
  }
}
