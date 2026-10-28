import { describe, it, expect } from 'vitest';
import { buildProxyConfig, pacRoute, routeBody } from '../src/background/proxy';
import type { ProxyProfile } from '../src/types';

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

describe('pacRoute / routeBody', () => {
  it('uses the PAC keyword for each proxy type', () => {
    expect(pacRoute('http', 'h', 1)).toBe('PROXY h:1');
    expect(pacRoute('https', 'h', 2)).toBe('HTTPS h:2');
    expect(pacRoute('socks5', 'h', 3)).toBe('SOCKS5 h:3');
  });

  it('routes a plain profile straight to its proxy', () => {
    expect(routeBody(profile({ type: 'socks5', port: 1080 }))).toBe('return "SOCKS5 proxy.example:1080";');
  });

  it('keeps routing rules, with the right keyword for HTTPS proxies', () => {
    const body = routeBody(profile({
      type: 'https',
      routingRules: { enabled: true, mode: 'blacklist', domains: ['*.local'] },
    }))!;
    const find = new Function('shExpMatch', `return function(url,host){${body}}`)(
      (h: string, p: string) => p === '*.local' && h.endsWith('.local'),
    );
    expect(find('https://a.local/', 'a.local')).toBe('DIRECT');
    expect(find('https://example.com/', 'example.com')).toBe('HTTPS proxy.example:3128');
  });

  it('has no inline route for a remote PAC script', () => {
    expect(routeBody(profile({ type: 'pac', pacUrl: 'https://example.com/p.pac' }))).toBeNull();
  });
});
