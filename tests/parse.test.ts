import { describe, it, expect } from 'vitest';
import { parseProxyString } from '../src/options/parse';

const proxy = (type: string, host: string, port: number, username = '', password = '') =>
  ({ type, host, port, username, password });

describe('parseProxyString', () => {
  it('reads host:port with the currently selected type', () => {
    expect(parseProxyString('1.2.3.4:8080', 'http')).toEqual(proxy('http', '1.2.3.4', 8080));
    expect(parseProxyString('  proxy.example.com:1080 ', 'socks5')).toEqual(proxy('socks5', 'proxy.example.com', 1080));
    // A host:port can't be a PAC script, so PAC falls back to HTTP.
    expect(parseProxyString('1.2.3.4:8080', 'pac')).toEqual(proxy('http', '1.2.3.4', 8080));
  });

  it('reads host:port:user:pass, keeping colons in the password', () => {
    expect(parseProxyString('1.2.3.4:8080:alice:s3cret', 'http')).toEqual(proxy('http', '1.2.3.4', 8080, 'alice', 's3cret'));
    expect(parseProxyString('1.2.3.4:8080:alice:pa:ss', 'http')).toEqual(proxy('http', '1.2.3.4', 8080, 'alice', 'pa:ss'));
  });

  it('reads user:pass:host:port, even when the password is numeric', () => {
    expect(parseProxyString('alice:s3cret:1.2.3.4:8080', 'https')).toEqual(proxy('https', '1.2.3.4', 8080, 'alice', 's3cret'));
    expect(parseProxyString('alice:12345:gate.example.com:8080', 'http')).toEqual(proxy('http', 'gate.example.com', 8080, 'alice', '12345'));
  });

  it('reads user:pass@host:port and host:port@user:pass', () => {
    expect(parseProxyString('alice:s3cret@1.2.3.4:8080', 'http')).toEqual(proxy('http', '1.2.3.4', 8080, 'alice', 's3cret'));
    expect(parseProxyString('1.2.3.4:8080@alice:s3cret', 'http')).toEqual(proxy('http', '1.2.3.4', 8080, 'alice', 's3cret'));
    expect(parseProxyString('alice:p@ss@1.2.3.4:8080', 'http')).toEqual(proxy('http', '1.2.3.4', 8080, 'alice', 'p@ss'));
  });

  it('takes the type from a URL scheme', () => {
    expect(parseProxyString('http://1.2.3.4:3128', 'socks5')).toEqual(proxy('http', '1.2.3.4', 3128));
    expect(parseProxyString('https://proxy.example.com:443/', 'http')).toEqual(proxy('https', 'proxy.example.com', 443));
    expect(parseProxyString('socks5://1.2.3.4:1080', 'http')).toEqual(proxy('socks5', '1.2.3.4', 1080));
    expect(parseProxyString('SOCKS5H://1.2.3.4:1080', 'http')).toEqual(proxy('socks5', '1.2.3.4', 1080));
    expect(parseProxyString('socks://1.2.3.4:1080', 'http')).toEqual(proxy('socks5', '1.2.3.4', 1080));
  });

  it('percent-decodes URL credentials and allows / in them', () => {
    expect(parseProxyString('http://alice:p%40ss%3Aw@1.2.3.4:8080', 'http')).toEqual(proxy('http', '1.2.3.4', 8080, 'alice', 'p@ss:w'));
    expect(parseProxyString('socks5://alice:pa/ss@1.2.3.4:1080', 'http')).toEqual(proxy('socks5', '1.2.3.4', 1080, 'alice', 'pa/ss'));
  });

  it('treats a URL with a path as a PAC script', () => {
    expect(parseProxyString('https://example.com/proxy.pac', 'http')).toEqual({ type: 'pac', pacUrl: 'https://example.com/proxy.pac' });
    expect(parseProxyString('http://10.0.0.1:8000/wpad.dat', 'http')).toEqual({ type: 'pac', pacUrl: 'http://10.0.0.1:8000/wpad.dat' });
    expect(parseProxyString('file:///etc/proxy.pac', 'http')).toEqual({ type: 'pac', pacUrl: 'file:///etc/proxy.pac' });
  });

  it('rejects text that is not a proxy', () => {
    for (const text of ['', '   ', 'proxy.example.com', 'host:port', 'host:0', 'host:65536', 'host:80:alice',
      'a b:8080', 'ftp://1.2.3.4:21', 'socks5://1.2.3.4', 'alice:s3cret@host', 'http://1.2.3.4:8080?x=1']) {
      expect(parseProxyString(text, 'http'), text).toBeNull();
    }
  });
});
