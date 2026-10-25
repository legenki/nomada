import type { ProxyProfile } from '../types';

/** Returns an error message, or null when the form is valid. */
export function validateProfile(
  type: ProxyProfile['config']['type'],
  host: string,
  port: number,
  pacUrl: string,
  user = '',
): string | null {
  if (type === 'socks5' && user.trim()) {
    return 'Chrome does not support username/password authentication for SOCKS5 proxies. Use an unauthenticated SOCKS5 proxy or HTTP/HTTPS.';
  }
  if (type === 'pac') {
    return /^(https?|file):\/\//i.test(pacUrl) || /^([a-zA-Z]:[\\/]|\/)/.test(pacUrl)
      ? null
      : 'PAC URL must start with http://, https:// or file://';
  }
  if (!host || /\s/.test(host)) return 'Host is required (no spaces)';
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Port must be a number from 1 to 65535';
  return null;
}
