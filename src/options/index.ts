import { readData, updateProfiles } from '../lib/storage';
import type { ActionResult, BgMessage, ProxyProfile } from '../types';
import { escHtml, safeColor } from '../lib/html';
import { validateProfile } from './validate';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Only what's on screen. Every write re-reads storage first, so changes made in
// the popup while this page is open are never overwritten.
let profiles: ProxyProfile[] = [];
let editingId: string | null = null;

async function init(): Promise<void> {
  profiles = (await readData()).profiles;
  renderProfiles();
  wireEvents();
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'local') return;
    void readData().then(d => { profiles = d.profiles; renderProfiles(); });
  });
}

/** Tell the background so an edited/deleted active profile is re-applied to Chrome. */
function notifyProfilesChanged(): Promise<ActionResult | undefined> {
  const msg: BgMessage = { type: 'PROFILES_CHANGED' };
  return new Promise(resolve => chrome.runtime.sendMessage(msg, r => {
    void chrome.runtime.lastError;
    resolve(r as ActionResult | undefined);
  }));
}

function renderProfiles(): void {
  const list = byId<HTMLElement>('profilesList');
  if (profiles.length === 0) {
    list.innerHTML = '<p class="empty-msg">No proxy profiles yet. Click "+ Add Profile" to create one.</p>';
    return;
  }
  list.innerHTML = profiles.map(p => `
    <div class="profile-row">
      <span class="profile-dot" style="background:${safeColor(p.color)}"></span>
      <span class="profile-name">${escHtml(p.name)}</span>
      <span class="profile-meta">${escHtml(p.config.type.toUpperCase())} · ${escHtml(p.config.type === 'pac' ? p.config.pacUrl : `${p.config.host}:${p.config.port}`)}</span>
      <button class="btn-edit" data-id="${escHtml(p.id)}">Edit</button>
    </div>`).join('');
}

function openModal(profileId?: string): void {
  editingId = profileId ?? null;
  byId<HTMLElement>('modalTitle').textContent = editingId ? 'Edit Profile' : 'Add Profile';
  byId<HTMLElement>('deleteProfileBtn').style.display = editingId ? 'inline-block' : 'none';

  const profile = editingId ? profiles.find(p => p.id === editingId) : null;
  byId<HTMLInputElement>('pName').value = profile?.name ?? '';
  byId<HTMLInputElement>('pColor').value = profile ? safeColor(profile.color) : '#0969da';
  byId<HTMLSelectElement>('pType').value = profile?.config.type ?? 'http';
  byId<HTMLInputElement>('pHost').value = profile?.config.host ?? '';
  byId<HTMLInputElement>('pPort').value = String(profile?.config.port ?? '');
  byId<HTMLInputElement>('pPacUrl').value = profile?.config.pacUrl ?? '';
  byId<HTMLInputElement>('pUser').value = profile?.config.auth.username ?? '';
  byId<HTMLInputElement>('pPass').value = profile?.config.auth.password ?? '';
  updateTypeFields();
  byId<HTMLElement>('modalOverlay').style.display = 'flex';
}

function closeModal(): void {
  byId<HTMLElement>('modalOverlay').style.display = 'none';
  editingId = null;
}

function updateTypeFields(): void {
  const type = byId<HTMLSelectElement>('pType').value;
  const isPac = type === 'pac';
  const isSocks = type === 'socks5';
  byId<HTMLElement>('hostPortFields').style.display = isPac ? 'none' : 'flex';
  byId<HTMLElement>('pacFields').style.display = isPac ? 'block' : 'none';
  const hint = document.getElementById('socksAuthHint');
  if (hint) hint.style.display = isSocks ? 'block' : 'none';
}

function showStatus(text: string): void {
  const status = byId<HTMLElement>('saveStatus');
  status.textContent = text;
  setTimeout(() => { if (status.textContent === text) status.textContent = ''; }, 2500);
}

async function saveProfile(): Promise<void> {
  const name = byId<HTMLInputElement>('pName').value.trim();
  if (!name) { alert('Name is required'); return; }
  const type = byId<HTMLSelectElement>('pType').value as ProxyProfile['config']['type'];
  const host = byId<HTMLInputElement>('pHost').value.trim();
  const port = Number(byId<HTMLInputElement>('pPort').value);
  const pacUrl = byId<HTMLInputElement>('pPacUrl').value.trim();
  const user = byId<HTMLInputElement>('pUser').value;
  const error = validateProfile(type, host, port, pacUrl, user);
  if (error) { alert(error); return; }

  const id = editingId ?? generateId();
  const now = new Date().toISOString();
  const latest = (await readData()).profiles;
  const existing = latest.find(p => p.id === id);
  const profile: ProxyProfile = {
    id,
    name,
    description: existing?.description ?? '',
    color: safeColor(byId<HTMLInputElement>('pColor').value),
    config: {
      type,
      host: type === 'pac' ? '' : host,
      port: type === 'pac' ? 0 : port,
      pacUrl: type === 'pac' ? pacUrl : '',
      auth: {
        username: byId<HTMLInputElement>('pUser').value,
        password: byId<HTMLInputElement>('pPass').value,
      },
      bypassList: existing?.config.bypassList ?? [],
      routingRules: existing?.config.routingRules ?? { enabled: false, mode: 'whitelist', domains: [] },
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    tags: existing?.tags ?? [],
  };

  const next = existing ? latest.map(p => p.id === id ? profile : p) : [...latest, profile];
  profiles = (await updateProfiles(next)).profiles;
  renderProfiles();
  closeModal();
  const applied = await notifyProfilesChanged();
  showStatus(applied && !applied.success ? `Saved, but the proxy couldn't be applied: ${applied.error}` : 'Saved ✓');
}

async function deleteProfile(): Promise<void> {
  if (!editingId) return;
  if (!confirm('Delete this profile? This cannot be undone.')) return;
  const id = editingId;
  const latest = (await readData()).profiles;
  // If it was the active profile, the background switches the proxy off.
  profiles = (await updateProfiles(latest.filter(p => p.id !== id))).profiles;
  renderProfiles();
  closeModal();
  await notifyProfilesChanged();
}

function wireEvents(): void {
  byId<HTMLButtonElement>('addProfileBtn').addEventListener('click', () => openModal());
  byId<HTMLButtonElement>('saveProfileBtn').addEventListener('click', () => { void saveProfile(); });
  byId<HTMLButtonElement>('cancelModalBtn').addEventListener('click', closeModal);
  byId<HTMLButtonElement>('deleteProfileBtn').addEventListener('click', () => { void deleteProfile(); });
  byId<HTMLSelectElement>('pType').addEventListener('change', updateTypeFields);
  byId<HTMLElement>('profilesList').addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.btn-edit');
    if (btn?.dataset.id) openModal(btn.dataset.id);
  });
  byId<HTMLElement>('modalOverlay').addEventListener('click', e => {
    if (e.target === byId<HTMLElement>('modalOverlay')) closeModal();
  });
}

document.addEventListener('DOMContentLoaded', () => { void init(); });
