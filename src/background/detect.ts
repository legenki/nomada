import type { DetectResult, ProbeTarget, WooPortalData } from '../types';
import { activeProfileOf } from '../lib/state';
import { readData } from '../lib/storage';
import { applyProxy, pacRoute, routeBody } from './proxy';
import { LOOKUP_HOST, probeLookup } from './places';

// Extensions can't open raw sockets, so a proxy's protocol is found by sending
// one real request through Chrome with each type in turn.

type ServerType = NonNullable<DetectResult['type']>;

/**
 * Types to try, in order. HTTP goes first: a SOCKS5 greeting sent to an HTTP
 * proxy can hang until the timeout, while the reverse fails at once. Chrome
 * can't log in to SOCKS5 proxies, so they're skipped when there's a login.
 */
export function probeOrder(hasLogin: boolean): ServerType[] {
  return hasLogin ? ['http', 'https'] : ['http', 'socks5', 'https'];
}

/** PAC that sends only the lookup through the candidate; other traffic keeps `otherTraffic`. */
export function buildProbePac(type: ServerType, host: string, port: number, otherTraffic: string): string {
  return `function FindProxyForURL(url,host){if(host===${JSON.stringify(LOOKUP_HOST)})return ${JSON.stringify(pacRoute(type, host, port))};${otherTraffic}}`;
}

// Errors that mean the proxy server itself can't be reached; every type would fail the same way.
const UNREACHABLE = /ERR_(PROXY_CONNECTION_FAILED|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|CONNECTION_REFUSED|CONNECTION_TIMED_OUT)$/;

interface Probe { host: string; username: string; password: string; challenges: number }

// The attempt in flight. Only one runs at a time: callers go through the commit queue.
let probe: Probe | null = null;
const proxyErrors: string[] = [];

/** Fed from chrome.proxy.onProxyError. */
export function noteProxyError(error: string): void {
  if (probe) proxyErrors.push(error);
}

/**
 * Answer a proxy auth challenge if it comes from the proxy being tested: its
 * login once, then cancel (a second challenge means the login was rejected).
 * Returns null for any other challenge.
 */
export function answerProbeChallenge(challengerHost: string | undefined): chrome.webRequest.BlockingResponse | null {
  if (!probe || challengerHost?.toLowerCase() !== probe.host) return null;
  probe.challenges++;
  return probe.username && probe.challenges === 1
    ? { authCredentials: { username: probe.username, password: probe.password } }
    : { cancel: true };
}

// Proxy errors are reported just after the request fails.
const settle = () => new Promise(resolve => setTimeout(resolve, 150));

/**
 * Find which proxy type `target` speaks. Other traffic keeps its route
 * meanwhile, and the stored proxy setting is put back afterwards.
 */
export async function detectProxyType(target: ProbeTarget, data: WooPortalData): Promise<DetectResult> {
  const active = activeProfileOf(data);
  const otherTraffic = active ? routeBody(active) : 'return "DIRECT";';
  if (otherTraffic === null) {
    return { success: false, error: "Can't check a proxy while Nomada is on with a PAC-script proxy. Turn Nomada off, or pick the type yourself." };
  }

  const host = target.host.trim();
  const address = `${host}:${target.port}`;
  const checkAddress = 'Check the host and port — the proxy may also be down or accept only whitelisted IPs.';
  proxyErrors.length = 0;
  try {
    for (const type of probeOrder(!!target.username)) {
      probe = { host: host.toLowerCase(), username: target.username, password: target.password, challenges: 0 };
      await chrome.proxy.settings.set({
        value: { mode: 'pac_script', pacScript: { data: buildProbePac(type, host, target.port, otherTraffic) } },
        scope: 'regular',
      });
      const place = await probeLookup();
      const { challenges } = probe;
      probe = null;

      if (place === 'timeout') return { success: false, error: `${address} didn't answer. ${checkAddress}` };
      // An answer from the user's own IP didn't go through the candidate.
      if (place && place.ip !== data.realPlace?.ip) return { success: true, type, place };
      if (challenges > (target.username ? 1 : 0)) {
        return { success: false, error: target.username ? 'The proxy rejected the username or password.' : 'This proxy needs a username and password.' };
      }
      await settle();
      if (proxyErrors.some(e => UNREACHABLE.test(e))) return { success: false, error: `Can't connect to ${address}. ${checkAddress}` };
    }
    return {
      success: false,
      error: target.username
        ? "Couldn't get through as HTTP or HTTPS. If it's a SOCKS5 proxy, Chrome can't use it with a username and password."
        : "Couldn't get through as HTTP, SOCKS5 or HTTPS. Check the host and port, or pick the type yourself.",
    };
  } finally {
    probe = null;
    await applyProxy(await readData());
  }
}
