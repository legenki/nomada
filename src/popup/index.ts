import { Globe } from './globe';
import { renderCityGrid, renderProxySection, renderSuggestionBanner, renderStatusPills } from './ui';
import type { ProxyElements } from './ui';
import type { ActionResult, BgMessage, BgState, SyncSuggestion } from '../types';
import { findLocationByKey } from '../lib/locations';
import type { Location } from '../lib/locations';
import { hasGeoTarget } from '../lib/state';

function sendMsg<T = unknown>(msg: BgMessage, retries = 3): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = (n: number) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          if (n > 0) setTimeout(() => attempt(n - 1), 200);
          else reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as T);
      });
    };
    attempt(retries);
  });
}

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

const globeCanvas    = $<HTMLCanvasElement>('#globeCanvas');
const locDot         = $<HTMLElement>('#locDot');
const masterToggle   = $<HTMLInputElement>('#masterToggle');
const locationName   = $<HTMLElement>('#locationName');
const locationCoords = $<HTMLElement>('#locationCoords');
const locationClock  = $<HTMLElement>('#locationClock');
const clockTime      = $<HTMLElement>('#clockTime');
const clockLocale    = $<HTMLElement>('#clockLocale');
const geoActivePill  = $<HTMLElement>('#geoActivePill');
const ipSyncBtn      = $<HTMLButtonElement>('#ipSyncBtn');
const citySearch     = $<HTMLInputElement>('#citySearch');
const cityGrid       = $<HTMLElement>('#cityGrid');
const suggestionBanner = $<HTMLElement>('#suggestionBanner');
const proxyError     = $<HTMLElement>('#proxyError');
const versionText    = $<HTMLElement>('#versionText');
const proxyEls: ProxyElements = {
  card: $<HTMLElement>('#proxyCard'),
  name: $<HTMLElement>('#proxyName'),
  meta: $<HTMLElement>('#proxyMeta'),
  badge: $<HTMLElement>('#proxyBadge'),
  colorDot: $<HTMLElement>('#proxyColorDot'),
  disconnect: $<HTMLButtonElement>('#proxyDisconnect'),
  list: $<HTMLElement>('#proxyList'),
};

const globe = new Globe(globeCanvas, 200);
let currentState: BgState | null = null;
let activeSuggestion: SyncSuggestion | null = null;
let clockTimezone: string | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function updateLocationDisplay(loc: Location): void {
  showLocation(loc.name, loc.lat, loc.lon, loc.locale, loc.timezone);
}

/** Render a location from any source (preset city or resolved IP). */
function showLocation(name: string, lat: number, lon: number, locale: string, timezone: string): void {
  locationName.textContent = name;
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
  locationCoords.textContent = `${latStr} · ${lonStr}`;
  clockLocale.textContent = locale;
  locationClock.hidden = false;
  startClock(timezone);
}

/** Live clock showing the current time in the selected location's timezone. */
function startClock(timezone: string): void {
  clockTimezone = timezone;
  if (clockTimer) clearInterval(clockTimer);
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

function tickClock(): void {
  if (!clockTimezone) { clockTime.textContent = '—'; return; }
  try {
    clockTime.textContent = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: clockTimezone,
    }).format(new Date());
  } catch {
    clockTime.textContent = '—';
  }
}

function clearClock(): void {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  clockTimezone = null;
  clockTime.textContent = '—';
  clockLocale.textContent = '—';
  locationClock.hidden = true;
}

function showProxyError(message: string | null): void {
  proxyError.textContent = message ?? '';
  proxyError.hidden = !message;
}

function applyState(state: BgState): void {
  currentState = state;

  masterToggle.checked = state.enabled;
  document.body.classList.toggle('is-disabled', !state.enabled);

  const g = state.geo;
  const loc = g.locationKey ? findLocationByKey(g.locationKey) : null;
  if (loc) {
    globe.rotateTo(loc.lon, loc.lat);
    updateLocationDisplay(loc);
  } else if (hasGeoTarget(g) && g.lat !== undefined && g.lon !== undefined) {
    // Location resolved from IP (not a preset city)
    globe.rotateTo(g.lon, g.lat);
    showLocation(g.cityName ?? 'Custom location', g.lat, g.lon, g.locale ?? '', g.timezone ?? 'UTC');
  } else {
    locationName.textContent = 'Choose a location';
    locationCoords.textContent = 'Pick a city below or use your IP';
    clearClock();
  }

  renderStatusPills(geoActivePill, state);
  renderCityGrid(cityGrid, citySearch.value, g.locationKey, handleCitySelect);
  renderProxySection(proxyEls, state, {
    onActivate: handleActivateProfile,
    onDeactivate: handleDeactivateProfile,
    onAdd: () => chrome.runtime.openOptionsPage(),
  });
}

async function refresh(): Promise<void> {
  applyState(await sendMsg<BgState>({ type: 'GET_STATE' }));
}

/** Run a state-changing action, refresh the UI and surface any proxy error. */
async function act(msg: BgMessage): Promise<ActionResult | undefined> {
  try {
    const result = await sendMsg<ActionResult>(msg);
    showProxyError(result && !result.success ? result.error ?? 'Something went wrong' : null);
    await refresh();
    return result;
  } catch (e) {
    showProxyError((e as Error).message);
    return undefined;
  }
}

async function handleMasterToggle(): Promise<void> {
  const enable = masterToggle.checked;
  document.body.classList.toggle('is-disabled', !enable);
  await act({ type: enable ? 'ENABLE_ALL' : 'DISABLE_ALL' });
  if (enable) void checkSyncInBackground();
}

async function handleCitySelect(loc: Location): Promise<void> {
  globe.rotateTo(loc.lon, loc.lat);
  updateLocationDisplay(loc);
  renderCityGrid(cityGrid, citySearch.value, loc.key, handleCitySelect);
  // Picking a place also turns the extension ON (handled by the background).
  await act({
    type: 'SET_GEO',
    payload: {
      enabled: true,
      timezone: loc.timezone,
      locale: loc.locale,
      lat: loc.lat,
      lon: loc.lon,
      locationKey: loc.key,
      countryCode: loc.countryCode,
    },
  });
}

async function handleIpSync(): Promise<void> {
  const label = ipSyncBtn.querySelector<HTMLElement>('.ip-sync-label')!;
  const original = label.textContent;
  const flash = (text: string) => {
    label.textContent = text;
    setTimeout(() => { label.textContent = original; }, 2000);
  };
  ipSyncBtn.disabled = true;
  ipSyncBtn.classList.add('is-loading');
  label.textContent = 'Detecting…';
  try {
    const r = await sendMsg<ActionResult>({ type: 'SYNC_TO_IP' });
    label.textContent = original;
    if (r?.success) await refresh();
    else flash(r?.error ?? 'Failed');
  } catch {
    flash('Network error');
  } finally {
    ipSyncBtn.disabled = false;
    ipSyncBtn.classList.remove('is-loading');
  }
}

async function handleAcceptSync(): Promise<void> {
  if (!activeSuggestion) return;
  const suggestion = activeSuggestion;
  activeSuggestion = null;
  renderSuggestionBanner(suggestionBanner, null, handleAcceptSync, handleDismissSync);
  await act({ type: 'ACCEPT_SYNC_SUGGESTION', payload: suggestion });
}

async function handleDismissSync(): Promise<void> {
  if (!activeSuggestion) return;
  const { countryCode } = activeSuggestion;
  activeSuggestion = null;
  renderSuggestionBanner(suggestionBanner, null, handleAcceptSync, handleDismissSync);
  await sendMsg({ type: 'DISMISS_SYNC_SUGGESTION', payload: { countryCode } }).catch(() => {});
}

async function handleActivateProfile(id: string): Promise<void> {
  const r = await act({ type: 'ACTIVATE_PROFILE', payload: { id } });
  if (r?.success) void checkSyncInBackground();
}

async function handleDeactivateProfile(): Promise<void> {
  await act({ type: 'DEACTIVATE_PROFILE' });
}

async function checkSyncInBackground(): Promise<void> {
  try {
    const r = await sendMsg<{ suggestion: SyncSuggestion | null }>({ type: 'CHECK_SYNC' });
    activeSuggestion = r?.suggestion ?? null;
    renderSuggestionBanner(suggestionBanner, activeSuggestion, handleAcceptSync, handleDismissSync);
  } catch {
    // Sync check failed (network) — non-critical, ignore
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  versionText.textContent = `v${chrome.runtime.getManifest().version}`;

  // Wire controls first, so a failed load below can't leave a dead popup.
  masterToggle.addEventListener('change', handleMasterToggle);
  ipSyncBtn.addEventListener('click', handleIpSync);
  citySearch.addEventListener('input', () => {
    renderCityGrid(cityGrid, citySearch.value, currentState?.geo.locationKey, handleCitySelect);
  });
  $<HTMLElement>('#settingsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $<HTMLElement>('#manageProxyBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => globe.draw());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh().catch(() => {});
  });

  globe.onDotPosition = (x, y) => {
    locDot.style.left = `${x}px`;
    locDot.style.top = `${y}px`;
  };

  // The map is decoration: load it alongside the state, and never let it block the UI.
  const [, stateResult] = await Promise.allSettled([
    globe.loadData(chrome.runtime.getURL('land-110m.json')),
    refresh(),
  ]);
  if (stateResult.status === 'rejected') {
    locationName.textContent = 'Nomada is starting…';
    locationCoords.textContent = 'Close and reopen the popup in a moment';
    return;
  }
  if (currentState?.activeProfile && currentState.enabled) void checkSyncInBackground();
});
