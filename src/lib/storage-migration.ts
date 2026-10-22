import type { WooPortalData, GeoSettings } from '../types';

export const SCHEMA_VERSION = 3 as const;

/** Max remembered "Not now" answers to sync suggestions. */
export const MAX_SYNC_DISMISSED = 50;

const DEFAULT_GEO: GeoSettings = { enabled: false };

// A fresh install starts OFF: nothing is spoofed until the user picks a place,
// so the switch never claims protection that isn't there.
const DEFAULT_DATA: WooPortalData = {
  version: 3,
  enabled: false,
  mode: 'system',
  profiles: [],
  activeProfileId: undefined,
  geo: DEFAULT_GEO,
  syncEnabled: true,
  syncDismissed: [],
  settings: { notifyChange: true, notifyError: true },
};

/** Older builds stored "profileId:CC" pairs; keep only unique country codes. */
function normalizeDismissed(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const codes = raw
    .filter((d): d is string => typeof d === 'string')
    .map(d => d.split(':').pop()!.toUpperCase())
    .filter(Boolean);
  return [...new Set(codes)].slice(-MAX_SYNC_DISMISSED);
}

export function migrateData(raw: unknown): WooPortalData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DATA, geo: { ...DEFAULT_GEO } };

  const data = raw as Record<string, unknown>;
  const profiles = Array.isArray(data.profiles) ? data.profiles as WooPortalData['profiles'] : [];
  const hasProfile = (id: unknown) => typeof id === 'string' && profiles.some(p => p?.id === id);

  // Installs that predate the master switch were effectively always ON.
  const enabled = data.enabled === undefined ? true : !!data.enabled;

  // Older builds cleared the profile on OFF and parked it in lastProfileId;
  // now OFF keeps the selection, so move it back.
  let activeProfileId = data.activeProfileId;
  let rawMode = data.mode;
  if (!enabled && rawMode !== 'profile' && hasProfile(data.lastProfileId)) {
    rawMode = 'profile';
    activeProfileId = data.lastProfileId;
  }

  // 'direct' was removed as a mode; anything other than a valid profile is 'system'.
  const mode: WooPortalData['mode'] =
    rawMode === 'profile' && hasProfile(activeProfileId) ? 'profile' : 'system';

  const migrated: WooPortalData & { lastProfileId?: unknown } = {
    ...DEFAULT_DATA,
    ...(data as Partial<WooPortalData>),
    version: SCHEMA_VERSION,
    enabled,
    mode,
    profiles,
    activeProfileId: mode === 'profile' ? activeProfileId as string : undefined,
    geo: { ...DEFAULT_GEO, ...(data.geo as GeoSettings | undefined) },
    syncDismissed: normalizeDismissed(data.syncDismissed),
  };
  delete migrated.lastProfileId;
  return migrated;
}
