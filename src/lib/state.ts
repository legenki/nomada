import type { GeoSettings, WooPortalData } from '../types';

/** True when the geo settings name an actual place to emulate. */
export function hasGeoTarget(geo: GeoSettings): boolean {
  return !!(geo.timezone || geo.locale || (geo.lat !== undefined && geo.lon !== undefined));
}

/** Location spoofing is live: master switch ON, geo enabled and a place chosen. */
export function isGeoActive(data: Pick<WooPortalData, 'enabled' | 'geo'>): boolean {
  return data.enabled && data.geo.enabled && hasGeoTarget(data.geo);
}
