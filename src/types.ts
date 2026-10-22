export interface ProxyAuth {
  username: string;
  password: string;
}

export interface RoutingRules {
  enabled: boolean;
  mode: 'whitelist' | 'blacklist';
  domains: string[];
}

export interface ProxyConfig {
  type: 'http' | 'https' | 'socks5' | 'pac';
  host: string;
  port: number;
  auth: ProxyAuth;
  pacUrl: string;
  bypassList: string[];
  routingRules: RoutingRules;
}

export interface ProxyProfile {
  id: string;
  name: string;
  description: string;
  color: string;
  config: ProxyConfig;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export interface GeoSettings {
  enabled: boolean;
  timezone?: string;
  locale?: string;
  lat?: number;
  lon?: number;
  /** Key into LOCATIONS when a preset city is chosen. */
  locationKey?: string;
  /** Display name when the location isn't a preset (e.g. resolved from IP). */
  cityName?: string;
  /** ISO 3166-1 alpha-2 country of the location (drives the toolbar badge). */
  countryCode?: string;
}

export interface WooPortalData {
  version: 3;
  /** Master switch: when false the whole extension is dormant (no geo, proxy released). */
  enabled: boolean;
  /** 'profile' routes traffic through activeProfileId; 'system' leaves the proxy untouched. */
  mode: 'system' | 'profile';
  profiles: ProxyProfile[];
  /** Selected profile. Kept while the master switch is OFF so ON restores it. */
  activeProfileId?: string;
  geo: GeoSettings;
  syncEnabled: boolean;
  /** Country codes the user declined to sync to (capped, most recent last). */
  syncDismissed: string[];
  settings: {
    notifyChange: boolean;
    notifyError: boolean;
  };
}

export type ProxyMode = WooPortalData['mode'];

export interface SyncSuggestion {
  countryCode: string;
  locationKey: string;
  city: string;
  timezone: string;
  locale: string;
  lat: number;
  lon: number;
}

/** Full geolocation resolved from the current outgoing IP address. */
export interface IpLocation {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
  locale: string;
}

// Messages between popup/options and background
export type BgMessage =
  | { type: 'GET_STATE' }
  | { type: 'CHECK_SYNC' }
  | { type: 'SYNC_TO_IP' }
  | { type: 'ENABLE_ALL' }
  | { type: 'DISABLE_ALL' }
  | { type: 'ACTIVATE_PROFILE'; payload: { id: string } }
  | { type: 'DEACTIVATE_PROFILE' }
  | { type: 'SET_GEO'; payload: GeoSettings }
  | { type: 'PROFILES_CHANGED' }
  | { type: 'DISMISS_SYNC_SUGGESTION'; payload: { countryCode: string } }
  | { type: 'ACCEPT_SYNC_SUGGESTION'; payload: SyncSuggestion };

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface BgState {
  enabled: boolean;
  mode: ProxyMode;
  profiles: ProxyProfile[];
  activeProfile: ProxyProfile | null;
  geo: GeoSettings;
}
