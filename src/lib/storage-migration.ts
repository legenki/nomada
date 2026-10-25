import type { WooPortalData } from '../types';

export const SCHEMA_VERSION = 3 as const;

// A fresh install starts OFF: nothing changes until the user adds a proxy and switches on.
const DEFAULT_DATA: WooPortalData = {
  version: 3,
  enabled: false,
  profiles: [],
  activeProfileId: undefined,
  realPlace: undefined,
  proxyPlace: undefined,
  settings: { notifyChange: true, notifyError: true },
};

// Fields from earlier builds (manual city picker, sync suggestions, mode switch).
const RETIRED_KEYS = ['mode', 'lastProfileId', 'geo', 'syncEnabled', 'syncDismissed'] as const;

export function migrateData(raw: unknown): WooPortalData {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DATA };

  const data = raw as Record<string, unknown>;
  const profiles = Array.isArray(data.profiles) ? data.profiles as WooPortalData['profiles'] : [];
  const hasProfile = (id: unknown) => typeof id === 'string' && profiles.some(p => p?.id === id);

  // Older builds cleared the profile on OFF and parked it in lastProfileId.
  const selected = [data.activeProfileId, data.lastProfileId].find(hasProfile) as string | undefined;

  const migrated: Record<string, unknown> = {
    ...DEFAULT_DATA,
    ...data,
    version: SCHEMA_VERSION,
    // Installs that predate the master switch were effectively always ON.
    enabled: (data.enabled === undefined ? true : !!data.enabled) && !!selected,
    profiles,
    activeProfileId: selected,
  };
  for (const key of RETIRED_KEYS) delete migrated[key];

  const proxyPlace = migrated.proxyPlace as WooPortalData['proxyPlace'];
  if (proxyPlace && proxyPlace.profileId !== selected) delete migrated.proxyPlace;
  return migrated as unknown as WooPortalData;
}
