import { describe, it, expect } from 'vitest';
import { validateProfile } from '../src/options/validate';

describe('validateProfile', () => {
  it('accepts valid http, https and socks5 configs', () => {
    expect(validateProfile('http', '127.0.0.1', 8080, '', '')).toBeNull();
    expect(validateProfile('https', 'proxy.example.com', 443, '', '')).toBeNull();
    expect(validateProfile('socks5', '127.0.0.1', 1080, '', '')).toBeNull();
  });

  it('rejects SOCKS5 with credentials because Chrome cannot authenticate SOCKS5', () => {
    expect(validateProfile('socks5', '127.0.0.1', 1080, '', 'admin')).toEqual({
      field: 'username',
      message: expect.stringMatching(/Chrome does not support username\/password authentication for SOCKS5/),
    });
  });

  it('accepts SOCKS5 with credentials where the browser can log in (Firefox)', () => {
    expect(validateProfile('socks5', '127.0.0.1', 1080, '', 'admin', true)).toBeNull();
  });

  it('validates host and port range', () => {
    expect(validateProfile('http', '', 8080, '', '')).toEqual({ field: 'host', message: expect.stringMatching(/Host is required/) });
    expect(validateProfile('http', 'host with space', 8080, '', '')).toMatchObject({ field: 'host' });
    expect(validateProfile('http', 'host', 0, '', '')).toEqual({ field: 'port', message: expect.stringMatching(/Port must be a number/) });
    expect(validateProfile('http', 'host', 70000, '', '')).toMatchObject({ field: 'port' });
    expect(validateProfile('http', 'host', NaN, '', '')).toMatchObject({ field: 'port' });
  });

  it('validates PAC URL format', () => {
    expect(validateProfile('pac', '', 0, 'https://example.com/proxy.pac', '')).toBeNull();
    expect(validateProfile('pac', '', 0, 'file:///etc/proxy.pac', '')).toBeNull();
    expect(validateProfile('pac', '', 0, 'invalid-url', '')).toEqual({ field: 'pacUrl', message: expect.stringMatching(/PAC URL must start with/) });
  });
});
