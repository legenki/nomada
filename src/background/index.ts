import { readData, writeData } from '../lib/storage';
import { activeProfileOf, isProtected, proxyPlaceOf, selectedProfileOf } from '../lib/state';
import { applyProxy } from './proxy';
import { applySpoof } from './spoof';
import { refreshIcon } from './icon';
import { LOOKUP_HOST, lookupDirectPlace, lookupProxyPlace } from './places';
import { answerProbeChallenge, detectProxyType, noteProxyError } from './detect';
import { installFirefoxProxy } from './firefox-proxy';
import { isFresh, spoofConfigOf, withProxyPlace } from './state-helpers';
import type { ActionResult, BgMessage, BgState, WooPortalData } from '../types';

const OK: ActionResult = { success: true };

// ── State transitions ───────────────────────────────────────────────────────
// Every change goes through commit(): apply a pure update to the latest stored
// state, persist it, then bring Chrome (proxy, page spoofing, toolbar icon) in
// line with whatever actually changed. Commits run one at a time so concurrent
// messages can't overwrite each other's writes.

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => {}).then(fn);
  queue = run;
  return run;
}

/**
 * Resolves once queued work is done. Location lookups wait for it: while a
 * proxy check runs, a lookup would go out through the proxy being checked.
 */
function whenIdle(): Promise<void> {
  return queue.then(() => {}, () => {});
}


interface Reapply { proxy?: boolean; spoof?: boolean }

function commit(update: (d: WooPortalData) => WooPortalData, force: Reapply = {}): Promise<ActionResult> {
  return serialize(async () => {
    const prev = await readData();
    const next = update(prev);
    await writeData(next);

    let result = OK;
    if (force.proxy || activeProfileOf(prev)?.id !== activeProfileOf(next)?.id) {
      result = await applyProxy(next);
    }
    const spoof = spoofConfigOf(next);
    if (force.spoof || JSON.stringify(spoofConfigOf(prev)) !== JSON.stringify(spoof)) {
      await applySpoof(spoof);
    }
    await refreshIcon();
    return result;
  });
}



// ── Places ──────────────────────────────────────────────────────────────────

/** Look up the user's own location. Only meaningful while no proxy is set. */
async function refreshRealPlace(force = false): Promise<void> {
  await whenIdle();
  const data = await readData();
  if (activeProfileOf(data) || (!force && isFresh(data.realPlace))) return;
  const place = await lookupDirectPlace();
  if (place) await commit(d => (activeProfileOf(d) ? d : { ...d, realPlace: place }));
}

/**
 * Look up the active proxy's exit location and start matching pages to it.
 * If the proxy can't reach the internet, switch back off rather than leave the
 * browser stuck behind a dead proxy.
 */
async function refreshProxyPlace(force = false): Promise<ActionResult> {
  await whenIdle();
  const data = await readData();
  const profile = activeProfileOf(data);
  if (!profile || (!force && isFresh(proxyPlaceOf(data)))) return OK;

  const place = await lookupProxyPlace(data.realPlace?.ip);
  if (!place) {
    if (proxyPlaceOf(data)) {
      return { success: false, error: `“${profile.name}” location re-check failed` };
    }
    await commit(d => (activeProfileOf(d)?.id === profile.id ? { ...d, enabled: false } : d));
    void refreshRealPlace();
    return { success: false, error: `“${profile.name}” didn't respond — Nomada stayed off` };
  }
  await commit(d => (activeProfileOf(d)?.id === profile.id ? withProxyPlace(d, profile.id, place) : d));
  return OK;
}

// ── Actions ─────────────────────────────────────────────────────────────────

const ALL_SITES: chrome.permissions.Permissions = { origins: ['<all_urls>'] };

async function enable(): Promise<ActionResult> {
  // Firefox only routes requests to sites Nomada may access, and people can
  // revoke that: switching on without it would leave traffic unproxied.
  if (__TARGET__ === 'firefox' && !(await chrome.permissions.contains(ALL_SITES))) {
    return { success: false, error: 'Allow Nomada to access all sites first' };
  }
  const data = await readData();
  const profileId = selectedProfileOf(data)?.id ?? data.profiles[0]?.id;
  if (!profileId) return { success: false, error: 'Add a proxy first' };
  // Know where the user really is before the route changes (for the globe and
  // to tell a proxied answer from one that slipped past the proxy).
  if (!data.realPlace) await refreshRealPlace(true);

  const result = await commit(d => ({ ...d, enabled: true, activeProfileId: profileId }));
  if (!result.success) {
    await commit(d => ({ ...d, enabled: false }));
    return result;
  }
  return refreshProxyPlace(true);
}

async function disable(): Promise<ActionResult> {
  const result = await commit(d => ({ ...d, enabled: false }));
  void refreshRealPlace();
  return result;
}

async function selectProfile(id: string): Promise<ActionResult> {
  const data = await readData();
  if (!data.profiles.some(p => p.id === id)) return { success: false, error: 'Profile not found' };
  const result = await commit(d => ({ ...d, activeProfileId: id }));
  if (!data.enabled) return result;
  if (!result.success) {
    await commit(d => ({ ...d, enabled: false }));
    return result;
  }
  return refreshProxyPlace(true);
}

async function profilesChanged(): Promise<ActionResult> {
  // The active profile's host, port or credentials may differ now; a deleted
  // selection is dropped by readData() (and turns Nomada off).
  const result = await commit(d => d, { proxy: true });
  if (!result.success) {
    await commit(d => ({ ...d, enabled: false }));
    return result;
  }
  return refreshProxyPlace(true);
}

async function getState(): Promise<BgState> {
  const data = await readData();
  return {
    enabled: data.enabled,
    profiles: data.profiles,
    activeProfile: selectedProfileOf(data) ?? null,
    protected: isProtected(data),
    realPlace: data.realPlace ?? null,
    proxyPlace: proxyPlaceOf(data) ?? null,
  };
}

// ── Browser events ──────────────────────────────────────────────────────────

if (__TARGET__ === 'firefox') {
  // Registered first thing on every start: Firefox wakes this page for it.
  installFirefoxProxy();
  // Firefox has no proxy.onProxyError; an Auto check reads its lookup's network error.
  chrome.webRequest.onErrorOccurred.addListener(d => noteProxyError(d.error), { urls: [`https://${LOOKUP_HOST}/*`] });
} else {
  chrome.proxy.onProxyError.addListener(details => {
    noteProxyError(details.error);
    console.error('[Nomada] proxy error:', details.error);
  });
}

// Chrome drops session rules, session storage and non-persistent content
// scripts on restart, and may drop extension settings on reload/update — so
// re-assert the stored state whenever the browser or extension starts.
async function reconcile(): Promise<void> {
  await commit(d => d, { proxy: true, spoof: true });
  const data = await readData();
  if (activeProfileOf(data)) await refreshProxyPlace(true);
  else await refreshRealPlace();
}
chrome.runtime.onStartup.addListener(() => { void reconcile(); });
if (__TARGET__ === 'firefox') {
  chrome.permissions.onRemoved.addListener(removed => { if (removed.origins?.length) void disable(); });
}
chrome.runtime.onInstalled.addListener(() => { void reconcile(); });

// Sync the icon whenever the service worker (re)starts.
void refreshIcon();

// ── Proxy authentication ────────────────────────────────────────────────────

// Requests we've already answered. A second challenge for the same request
// means the credentials were rejected; answering again would loop forever.
const answeredAuth = new Set<string>();
const forgetAuth = (d: { requestId: string }) => { answeredAuth.delete(d.requestId); };
chrome.webRequest.onCompleted.addListener(forgetAuth, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(forgetAuth, { urls: ['<all_urls>'] });

async function answerAuth(details: chrome.webRequest.WebAuthenticationChallengeDetails): Promise<chrome.webRequest.BlockingResponse> {
  if (!details.isProxy) return {};
  const probeAnswer = answerProbeChallenge(details.challenger?.host);
  if (probeAnswer) return probeAnswer;
  if (answeredAuth.has(details.requestId)) return { cancel: true };
  const profile = activeProfileOf(await readData());
  const auth = profile?.config.auth;
  // Only hand the credentials to the proxy they were configured for
  // (a PAC script can route through other proxies).
  const challenger = details.challenger?.host.toLowerCase();
  const host = profile?.config.host.trim().toLowerCase();
  const hostOk = profile?.config.type === 'pac' ? !host || challenger === host : challenger === host;
  if (!auth?.username || !hostOk) return {};
  answeredAuth.add(details.requestId);
  return { authCredentials: { username: auth.username, password: auth.password } };
}

if (__TARGET__ === 'firefox') {
  // Firefox has no asyncBlocking: a blocking listener may return a Promise instead.
  chrome.webRequest.onAuthRequired.addListener(
    details => answerAuth(details).catch(() => ({})) as unknown as chrome.webRequest.BlockingResponse,
    { urls: ['<all_urls>'] },
    ['blocking'],
  );
} else {
  chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => { answerAuth(details).then(callback, () => callback!({})); },
    { urls: ['<all_urls>'] },
    ['asyncBlocking'],
  );
}

// ── Messages from popup / options ───────────────────────────────────────────

async function handle(msg: BgMessage): Promise<unknown> {
  switch (msg.type) {
    case 'GET_STATE':
      return getState();
    case 'REFRESH_PLACE': {
      const data = await readData();
      const result = activeProfileOf(data) ? await refreshProxyPlace() : (await refreshRealPlace(), OK);
      return { result, state: await getState() };
    }
    case 'ENABLE':
      return enable();
    case 'DISABLE':
      return disable();
    case 'SELECT_PROFILE':
      return selectProfile(msg.payload.id);
    case 'PROFILES_CHANGED':
      return profilesChanged();
    case 'DETECT_PROXY':
      return serialize(async () => detectProxyType(msg.payload, await readData()));
  }
}

chrome.runtime.onMessage.addListener((msg: BgMessage, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: Error) => {
    console.error('[Nomada] message handler error:', e);
    sendResponse({ success: false, error: e.message });
  });
  return true;
});
