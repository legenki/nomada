import { describe, it, expect, vi } from 'vitest';
import { migrateData } from '../src/lib/storage-migration';
import {
  createFailover, failoverChain, isProxyFailure, nextCandidates, withDirect, withFailoverSettings,
} from '../src/background/failover';
import type { Place, ProxyProfile, ProxyConfig, WooPortalData } from '../src/types';

const profile = (id: string, type: ProxyConfig['type'] = 'http'): ProxyProfile => ({
  id, name: id.toUpperCase(), description: '', color: '', createdAt: '', updatedAt: '', tags: [],
  config: {
    type, host: `${id}.example`, port: 8080, pacUrl: '', bypassList: [],
    auth: { username: '', password: '' }, routingRules: { enabled: false, mode: 'whitelist', domains: [] },
  },
});
const place = (ip: string): Place => ({
  ip, city: `City ${ip}`, country: 'Land', countryCode: 'DE', lat: 1, lon: 2,
  timezone: 'UTC', locale: 'de-DE', checkedAt: 0,
});
const a = profile('a'), b = profile('b'), c = profile('c');

const on = (over: Partial<WooPortalData> = {}): WooPortalData => ({
  version: 3, enabled: true, profiles: [a, b, c], activeProfileId: 'a',
  proxyPlace: { ...place('10.0.0.1'), profileId: 'a' }, realPlace: place('1.1.1.1'),
  failover: { enabled: true, order: ['a', 'b', 'c'], down: [] },
  settings: { notifyChange: true, notifyError: true }, ...over,
});

/** A failover over in-memory storage; reads go through the real migration, as in the extension. */
function harness(start: WooPortalData, answers: Record<string, Place | null>, over: { online?: boolean; probing?: boolean } = {}) {
  let stored = start;
  const tried: string[] = [];
  let now = 1_000_000;
  const lookup = vi.fn(async () => {
    const id = migrateData(stored).activeProfileId!;
    tried.push(id);
    return answers[id] ?? null;
  });
  const failover = createFailover({
    read: async () => migrateData(stored),
    commit: async update => { stored = update(migrateData(stored)); return { success: true }; },
    lookup,
    isOnline: () => over.online ?? true,
    probing: () => over.probing ?? false,
    now: () => now,
    wait: async () => {},
  });
  return {
    failover, lookup, tried,
    state: () => migrateData(stored),
    raw: () => stored,
    set: (next: WooPortalData) => { stored = next; },
    advance: (ms: number) => { now += ms; },
  };
}

describe('failoverChain / nextCandidates', () => {
  it('follows the saved order, adds the rest, and leaves PAC out', () => {
    const pac = profile('p', 'pac');
    const d = on({ profiles: [a, b, pac, c], failover: { enabled: true, order: ['c', 'gone', 'a'], down: [] } });
    expect(failoverChain(d).map(p => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('tries the proxies after the active one, then wraps round', () => {
    expect(nextCandidates([a, b, c], 'b').map(p => p.id)).toEqual(['c', 'a']);
    expect(nextCandidates([a, b, c], 'x').map(p => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('isProxyFailure', () => {
  it('accepts connection-level errors and ignores the rest', () => {
    for (const e of ['NS_ERROR_PROXY_CONNECTION_REFUSED', 'NS_ERROR_UNKNOWN_PROXY_HOST', 'NS_ERROR_NET_TIMEOUT', 'NS_ERROR_NET_RESET', 'NS_ERROR_CONNECTION_REFUSED']) {
      expect(isProxyFailure(e), e).toBe(true);
    }
    for (const e of ['NS_BINDING_ABORTED', 'NS_ERROR_ABORT', 'NS_ERROR_NET_ON_RESOLVED']) expect(isProxyFailure(e), e).toBe(false);
  });
});

describe('onFailure', () => {
  it('stays put when the proxy answers: one error may be just one site', async () => {
    const h = harness(on(), { a: place('10.0.0.1') });
    await h.failover.onFailure();
    expect(h.state().activeProfileId).toBe('a');
    expect(h.tried).toEqual(['a']);
  });

  it('gives the proxy a second chance before moving on', async () => {
    const h = harness(on(), { a: null, b: place('10.0.0.2') });
    h.lookup.mockImplementationOnce(async () => null).mockImplementationOnce(async () => place('10.0.0.1'));
    await h.failover.onFailure();
    expect(h.state().activeProfileId).toBe('a');
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });

  it('moves to the next proxy and takes its identity', async () => {
    const h = harness(on(), { a: null, b: place('10.0.0.2') });
    await h.failover.onFailure();
    const d = h.state();
    expect(d.activeProfileId).toBe('b');
    expect(d.proxyPlace).toMatchObject({ ip: '10.0.0.2', profileId: 'b' });
    expect(d.failover).toMatchObject({ down: ['a'], moved: { from: 'a', to: 'b' } });
    expect(d.failover?.exhausted).toBeFalsy();
  });

  it('skips silent backups', async () => {
    const h = harness(on(), { a: null, b: null, c: place('10.0.0.3') });
    await h.failover.onFailure();
    expect(h.state().activeProfileId).toBe('c');
    expect(h.state().failover?.down).toEqual(['a', 'b']);
  });

  it('stays on with the old identity when every proxy is silent, so nothing leaves directly', async () => {
    const h = harness(on(), { a: null, b: null, c: null });
    const result = await h.failover.onFailure();
    const d = h.state();
    expect(d.enabled).toBe(true);
    expect(d.activeProfileId).toBe('a');
    expect(d.proxyPlace).toMatchObject({ ip: '10.0.0.1', profileId: 'a' });
    expect(d.failover).toMatchObject({ exhausted: true, down: ['a', 'b', 'c'] });
    expect(result?.success).toBe(false);
  });

  it('does nothing in Single mode, on Direct, during an Auto check or offline', async () => {
    const answers = { a: null, b: place('10.0.0.2') };
    for (const h of [
      harness(on({ failover: { enabled: false, order: [], down: [] } }), answers),
      harness(on({ enabled: false }), answers),
      harness(on(), answers, { probing: true }),
    ]) {
      await h.failover.onFailure();
      expect(h.lookup).not.toHaveBeenCalled();
    }
    const offline = harness(on(), answers, { online: false });
    await offline.failover.onFailure();
    expect(offline.state().activeProfileId).toBe('a');
  });

  it('checks at most once in 30 seconds, and not at all once every proxy failed', async () => {
    const h = harness(on(), { a: place('10.0.0.1') });
    await h.failover.onFailure();
    await h.failover.onFailure();
    expect(h.lookup).toHaveBeenCalledTimes(1);
    h.advance(30_001);
    await h.failover.onFailure();
    expect(h.lookup).toHaveBeenCalledTimes(2);

    const done = harness(on({ failover: { enabled: true, order: [], down: [], exhausted: true } }), {});
    await done.failover.onFailure();
    expect(done.lookup).not.toHaveBeenCalled();
  });

  it('stops when the user switches to Direct in the middle', async () => {
    const h = harness(on(), { a: null, b: null, c: place('10.0.0.3') });
    h.lookup.mockImplementationOnce(async () => null).mockImplementationOnce(async () => null).mockImplementationOnce(async () => {
      h.set({ ...h.raw(), enabled: false });
      return null;
    });
    await h.failover.onFailure();
    expect(h.state().enabled).toBe(false);
    expect(h.tried).not.toContain('c');
  });
});

describe('moveOn right after choosing Proxy', () => {
  it('stays off when nothing answers', async () => {
    const h = harness(on({ proxyPlace: undefined }), { a: null, b: null, c: null });
    const result = await h.failover.moveOn('a', { offIfAllDown: true });
    expect(h.state().enabled).toBe(false);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/stayed off/) });
    expect(h.state().failover?.exhausted).toBeFalsy();
  });
});

describe('retry', () => {
  it('starts again from the first proxy and clears the warning', async () => {
    const h = harness(on({ failover: { enabled: true, order: ['a', 'b', 'c'], down: ['a', 'b', 'c'], exhausted: true } }), { a: null, b: place('10.0.0.2') });
    expect(await h.failover.retry()).toEqual({ success: true });
    expect(h.state().activeProfileId).toBe('b');
    expect(h.state().failover?.exhausted).toBeFalsy();
  });

  it('keeps the warning and the identity if they are all still silent', async () => {
    const h = harness(on({ failover: { enabled: true, order: ['a', 'b', 'c'], down: ['a', 'b', 'c'], exhausted: true } }), {});
    expect((await h.failover.retry()).success).toBe(false);
    expect(h.state().failover?.exhausted).toBe(true);
    expect(h.state().proxyPlace).toMatchObject({ profileId: 'a' });
  });
});

describe('withDirect / withFailoverSettings', () => {
  it('Direct forgets what failed and goes back to the first proxy', () => {
    const d = withDirect(on({ activeProfileId: 'c', failover: { enabled: true, order: ['b', 'a', 'c'], down: ['a'], moved: { from: 'a', to: 'c' } } }));
    expect(d).toMatchObject({ enabled: false, activeProfileId: 'b', failover: { enabled: true, order: ['b', 'a', 'c'] } });
    expect(d.failover?.down).toEqual([]);
    expect(d.failover?.moved).toBeUndefined();
  });

  it('Direct keeps the selection in Single mode', () => {
    expect(withDirect(on({ activeProfileId: 'c', failover: undefined }))).toMatchObject({ enabled: false, activeProfileId: 'c' });
  });

  it('turning Failover on while Direct selects the first proxy; while on it leaves traffic alone', () => {
    const direct = on({ enabled: false, activeProfileId: 'c', failover: undefined });
    expect(withFailoverSettings(direct, { enabled: true })).toMatchObject({ activeProfileId: 'a', failover: { enabled: true } });
    expect(withFailoverSettings(on({ activeProfileId: 'c', failover: undefined }), { enabled: true }).activeProfileId).toBe('c');
  });

  it('reordering while Direct keeps the first proxy selected', () => {
    expect(withFailoverSettings(on({ enabled: false }), { order: ['c', 'a', 'b'] }).activeProfileId).toBe('c');
  });
});
