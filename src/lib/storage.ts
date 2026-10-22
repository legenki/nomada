import type { WooPortalData, ProxyProfile } from '../types';
import { migrateData, SCHEMA_VERSION } from './storage-migration';

// Kept from the wooPortal era: renaming it would orphan existing users' settings.
const STORAGE_KEY = 'wooportal-data';

export async function readData(): Promise<WooPortalData> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return migrateData(result[STORAGE_KEY]);
}

export async function writeData(data: WooPortalData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...data, version: SCHEMA_VERSION } });
}

/**
 * Read-modify-write against the latest stored state. Pages that stay open (the
 * options page) must use this instead of writing back a stale snapshot.
 */
export async function updateData(fn: (data: WooPortalData) => WooPortalData): Promise<WooPortalData> {
  const next = fn(await readData());
  await writeData(next);
  return next;
}

export function updateProfiles(profiles: ProxyProfile[]): Promise<WooPortalData> {
  return updateData(data => ({ ...data, profiles }));
}
