import { LOCATIONS, DEFAULT_LOCATION_KEYS } from '../lib/locations';
import type { Location } from '../lib/locations';
import type { BgState, ProxyProfile, SyncSuggestion } from '../types';
import { isGeoActive } from '../lib/state';
import { escHtml, safeColor } from '../lib/html';

export function renderCityGrid(
  container: HTMLElement,
  filter: string,
  activeKey: string | undefined,
  onSelect: (loc: Location) => void,
): void {
  const q = filter.trim().toLowerCase();
  let filtered: Location[];
  if (q) {
    filtered = LOCATIONS.filter(l =>
      l.name.toLowerCase().includes(q) || l.country.toLowerCase().includes(q)
    );
  } else {
    const keys = activeKey && !DEFAULT_LOCATION_KEYS.includes(activeKey)
      ? [...DEFAULT_LOCATION_KEYS, activeKey]
      : DEFAULT_LOCATION_KEYS;
    filtered = keys.map(k => LOCATIONS.find(l => l.key === k)).filter((l): l is Location => !!l);
  }
  container.innerHTML = filtered.map(loc => `
    <button class="city-btn ${loc.key === activeKey ? 'active' : ''}" data-key="${escHtml(loc.key)}">
      <span class="city-flag">${loc.flag}</span>
      <span>
        <div class="city-name">${escHtml(loc.name)}</div>
        <div class="city-tz">${escHtml(loc.country)}</div>
      </span>
    </button>`).join('');
  container.onclick = e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.city-btn');
    const loc = btn && LOCATIONS.find(l => l.key === btn.dataset.key);
    if (loc) onSelect(loc);
  };
}

export interface ProxyElements {
  card: HTMLElement;
  name: HTMLElement;
  meta: HTMLElement;
  badge: HTMLElement;
  colorDot: HTMLElement;
  disconnect: HTMLButtonElement;
  list: HTMLElement;
}

export interface ProxyHandlers {
  onActivate: (id: string) => void;
  onDeactivate: () => void;
  onAdd: () => void;
}

function proxyMetaText(p: ProxyProfile, max: number): string {
  const cfg = p.config;
  return cfg.type === 'pac'
    ? `PAC · ${truncate(cfg.pacUrl, max)}`
    : `${cfg.type.toUpperCase()} · ${cfg.host}:${cfg.port}`;
}

export function renderProxySection(els: ProxyElements, state: BgState, handlers: ProxyHandlers): void {
  const selected = state.activeProfile;
  if (selected) {
    els.colorDot.style.background = safeColor(selected.color);
    els.name.textContent = selected.name;
    els.meta.textContent = proxyMetaText(selected, 28);
    // While the master switch is OFF the profile stays selected but carries no traffic.
    els.badge.textContent = state.enabled ? 'Active' : 'Paused';
    els.badge.classList.toggle('is-paused', !state.enabled);
    els.disconnect.onclick = () => handlers.onDeactivate();
    els.card.style.display = 'flex';
    els.list.style.display = 'none';
    return;
  }

  els.card.style.display = 'none';
  els.list.style.display = 'block';
  els.list.innerHTML = state.profiles.length > 0
    ? state.profiles.map(p => `
      <button class="proxy-card proxy-option" data-id="${escHtml(p.id)}">
        <span class="proxy-color" style="background:${safeColor(p.color)}"></span>
        <span class="proxy-info">
          <span class="proxy-name">${escHtml(p.name)}</span>
          <span class="proxy-meta">${escHtml(proxyMetaText(p, 22))}</span>
        </span>
        <span class="use-badge">Use</span>
      </button>`).join('') +
      '<div class="proxy-add-row"><span class="section-link" data-action="add">+ Add profile</span></div>'
    : '<div class="empty-proxy">No proxy configured <span class="section-link" data-action="add">+ Add</span></div>';

  els.list.onclick = e => {
    const target = e.target as Element;
    if (target.closest('[data-action="add"]')) { handlers.onAdd(); return; }
    const option = target.closest<HTMLElement>('.proxy-option');
    if (option?.dataset.id) handlers.onActivate(option.dataset.id);
  };
}

export function renderSuggestionBanner(
  container: HTMLElement,
  suggestion: SyncSuggestion | null,
  onAccept: () => void,
  onDismiss: () => void,
): void {
  if (!suggestion) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  const title = container.querySelector<HTMLElement>('.suggestion-title')!;
  const text = container.querySelector<HTMLElement>('.suggestion-text')!;
  const acceptBtn = container.querySelector<HTMLButtonElement>('.btn-accept')!;
  const dismissBtn = container.querySelector<HTMLButtonElement>('.btn-dismiss')!;
  title.textContent = `Proxy via ${suggestion.city} detected`;
  text.textContent = `Sync geolocation, timezone and locale to match ${suggestion.city}?`;
  acceptBtn.onclick = onAccept;
  dismissBtn.onclick = onDismiss;
}

export function renderStatusPills(geoActivePill: HTMLElement, state: BgState): void {
  geoActivePill.style.display = isGeoActive(state) ? 'inline-flex' : 'none';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
