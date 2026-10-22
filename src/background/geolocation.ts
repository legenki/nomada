import type { GeoSettings } from '../types';
import { hasGeoTarget } from '../lib/state';
import { acceptLanguageFor } from '../lib/country-locales';

// Tabs our debugger session is attached to. Persisted in session storage so a
// service-worker restart doesn't forget which tabs are carrying overrides.
const SESSION_KEY = 'geoTabs';
let tracked: Set<number> | null = null;

async function trackedTabs(): Promise<Set<number>> {
  if (!tracked) {
    const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as number[] | undefined;
    tracked ??= new Set(stored ?? []);
  }
  return tracked;
}

function persistTracked(): void {
  if (tracked) void chrome.storage.session.set({ [SESSION_KEY]: [...tracked] });
}

async function untrack(tabId: number): Promise<void> {
  if ((await trackedTabs()).delete(tabId)) persistTracked();
}

// The user can kill every session via the "is debugging this browser" bar, and
// closed tabs take their session with them.
chrome.debugger.onDetach.addListener(source => { if (source.tabId) void untrack(source.tabId); });
chrome.tabs.onRemoved.addListener(tabId => { void untrack(tabId); });

/** Serialize work per tab so a navigation and a city change can't interleave. */
const tabLocks = new Map<number, Promise<unknown>>();
function withTabLock<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = tabLocks.get(tabId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  tabLocks.set(tabId, next);
  void next.finally(() => { if (tabLocks.get(tabId) === next) tabLocks.delete(tabId); });
  return next;
}

/** Read and clear chrome.runtime.lastError so it doesn't surface as "Unchecked runtime.lastError". */
function consumeError(): string | undefined {
  return chrome.runtime.lastError?.message;
}

function attach(tabId: number): Promise<boolean> {
  return new Promise(resolve => {
    chrome.debugger.attach({ tabId }, '1.3', () => resolve(!consumeError()));
  });
}

function detach(tabId: number): Promise<void> {
  return new Promise(resolve => {
    chrome.debugger.detach({ tabId }, () => { consumeError(); resolve(); });
  });
}

function sendCommand(tabId: number, method: string, params: object = {}): Promise<boolean> {
  return new Promise(resolve => {
    chrome.debugger.sendCommand({ tabId }, method, params, () => resolve(!consumeError()));
  });
}

interface UaOverride { userAgent: string; userAgentMetadata?: object }
let uaOverride: Promise<UaOverride> | null = null;

/**
 * The real UA plus its client-hint metadata. Emulation.setUserAgentOverride is
 * the only way to change navigator.language and the Accept-Language header,
 * and without metadata Chrome would stop sending UA client hints — itself a tell.
 */
function getUaOverride(): Promise<UaOverride> {
  uaOverride ??= (async () => {
    const userAgent = navigator.userAgent;
    type UaData = {
      brands: { brand: string; version: string }[];
      mobile: boolean;
      platform: string;
      getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
    };
    const uaData = (navigator as unknown as { userAgentData?: UaData }).userAgentData;
    if (!uaData) return { userAgent };
    try {
      const hi = await uaData.getHighEntropyValues(
        ['architecture', 'bitness', 'fullVersionList', 'model', 'platformVersion', 'wow64'],
      );
      return {
        userAgent,
        userAgentMetadata: {
          brands: uaData.brands,
          fullVersionList: hi.fullVersionList ?? uaData.brands,
          platform: uaData.platform,
          platformVersion: hi.platformVersion ?? '',
          architecture: hi.architecture ?? '',
          model: hi.model ?? '',
          mobile: uaData.mobile,
          bitness: hi.bitness ?? '',
          wow64: hi.wow64 ?? false,
        },
      };
    } catch {
      return { userAgent };
    }
  })();
  return uaOverride;
}

/**
 * Set a timezone/locale override. On a live session a second override fails
 * with "already in effect", so only then clear and retry — clearing up front
 * would briefly expose the real value to the running page.
 */
async function setReplacing(tabId: number, method: string, value: object): Promise<boolean> {
  if (await sendCommand(tabId, method, value)) return true;
  await sendCommand(tabId, method, method === 'Emulation.setTimezoneOverride' ? { timezoneId: '' } : {});
  return sendCommand(tabId, method, value);
}

/** Apply (or re-apply) every override to an attached tab. */
async function sendOverrides(tabId: number, geo: GeoSettings): Promise<boolean> {
  if (geo.timezone) {
    if (!await setReplacing(tabId, 'Emulation.setTimezoneOverride', { timezoneId: geo.timezone })) return false;
  }
  if (geo.lat !== undefined && geo.lon !== undefined) {
    if (!await sendCommand(tabId, 'Emulation.setGeolocationOverride', {
      latitude: geo.lat, longitude: geo.lon, accuracy: 20,
    })) return false;
  }
  if (geo.locale) {
    if (!await setReplacing(tabId, 'Emulation.setLocaleOverride', { locale: geo.locale })) return false;
    const ua = await getUaOverride();
    if (!await sendCommand(tabId, 'Emulation.setUserAgentOverride', {
      ...ua, acceptLanguage: acceptLanguageFor(geo.locale),
    })) return false;
  }
  return true;
}

/**
 * Attach to a tab (if needed) and apply the overrides. With `onlyIfNew`, a tab
 * that already carries overrides is left alone — they survive navigation, and
 * re-sending them mid-load would only open a gap. The check happens under the
 * tab lock because tabs.onCreated and onBeforeNavigate race for new tabs.
 */
export function applyGeoToTab(tabId: number, geo: GeoSettings, onlyIfNew = false): Promise<void> {
  return withTabLock(tabId, async () => {
    if (!hasGeoTarget(geo)) return;
    const tabs = await trackedTabs();
    if (tabs.has(tabId)) {
      if (onlyIfNew) return;
    } else {
      if (!await attach(tabId)) return; // chrome:// page, DevTools open, …
      tabs.add(tabId);
      persistTracked();
    }
    if (!await sendOverrides(tabId, geo)) {
      // Our session went away underneath us (e.g. tab crashed) — start clean next time.
      await detach(tabId);
      await untrack(tabId);
    }
  });
}

/** For new tabs and navigations: attach only tabs that aren't carrying overrides yet. */
export function ensureGeoOnTab(tabId: number, geo: GeoSettings): Promise<void> {
  return applyGeoToTab(tabId, geo, true);
}

/**
 * Push new overrides to every protected tab plus the active one, so changing
 * the location never leaves an already-protected tab exposed.
 */
export async function reapplyGeo(geo: GeoSettings): Promise<void> {
  const tabs = new Set(await trackedTabs());
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id !== undefined) tabs.add(active.id);
  } catch { /* no window (e.g. at startup) */ }
  await Promise.all([...tabs].map(id => applyGeoToTab(id, geo)));
}

/** Detach from every tab we attached to (detaching drops all overrides). */
export async function detachAllGeo(): Promise<void> {
  const tabs = [...await trackedTabs()];
  await Promise.all(tabs.map(id => withTabLock(id, async () => {
    await detach(id);
    await untrack(id);
  })));
}
