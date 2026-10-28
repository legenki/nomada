import type { ProxyProfile } from '../types';

export interface ValidationError {
  /** The form field to highlight. */
  field: 'host' | 'port' | 'pacUrl' | 'username';
  message: string;
}

/** Returns what's wrong with the form, or null when it is valid. */
export function validateProfile(
  type: ProxyProfile['config']['type'],
  host: string,
  port: number,
  pacUrl: string,
  user = '',
): ValidationError | null {
  if (type === 'socks5' && user.trim()) {
    return {
      field: 'username',
      message: 'Chrome does not support username/password authentication for SOCKS5 proxies. Use an unauthenticated SOCKS5 proxy or HTTP/HTTPS.',
    };
  }
  if (type === 'pac') {
    return /^(https?|file):\/\//i.test(pacUrl) || /^([a-zA-Z]:[\\/]|\/)/.test(pacUrl)
      ? null
      : { field: 'pacUrl', message: 'PAC URL must start with http://, https:// or file://' };
  }
  if (!host || /\s/.test(host)) return { field: 'host', message: 'Host is required (no spaces)' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { field: 'port', message: 'Port must be a number from 1 to 65535' };
  return null;
}
