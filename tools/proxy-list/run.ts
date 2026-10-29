import type { PublicList } from '../../src/types.ts';
import type { CheckResult } from './check.ts';
import type { Candidate, ProxyType } from './lists.ts';

export interface Checked {
  type: ProxyType;
  host: string;
  port: number;
  /** Exit IP seen by the target. */
  ip: string;
  ms: number;
}

type Check = (type: ProxyType, host: string, port: number) => Promise<CheckResult>;

/** Check every candidate as every type it was listed as, `concurrency` at a time. */
export async function checkAll(candidates: Candidate[], check: Check, concurrency: number): Promise<Checked[]> {
  const jobs = candidates.flatMap(({ host, port, types }) => types.map(type => ({ type, host, port })));
  const working: Checked[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const result = await check(job.type, job.host, job.port);
      if (result.ok) working.push({ ...job, ip: result.ip, ms: result.ms });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return working;
}

/** proxies.json: working proxies whose exit country is known, fastest first. */
export function buildList(checked: Checked[], countryOf: (ip: string) => string | null, now: Date, limit = 1000): PublicList {
  const proxies = checked
    .map(({ type, host, port, ip, ms }) => ({ type, host, port, country: countryOf(ip), ms }))
    .filter((p): p is typeof p & { country: string } => p.country !== null)
    .sort((a, b) => a.ms - b.ms)
    .slice(0, limit);
  return { updatedAt: now.toISOString(), source: 'TheSpeedX/SOCKS-List', proxies };
}
