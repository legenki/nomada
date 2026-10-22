import { readData, writeData } from '../lib/storage';
import { MAX_SYNC_DISMISSED } from '../lib/storage-migration';
import { countryOfGeo } from '../lib/locations';
import { hasGeoTarget, isGeoActive } from '../lib/state';
import { applyProxy, activeProfileOf } from './proxy';
import { refreshIcon } from './icon';
import { ensureGeoOnTab, reapplyGeo, detachAllGeo } from './geolocation';
import { detectProxyCountry, detectIpLocation, shouldSuggest, parseSyncSuggestion, clearIpCache } from './sync';
import type { ActionResult, BgMessage, BgState, GeoSettings, SyncSuggestion, WooPortalData } from '../types';

// ── State transitions ───────────────────────────────────────────────────────
// Every change goes through commit(): apply a pure update to the latest stored
// state, persist it, then bring Chrome (proxy, debugger overrides, WebRTC,
// toolbar icon) in line with whatever actually changed. Commits run one at a
// time so concurrent messages can't overwrite each other's writes.

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => {}).then(fn);
  queue = run;
  return run;
}

function proxyRouteChanged(a: WooPortalData, b: WooPortalData): boolean {
  return activeProfileOf(a)?.id !== activeProfileOf(b)?.id;
}

function geoChanged(a: WooPortalData, b: WooPortalData): boolean {
  return isGeoActive(a) !== isGeoActive(b) || JSON.stringify(a.geo) !== JSON.stringify(b.geo);
}

interface Reapply { proxy?: boolean; geo?: boolean }

function commit(update: (d: WooPortalData) => WooPortalData, force: Reapply = {}): Promise<ActionResult> {
  return serialize(async () => {
    const prev = await readData();
    let next = update(prev);
    await writeData(next);

    let result: ActionResult = { success: true };
    if (force.proxy || proxyRouteChanged(prev, next)) {
      clearIpCache(); // the exit IP changes with the route
      result = await applyProxy(next);
      if (!result.success && next.mode === 'profile') {
        // Don't claim a proxy that Chrome refused: fall back and say why.
        next = { ...next, mode: 'system', activeProfileId: undefined };
        await writeData(next);
        await applyProxy(next);
      }
    }
    if (force.geo || geoChanged(prev, next)) {
      if (isGeoActive(next)) await reapplyGeo(next.geo);
      else await detachAllGeo();
    }
    await refreshIcon();
    return result;
  });
}

/** Choosing a place or a proxy implies the extension should be ON. */
function withGeo(geo: GeoSettings) {
  return (d: WooPortalData): WooPortalData => ({ ...d, enabled: true, geo });
}

// ── Queries ─────────────────────────────────────────────────────────────────

async function getState(): Promise<BgState> {
  const data = await readData();
  return {
    enabled: data.enabled,
    mode: data.mode,
    profiles: data.profiles,
    // The selected profile, even while the master switch is OFF (shown as paused).
    activeProfile: data.mode === 'profile'
      ? data.profiles.find(p => p.id === data.activeProfileId) ?? null
      : null,
    geo: data.geo,
  };
}

async function checkSync(): Promise<SyncSuggestion | null> {
  const data = await readData();
  if (!activeProfileOf(data) || !data.syncEnabled) return null;
  const countryCode = await detectProxyCountry();
  if (countryCode && shouldSuggest(countryCode, countryOfGeo(data.geo), data.syncDismissed)) {
    return parseSyncSuggestion(countryCode);
  }
  return null;
}

async function syncToIp(): Promise<ActionResult> {
  clearIpCache(); // always get a fresh reading on explicit user action
  const ip = await detectIpLocation();
  if (!ip) return { success: false, error: 'Could not determine IP location' };
  return commit(withGeo({
    enabled: true,
    timezone: ip.timezone,
    locale: ip.locale,
    lat: ip.lat,
    lon: ip.lon,
    cityName: ip.city,
    countryCode: ip.countryCode || undefined,
  }));
}

// ── Chrome events ───────────────────────────────────────────────────────────

chrome.proxy.onProxyError.addListener(details => {
  console.error('[Nomada] proxy error:', details.error);
});

// Chrome can drop extension-controlled settings (reload, disable/enable,
// update), so re-assert the stored state whenever the browser or extension starts.
const reconcile = () => { void commit(d => d, { proxy: true, geo: true }); };
chrome.runtime.onStartup.addListener(reconcile);
chrome.runtime.onInstalled.addListener(reconcile);

// Sync the icon whenever the service worker (re)starts.
void refreshIcon();

async function protectTab(tabId: number): Promise<void> {
  const data = await readData();
  if (isGeoActive(data)) await ensureGeoOnTab(tabId, data.geo);
}

// Attach as early as possible: on tab creation and before each top-level
// navigation, so a new page's first scripts already see the overrides.
chrome.tabs.onCreated.addListener(tab => { if (tab.id !== undefined) void protectTab(tab.id); });
chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId === 0) void protectTab(details.tabId);
});

// ── Proxy authentication ────────────────────────────────────────────────────

// Requests we've already answered. A second challenge for the same request
// means the credentials were rejected; answering again would loop forever.
const answeredAuth = new Set<string>();
const forgetAuth = (d: { requestId: string }) => { answeredAuth.delete(d.requestId); };
chrome.webRequest.onCompleted.addListener(forgetAuth, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(forgetAuth, { urls: ['<all_urls>'] });

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy) { callback!({}); return; }
    if (answeredAuth.has(details.requestId)) { callback!({ cancel: true }); return; }
    readData().then(data => {
      const profile = activeProfileOf(data);
      const auth = profile?.config.auth;
      // Only hand the credentials to the proxy they were configured for
      // (a PAC script can route through other proxies).
      const challenger = details.challenger?.host.toLowerCase();
      const host = profile?.config.host.trim().toLowerCase();
      const hostOk = profile?.config.type === 'pac' ? !host || challenger === host : challenger === host;
      if (auth?.username && hostOk) {
        answeredAuth.add(details.requestId);
        callback!({ authCredentials: { username: auth.username, password: auth.password } });
      } else {
        callback!({});
      }
    }, () => callback!({}));
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking'],
);

// ── Messages from popup / options ───────────────────────────────────────────

async function handle(msg: BgMessage): Promise<unknown> {
  switch (msg.type) {
    case 'GET_STATE':
      return getState();
    case 'CHECK_SYNC':
      return { suggestion: await checkSync() };
    case 'SYNC_TO_IP':
      return syncToIp();
    case 'ENABLE_ALL':
      return commit(d => ({ ...d, enabled: true, geo: { ...d.geo, enabled: hasGeoTarget(d.geo) } }));
    case 'DISABLE_ALL':
      return commit(d => ({ ...d, enabled: false }));
    case 'ACTIVATE_PROFILE':
      return commit(d => ({ ...d, enabled: true, mode: 'profile', activeProfileId: msg.payload.id }));
    case 'DEACTIVATE_PROFILE':
      return commit(d => ({ ...d, mode: 'system', activeProfileId: undefined }));
    case 'PROFILES_CHANGED':
      // The options page edited/deleted profiles: the active one's host, port or
      // credentials may differ now (readData already drops a deleted active profile).
      return commit(d => d, { proxy: true });
    case 'SET_GEO':
      return commit(withGeo({ ...msg.payload, enabled: true }));
    case 'ACCEPT_SYNC_SUGGESTION': {
      const s = msg.payload;
      return commit(withGeo({
        enabled: true,
        timezone: s.timezone,
        locale: s.locale,
        lat: s.lat,
        lon: s.lon,
        locationKey: s.locationKey,
        countryCode: s.countryCode,
      }));
    }
    case 'DISMISS_SYNC_SUGGESTION': {
      const cc = msg.payload.countryCode.toUpperCase();
      return commit(d => ({
        ...d,
        syncDismissed: [...d.syncDismissed.filter(c => c !== cc), cc].slice(-MAX_SYNC_DISMISSED),
      }));
    }
  }
}

chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: Error) => {
    console.error('[Nomada] message handler error:', e);
    sendResponse({ success: false, error: e.message });
  });
  return true;
});
