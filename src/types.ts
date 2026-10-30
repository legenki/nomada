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

export interface Country {
  /** ISO 3166-1 alpha-2, upper case. */
  code: string;
  name: string;
  /** Where the exit IP is, once looked up (public proxies only know their country). */
  lat?: number;
  lon?: number;
}

export interface ProxyProfile {
  id: string;
  name: string;
  description: string;
  /** No longer shown (the card takes its colour from the flag); kept for stored data. */
  color: string;
  config: ProxyConfig;
  /** Country of the proxy's exit IP, remembered from the last lookup or check. */
  exitCountry?: Country;
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

/** Moving to the next proxy when the one in use stops answering. */
export interface FailoverState {
  enabled: boolean;
  /** Profile ids, first choice first. Profiles missing here come last. */
  order: string[];
  /** Proxies that didn't answer last time they were tried. */
  down: string[];
  /** The last automatic move (profile ids), for the popup to mention. */
  moved?: { from: string; to: string };
  /** Every proxy is silent: Nomada stays on and traffic is blocked rather than exposed. */
  exhausted?: boolean;
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
  failover?: FailoverState;
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

/** A public proxy that the list checker (tools/proxy-list) found working. */
export interface PublicProxy {
  type: 'http' | 'socks5';
  host: string;
  port: number;
  /** ISO 3166-1 alpha-2 of the exit IP. */
  country: string;
  /** Round trip measured by the checker (not from the user's connection). */
  ms: number;
}

/** proxies.json, published by the checker. */
export interface PublicList {
  updatedAt: string;
  source: string;
  proxies: PublicProxy[];
}

/** A proxy server to test before saving it. */
export interface ProbeTarget {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface DetectResult extends ActionResult {
  /** The type that carried the test request. */
  type?: Exclude<ProxyConfig['type'], 'pac'>;
  /** Where the proxy's exit IP is. */
  place?: Place;
}

// Messages between popup/options and background
export type BgMessage =
  | { type: 'GET_STATE' }
  | { type: 'REFRESH_PLACE' }
  | { type: 'ENABLE' }
  | { type: 'DISABLE' }
  | { type: 'SELECT_PROFILE'; payload: { id: string } }
  | { type: 'PROFILES_CHANGED' }
  | { type: 'DETECT_PROXY'; payload: ProbeTarget }
  | { type: 'SET_FAILOVER'; payload: { enabled?: boolean; order?: string[] } }
  | { type: 'RETRY_FAILOVER' };

export interface BgState {
  failover: {
    enabled: boolean;
    /** Profile ids taking part, in order. */
    chain: string[];
    down: string[];
    /** Names, for the popup's note. */
    moved: { from: string; to: string } | null;
    exhausted: boolean;
  };
  enabled: boolean;
  profiles: ProxyProfile[];
  activeProfile: ProxyProfile | null;
  /** True once traffic goes through the proxy and the page identity matches its location. */
  protected: boolean;
  realPlace: Place | null;
  /** Proxy exit location for the selected profile (null if unknown yet). */
  proxyPlace: ProxyPlace | null;
}
