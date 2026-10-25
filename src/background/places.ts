import type { Place } from '../types';
import { localeForCountry } from '../lib/country-locales';

// ipwho.is: free, HTTPS, no API key, CORS-enabled.
const LOOKUP_URL = 'https://ipwho.is/';
const TIMEOUT_MS = 6000;

/** Raw ipwho.is response (subset we use). */
interface IpWhoResponse {
  success?: boolean;
  ip?: string;
  country?: string;
  country_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: { id?: string };
}

export function toPlace(raw: IpWhoResponse | null | undefined, baseLanguage = 'en'): Place | null {
  if (!raw?.success || !raw.ip || raw.latitude === undefined || raw.longitude === undefined) return null;
  const countryCode = (raw.country_code ?? '').toUpperCase();
  return {
    ip: raw.ip,
    city: raw.city || raw.country || 'Unknown',
    country: raw.country ?? '',
    countryCode,
    lat: raw.latitude,
    lon: raw.longitude,
    timezone: raw.timezone?.id || 'UTC',
    locale: localeForCountry(countryCode, baseLanguage),
    checkedAt: Date.now(),
  };
}

function lookupUrl(): string {
  // Cache-buster so no HTTP cache serves an answer from before the route changed.
  return `${LOOKUP_URL}?_=${Date.now()}`;
}

function userLanguage(): string {
  return navigator.language.split('-')[0];
}

/** Lookup from the service worker: follows the browser-wide proxy setting. */
async function lookupFromWorker(): Promise<Place | null> {
  try {
    const res = await fetch(lookupUrl(), { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return toPlace(await res.json() as IpWhoResponse, userLanguage());
  } catch {
    return null;
  }
}

/**
 * Lookup from inside the active tab (isolated world — invisible to the page),
 * so it leaves through exactly the same route and proxy auth as the pages.
 * Returns null without a scriptable http(s) tab.
 */
async function lookupFromTab(): Promise<Place | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !tab.url || !/^https?:/i.test(tab.url)) return null;
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (url: string, timeoutMs: number) => {
        try {
          const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
          return await r.json();
        } catch {
          return null;
        }
      },
      args: [lookupUrl(), TIMEOUT_MS],
    });
    return toPlace(injection?.result as IpWhoResponse | null, userLanguage());
  } catch {
    return null;
  }
}

/** Where the user really is (call while no proxy is set). */
export function lookupDirectPlace(): Promise<Place | null> {
  return lookupFromWorker();
}

/**
 * Where the proxy's exit IP is (call after the proxy is set). If the worker's
 * request comes back with the user's own IP it didn't go through the proxy, so
 * ask from a tab instead rather than report the real location as the proxy's.
 */
export async function lookupProxyPlace(realIp: string | undefined): Promise<Place | null> {
  const fromWorker = await lookupFromWorker();
  if (fromWorker && (!realIp || fromWorker.ip !== realIp)) return fromWorker;
  return lookupFromTab();
}
