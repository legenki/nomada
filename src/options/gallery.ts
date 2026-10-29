import type { ProxyProfile, PublicList, PublicProxy } from '../types';
import { escHtml } from '../lib/html';
import { flagHtml, paintFlags } from '../lib/flags';
import { countryCounts, filterPublic, findProfile, loadPublicList, speedOf, type PublicFilter } from '../lib/public-proxies';

// The "Public proxies" gallery on the settings page: working public proxies
// by country and type, each one click away from "My proxies".

const PAGE = 24;
const WARNING_KEY = 'nomada-public-warning-dismissed';

const regions = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();

export function countryName(code: string): string {
  try { return regions?.of(code) ?? code; } catch { return code; }
}

/** What the gallery needs from the page around it. */
export interface GalleryHost {
  profiles(): ProxyProfile[];
  add(p: PublicProxy): Promise<void>;
  use(p: PublicProxy): Promise<void>;
}

const keyOf = (p: PublicProxy) => `${p.type}:${p.host}:${p.port}`;
const formatMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return rtf.format(-Math.max(minutes, 0), 'minute');
  if (minutes < 48 * 60) return rtf.format(-Math.round(minutes / 60), 'hour');
  return rtf.format(-Math.round(minutes / 1440), 'day');
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

export function initGallery(host: GalleryHost): { render: () => void } {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const gallery = byId<HTMLElement>('gallery');
  const rail = byId<HTMLElement>('countryRail');
  const filters = byId<HTMLElement>('publicFilters');
  const status = byId<HTMLElement>('publicStatus');
  const count = byId<HTMLElement>('publicCount');
  const updated = byId<HTMLElement>('publicUpdated');
  const refresh = byId<HTMLButtonElement>('publicRefresh');
  const more = byId<HTMLButtonElement>('showMore');
  const warning = byId<HTMLElement>('publicWarning');

  let list: PublicList | null = null;
  let error = '';
  let loading = false;
  let limit = PAGE;
  let shown: PublicProxy[] = [];
  const filter: PublicFilter = { type: 'all', country: null, sort: 'speed' };
  // Proxies being added or connected to, so their buttons can say so.
  const busy = new Set<string>();

  function chip(code: string | null, n: number): string {
    const label = code ? countryName(code) : 'All countries';
    const face = code ? flagHtml({ code, name: label }) : '<span class="chip-all">All</span>';
    return `<button class="chip" type="button" data-country="${code ?? ''}" aria-pressed="${filter.country === code}" title="${escHtml(label)}">${face}<span>${n}</span></button>`;
  }

  function card(p: PublicProxy, i: number, profiles: ProxyProfile[]): string {
    const name = countryName(p.country);
    const connecting = busy.has(keyOf(p));
    const added = findProfile(profiles, p)
      ? '<span class="added">✓ Added</span>'
      : `<button class="ghost small" type="button" data-act="add" data-i="${i}"${connecting ? ' disabled' : ''}>+ Add</button>`;
    return `
      <article class="pcard" data-flag="${escHtml(p.country)}">
        <div class="pcard-head">${flagHtml({ code: p.country, name })}<span class="pcard-country">${escHtml(name)}</span></div>
        <div class="pcard-addr">${escHtml(`${p.host}:${p.port}`)}</div>
        <div class="pcard-meta">
          <span class="tag">${p.type === 'socks5' ? 'SOCKS5' : 'HTTP'}</span>
          <span class="speed" data-speed="${speedOf(p.ms)}" title="Measured by the list checker, not from your connection">${formatMs(p.ms)}</span>
        </div>
        <div class="pcard-actions">
          ${added}
          <button class="primary small" type="button" data-act="use" data-i="${i}"${connecting ? ' disabled' : ''}>${connecting ? 'Connecting…' : 'Use'}</button>
        </div>
      </article>`;
  }

  function render(): void {
    refresh.disabled = loading;
    if (!list) {
      filters.hidden = rail.hidden = more.hidden = count.hidden = true;
      updated.textContent = '';
      gallery.innerHTML = '';
      status.hidden = false;
      status.textContent = loading ? 'Loading public proxies…' : `Couldn't load the list${error ? ` (${error})` : ''}. Try again with ↻.`;
      return;
    }
    status.hidden = !error;
    status.textContent = error ? `Couldn't refresh the list (${error}) — showing the one from ${ago(list.updatedAt)}.` : '';
    filters.hidden = rail.hidden = false;
    count.hidden = false;
    count.textContent = String(list.proxies.length);
    updated.textContent = `updated ${ago(list.updatedAt)}`;

    const counts = countryCounts(list.proxies, filter.type);
    if (filter.country && !counts.some(([code]) => code === filter.country)) filter.country = null;
    const total = counts.reduce((n, [, c]) => n + c, 0);
    rail.innerHTML = chip(null, total) + counts.map(([code, n]) => chip(code, n)).join('');

    shown = filterPublic(list.proxies, filter, countryName);
    const profiles = host.profiles();
    gallery.innerHTML = shown.length
      ? shown.slice(0, limit).map((p, i) => card(p, i, profiles)).join('')
      : '<p class="gallery-empty">No working proxies like that right now — the list is checked again every 6 hours.</p>';
    paintFlags(gallery);
    paintFlags(rail);
    more.hidden = shown.length <= limit;
    more.textContent = `Show more (${shown.length - limit})`;
  }

  async function load(force: boolean): Promise<void> {
    loading = true;
    render();
    try {
      const result = await loadPublicList(force);
      list = result.list ?? list;
      error = result.error ?? '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
      render();
    }
  }

  async function act(action: 'add' | 'use', p: PublicProxy): Promise<void> {
    busy.add(keyOf(p));
    render();
    try {
      await (action === 'add' ? host.add(p) : host.use(p));
    } finally {
      busy.delete(keyOf(p));
      render();
    }
  }

  warning.hidden = readFlag(WARNING_KEY);
  byId('publicWarningClose').addEventListener('click', () => {
    warning.hidden = true;
    try { localStorage.setItem(WARNING_KEY, '1'); } catch { /* storage off: shows again next time */ }
  });
  document.querySelectorAll<HTMLInputElement>('input[name="publicType"]').forEach(radio => radio.addEventListener('change', () => {
    filter.type = radio.value as PublicFilter['type'];
    limit = PAGE;
    render();
  }));
  byId<HTMLSelectElement>('publicSort').addEventListener('change', e => {
    filter.sort = (e.target as HTMLSelectElement).value as PublicFilter['sort'];
    render();
  });
  rail.addEventListener('click', e => {
    const chipEl = (e.target as Element).closest<HTMLElement>('.chip');
    if (!chipEl) return;
    const code = chipEl.dataset.country || null;
    filter.country = filter.country === code ? null : code;
    limit = PAGE;
    render();
  });
  gallery.addEventListener('click', e => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button[data-act]');
    const p = button ? shown[Number(button.dataset.i)] : undefined;
    if (button && p) void act(button.dataset.act as 'add' | 'use', p);
  });
  more.addEventListener('click', () => { limit += PAGE; render(); });
  refresh.addEventListener('click', () => { void load(true); });

  void load(false);
  return { render };
}
