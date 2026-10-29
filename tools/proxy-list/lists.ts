export type ProxyType = 'http' | 'socks5';

export interface Candidate {
  host: string;
  port: number;
  /** Every type the address was listed as (the lists don't check this). */
  types: ProxyType[];
}

export const SOURCES: Record<ProxyType, string> = {
  http: 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
  socks5: 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt',
};

const ENTRY = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/;

/** `host:port` lines with an IPv4 host; anything else is skipped. */
export function parseList(text: string): { host: string; port: number }[] {
  const entries: { host: string; port: number }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ENTRY.exec(line.trim());
    if (!m) continue;
    const port = Number(m[2]);
    if (port < 1 || port > 65535 || m[1].split('.').some(octet => Number(octet) > 255)) continue;
    entries.push({ host: m[1], port });
  }
  return entries;
}

/** One candidate per address, with every type it was listed as. */
export function mergeLists(lists: Record<ProxyType, string>): Candidate[] {
  const byAddress = new Map<string, Candidate>();
  for (const type of ['http', 'socks5'] as const) {
    for (const { host, port } of parseList(lists[type])) {
      const key = `${host}:${port}`;
      const candidate = byAddress.get(key) ?? { host, port, types: [] };
      if (!candidate.types.includes(type)) candidate.types.push(type);
      byAddress.set(key, candidate);
    }
  }
  return [...byAddress.values()];
}
