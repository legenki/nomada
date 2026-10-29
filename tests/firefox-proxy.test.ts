import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProxyProfile, WooPortalData } from '../src/types';

let stored: WooPortalData;
const readData = vi.fn(async () => stored);
vi.mock('../src/lib/storage', () => ({ readData: () => readData() }));

type Listener = (d: chrome.proxy.FirefoxRequestDetails) => Promise<chrome.proxy.FirefoxProxyAnswer>;
let onRequest: Listener | undefined;
vi.stubGlobal('chrome', { proxy: { onRequest: { addListener: (l: Listener) => { onRequest = l; } } } });

const { installFirefoxProxy, proxyInfoFor, routeRequest, setFirefoxRoute } = await import('../src/background/firefox-proxy');
const { setProbe } = await import('../src/background/probe-state');

const profile = (config: Partial<ProxyProfile['config']> = {}): ProxyProfile => ({
  id: 'p1', name: 'Berlin', description: '', color: '', createdAt: '', updatedAt: '', tags: [],
  config: {
    type: 'http', host: 'proxy.example', port: 3128, pacUrl: '', bypassList: [],
    auth: { username: '', password: '' }, routingRules: { enabled: false, mode: 'whitelist', domains: [] }, ...config,
  },
});
const data = (enabled: boolean, p = profile()): WooPortalData => ({
  version: 3, enabled, profiles: [p], activeProfileId: p.id, settings: { notifyChange: true, notifyError: true },
});
const request = (url: string, tabId = 3) => onRequest!({ requestId: '1', url, tabId });

describe('proxyInfoFor', () => {
  it('describes HTTP and HTTPS proxies', () => {
    expect(proxyInfoFor('http', 'h', 1, { username: 'a', password: 'b' })).toEqual({ type: 'http', host: 'h', port: 1 });
    expect(proxyInfoFor('https', 'h', 2, { username: '', password: '' })).toEqual({ type: 'https', host: 'h', port: 2 });
  });

  it('logs in to SOCKS5 itself and resolves names through it', () => {
    expect(proxyInfoFor('socks5', 'h', 1080, { username: 'alice', password: 's3cret' }))
      .toEqual({ type: 'socks', host: 'h', port: 1080, proxyDNS: true, username: 'alice', password: 's3cret' });
    expect(proxyInfoFor('socks5', 'h', 1080, { username: '', password: '' }))
      .toEqual({ type: 'socks', host: 'h', port: 1080, proxyDNS: true });
  });
});

describe('routeRequest', () => {
  it("leaves requests to the browser's own setting when no proxy is active", () => {
    expect(routeRequest(undefined, 'example.com')).toBeUndefined();
  });

  it('sends requests through the active proxy and never fails over to a direct connection', () => {
    expect(routeRequest(profile(), 'example.com')).toEqual([{ type: 'http', host: 'proxy.example', port: 3128 }, null]);
  });

  it('follows routing rules', () => {
    const only = profile({ routingRules: { enabled: true, mode: 'whitelist', domains: ['*.example.com'] } });
    expect(routeRequest(only, 'www.example.com')).toEqual([{ type: 'http', host: 'proxy.example', port: 3128 }, null]);
    expect(routeRequest(only, 'other.org')).toEqual({ type: 'direct' });
    const except = profile({ routingRules: { enabled: true, mode: 'blacklist', domains: ['intranet?'] } });
    expect(routeRequest(except, 'intranet1')).toEqual({ type: 'direct' });
    expect(routeRequest(except, 'example.com')).toEqual([{ type: 'http', host: 'proxy.example', port: 3128 }, null]);
  });
});

describe('installFirefoxProxy', () => {
  beforeEach(() => {
    readData.mockClear();
    setProbe(null);
  });

  it('reads the active proxy from storage after the page wakes, then answers from memory', async () => {
    stored = data(true);
    installFirefoxProxy();
    expect(await request('https://example.com/')).toEqual([{ type: 'http', host: 'proxy.example', port: 3128 }, null]);
    await request('https://example.org/');
    expect(readData).toHaveBeenCalledTimes(1);
  });

  it('follows the route it was last given', async () => {
    installFirefoxProxy();
    setFirefoxRoute(undefined);
    expect(await request('https://example.com/')).toBeUndefined();
    setFirefoxRoute(profile({ type: 'socks5', port: 1080 }));
    expect(await request('https://example.com/')).toEqual([{ type: 'socks', host: 'proxy.example', port: 1080, proxyDNS: true }, null]);
  });

  it("sends only an Auto check's own lookup through the proxy being checked", async () => {
    installFirefoxProxy();
    setFirefoxRoute(undefined);
    setProbe({ type: 'socks5', host: 'candidate.example', port: 1080, username: 'alice', password: 'x', challenges: 0 });
    expect(await request('https://ipwho.is/?_=1', -1)).toEqual([
      { type: 'socks', host: 'candidate.example', port: 1080, proxyDNS: true, username: 'alice', password: 'x' }, null,
    ]);
    expect(await request('https://ipwho.is/?_=1', 7)).toBeUndefined(); // a page's request
    expect(await request('https://example.com/', -1)).toBeUndefined();
  });
});
