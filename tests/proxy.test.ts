import { describe, it, expect } from 'vitest';
import { buildProxyConfig, activeProfileOf } from '../src/background/proxy';
import type { ProxyProfile, WooPortalData } from '../src/types';

function profile(config: Partial<ProxyProfile['config']> = {}): ProxyProfile {
  return {
    id: 'p1', name: 'Test', description: '', color: '#0969da', createdAt: '', updatedAt: '', tags: [],
    config: {
      type: 'http', host: 'proxy.example', port: 3128, pacUrl: '', bypassList: [],
      auth: { username: '', password: '' },
      routingRules: { enabled: false, mode: 'whitelist', domains: [] },
      ...config,
    },
  };
}

describe('buildProxyConfig', () => {
  it('builds a fixed server for plain proxies', () => {
    expect(buildProxyConfig(profile())).toEqual({
      mode: 'fixed_servers',
      rules: { singleProxy: { scheme: 'http', host: 'proxy.example', port: 3128 } },
    });
  });

  it('rejects a missing host or an out-of-range port', () => {
    expect(() => buildProxyConfig(profile({ host: '' }))).toThrow(/host/);
    expect(() => buildProxyConfig(profile({ port: 0 }))).toThrow(/port/);
    expect(() => buildProxyConfig(profile({ port: 70000 }))).toThrow(/port/);
  });

  it('normalizes local PAC paths to file URLs', () => {
    expect(buildProxyConfig(profile({ type: 'pac', pacUrl: '/etc/proxy.pac' })))
      .toEqual({ mode: 'pac_script', pacScript: { url: 'file:///etc/proxy.pac' } });
    expect(() => buildProxyConfig(profile({ type: 'pac', pacUrl: 'nonsense' }))).toThrow(/PAC/);
  });

  it('generates a PAC script for routing rules that cannot be broken by input', () => {
    const cfg = buildProxyConfig(profile({
      host: 'evil";alert(1);"',
      routingRules: { enabled: true, mode: 'whitelist', domains: ['*.example.com'] },
    }));
    expect(cfg.mode).toBe('pac_script');
    const data = cfg.pacScript!.data!;
    expect(data).toContain('"PROXY evil\\";alert(1);\\":3128"');
    expect(() => new Function(data)).not.toThrow();
  });
});

describe('activeProfileOf', () => {
  const base = {
    enabled: true, mode: 'profile', activeProfileId: 'p1', profiles: [profile()],
  } as unknown as WooPortalData;

  it('returns the selected profile while ON', () => {
    expect(activeProfileOf(base)?.id).toBe('p1');
  });

  it('returns nothing while the master switch is OFF', () => {
    expect(activeProfileOf({ ...base, enabled: false })).toBeUndefined();
  });

  it('returns nothing in system mode', () => {
    expect(activeProfileOf({ ...base, mode: 'system' })).toBeUndefined();
  });
});
