import { languagesFor } from '../lib/country-locales';
import { isProtected, proxyPlaceOf } from '../lib/state';
import type { Place, SpoofConfig, WooPortalData } from '../types';

export const PLACE_TTL_MS = 10 * 60 * 1000;

export function isFresh(p: Place | undefined): boolean {
  return !!p && Date.now() - p.checkedAt < PLACE_TTL_MS;
}

/** Store where a profile's proxy exits, and remember that country on the profile. */
export function withProxyPlace(data: WooPortalData, profileId: string, place: Place): WooPortalData {
  const country = place.countryCode ? { code: place.countryCode, name: place.country } : undefined;
  return {
    ...data,
    proxyPlace: { ...place, profileId },
    profiles: country
      ? data.profiles.map(p => (p.id === profileId ? { ...p, exitCountry: country } : p))
      : data.profiles,
  };
}

export function spoofConfigOf(data: WooPortalData): SpoofConfig | null {
  if (!data.enabled) return null;
  // Use current profile's location if available, or keep existing proxyPlace during profile switch
  const place = isProtected(data) ? proxyPlaceOf(data) : data.proxyPlace;
  if (!place) return null;
  return {
    timezone: place.timezone,
    locale: place.locale,
    languages: languagesFor(place.locale),
    lat: place.lat,
    lon: place.lon,
  };
}
