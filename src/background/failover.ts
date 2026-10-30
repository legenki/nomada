import type { ActionResult, FailoverState, Place, ProxyPlace, ProxyProfile, WooPortalData } from '../types';
import { activeProfileOf } from '../lib/state';
import { withProxyPlace } from './state-helpers';

// Moving to the next proxy when the one in use stops answering. Nomada does this
// itself, not the browser's own failover list, so that the proxy and the identity
// pages see change together: during a move requests fail, they don't leak.

const CHECK_COOLDOWN_MS = 30_000;
const RECHECK_DELAY_MS = 1_000;

/** Proxies taking part, in order. PAC scripts route by themselves and don't exist in Firefox. */
export function failoverChain(data: Pick<WooPortalData, 'profiles' | 'failover'>): ProxyProfile[] {
  const usable = data.profiles.filter(p => p.config.type !== 'pac');
  const order = data.failover?.order ?? [];
  const ordered = order.flatMap(id => usable.filter(p => p.id === id));
  return [...ordered, ...usable.filter(p => !order.includes(p.id))];
}

/** Who to try when `activeId` fails: the ones after it, then round from the start. */
export function nextCandidates(chain: ProxyProfile[], activeId: string): ProxyProfile[] {
  const i = chain.findIndex(p => p.id === activeId);
  return i < 0 ? chain : [...chain.slice(i + 1), ...chain.slice(0, i)];
}

/** Firefox reports every failed request; these mean the connection to the proxy is the problem. */
export function isProxyFailure(error: string): boolean {
  return /NS_ERROR_(PROXY_|UNKNOWN_PROXY_HOST|NET_TIMEOUT|NET_RESET|CONNECTION_REFUSED)/.test(error);
}

/** The user's settings without what the last moves left behind. */
function settingsOf(data: WooPortalData): FailoverState | undefined {
  return data.failover && { enabled: data.failover.enabled, order: data.failover.order, down: [] };
}

export const withoutMoves = (data: WooPortalData): WooPortalData => ({ ...data, failover: settingsOf(data) });

/** Going Direct: forget the moves, and start from the top next time. */
export function withDirect(data: WooPortalData): WooPortalData {
  const first = data.failover?.enabled ? failoverChain(data)[0]?.id : undefined;
  return { ...withoutMoves(data), enabled: false, activeProfileId: first ?? data.activeProfileId };
}

export function withFailoverSettings(data: WooPortalData, patch: { enabled?: boolean; order?: string[] }): WooPortalData {
  const failover: FailoverState = {
    enabled: patch.enabled ?? data.failover?.enabled ?? false,
    order: patch.order ?? data.failover?.order ?? [],
    down: [],
  };
  const next = { ...data, failover };
  // While on, traffic keeps its route; while Direct, the first proxy is the next one to use.
  const first = failover.enabled && !data.enabled ? failoverChain(next)[0]?.id : undefined;
  return first ? { ...next, activeProfileId: first } : next;
}

export interface FailoverDeps {
  read(): Promise<WooPortalData>;
  commit(update: (d: WooPortalData) => WooPortalData): Promise<ActionResult>;
  /** Where the current route exits; null if nothing answered. */
  lookup(realIp: string | undefined): Promise<Place | null>;
  isOnline(): boolean;
  /** An Auto check is running: its errors are about the proxy being checked. */
  probing(): boolean;
  now(): number;
  wait(ms: number): Promise<void>;
}

export function createFailover(deps: FailoverDeps) {
  const { read, commit, lookup, isOnline, probing, now, wait } = deps;
  let running: Promise<ActionResult> | null = null;
  let nextCheckAt = 0;

  function exclusive(job: () => Promise<ActionResult>): Promise<ActionResult> {
    running ??= job().finally(() => { running = null; nextCheckAt = now() + CHECK_COOLDOWN_MS; });
    return running;
  }

  async function walk(fromId: string, offIfAllDown: boolean, previous: ProxyPlace | undefined): Promise<ActionResult> {
    if (!isOnline()) return { success: false, error: "You're offline" };
    const start = await read();
    const realIp = start.realPlace?.ip;
    // Reads drop the place once another proxy is selected, so keep it for coming back.
    const lastPlace = previous ?? start.proxyPlace;
    const down = [fromId];
    let current = fromId;
    // Stop as soon as the user changes anything: their choice wins.
    const stillOurs = (d: WooPortalData) => d.enabled && d.activeProfileId === current && !!d.failover?.enabled;

    for (const candidate of nextCandidates(failoverChain(start), fromId)) {
      if (!stillOurs(await read())) return { success: true };
      const previousId = current;
      const failed = [...down];
      const applied = await commit(d => (d.enabled && d.activeProfileId === previousId && d.failover
        ? { ...d, activeProfileId: candidate.id, failover: { ...d.failover, down: failed } }
        : d));
      current = candidate.id;
      const place = applied.success ? await lookup(realIp) : null;
      if (!stillOurs(await read())) return { success: true };
      if (place) {
        await commit(d => {
          const next = withProxyPlace(d, candidate.id, place);
          return { ...next, failover: { ...next.failover!, down: failed, moved: { from: fromId, to: candidate.id }, exhausted: false } };
        });
        return { success: true };
      }
      down.push(candidate.id);
    }

    if (offIfAllDown) {
      await commit(d => ({ ...withoutMoves(d), enabled: false, activeProfileId: fromId }));
      return { success: false, error: "None of your proxies responded — Nomada stayed off" };
    }
    // Stay on: requests fail rather than exposing the real IP. Pages keep the identity
    // they have, so go back to the proxy it belongs to in case that one returns first.
    const home = lastPlace?.profileId ?? fromId;
    await commit(d => ({
      ...d,
      activeProfileId: home,
      proxyPlace: lastPlace,
      failover: { ...d.failover!, down, moved: undefined, exhausted: true },
    }));
    return { success: false, error: 'None of your proxies is answering. Traffic is blocked so your real IP stays hidden.' };
  }

  return {
    /** Don't react to errors for a while: a user action is about to test the proxy itself. */
    hold(): void {
      nextCheckAt = now() + CHECK_COOLDOWN_MS;
    },

    /** The browser reported a proxy error: find out whether it's the proxy, and move on if so. */
    async onFailure(): Promise<ActionResult | undefined> {
      if (running || probing() || now() < nextCheckAt) return undefined;
      nextCheckAt = now() + CHECK_COOLDOWN_MS;
      const data = await read();
      const active = activeProfileOf(data);
      if (!active || !data.failover?.enabled || data.failover.exhausted || !isOnline()) return undefined;
      return exclusive(async () => {
        const realIp = data.realPlace?.ip;
        if (await lookup(realIp)) return { success: true };
        await wait(RECHECK_DELAY_MS);
        if (await lookup(realIp)) return { success: true };
        return walk(active.id, false, undefined);
      });
    },

    /** The active proxy didn't answer a user action or a re-check. */
    moveOn(fromId: string, { offIfAllDown }: { offIfAllDown: boolean }): Promise<ActionResult> {
      return exclusive(() => walk(fromId, offIfAllDown, undefined));
    },

    /** Start again from the first proxy (Try again, or the popup opening after they all failed). */
    retry(): Promise<ActionResult> {
      return exclusive(async () => {
        const start = await read();
        const first = failoverChain(start)[0];
        if (!first || !start.enabled) return { success: true };
        if (!isOnline()) return { success: false, error: "You're offline" };
        const lastPlace = start.proxyPlace;
        await commit(d => ({ ...d, activeProfileId: first.id, failover: { ...d.failover!, down: [], exhausted: false } }));
        const place = await lookup(start.realPlace?.ip);
        if (place) {
          await commit(d => withoutMoves(withProxyPlace(d, first.id, place)));
          return { success: true };
        }
        return walk(first.id, false, lastPlace);
      });
    },
  };
}
