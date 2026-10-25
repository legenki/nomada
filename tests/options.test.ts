import { describe, it, expect } from 'vitest';
import { validateProfile } from '../src/options/validate';

describe('validateProfile', () => {
  it('accepts valid http, https and socks5 configs', () => {
    expect(validateProfile('http', '127.0.0.1', 8080, '', '')).toBeNull();
    expect(validateProfile('https', 'proxy.example.com', 443, '', '')).toBeNull();
    expect(validateProfile('socks5', '127.0.0.1', 1080, '', '')).toBeNull();
  });

  it('rejects SOCKS5 with credentials because Chrome cannot authenticate SOCKS5', () => {
    expect(validateProfile('socks5', '127.0.0.1', 1080, '', 'admin'))
      .toMatch(/Chrome does not support username\/password authentication for SOCKS5/);
  });

  it('validates host and port range', () => {
    expect(validateProfile('http', '', 8080, '', '')).toMatch(/Host is required/);
    expect(validateProfile('http', 'host with space', 8080, '', '')).toMatch(/Host is required/);
    expect(validateProfile('http', 'host', 0, '', '')).toMatch(/Port must be a number/);
    expect(validateProfile('http', 'host', 70000, '', '')).toMatch(/Port must be a number/);
  });

  it('validates PAC URL format', () => {
    expect(validateProfile('pac', '', 0, 'https://example.com/proxy.pac', '')).toBeNull();
    expect(validateProfile('pac', '', 0, 'file:///etc/proxy.pac', '')).toBeNull();
    expect(validateProfile('pac', '', 0, 'invalid-url', '')).toMatch(/PAC URL must start with/);
  });
});
