import type { ProxyPlace, ProxyProfile, WooPortalData } from '../types';

export function selectedProfileOf(data: Pick<WooPortalData, 'profiles' | 'activeProfileId'>): ProxyProfile | undefined {
  return data.activeProfileId ? data.profiles.find(p => p.id === data.activeProfileId) : undefined;
}

/** The profile carrying traffic right now (master switch ON + a valid selection). */
export function activeProfileOf(data: WooPortalData): ProxyProfile | undefined {
  return data.enabled ? selectedProfileOf(data) : undefined;
}

/** The proxy's exit location, if it belongs to the selected profile. */
export function proxyPlaceOf(data: WooPortalData): ProxyPlace | undefined {
  const p = data.proxyPlace;
  return p && p.profileId === data.activeProfileId ? p : undefined;
}

/** Traffic is proxied and the page identity has been matched to the proxy's location. */
export function isProtected(data: WooPortalData): boolean {
  return !!activeProfileOf(data) && !!proxyPlaceOf(data);
}
