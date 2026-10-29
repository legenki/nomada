import type { ProxyProfile, PublicList, PublicProxy } from '../types';

// Public proxies checked every 6 hours by tools/proxy-list (GitHub Actions) and
// published on this repository's proxy-list branch.
export const PUBLIC_LIST_URL = 'https://raw.githubusercontent.com/legenki/nomada/proxy-list/proxies.json';

const CACHE_KEY = 'nomadaPublicProxies';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPublicProxy(p: unknown): p is PublicProxy {
  if (!p || typeof p !== 'object') return false;
  const { type, host, port, country, ms } = p as Record<string, unknown>;
  return (type === 'http' || type === 'socks5')
    && typeof host === 'string' && IPV4.test(host) && host.split('.').every(o => Number(o) <= 255)
    && Number.isInteger(port) && (port as number) >= 1 && (port as number) <= 65535
    && typeof country === 'string' && /^[A-Z]{2}$/.test(country)
    && typeof ms === 'number' && Number.isFinite(ms) && ms >= 0;
}

/** The downloaded file is untrusted: keep only entries that are exactly what we expect. */
export function parsePublicList(raw: unknown): PublicList | null {
  if (!raw || typeof raw !== 'object') return null;
  const { updatedAt, source, proxies } = raw as Record<string, unknown>;
  if (typeof updatedAt !== 'string' || !Array.isArray(proxies)) return null;
  return { updatedAt, source: typeof source === 'string' ? source : '', proxies: proxies.filter(isPublicProxy) };
}

export interface PublicFilter {
  type: 'all' | PublicProxy['type'];
  /** ISO code, or null for every country. */
  country: string | null;
  sort: 'speed' | 'country';
}

export function filterPublic(proxies: PublicProxy[], filter: PublicFilter, countryName: (code: string) => string): PublicProxy[] {
  const shown = proxies.filter(p => (filter.type === 'all' || p.type === filter.type) && (!filter.country || p.country === filter.country));
  return shown.sort((a, b) => (filter.sort === 'country'
    ? countryName(a.country).localeCompare(countryName(b.country)) || a.ms - b.ms
    : a.ms - b.ms));
}

/** Countries with how many proxies of `type` each has, most first. */
export function countryCounts(proxies: PublicProxy[], type: PublicFilter['type']): [string, number][] {
  const counts = new Map<string, number>();
  for (const p of proxies) if (type === 'all' || p.type === type) counts.set(p.country, (counts.get(p.country) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** How quick the checker found it (public proxies are slow; this is relative). */
export function speedOf(ms: number): 'fast' | 'ok' | 'slow' {
  return ms < 1000 ? 'fast' : ms < 2500 ? 'ok' : 'slow';
}

/** A saved profile for this server, if there is one. */
export function findProfile(profiles: ProxyProfile[], p: PublicProxy): ProxyProfile | undefined {
  return profiles.find(x => x.config.type === p.type && x.config.host === p.host && x.config.port === p.port);
}

export function publicProfile(p: PublicProxy, countryName: string, id: string, now: string): ProxyProfile {
  return {
    id,
    name: countryName,
    description: '',
    color: '#808080',
    config: {
      type: p.type,
      host: p.host,
      port: p.port,
      pacUrl: '',
      auth: { username: '', password: '' },
      bypassList: [],
      routingRules: { enabled: false, mode: 'whitelist', domains: [] },
    },
    exitCountry: { code: p.country, name: countryName },
    createdAt: now,
    updatedAt: now,
    tags: ['public'],
  };
}

interface Cached { fetchedAt: number; list: unknown }

/**
 * The list, from the saved copy while it's fresh (the checker only runs every
 * 6 hours), otherwise downloaded. If the download fails the old copy is still
 * returned, with the error.
 */
export async function loadPublicList(force = false, now = Date.now()): Promise<{ list: PublicList | null; error?: string }> {
  const cached = await chrome.storage.local.get(CACHE_KEY).then(r => r[CACHE_KEY] as Cached | undefined, () => undefined);
  const cachedList = cached ? parsePublicList(cached.list) : null;
  if (!force && cachedList && now - cached!.fetchedAt < MAX_AGE_MS) return { list: cachedList };
  try {
    const res = await fetch(PUBLIC_LIST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = parsePublicList(await res.json());
    if (!list) throw new Error('The list has an unexpected format');
    await chrome.storage.local.set({ [CACHE_KEY]: { fetchedAt: now, list } });
    return { list };
  } catch (e) {
    return { list: cachedList, error: (e as Error).message };
  }
}
