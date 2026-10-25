import { Globe } from './globe';
import { escHtml, safeColor } from '../lib/html';
import type { ActionResult, BgMessage, BgState, Place, ProxyProfile } from '../types';

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

const power      = $<HTMLInputElement>('#power');
const status     = $<HTMLElement>('#status');
const statusText = $<HTMLElement>('#statusText');
const placeEl    = $<HTMLElement>('#place');
const countryEl  = $<HTMLElement>('#country');
const timeEl     = $<HTMLElement>('#time');
const langEl     = $<HTMLElement>('#lang');
const ipEl       = $<HTMLElement>('#ip');
const note       = $<HTMLElement>('#note');
const proxyList  = $<HTMLElement>('#proxyList');

const globe = new Globe($<HTMLCanvasElement>('#globe'), 260);

let state: BgState | null = null;
let connecting = false;
let clockZone: string | null = null;

// ── Rendering ───────────────────────────────────────────────────────────────

function tickClock(): void {
  if (!clockZone) { timeEl.textContent = '—'; return; }
  try {
    timeEl.textContent = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: clockZone,
    }).format(new Date());
  } catch {
    timeEl.textContent = '—';
  }
}

function showPlace(place: Place | null, pending: string): void {
  placeEl.textContent = place?.city ?? pending;
  countryEl.textContent = place?.country || ' ';
  langEl.textContent = place?.locale ?? '—';
  ipEl.textContent = place?.ip ?? '—';
  ipEl.title = place?.ip ?? '';
  clockZone = place?.timezone ?? null;
  tickClock();
}

function showNote(message: string | null): void {
  note.textContent = message ?? '';
  note.hidden = !message;
}

function proxyMeta(p: ProxyProfile): string {
  return p.config.type === 'pac' ? `PAC · ${p.config.pacUrl}` : `${p.config.type.toUpperCase()} · ${p.config.host}:${p.config.port}`;
}

function renderProxies(s: BgState): void {
  if (s.profiles.length === 0) {
    proxyList.innerHTML = `
      <div class="empty">
        <span>Add a proxy to travel somewhere else.</span>
        <button class="primary" type="button" data-action="add">Add proxy</button>
      </div>`;
    return;
  }
  proxyList.innerHTML = s.profiles.map(p => `
    <button class="proxy" type="button" role="radio" data-id="${escHtml(p.id)}"
            aria-checked="${p.id === s.activeProfile?.id}">
      <span class="proxy-dot" style="background:${safeColor(p.color)}"></span>
      <span class="proxy-text">
        <span class="proxy-name">${escHtml(p.name)}</span>
        <span class="proxy-meta">${escHtml(proxyMeta(p))}</span>
      </span>
      <span class="radio" aria-hidden="true"></span>
    </button>`).join('');
}

function render(): void {
  if (!state) return;
  const s = state;
  const on = s.enabled && !!s.activeProfile;

  power.checked = on || connecting;
  power.disabled = s.profiles.length === 0;

  if (connecting) {
    status.dataset.state = 'connecting';
    statusText.textContent = `Connecting via ${s.activeProfile?.name ?? 'proxy'}…`;
    showPlace(s.proxyPlace, 'Locating…');
  } else if (on && s.protected) {
    status.dataset.state = 'on';
    statusText.textContent = `Protected · via ${s.activeProfile!.name}`;
    showPlace(s.proxyPlace, 'Locating…');
  } else if (on) {
    status.dataset.state = 'connecting';
    statusText.textContent = 'Checking the proxy…';
    showPlace(s.proxyPlace, 'Locating…');
  } else {
    status.dataset.state = 'off';
    statusText.textContent = 'Your real location';
    showPlace(s.realPlace, s.realPlace ? '' : 'Locating…');
  }

  globe.setScene({
    real: s.realPlace,
    proxy: s.proxyPlace,
    active: on && s.protected,
    connecting: connecting || (on && !s.protected),
  });
  renderProxies(s);
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function refreshState(): Promise<void> {
  state = await sendMsg<BgState>({ type: 'GET_STATE' });
  render();
}

/** Run an action that may take a network round trip, showing progress meanwhile. */
async function run(msg: BgMessage, showConnecting: boolean): Promise<void> {
  showNote(null);
  connecting = showConnecting;
  render();
  try {
    const result = await sendMsg<ActionResult>(msg);
    if (result && !result.success) showNote(result.error ?? 'Something went wrong');
  } catch (e) {
    showNote((e as Error).message);
  } finally {
    connecting = false;
    await refreshState().catch(() => {});
  }
}

power.addEventListener('change', () => {
  if (!state) return;
  if (state.profiles.length === 0) { chrome.runtime.openOptionsPage(); return; }
  void run({ type: power.checked ? 'ENABLE' : 'DISABLE' }, power.checked);
});

proxyList.addEventListener('click', e => {
  const target = e.target as Element;
  if (target.closest('[data-action="add"]')) { chrome.runtime.openOptionsPage(); return; }
  const id = target.closest<HTMLElement>('.proxy')?.dataset.id;
  if (!id || !state || id === state.activeProfile?.id) return;
  // Switching while ON reconnects through the new proxy.
  void run({ type: 'SELECT_PROFILE', payload: { id } }, state.enabled);
});

$<HTMLButtonElement>('#manage').addEventListener('click', () => chrome.runtime.openOptionsPage());

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => globe.refreshPalette());
setInterval(tickClock, 1000);

// ── Start ───────────────────────────────────────────────────────────────────

globe.start();
void globe.loadLand(chrome.runtime.getURL('land-110m.json')).catch(() => {});

(async () => {
  try {
    await refreshState();
  } catch {
    placeEl.textContent = 'Nomada is starting…';
    countryEl.textContent = 'Close and reopen in a moment';
    return;
  }
  // Then make sure the location shown is current (it may need a lookup).
  try {
    const r = await sendMsg<{ result: ActionResult; state: BgState }>({ type: 'REFRESH_PLACE' });
    if (r?.result && !r.result.success) showNote(r.result.error ?? null);
    if (r?.state) { state = r.state; render(); }
  } catch {
    // Offline — keep what we have.
  }
})();
