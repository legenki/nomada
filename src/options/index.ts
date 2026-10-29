import { readData, updateProfiles } from '../lib/storage';
import { isProtected, proxyPlaceOf, selectedProfileOf } from '../lib/state';
import { escHtml } from '../lib/html';
import { SOCKS_LOGIN, SUPPORTS_PAC } from '../lib/platform';
import { flagHtml, paintFlags } from '../lib/flags';
import type { ActionResult, BgMessage, DetectResult, ProxyConfig, ProxyProfile, WooPortalData } from '../types';
import { parseProxyString } from './parse';
import { validateProfile, type ValidationError } from './validate';

type ProxyType = ProxyConfig['type'];
/** 'auto' finds the type on save. */
type FormType = ProxyType | 'auto';
type FormField = ValidationError['field'] | 'type';

const svg = (path: string, cls = 'icon', label = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path d="${path}"/></svg>`;
const ICON = {
  plus: svg('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'),
  lock: svg('M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6zm3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z', 'icon', 'Signs in with a username'),
  chevron: svg('M9.29 6.71a1 1 0 0 0 0 1.41L13.17 12l-3.88 3.88a1 1 0 1 0 1.41 1.41l4.59-4.59a1 1 0 0 0 0-1.41L10.7 6.7a1 1 0 0 0-1.41.01z', 'icon chev'),
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const list         = byId<HTMLElement>('list');
const count        = byId<HTMLElement>('count');
const addBtn       = byId<HTMLButtonElement>('addBtn');
const dialog       = byId<HTMLDialogElement>('dialog');
const form         = byId<HTMLFormElement>('form');
const pasteHint    = byId<HTMLElement>('pasteHint');
const deleteBtn    = byId<HTMLButtonElement>('deleteBtn');
const saveBtn      = byId<HTMLButtonElement>('saveBtn');
const toastEl      = byId<HTMLElement>('toast');
const f = {
  paste:       byId<HTMLInputElement>('fPaste'),
  host:        byId<HTMLInputElement>('fHost'),
  port:        byId<HTMLInputElement>('fPort'),
  pacUrl:      byId<HTMLInputElement>('fPacUrl'),
  username:    byId<HTMLInputElement>('fUser'),
  password:    byId<HTMLInputElement>('fPass'),
  name:        byId<HTMLInputElement>('fName'),
};
const INPUT_FOR: Record<FormField, HTMLInputElement> = {
  host: f.host, port: f.port, pacUrl: f.pacUrl, username: f.username,
  type: form.querySelector<HTMLInputElement>('input[name="type"][value="auto"]')!,
};
const typeRadios = () => form.elements.namedItem('type') as RadioNodeList;

// Only what's on screen. Every write re-reads storage first, so changes made in
// the popup while this page is open are never overwritten.
let data: WooPortalData | null = null;
let editingId: string | null = null;

function send<T>(msg: BgMessage): Promise<T | undefined> {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, r => {
    void chrome.runtime.lastError;
    resolve(r as T | undefined);
  }));
}

/** Tell the background so an edited/deleted active profile is re-applied to the browser. */
const notifyProfilesChanged = () => send<ActionResult>({ type: 'PROFILES_CHANGED' });

// ── List ────────────────────────────────────────────────────────────────────

interface Status { kind: 'active' | 'connecting' | 'selected'; label: string; place: string; placeTitle: string }

/** How the selected proxy is doing; other proxies have no status. */
function statusOf(p: ProxyProfile, d: WooPortalData): Status | null {
  if (selectedProfileOf(d)?.id !== p.id) return null;
  const place = proxyPlaceOf(d);
  const where = place ? [place.city, place.country].filter(Boolean).join(', ') : '';
  if (!d.enabled) return { kind: 'selected', label: 'Selected', place: where, placeTitle: 'Last known exit location' };
  if (isProtected(d)) return { kind: 'active', label: 'Active', place: where, placeTitle: place ? `Exit IP ${place.ip}` : '' };
  return { kind: 'connecting', label: 'Connecting…', place: '', placeTitle: '' };
}

function address(p: ProxyProfile): string {
  return p.config.type === 'pac' ? `PAC · ${p.config.pacUrl}` : `${p.config.type.toUpperCase()} · ${p.config.host}:${p.config.port}`;
}

function renderList(): void {
  const d = data;
  if (!d) return;
  count.textContent = String(d.profiles.length);
  count.hidden = d.profiles.length === 0;
  // The empty state has its own Add button.
  addBtn.hidden = d.profiles.length === 0;
  if (d.profiles.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-title">No proxies yet</span>
        <span>Add one to browse from somewhere else.</span>
        <button class="primary" type="button" data-action="add">${ICON.plus}Add proxy</button>
      </div>`;
    return;
  }
  list.innerHTML = d.profiles.map(p => {
    const s = statusOf(p, d);
    return `
    <button class="card" type="button" data-id="${escHtml(p.id)}"${s ? ` data-status="${s.kind}"` : ''}${p.exitCountry ? ` data-flag="${escHtml(p.exitCountry.code)}"` : ''}>
      ${flagHtml(p.exitCountry)}
      <span class="card-main">
        <span class="name">${escHtml(p.name)}</span>
        <span class="meta"><span class="meta-text">${escHtml(address(p))}</span>${p.config.auth.username ? ICON.lock : ''}</span>
      </span>
      ${s ? `<span class="card-side">
        <span class="pill" data-kind="${s.kind}"><span class="pill-dot"></span>${s.label}</span>
        ${s.place ? `<span class="place" title="${escHtml(s.placeTitle)}">${escHtml(s.place)}</span>` : ''}
      </span>` : ''}
      ${ICON.chevron}
    </button>`;
  }).join('');
  paintFlags(list);
}

async function load(): Promise<void> {
  data = await readData();
  renderList();
}

// ── Dialog ──────────────────────────────────────────────────────────────────

const currentType = () => typeRadios().value as FormType;

function setType(type: FormType): void {
  typeRadios().value = type;
  updateTypeFields();
}

function updateTypeFields(): void {
  const type = currentType();
  byId('addrRow').hidden = type === 'pac';
  byId('pacRow').hidden = type !== 'pac';
  // Chrome can't answer a SOCKS5 auth challenge, so there credentials are never saved for it.
  const socksWithoutLogin = type === 'socks5' && !SOCKS_LOGIN;
  byId('authRow').hidden = socksWithoutLogin;
  byId('socksNote').hidden = !socksWithoutLogin;
  byId('autoHint').hidden = type !== 'auto';
  updateNamePlaceholder();
}

/** Name used when the user leaves it blank. */
function fallbackName(): string {
  if (currentType() !== 'pac') return f.host.value.trim();
  try { return new URL(f.pacUrl.value.trim()).hostname || 'PAC proxy'; } catch { return 'PAC proxy'; }
}

function updateNamePlaceholder(): void {
  // Auto names the proxy after its exit city, found on save.
  f.name.placeholder = currentType() === 'auto' ? 'City of the exit IP' : fallbackName() || 'My proxy';
}

function clearErrors(): void {
  form.querySelectorAll<HTMLElement>('[data-error-for]').forEach(el => { el.hidden = true; el.textContent = ''; });
  for (const input of Object.values(INPUT_FOR)) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
}

function showError(error: { field: FormField; message: string }): void {
  clearErrors();
  const message = form.querySelector<HTMLElement>(`[data-error-for="${error.field}"]`)!;
  message.id = `${error.field}Error`;
  message.textContent = error.message;
  message.hidden = false;
  const input = INPUT_FOR[error.field];
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', message.id);
  input.focus();
}

function showPasteHint(text: string, kind: 'ok' | 'error'): void {
  pasteHint.textContent = text;
  pasteHint.dataset.kind = kind;
  pasteHint.hidden = false;
}

/**
 * Fill the form from the paste field. While typing (`final` false) a partial
 * string is ignored quietly; once committed, an unreadable one is reported.
 */
function applyPaste(final: boolean): boolean {
  const text = f.paste.value;
  if (!text.trim()) { pasteHint.hidden = true; return false; }
  const parsed = parseProxyString(text);
  if (!parsed) {
    if (final) showPasteHint("Couldn't read that. Try host:port, host:port:user:pass or socks5://host:port", 'error');
    else pasteHint.hidden = true;
    return false;
  }
  if (parsed.type === 'pac' && !SUPPORTS_PAC) {
    showPasteHint("Firefox can't use PAC scripts here. Paste the proxy's own address instead.", 'error');
    return false;
  }
  if (parsed.type === 'socks5' && parsed.username && !SOCKS_LOGIN) {
    showPasteHint("Chrome can't sign in to SOCKS5 proxies, so one that needs a username and password won't work.", 'error');
    return false;
  }
  // Without a scheme the text doesn't say the type: keep the chosen one when it fits.
  const current = currentType();
  const keep = current !== 'pac' && !(current === 'socks5' && parsed.type !== 'pac' && parsed.username && !SOCKS_LOGIN);
  setType(parsed.type ?? (keep ? current : 'auto'));
  if (parsed.type === 'pac') {
    f.pacUrl.value = parsed.pacUrl;
  } else {
    f.host.value = parsed.host;
    f.port.value = String(parsed.port);
    f.username.value = parsed.username;
    f.password.value = parsed.password;
  }
  updateNamePlaceholder();
  clearErrors();
  showPasteHint(parsed.type === 'pac'
    ? 'Filled in a PAC script'
    : `Filled in ${parsed.type ? `${parsed.type.toUpperCase()} ` : ''}${parsed.host}:${parsed.port}${parsed.username ? ' with a login' : ''}`, 'ok');
  return true;
}

let deleteTimer: number | undefined;
// Bumped on every open, so a slow save can tell the dialog it started in is gone.
let dialogSession = 0;

function resetDelete(): void {
  clearTimeout(deleteTimer);
  delete deleteBtn.dataset.confirm;
  deleteBtn.textContent = 'Delete';
}

function openDialog(id?: string): void {
  const profile = id ? data?.profiles.find(p => p.id === id) : undefined;
  if (id && !profile) return;
  editingId = profile?.id ?? null;
  dialogSession++;

  form.reset();
  clearErrors();
  resetDelete();
  pasteHint.hidden = true;
  byId('dialogTitle').textContent = profile ? 'Edit proxy' : 'Add proxy';
  deleteBtn.hidden = !profile;

  const c = profile?.config;
  setType(c?.type ?? 'auto');
  f.host.value = c?.host ?? '';
  f.port.value = c && c.type !== 'pac' ? String(c.port) : '';
  f.pacUrl.value = c?.pacUrl ?? '';
  f.username.value = c?.auth.username ?? '';
  f.password.value = c?.auth.password ?? '';
  f.name.value = profile?.name ?? '';
  updateNamePlaceholder();
  dialog.showModal();
}

// ── Save / delete ───────────────────────────────────────────────────────────

let toastTimer: number | undefined;

function toast(text: string, kind: 'ok' | 'warn' = 'ok'): void {
  toastEl.textContent = text;
  toastEl.dataset.kind = kind;
  toastEl.hidden = true;
  void toastEl.offsetWidth; // restart the entrance animation
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, kind === 'warn' ? 6000 : 2500);
}

/** Re-apply in the background and report if the (active) proxy couldn't be set. */
async function applyChanges(): Promise<void> {
  const applied = await notifyProfilesChanged();
  if (applied && !applied.success) toast(`Saved, but the proxy couldn't be applied: ${applied.error}`, 'warn');
}

let saving = false;

function setChecking(on: boolean): void {
  saveBtn.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span>Checking…' : 'Save';
  form.setAttribute('aria-busy', String(on));
}

/** Ask the background which type the proxy speaks (the Auto type). */
async function detectType(host: string, port: number, auth: ProxyProfile['config']['auth']): Promise<DetectResult> {
  setChecking(true);
  try {
    return await send<DetectResult>({ type: 'DETECT_PROXY', payload: { host, port, ...auth } })
      ?? { success: false, error: "Nomada didn't respond. Try again in a moment." };
  } finally {
    setChecking(false);
  }
}

async function saveProfile(): Promise<void> {
  if (saving) return;
  const formType = currentType();
  const host = f.host.value.trim();
  const portText = f.port.value.trim();
  const port = portText ? Number(portText) : NaN;
  const pacUrl = f.pacUrl.value.trim();
  const auth = formType === 'socks5' && !SOCKS_LOGIN
    ? { username: '', password: '' }
    : { username: f.username.value, password: f.password.value };
  // Auto needs a host and port like any proxy server.
  const error = validateProfile(formType === 'auto' ? 'http' : formType, host, port, pacUrl, auth.username);
  if (error) { showError(error); return; }

  const session = dialogSession;
  const editing = editingId;
  saving = true;
  saveBtn.disabled = true;
  try {
    let type: ProxyType = formType === 'auto' ? 'http' : formType;
    let found: DetectResult | undefined;
    if (formType === 'auto') {
      found = await detectType(host, port, auth);
      if (session !== dialogSession || !dialog.open) return; // closed while checking
      if (!found.success || !found.type) { showError({ field: 'type', message: found.error ?? "Couldn't check the proxy" }); return; }
      type = found.type;
    }

    const isPac = type === 'pac';
    const id = editing ?? generateId();
    const now = new Date().toISOString();
    const latest = (await readData()).profiles;
    const existing = latest.find(p => p.id === id);
    const config: ProxyConfig = {
      type,
      host: isPac ? '' : host,
      port: isPac ? 0 : port,
      pacUrl: isPac ? pacUrl : '',
      auth,
      bypassList: existing?.config.bypassList ?? [],
      routingRules: existing?.config.routingRules ?? { enabled: false, mode: 'whitelist', domains: [] },
    };
    // Another server may exit somewhere else: forget its country until it's looked up again.
    const old = existing?.config;
    const sameServer = !!old && old.type === config.type && old.host === config.host
      && old.port === config.port && old.pacUrl === config.pacUrl;
    const profile: ProxyProfile = {
      id,
      name: f.name.value.trim() || found?.place?.city || fallbackName(),
      description: existing?.description ?? '',
      color: existing?.color ?? '#808080',
      config,
      exitCountry: found?.place?.countryCode
        ? { code: found.place.countryCode, name: found.place.country }
        : sameServer ? existing?.exitCountry : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      tags: existing?.tags ?? [],
    };

    const next = existing ? latest.map(p => (p.id === id ? profile : p)) : [...latest, profile];
    data = await updateProfiles(next);
    renderList();
    dialog.close();
    const where = found?.place ? ` · ${type.toUpperCase()} · ${[found.place.city, found.place.country].filter(Boolean).join(', ')}` : '';
    toast(`${existing ? 'Saved' : `Added “${profile.name}”`}${where}`);
    await applyChanges();
  } finally {
    saving = false;
    saveBtn.disabled = false;
  }
}

async function deleteProfile(): Promise<void> {
  if (!editingId) return;
  const id = editingId;
  const latest = (await readData()).profiles;
  const name = latest.find(p => p.id === id)?.name ?? 'proxy';
  // If it was the active profile, the background switches the proxy off.
  data = await updateProfiles(latest.filter(p => p.id !== id));
  renderList();
  dialog.close();
  toast(`Deleted “${name}”`);
  await notifyProfilesChanged();
}

// ── Events ──────────────────────────────────────────────────────────────────

byId('pacOption').hidden = !SUPPORTS_PAC;
addBtn.addEventListener('click', () => openDialog());
list.addEventListener('click', e => {
  const target = e.target as Element;
  if (target.closest('[data-action="add"]')) { openDialog(); return; }
  const id = target.closest<HTMLElement>('.card')?.dataset.id;
  if (id) openDialog(id);
});

form.addEventListener('submit', e => { e.preventDefault(); void saveProfile(); });
form.addEventListener('input', e => { if (e.target !== f.paste) clearErrors(); });
typeRadios().forEach(radio => radio.addEventListener('change', () => { clearErrors(); updateTypeFields(); }));
f.host.addEventListener('input', updateNamePlaceholder);
f.pacUrl.addEventListener('input', updateNamePlaceholder);

f.paste.addEventListener('input', () => { applyPaste(false); });
f.paste.addEventListener('change', () => { applyPaste(true); });
// Enter in the paste field fills the form instead of saving a half-filled one.
f.paste.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (applyPaste(true)) f.name.focus();
});

deleteBtn.addEventListener('click', () => {
  if (deleteBtn.dataset.confirm === undefined) {
    deleteBtn.dataset.confirm = '';
    deleteBtn.textContent = 'Confirm delete';
    deleteTimer = window.setTimeout(resetDelete, 3000);
    return;
  }
  void deleteProfile();
});

byId('cancelBtn').addEventListener('click', () => dialog.close());
byId('closeBtn').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { editingId = null; resetDelete(); });
// Close on a backdrop click, but not when a text selection drag ends outside.
let pressedBackdrop = false;
dialog.addEventListener('pointerdown', e => { pressedBackdrop = e.target === dialog; });
dialog.addEventListener('click', e => { if (pressedBackdrop && e.target === dialog) dialog.close(); });

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') void load();
});

void load();
