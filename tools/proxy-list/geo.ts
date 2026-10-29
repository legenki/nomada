import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

// Country of an IP from DB-IP's free "IP to Country Lite" database
// (CC-BY 4.0, https://db-ip.com), so no lookup service is asked per proxy.

export interface GeoTable {
  starts: Uint32Array;
  ends: Uint32Array;
  codes: string[];
}

export function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

/** The database's `start,end,country` rows; IPv6 rows are skipped (proxies here are IPv4). */
export function parseCountryCsv(csv: string): GeoTable {
  const starts: number[] = [];
  const ends: number[] = [];
  const codes: string[] = [];
  for (const line of csv.split('\n')) {
    const [start, end, code] = line.trim().split(',');
    const from = ipToInt(start ?? '');
    const to = ipToInt(end ?? '');
    if (from === null || to === null || !code) continue;
    starts.push(from);
    ends.push(to);
    codes.push(code);
  }
  return { starts: Uint32Array.from(starts), ends: Uint32Array.from(ends), codes };
}

/** Rows are sorted by start, so a binary search finds the range holding `ip`. */
export function countryOf(table: GeoTable, ip: string): string | null {
  const n = ipToInt(ip);
  if (n === null) return null;
  let lo = 0;
  let hi = table.starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (table.starts[mid] > n) hi = mid - 1;
    else if (table.ends[mid] < n) lo = mid + 1;
    else return table.codes[mid] === 'ZZ' ? null : table.codes[mid];
  }
  return null;
}

const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/**
 * This month's database (or last month's, early in a month before it's out),
 * downloaded once into `cacheDir`.
 */
export async function loadGeo(cacheDir: string, now = new Date()): Promise<GeoTable> {
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  await mkdir(cacheDir, { recursive: true });
  for (const month of [monthOf(now), monthOf(lastMonth)]) {
    const file = join(cacheDir, `dbip-country-lite-${month}.csv.gz`);
    if (!existsSync(file)) {
      const res = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`);
      if (!res.ok) continue;
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    return parseCountryCsv(gunzipSync(await readFile(file)).toString('utf8'));
  }
  throw new Error('DB-IP country database is not available');
}
