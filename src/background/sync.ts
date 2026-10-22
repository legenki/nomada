import type { SyncSuggestion, IpLocation } from '../types';
import { COUNTRY_TO_LOCATION, localeForCountry } from '../lib/country-locales';
import { findLocationByKey } from '../lib/locations';

// ipwho.is: free, HTTPS, no API key, CORS-enabled. (ip-api.com only allows
// HTTPS on paid plans and returns 403 otherwise.)
const IP_API_BASE = 'https://ipwho.is/';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_TIMEOUT_MS = 5000;

/** Raw ipwho.is response (subset we use). */
interface IpWhoResponse {
  success?: boolean;
  country?: string;
  country_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string };
}

/** Provider-agnostic, normalized IP info used by the rest of this module. */
interface IpInfo {
  country?: string;
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
}

function normalize(raw: IpWhoResponse | null | undefined): IpInfo | null {
  if (!raw?.success) return null;
  return {
    country: raw.country,
    countryCode: raw.country_code,
    city: raw.city,
    lat: raw.latitude,
    lon: raw.longitude,
    timezone: raw.timezone?.id,
  };
}

let ipCache: { data: IpInfo; fetchedAt: number } | null = null;

function cacheAndReturn(info: IpInfo | null): IpInfo | null {
  if (info) ipCache = { data: info, fetchedAt: Date.now() };
  return info;
}

function lookupUrl(): string {
  // Cache-buster so no HTTP cache serves an answer from before the route changed.
  return `${IP_API_BASE}?_=${Date.now()}`;
}

/** Lookup from the service worker. Used for the background sync suggestion. */
async function fetchIpApi(): Promise<IpInfo | null> {
  if (ipCache && Date.now() - ipCache.fetchedAt < CACHE_TTL_MS) return ipCache.data;
  try {
    const res = await fetch(lookupUrl(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    return cacheAndReturn(normalize(await res.json() as IpWhoResponse));
  } catch {
    return null; // offline, timeout or blocked — the caller treats it as "unknown"
  }
}

/**
 * Lookup from inside the active tab, so it leaves through exactly the same
 * route (proxy + proxy auth) as the pages the user is protecting. It runs in
 * the extension's isolated world: page scripts can't intercept or fake the
 * result, can't observe the request, and the page's CSP doesn't apply.
 * Returns null if there's no scriptable tab (e.g. a chrome:// page).
 */
async function fetchIpApiViaTab(): Promise<IpInfo | null> {
  let tab: chrome.tabs.Tab | undefined;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return null;
  }
  if (tab?.id === undefined || !tab.url || !/^https?:/i.test(tab.url)) return null;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (apiUrl: string, timeoutMs: number) => {
        try {
          const r = await fetch(apiUrl, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
          return await r.json();
        } catch {
          return null;
        }
      },
      args: [lookupUrl(), FETCH_TIMEOUT_MS],
    });
    return cacheAndReturn(normalize(injection?.result as IpWhoResponse | null));
  } catch {
    return null;
  }
}

/** Should we offer to move the location to the proxy's country? */
export function shouldSuggest(
  detectedCountry: string,
  currentCountry: string | undefined,
  dismissed: string[],
): boolean {
  if (!currentCountry) return false;
  const cc = detectedCountry.toUpperCase();
  if (!COUNTRY_TO_LOCATION[cc]) return false;
  if (currentCountry.toUpperCase() === cc) return false;
  return !dismissed.includes(cc);
}

export function parseSyncSuggestion(countryCode: string): SyncSuggestion | null {
  const key = COUNTRY_TO_LOCATION[countryCode.toUpperCase()];
  const loc = key ? findLocationByKey(key) : undefined;
  if (!loc) return null;
  return {
    countryCode: countryCode.toUpperCase(),
    locationKey: loc.key,
    city: loc.name,
    timezone: loc.timezone,
    locale: loc.locale,
    lat: loc.lat,
    lon: loc.lon,
  };
}

export async function detectProxyCountry(): Promise<string | null> {
  return (await fetchIpApi())?.countryCode ?? null;
}

/** Full geolocation of the current outgoing IP (the proxy's exit IP when a proxy is active). */
export async function detectIpLocation(): Promise<IpLocation | null> {
  const data = (await fetchIpApiViaTab()) ?? (await fetchIpApi());
  if (!data || data.lat === undefined || data.lon === undefined) return null;
  const countryCode = (data.countryCode || '').toUpperCase();
  return {
    city: data.city || data.country || 'Unknown',
    country: data.country || '',
    countryCode,
    lat: data.lat,
    lon: data.lon,
    timezone: data.timezone || 'UTC',
    locale: localeForCountry(countryCode, navigator.language.split('-')[0]),
  };
}

export function clearIpCache(): void {
  ipCache = null;
}
