import { Globe } from './globe';
import { escHtml } from '../lib/html';
import { flagHtml, paintFlags } from '../lib/flags';
import { TARGET } from '../lib/platform';
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

const connDirect = $<HTMLInputElement>('#connDirect');
const connProxy  = $<HTMLInputElement>('#connProxy');
const mode       = $<HTMLElement>('#mode');
const modeSingle = $<HTMLInputElement>('#modeSingle');
const modeFail   = $<HTMLInputElement>('#modeFailover');
const moved      = $<HTMLElement>('#moved');
const blocked    = $<HTMLElement>('#blocked');
const foot       = $<HTMLElement>('#failoverFoot');
const footHint   = $<HTMLElement>('#failoverHint');
const status     = $<HTMLElement>('#status');
const statusText = $<HTMLElement>('#statusText');
const placeEl    = $<HTMLElement>('#place');
const countryEl  = $<HTMLElement>('#country');
const timeEl     = $<HTMLElement>('#time');
const langEl     = $<HTMLElement>('#lang');
const ipEl       = $<HTMLElement>('#ip');
const note       = $<HTMLElement>('#note');
const proxyList  = $<HTMLElement>('#proxyList');
const access     = $<HTMLElement>('#access');

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

/** Failover: the proxies in the order they'd be used, with what each is doing now. */
function renderChain(s: BgState, on: boolean): void {
  const profiles = s.failover.chain.flatMap(id => s.profiles.filter(p => p.id === id));
  proxyList.innerHTML = profiles.map((p, i) => {
    const selected = p.id === s.activeProfile?.id;
    const state = s.failover.down.includes(p.id) ? 'down' : !selected ? 'backup' : on ? 'active' : 'next';
    const tag = { down: 'NO ANSWER', backup: 'BACKUP', active: 'ACTIVE', next: 'NEXT' }[state];
    return `
    <div class="fo-row" draggable="true" data-id="${escHtml(p.id)}" data-state="${state}">
      <button class="proxy" type="button" role="radio" data-id="${escHtml(p.id)}"
              aria-checked="${selected}"${p.exitCountry ? ` data-flag="${escHtml(p.exitCountry.code)}"` : ''}>
        <span class="fo-n">${i + 1}</span>
        ${flagHtml(p.exitCountry)}
        <span class="proxy-text">
          <span class="fo-name"><span class="fo-name-text">${escHtml(p.name)}</span><span class="fo-tag">${tag}</span></span>
          <span class="proxy-meta">${escHtml(proxyMeta(p))}</span>
        </span>
      </button>
      <button class="grip" type="button" data-id="${escHtml(p.id)}" aria-label="Move ${escHtml(p.name)} with the arrow keys" title="Drag to reorder">⋮⋮</button>
    </div>`;
  }).join('');
  paintFlags(proxyList);
  footHint.textContent = on ? 'If a proxy stops answering, Nomada moves to the next one.' : 'Switch to Proxy to go through them, in this order.';
}

function renderProxies(s: BgState, on: boolean): void {
  mode.hidden = s.failover.chain.length === 0;
  modeSingle.checked = !s.failover.enabled;
  modeFail.checked = s.failover.enabled;
  const chained = s.failover.enabled && s.failover.chain.length > 0;
  foot.hidden = !chained;
  if (chained) { renderChain(s, on); return; }
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
            aria-checked="${p.id === s.activeProfile?.id}"${p.exitCountry ? ` data-flag="${escHtml(p.exitCountry.code)}"` : ''}>
      ${flagHtml(p.exitCountry)}
      <span class="proxy-text">
        <span class="proxy-name">${escHtml(p.name)}</span>
        <span class="proxy-meta">${escHtml(proxyMeta(p))}</span>
      </span>
      <span class="radio" aria-hidden="true"></span>
    </button>`).join('');
  paintFlags(proxyList);
}

/** Where the other proxies are on the globe; ones never used yet have no known point. */
function otherProxies(s: BgState) {
  return s.profiles.flatMap(p => {
    const { lat, lon } = p.exitCountry ?? {};
    const isRoute = p.id === s.activeProfile?.id && !s.failover.exhausted;
    if (lat === undefined || lon === undefined || isRoute || !s.failover.chain.includes(p.id)) return [];
    return [{ lat, lon, down: s.failover.down.includes(p.id) }];
  });
}

function render(): void {
  if (!state) return;
  const s = state;
  const on = s.enabled && !!s.activeProfile;
  const { exhausted } = s.failover;

  connProxy.checked = on || connecting;
  connDirect.checked = !connProxy.checked;
  connProxy.disabled = s.profiles.length === 0;
  blocked.hidden = !exhausted || !on || connecting;
  moved.hidden = !s.failover.moved || !on;
  moved.textContent = s.failover.moved ? `${s.failover.moved.from} stopped answering — moved to ${s.failover.moved.to}` : '';
  if (!blocked.hidden) showNote(null);

  if (connecting) {
    status.dataset.state = 'connecting';
    statusText.textContent = `Connecting via ${s.activeProfile?.name ?? 'proxy'}…`;
    showPlace(s.proxyPlace, 'Locating…');
  } else if (on && exhausted) {
    status.dataset.state = 'warn';
    statusText.textContent = 'No proxy is answering';
    showPlace(s.proxyPlace, 'Blocked');
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
    // Blocked: a marker on the real place would read as "you're connected from here".
    real: on && exhausted ? null : s.realPlace,
    proxy: s.proxyPlace,
    active: on && s.protected && !exhausted,
    connecting: connecting || (on && !s.protected && !exhausted),
    others: on && s.failover.enabled ? otherProxies(s) : [],
  });
  renderProxies(s, on);
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

// Without access to all sites Firefox won't hand Nomada their requests, so
// nothing could be proxied or matched. Firefox lets people revoke it anytime.
const ALL_SITES: chrome.permissions.Permissions = { origins: ['<all_urls>'] };

async function checkSiteAccess(): Promise<void> {
  access.hidden = await chrome.permissions.contains(ALL_SITES);
}

$<HTMLButtonElement>('#grantAccess').addEventListener('click', () => {
  chrome.permissions.request(ALL_SITES).then(granted => { access.hidden = granted; }, () => {});
});

connDirect.addEventListener('change', () => { void run({ type: 'DISABLE' }, false); });
connProxy.addEventListener('change', () => { void run({ type: 'ENABLE' }, true); });
$<HTMLButtonElement>('#retry').addEventListener('click', () => { void run({ type: 'RETRY_FAILOVER' }, true); });

async function setFailover(payload: { enabled?: boolean; order?: string[] }): Promise<void> {
  await sendMsg({ type: 'SET_FAILOVER', payload }).catch(() => {});
  await refreshState().catch(() => {});
}

modeSingle.addEventListener('change', () => { void setFailover({ enabled: false }); });
modeFail.addEventListener('change', () => { void setFailover({ enabled: true }); });
$<HTMLButtonElement>('#addBackup').addEventListener('click', () => chrome.runtime.openOptionsPage());

/** Save a new order, showing it straight away. */
function reorder(order: string[]): Promise<void> {
  if (state) { state.failover.chain = order; render(); }
  return setFailover({ order });
}

function reordered(order: string[], id: string, targetId: string, after: boolean): string[] {
  const rest = order.filter(x => x !== id);
  rest.splice(rest.indexOf(targetId) + (after ? 1 : 0), 0, id);
  return rest;
}

let draggingId: string | null = null;
const rowOf = (e: Event) => (e.target as Element).closest<HTMLElement>('.fo-row');
const clearDrop = () => proxyList.querySelectorAll<HTMLElement>('[data-drop]').forEach(r => { delete r.dataset.drop; });
const isAfter = (e: DragEvent, row: HTMLElement) => { const box = row.getBoundingClientRect(); return e.clientY > box.top + box.height / 2; };

proxyList.addEventListener('dragstart', e => {
  const row = rowOf(e);
  if (!row) return;
  draggingId = row.dataset.id!;
  row.classList.add('dragging');
  e.dataTransfer?.setData('text/plain', draggingId);
});
proxyList.addEventListener('dragover', e => {
  const row = rowOf(e);
  if (!row || !draggingId || row.dataset.id === draggingId) return;
  e.preventDefault();
  clearDrop();
  row.dataset.drop = isAfter(e, row) ? 'after' : 'before';
});
proxyList.addEventListener('drop', e => {
  const row = rowOf(e);
  if (!row || !draggingId || !state || row.dataset.id === draggingId) return;
  e.preventDefault();
  void reorder(reordered(state.failover.chain, draggingId, row.dataset.id!, isAfter(e, row)));
});
proxyList.addEventListener('dragend', () => {
  draggingId = null;
  clearDrop();
  proxyList.querySelector('.dragging')?.classList.remove('dragging');
});
proxyList.addEventListener('keydown', e => {
  const grip = (e.target as Element).closest<HTMLElement>('.grip');
  if (!grip || !state || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const id = grip.dataset.id!;
  const { chain } = state.failover;
  const to = chain.indexOf(id) + (e.key === 'ArrowUp' ? -1 : 1);
  if (to < 0 || to >= chain.length) return;
  const order = reordered(chain, id, chain[to], e.key === 'ArrowDown');
  void reorder(order).then(() => proxyList.querySelector<HTMLElement>(`.grip[data-id="${CSS.escape(id)}"]`)?.focus());
});

// Failover moves happen in the background, also while the popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'wooportal-data' in changes && !connecting) void refreshState().catch(() => {});
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
if (TARGET === 'firefox') void checkSiteAccess();
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
