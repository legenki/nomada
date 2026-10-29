import type { ActionResult, ProxyConfig, ProxyProfile, WooPortalData } from '../types';
import { activeProfileOf } from '../lib/state';
import { setFirefoxRoute } from './firefox-proxy';

/** A PAC route to one proxy server, e.g. `PROXY host:port`. */
export function pacRoute(type: Exclude<ProxyConfig['type'], 'pac'>, host: string, port: number): string {
  return `${type === 'socks5' ? 'SOCKS5' : type === 'https' ? 'HTTPS' : 'PROXY'} ${host}:${port}`;
}

/**
 * The body of `FindProxyForURL(url, host)` that routes the way `profile` does,
 * or null for a remote PAC script, whose logic can't be inlined.
 */
export function routeBody(profile: ProxyProfile): string | null {
  const { type, host, port, routingRules } = profile.config;
  if (type === 'pac') return null;
  // JSON.stringify quotes/escapes values so user input can't break out of the PAC source.
  const proxyStr = JSON.stringify(pacRoute(type, host, port));
  if (!routingRules?.enabled || routingRules.domains.length === 0) return `return ${proxyStr};`;
  const list = JSON.stringify(routingRules.domains);
  if ((routingRules.mode ?? 'whitelist') === 'whitelist') {
    return `var w=${list};for(var i=0;i<w.length;i++){if(shExpMatch(host,w[i]))return ${proxyStr};}return "DIRECT";`;
  }
  return `var b=${list};for(var i=0;i<b.length;i++){if(shExpMatch(host,b[i]))return "DIRECT";}return ${proxyStr};`;
}

function generatePAC(profile: ProxyProfile): string {
  return `function FindProxyForURL(url,host){${routeBody(profile)}}`;
}

function toPacUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /^file:\/\//i.test(t)) return t;
  if (/^[a-zA-Z]:[\\/]/.test(t)) return 'file:///' + t.replace(/\\/g, '/');
  if (t.startsWith('/')) return 'file://' + t;
  return null;
}

/** Throw a user-facing error if the profile's proxy server can't be used. */
function checkServer({ host, port }: ProxyConfig): void {
  if (!host) throw new Error('Proxy host is missing');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Proxy port must be 1–65535');
}

/** Translate a profile into a chrome.proxy config, or throw a user-facing error. */
export function buildProxyConfig(profile: ProxyProfile): chrome.proxy.ProxyConfig {
  const { type, host, port, routingRules } = profile.config;
  if (type === 'pac') {
    const url = toPacUrl(profile.config.pacUrl);
    if (!url) throw new Error('Invalid PAC URL');
    return { mode: 'pac_script', pacScript: { url } };
  }
  checkServer(profile.config);
  if (routingRules?.enabled && routingRules.domains.length > 0) {
    return { mode: 'pac_script', pacScript: { data: generatePAC(profile) } };
  }
  return { mode: 'fixed_servers', rules: { singleProxy: { scheme: type, host, port } } };
}

/**
 * Make Chrome's proxy match the stored state. With no active profile the
 * setting is released (clear), not forced to "system": OFF must behave as if
 * the extension weren't installed and leave room for other proxy tools.
 * `set` replaces the previous config atomically — clearing first would let
 * traffic escape the proxy for a moment.
 */
export async function applyProxy(data: WooPortalData): Promise<ActionResult> {
  const profile = activeProfileOf(data);
  try {
    if (__TARGET__ === 'firefox') {
      // Firefox asks proxy.onRequest about every request (firefox-proxy.ts).
      if (profile?.config.type === 'pac') throw new Error("Firefox can't use PAC-script proxies — pick HTTP, HTTPS or SOCKS5");
      if (profile) checkServer(profile.config);
      setFirefoxRoute(profile);
    } else if (profile) {
      await chrome.proxy.settings.set({ value: buildProxyConfig(profile), scope: 'regular' });
    } else {
      await chrome.proxy.settings.clear({ scope: 'regular' });
    }
    await applyWebRtcPolicy(!!profile);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * While a proxy is active, stop WebRTC from opening direct UDP paths that would
 * reveal the real IP behind the proxy.
 */
async function applyWebRtcPolicy(proxyActive: boolean): Promise<void> {
  const setting = chrome.privacy.network.webRTCIPHandlingPolicy;
  try {
    if (proxyActive) {
      await setting.set({ value: 'disable_non_proxied_udp' });
    } else {
      await setting.clear({});
    }
  } catch {
    // Controlled by policy or another extension — nothing we can do.
  }
}
