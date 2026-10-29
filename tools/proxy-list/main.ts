// Builds proxies.json for the settings page's public proxy gallery:
//   node tools/proxy-list/main.ts --out out/proxies.json [--limit 50]
// Run every 6 hours by .github/workflows/proxy-list.yml.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { checkProxy } from './check.ts';
import { countryOf, loadGeo } from './geo.ts';
import { SOURCES, mergeLists } from './lists.ts';
import { buildList, checkAll } from './run.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'out/proxies.json' },
    cache: { type: 'string', default: '.cache/dbip' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '200' },
  },
});

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const started = Date.now();
const [http, socks5] = await Promise.all([fetchText(SOURCES.http), fetchText(SOURCES.socks5)]);
let candidates = mergeLists({ http, socks5 });
if (values.limit) candidates = candidates.slice(0, Number(values.limit));

const geo = await loadGeo(values.cache);
const working = await checkAll(candidates, (type, host, port) => checkProxy(type, host, port), Number(values.concurrency));
const list = buildList(working, ip => countryOf(geo, ip), new Date());

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, JSON.stringify(list));
const countries = new Set(list.proxies.map(p => p.country)).size;
console.log(`${candidates.length} candidates → ${working.length} working → ${list.proxies.length} published in ${countries} countries (${Math.round((Date.now() - started) / 1000)} s)`);
