import { languagesFor } from '../lib/country-locales';
import { isProtected, proxyPlaceOf } from '../lib/state';
import type { Place, SpoofConfig, WooPortalData } from '../types';

export const PLACE_TTL_MS = 10 * 60 * 1000;

export function isFresh(p: Place | undefined): boolean {
  return !!p && Date.now() - p.checkedAt < PLACE_TTL_MS;
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
