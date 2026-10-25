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

/** Where an IP address is, as reported by the IP lookup service. */
export interface Place {
  ip: string;
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  timezone: string;
  /** Locale a browser in that country would use; drives language + formatting. */
  locale: string;
  /** When the lookup happened (ms since epoch). */
  checkedAt: number;
}

/** The exit location of a proxy profile — what sites see while it's active. */
export interface ProxyPlace extends Place {
  profileId: string;
}

export interface WooPortalData {
  version: 3;
  /** Master switch: ON routes traffic through the selected proxy and matches its location. */
  enabled: boolean;
  profiles: ProxyProfile[];
  /** Selected profile. Kept while OFF so turning ON reconnects to it. */
  activeProfileId?: string;
  /** The user's own location (looked up while not proxied). */
  realPlace?: Place;
  /** Location of the selected proxy's exit IP. */
  proxyPlace?: ProxyPlace;
  settings: {
    notifyChange: boolean;
    notifyError: boolean;
  };
}

/** Values the page-level spoofing script applies. */
export interface SpoofConfig {
  timezone: string;
  locale: string;
  languages: string[];
  lat: number;
  lon: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

// Messages between popup/options and background
export type BgMessage =
  | { type: 'GET_STATE' }
  | { type: 'REFRESH_PLACE' }
  | { type: 'ENABLE' }
  | { type: 'DISABLE' }
  | { type: 'SELECT_PROFILE'; payload: { id: string } }
  | { type: 'PROFILES_CHANGED' };

export interface BgState {
  enabled: boolean;
  profiles: ProxyProfile[];
  activeProfile: ProxyProfile | null;
  /** True once traffic goes through the proxy and the page identity matches its location. */
  protected: boolean;
  realPlace: Place | null;
  /** Proxy exit location for the selected profile (null if unknown yet). */
  proxyPlace: ProxyPlace | null;
}
