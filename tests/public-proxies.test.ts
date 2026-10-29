import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProxyProfile, PublicProxy } from '../src/types';

let stored: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (key: string) => (key in stored ? { [key]: stored[key] } : {}),
      set: async (items: Record<string, unknown>) => { stored = { ...stored, ...items }; },
    },
  },
});
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const {
  countryCounts, filterPublic, findProfile, loadPublicList, parsePublicList, publicProfile, speedOf,
} = await import('../src/lib/public-proxies');

const proxy = (type: 'http' | 'socks5', host: string, country: string, ms: number, port = 8080): PublicProxy =>
  ({ type, host, port, country, ms });
const list = {
  updatedAt: '2026-10-29T09:20:00Z',
  source: 'TheSpeedX/SOCKS-List',
  proxies: [
    proxy('socks5', '1.1.1.1', 'US', 900, 1080),
    proxy('http', '2.2.2.2', 'DE', 300),
    proxy('http', '3.3.3.3', 'US', 1500),
    proxy('socks5', '4.4.4.4', 'BR', 200, 1080),
  ],
};
const names: Record<string, string> = { US: 'United States', DE: 'Germany', BR: 'Brazil' };
const nameOf = (code: string) => names[code] ?? code;

describe('parsePublicList', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const parsed = parsePublicList({
      ...list,
      proxies: [
        ...list.proxies,
        { type: 'https', host: '5.5.5.5', port: 443, country: 'DE', ms: 1 },
        { type: 'http', host: 'evil"><img>', port: 80, country: 'DE', ms: 1 },
        { type: 'http', host: '6.6.6.6', port: 70000, country: 'DE', ms: 1 },
        { type: 'http', host: '7.7.7.7', port: 80, country: 'de', ms: 1 },
        null,
      ],
    });
    expect(parsed?.proxies).toEqual(list.proxies);
  });

  it('rejects anything that is not a list', () => {
    for (const raw of [null, 'x', {}, { updatedAt: 1, proxies: [] }, { updatedAt: 'x', proxies: {} }]) {
      expect(parsePublicList(raw)).toBeNull();
    }
  });
});

describe('filterPublic / countryCounts / speedOf', () => {
  it('filters by type and country, fastest first', () => {
    expect(filterPublic(list.proxies, { type: 'all', country: null, sort: 'speed' }, nameOf).map(p => p.host))
      .toEqual(['4.4.4.4', '2.2.2.2', '1.1.1.1', '3.3.3.3']);
    expect(filterPublic(list.proxies, { type: 'http', country: 'US', sort: 'speed' }, nameOf).map(p => p.host))
      .toEqual(['3.3.3.3']);
  });

  it('sorts by country name, then speed', () => {
    expect(filterPublic(list.proxies, { type: 'all', country: null, sort: 'country' }, nameOf).map(p => p.host))
      .toEqual(['4.4.4.4', '2.2.2.2', '1.1.1.1', '3.3.3.3']);
  });

  it('counts proxies per country for the chosen type, most first', () => {
    expect(countryCounts(list.proxies, 'all')).toEqual([['US', 2], ['BR', 1], ['DE', 1]]);
    expect(countryCounts(list.proxies, 'socks5')).toEqual([['BR', 1], ['US', 1]]);
  });

  it('grades speed as the checker measured it', () => {
    expect([speedOf(400), speedOf(1000), speedOf(2499), speedOf(2500)]).toEqual(['fast', 'ok', 'ok', 'slow']);
  });
});

describe('publicProfile / findProfile', () => {
  it('makes a profile that remembers its country and that it is public', () => {
    const p = publicProfile(proxy('socks5', '4.4.4.4', 'BR', 200, 1080), 'Brazil', 'id1', '2026-10-29T10:00:00.000Z');
    expect(p).toMatchObject({
      id: 'id1', name: 'Brazil', tags: ['public'], exitCountry: { code: 'BR', name: 'Brazil' },
      config: { type: 'socks5', host: '4.4.4.4', port: 1080, auth: { username: '', password: '' } },
      createdAt: '2026-10-29T10:00:00.000Z',
    });
  });

  it('finds a saved profile for the same server', () => {
    const saved = publicProfile(proxy('http', '2.2.2.2', 'DE', 300), 'Germany', 'id2', '');
    const profiles: ProxyProfile[] = [saved];
    expect(findProfile(profiles, proxy('http', '2.2.2.2', 'DE', 300))).toBe(saved);
    expect(findProfile(profiles, proxy('socks5', '2.2.2.2', 'DE', 300))).toBeUndefined();
  });
});

describe('loadPublicList', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  beforeEach(() => { stored = {}; fetchMock.mockReset(); });

  it('downloads the list and keeps a copy', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => list });
    expect(await loadPublicList(false, now)).toEqual({ list });
    expect(stored.nomadaPublicProxies).toEqual({ fetchedAt: now, list });
  });

  it('uses a fresh copy without the network, unless asked to refresh', async () => {
    stored.nomadaPublicProxies = { fetchedAt: now - 60_000, list };
    expect(await loadPublicList(false, now)).toEqual({ list });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true, json: async () => list });
    await loadPublicList(true, now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still downloads when the saved copy can\'t be read', async () => {
    const get = chrome.storage.local.get;
    chrome.storage.local.get = (async () => { throw new Error('storage off'); }) as typeof get;
    fetchMock.mockResolvedValue({ ok: true, json: async () => list });
    expect(await loadPublicList(false, now)).toEqual({ list });
    chrome.storage.local.get = get;
  });

  it('falls back to the old copy when the download fails', async () => {
    stored.nomadaPublicProxies = { fetchedAt: now - 24 * 3600_000, list };
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await loadPublicList(false, now)).toEqual({ list, error: 'offline' });
  });
});
