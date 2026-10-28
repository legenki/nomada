import type { ProxyConfig } from '../types';

type ServerType = Exclude<ProxyConfig['type'], 'pac'>;

export type ParsedProxy =
  | { type: 'pac'; pacUrl: string }
  /** `type` is null when the text doesn't name a scheme. */
  | { type: ServerType | null; host: string; port: number; username: string; password: string };

interface Candidate { host: string; port: string; username: string; password: string }

const SCHEMES: Record<string, ServerType> = {
  http: 'http', https: 'https', socks: 'socks5', socks5: 'socks5', socks5h: 'socks5',
};
const HOST = /^[^\s:@/?#[\]]+$/;

function toPort(s: string): number | null {
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 65535 ? n : null;
}

/** Splits "a:b" at the first colon; a missing colon means "a" with an empty "b". */
function pair(s: string): [string, string] {
  const i = s.indexOf(':');
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
}

function decode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

function candidate(address: string, credentials: string): Candidate {
  const i = address.lastIndexOf(':');
  const [username, password] = pair(credentials);
  return i < 0
    ? { host: '', port: '', username, password }
    : { host: address.slice(0, i), port: address.slice(i + 1), username, password };
}

/**
 * Sellers write proxies in several orders, so a string can often be read more
 * than one way. Keep the readings with a valid host and port, preferring one
 * whose host looks like a real host over e.g. a user name.
 */
function pick(type: ServerType | null, candidates: Candidate[]): ParsedProxy | null {
  const valid = candidates.filter(c => HOST.test(c.host) && toPort(c.port));
  const c = valid.find(c => c.host.includes('.') || c.host.toLowerCase() === 'localhost') ?? valid[0];
  return c ? { type, host: c.host, port: toPort(c.port)!, username: c.username, password: c.password } : null;
}

/** user:pass@host:port, host:port@user:pass, host:port, host:port:user:pass, user:pass:host:port */
function parseBare(s: string): ParsedProxy | null {
  if (s.includes('@')) {
    const last = s.lastIndexOf('@');
    const first = s.indexOf('@');
    return pick(null, [
      candidate(s.slice(last + 1), s.slice(0, last)),
      candidate(s.slice(0, first), s.slice(first + 1)),
    ]);
  }
  const parts = s.split(':');
  if (parts.length === 2) return pick(null, [candidate(s, '')]);
  if (parts.length < 4) return null;
  const [a, b, c, ...rest] = parts;
  const candidates = [{ host: a, port: b, username: c, password: rest.join(':') }];
  if (parts.length === 4) candidates.push({ host: c, port: rest[0], username: a, password: b });
  return pick(null, candidates);
}

/**
 * Reads a proxy written as one line — a URL (`socks5://user:pass@host:port`),
 * a PAC script URL, or one of the colon/@ formats proxy sellers hand out.
 */
export function parseProxyString(text: string): ParsedProxy | null {
  const s = text.trim();
  if (!s || /\s/.test(s)) return null;

  const url = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(s);
  if (!url) return parseBare(s);

  const scheme = url[1].toLowerCase();
  const rest = url[2];
  if (scheme === 'file') return { type: 'pac', pacUrl: s };

  // Passwords may contain "/", so the path starts after the credentials.
  const at = rest.lastIndexOf('@');
  const slash = rest.indexOf('/', at + 1);
  const hasPath = slash >= 0 && slash < rest.length - 1;
  if (hasPath && (scheme === 'http' || scheme === 'https')) return { type: 'pac', pacUrl: s };

  const type = SCHEMES[scheme];
  if (!type) return null;
  const authority = slash >= 0 ? rest.slice(0, slash) : rest;
  const parsed = pick(type, [at < 0 ? candidate(authority, '') : candidate(authority.slice(at + 1), authority.slice(0, at))]);
  return parsed && parsed.type !== 'pac'
    ? { ...parsed, username: decode(parsed.username), password: decode(parsed.password) }
    : parsed;
}
