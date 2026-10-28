import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Place, ProxyProfile, WooPortalData } from '../src/types';

const lookup = vi.fn<[], Promise<Place | 'timeout' | null>>();
vi.mock('../src/background/places', () => ({ LOOKUP_HOST: 'ipwho.is', probeLookup: () => lookup() }));
const applyProxy = vi.fn(async (_d: WooPortalData) => ({ success: true }));
vi.mock('../src/background/proxy', async importOriginal => ({
  ...(await importOriginal<typeof import('../src/background/proxy')>()),
  applyProxy: (d: WooPortalData) => applyProxy(d),
}));
let stored: WooPortalData;
vi.mock('../src/lib/storage', () => ({ readData: async () => stored }));

const setProxy = vi.fn(async (_: unknown) => {});
vi.stubGlobal('chrome', { proxy: { settings: { set: (d: unknown) => setProxy(d) } } });

const { answerProbeChallenge, buildProbePac, detectProxyType, noteProxyError, probeOrder } = await import('../src/background/detect');

const place = (ip: string): Place => ({
  ip, city: 'Berlin', country: 'Germany', countryCode: 'DE', lat: 52.5, lon: 13.4,
  timezone: 'Europe/Berlin', locale: 'de-DE', checkedAt: 0,
});
const profile = (config: Partial<ProxyProfile['config']>): ProxyProfile => ({
  id: 'p1', name: 'Active', description: '', color: '#16a34a', createdAt: '', updatedAt: '', tags: [],
  config: {
    type: 'http', host: 'active.example', port: 8080, pacUrl: '', bypassList: [],
    auth: { username: '', password: '' }, routingRules: { enabled: false, mode: 'whitelist', domains: [] }, ...config,
  },
});
const data = (over: Partial<WooPortalData> = {}): WooPortalData => ({
  version: 3, enabled: false, profiles: [], realPlace: place('1.1.1.1'),
  settings: { notifyChange: true, notifyError: true }, ...over,
});
const target = { host: 'Proxy.Example', port: 3128, username: '', password: '' };
/** Which types were tried, read from the PAC scripts that were set. */
const tried = () => setProxy.mock.calls.map(([d]) => {
  const pac = (d as { value: { pacScript: { data: string } } }).value.pacScript.data;
  return /return "(\w+) proxy\.example:3128"/i.exec(pac)?.[1];
});

beforeEach(() => {
  lookup.mockReset();
  applyProxy.mockClear();
  setProxy.mockClear();
  stored = data();
});

describe('probeOrder', () => {
  it('tries HTTP first and skips SOCKS5 when there is a login', () => {
    expect(probeOrder(false)).toEqual(['http', 'socks5', 'https']);
    expect(probeOrder(true)).toEqual(['http', 'https']);
  });
});

describe('buildProbePac', () => {
  it('sends only the lookup host through the candidate', () => {
    const find = new Function(`${buildProbePac('socks5', 'p.example', 1080, 'return "PROXY active.example:8080";')}return FindProxyForURL;`)();
    expect(find('https://ipwho.is/', 'ipwho.is')).toBe('SOCKS5 p.example:1080');
    expect(find('https://example.com/', 'example.com')).toBe('PROXY active.example:8080');
  });
});

describe('detectProxyType', () => {
  it('returns the first type that reaches the lookup, then restores the stored route', async () => {
    lookup.mockResolvedValueOnce(null).mockResolvedValueOnce(place('9.9.9.9'));
    const result = await detectProxyType(target, data());
    expect(result).toEqual({ success: true, type: 'socks5', place: place('9.9.9.9') });
    expect(tried()).toEqual(['PROXY', 'SOCKS5']);
    expect(applyProxy).toHaveBeenCalledWith(stored);
  });

  it('keeps other traffic DIRECT while off and on the active proxy while on', async () => {
    lookup.mockResolvedValue(place('9.9.9.9'));
    await detectProxyType(target, data());
    expect(JSON.stringify(setProxy.mock.calls[0][0])).toContain('return \\"DIRECT\\"');

    setProxy.mockClear();
    const active = profile({});
    await detectProxyType(target, data({ enabled: true, profiles: [active], activeProfileId: active.id }));
    expect(JSON.stringify(setProxy.mock.calls[0][0])).toContain('PROXY active.example:8080');
  });

  it("doesn't count an answer from the user's own IP", async () => {
    lookup.mockResolvedValue(place('1.1.1.1'));
    const result = await detectProxyType(target, data());
    expect(result.success).toBe(false);
    expect(tried()).toEqual(['PROXY', 'SOCKS5', 'HTTPS']);
  });

  it('answers the first auth challenge with the login and reports a rejected one', async () => {
    const answers: unknown[] = [];
    lookup.mockImplementation(async () => {
      answers.push(answerProbeChallenge('proxy.example'), answerProbeChallenge('proxy.example'));
      return null;
    });
    const result = await detectProxyType({ ...target, username: 'alice', password: 's3cret' }, data());
    expect(answers).toEqual([{ authCredentials: { username: 'alice', password: 's3cret' } }, { cancel: true }]);
    expect(result).toEqual({ success: false, error: 'The proxy rejected the username or password.' });
  });

  it('says when a proxy needs a login', async () => {
    lookup.mockImplementation(async () => { answerProbeChallenge('proxy.example'); return null; });
    expect(await detectProxyType(target, data())).toEqual({ success: false, error: 'This proxy needs a username and password.' });
  });

  it('leaves challenges from other proxies alone', () => {
    expect(answerProbeChallenge('proxy.example')).toBeNull();
  });

  it('stops at once when the proxy server cannot be reached', async () => {
    lookup.mockImplementation(async () => { noteProxyError('net::ERR_PROXY_CONNECTION_FAILED'); return null; });
    const result = await detectProxyType(target, data());
    expect(result.error).toMatch(/^Can't connect to Proxy\.Example:3128/);
    expect(tried()).toEqual(['PROXY']);
  });

  it('stops at once on a timeout', async () => {
    lookup.mockResolvedValue('timeout');
    expect((await detectProxyType(target, data())).error).toMatch(/didn't answer/);
    expect(tried()).toEqual(['PROXY']);
  });

  it('explains SOCKS5 when nothing works with a login', async () => {
    lookup.mockResolvedValue(null);
    const result = await detectProxyType({ ...target, username: 'alice', password: 'x' }, data());
    expect(result.error).toMatch(/SOCKS5/);
    expect(tried()).toEqual(['PROXY', 'HTTPS']);
  });

  it("refuses while on with a remote PAC profile, whose route can't be kept", async () => {
    const active = profile({ type: 'pac', pacUrl: 'https://example.com/p.pac' });
    const result = await detectProxyType(target, data({ enabled: true, profiles: [active], activeProfileId: active.id }));
    expect(result.success).toBe(false);
    expect(setProxy).not.toHaveBeenCalled();
  });

  it('restores the stored route even if Chrome refuses the probe', async () => {
    setProxy.mockRejectedValueOnce(new Error('controlled by policy'));
    await expect(detectProxyType(target, data())).rejects.toThrow('controlled by policy');
    expect(applyProxy).toHaveBeenCalled();
  });
});
