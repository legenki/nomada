import type { ActionResult, ProxyProfile, WooPortalData } from '../types';

function generatePAC(profile: ProxyProfile): string {
  const { type, host, port } = profile.config;
  const { domains, mode } = profile.config.routingRules;
  // JSON.stringify quotes/escapes values so user input can't break out of the PAC source.
  const proxyStr = JSON.stringify(`${type === 'socks5' ? 'SOCKS5' : 'PROXY'} ${host}:${port}`);
  const list = JSON.stringify(domains);
  if ((mode ?? 'whitelist') === 'whitelist') {
    return `function FindProxyForURL(url,host){var w=${list};for(var i=0;i<w.length;i++){if(shExpMatch(host,w[i]))return ${proxyStr};}return "DIRECT";}`;
  }
  return `function FindProxyForURL(url,host){var b=${list};for(var i=0;i<b.length;i++){if(shExpMatch(host,b[i]))return "DIRECT";}return ${proxyStr};}`;
}

function toPacUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t) || /^file:\/\//i.test(t)) return t;
  if (/^[a-zA-Z]:[\\/]/.test(t)) return 'file:///' + t.replace(/\\/g, '/');
  if (t.startsWith('/')) return 'file://' + t;
  return null;
}

/** Translate a profile into a chrome.proxy config, or throw a user-facing error. */
export function buildProxyConfig(profile: ProxyProfile): chrome.proxy.ProxyConfig {
  const { type, host, port, routingRules } = profile.config;
  if (type === 'pac') {
    const url = toPacUrl(profile.config.pacUrl);
    if (!url) throw new Error('Invalid PAC URL');
    return { mode: 'pac_script', pacScript: { url } };
  }
  if (!host) throw new Error('Proxy host is missing');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Proxy port must be 1–65535');
  if (routingRules?.enabled && routingRules.domains.length > 0) {
    return { mode: 'pac_script', pacScript: { data: generatePAC(profile) } };
  }
  return { mode: 'fixed_servers', rules: { singleProxy: { scheme: type, host, port } } };
}

export function activeProfileOf(data: WooPortalData): ProxyProfile | undefined {
  if (!data.enabled || data.mode !== 'profile' || !data.activeProfileId) return undefined;
  return data.profiles.find(p => p.id === data.activeProfileId);
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
    if (profile) {
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
