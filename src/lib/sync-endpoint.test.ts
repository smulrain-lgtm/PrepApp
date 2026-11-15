import { describe, expect, it, vi } from 'vitest';
import { normaliseEndpoint, testConnection } from './sync-endpoint';

describe('normaliseEndpoint', () => {
  it('adds https:// and strips trailing slashes', () => {
    expect(normaliseEndpoint(' prep.mulras.uk/ ')).toEqual({ ok: true, url: 'https://prep.mulras.uk' });
  });

  it('keeps a port and a path prefix', () => {
    expect(normaliseEndpoint('https://prep.mulras.uk:8443/couch///')).toEqual({
      ok: true,
      url: 'https://prep.mulras.uk:8443/couch',
    });
  });

  it('rejects plain http except for localhost', () => {
    expect(normaliseEndpoint('http://192.168.1.20').ok).toBe(false);
    expect(normaliseEndpoint('http://localhost:5984')).toEqual({ ok: true, url: 'http://localhost:5984' });
  });

  it('rejects empty input, other schemes and query strings', () => {
    expect(normaliseEndpoint('').ok).toBe(false);
    expect(normaliseEndpoint('ftp://prep.mulras.uk').ok).toBe(false);
    expect(normaliseEndpoint('https://prep.mulras.uk/?x=1').ok).toBe(false);
  });
});

function response(status: number): Response {
  return new Response(status === 200 ? '{}' : null, { status });
}

describe('testConnection', () => {
  it('reports invalid input without calling the network', async () => {
    const fetchImpl = vi.fn();
    const result = await testConnection('', { fetchImpl });
    expect(result.kind).toBe('invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports reachable when only the address is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200));
    const result = await testConnection('prep.mulras.uk', { fetchImpl });
    expect(result.kind).toBe('reachable');
    expect(fetchImpl).toHaveBeenCalledWith('https://prep.mulras.uk/_up', expect.anything());
  });

  it('reports unreachable when the request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    expect((await testConnection('prep.mulras.uk', { fetchImpl })).kind).toBe('unreachable');
  });

  it('checks the database with basic auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200));
    const result = await testConnection('prep.mulras.uk', {
      fetchImpl,
      database: 'prepapp',
      username: 'household',
      password: 'pa£ss',
    });
    expect(result.kind).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe('https://prep.mulras.uk/prepapp');
    expect(init.headers.Authorization).toMatch(/^Basic /);
  });

  it('distinguishes a wrong password from a missing database', async () => {
    const wrong = vi.fn().mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(401));
    const missing = vi.fn().mockResolvedValueOnce(response(200)).mockResolvedValueOnce(response(404));
    const opts = { database: 'prepapp', username: 'household', password: 'x' };
    expect((await testConnection('prep.mulras.uk', { ...opts, fetchImpl: wrong })).kind).toBe('unauthorised');
    expect((await testConnection('prep.mulras.uk', { ...opts, fetchImpl: missing })).kind).toBe(
      'no-database',
    );
  });
});
