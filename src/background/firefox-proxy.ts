import type { ProxyAuth, ProxyConfig, ProxyProfile } from '../types';
import { activeProfileOf } from '../lib/state';
import { readData } from '../lib/storage';
import { LOOKUP_HOST } from './places';
import { activeProbe } from './probe-state';

// Firefox routes each request through proxy.onRequest instead of a browser-wide
// proxy setting. The listener is a persistent event: Firefox wakes the
// background page for it, so routing survives the page being unloaded.

type Answer = chrome.proxy.FirefoxProxyAnswer;

/** One proxy server as Firefox's ProxyInfo. */
export function proxyInfoFor(
  type: Exclude<ProxyConfig['type'], 'pac'>,
  host: string,
  port: number,
  auth: ProxyAuth,
): chrome.proxy.FirefoxProxyInfo {
  if (type !== 'socks5') return { type, host, port };
  // Firefox logs in to SOCKS5 itself, and resolves names through the proxy so
  // DNS lookups don't leave from the real connection.
  return { type: 'socks', host, port, proxyDNS: true, ...(auth.username ? { username: auth.username, password: auth.password } : {}) };
}

/** PAC's shExpMatch: `*` and `?` wildcards over the whole host. */
function hostMatches(host: string, pattern: string): boolean {
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${re}$`, 'i').test(host);
}

/**
 * Where a request to `host` goes. Nothing active: the browser's own setting,
 * as if Nomada weren't installed. Otherwise the profile's proxy with no
 * failover, so a dead proxy fails the request instead of leaking it.
 */
export function routeRequest(profile: ProxyProfile | undefined, host: string): Answer {
  if (!profile || profile.config.type === 'pac') return undefined;
  const { type, host: proxyHost, port, auth, routingRules } = profile.config;
  if (routingRules?.enabled && routingRules.domains.length > 0) {
    const listed = routingRules.domains.some(d => hostMatches(host, d));
    if (listed !== ((routingRules.mode ?? 'whitelist') === 'whitelist')) return { type: 'direct' };
  }
  return [proxyInfoFor(type, proxyHost, port, auth), null];
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

// The active profile, kept in memory so each request is answered at once.
// Empty after the page wakes until storage has been read again.
let active: ProxyProfile | undefined;
let loaded: Promise<void> | undefined;
let routeVersion = 0;

/** Route requests through `profile` from now on (undefined: Nomada is off). */
export function setFirefoxRoute(profile: ProxyProfile | undefined): void {
  active = profile;
  routeVersion++;
  loaded = Promise.resolve();
}

function loadRoute(): Promise<void> {
  const version = routeVersion;
  return readData().then(data => {
    // A route set while storage was being read is newer than what was read.
    if (version === routeVersion) active = activeProfileOf(data);
  });
}

export function installFirefoxProxy(): void {
  chrome.proxy.onRequest.addListener(async details => {
    const probe = activeProbe();
    // An Auto check's own lookup (from the background, not a tab) goes through
    // the proxy being checked; nothing else does.
    if (probe && details.tabId === -1 && hostOf(details.url) === LOOKUP_HOST) {
      return [proxyInfoFor(probe.type, probe.host, probe.port, probe), null];
    }
    loaded ??= loadRoute();
    await loaded;
    return routeRequest(active, hostOf(details.url));
  }, { urls: ['<all_urls>'] });
}
