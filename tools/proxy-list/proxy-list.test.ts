import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { mergeLists, parseList } from './lists.ts';
import { countryOf, ipToInt, parseCountryCsv } from './geo.ts';
import { buildList, checkAll } from './run.ts';
import { checkProxy } from './check.ts';
import type { Target } from './check.ts';

describe('parseList / mergeLists', () => {
  it('reads IPv4 host:port lines and skips anything else', () => {
    expect(parseList('1.2.3.4:8080\r\n\n  5.6.7.8:1080 \nbad\n1.2.3.4:0\n300.1.1.1:80\n[::1]:80\n'))
      .toEqual([{ host: '1.2.3.4', port: 8080 }, { host: '5.6.7.8', port: 1080 }]);
  });

  it('keeps one candidate per address with every type it was listed as', () => {
    expect(mergeLists({ http: '1.1.1.1:80\n2.2.2.2:8080\n', socks5: '2.2.2.2:8080\n3.3.3.3:1080\n1.1.1.1:80\n' })).toEqual([
      { host: '1.1.1.1', port: 80, types: ['http', 'socks5'] },
      { host: '2.2.2.2', port: 8080, types: ['http', 'socks5'] },
      { host: '3.3.3.3', port: 1080, types: ['socks5'] },
    ]);
  });
});

describe('geo', () => {
  const table = parseCountryCsv([
    '0.0.0.0,0.255.255.255,ZZ',
    '1.0.0.0,1.0.0.255,AU',
    '1.0.1.0,1.0.3.255,CN',
    '5.0.0.0,5.255.255.255,DE',
    '2001:200::,2001:200:ffff:ffff:ffff:ffff:ffff:ffff,JP',
  ].join('\n'));

  it('converts IPv4 to a number', () => {
    expect(ipToInt('1.0.1.0')).toBe(16777472);
    expect(ipToInt('255.255.255.255')).toBe(4294967295);
    expect(ipToInt('1.2.3')).toBeNull();
  });

  it('finds the country of an IPv4 address, ignoring IPv6 rows and unknown ranges', () => {
    expect(countryOf(table, '1.0.2.200')).toBe('CN');
    expect(countryOf(table, '5.6.7.8')).toBe('DE');
    expect(countryOf(table, '0.1.2.3')).toBeNull(); // ZZ
    expect(countryOf(table, '4.4.4.4')).toBeNull(); // no range
    expect(countryOf(table, '2001:200::1')).toBeNull();
  });
});

describe('checkAll / buildList', () => {
  it('tries every listed type and keeps the ones that work', async () => {
    const seen: string[] = [];
    const checked = await checkAll(
      [{ host: '1.1.1.1', port: 80, types: ['http', 'socks5'] }, { host: '2.2.2.2', port: 1080, types: ['socks5'] }],
      async (type, host) => {
        seen.push(`${type} ${host}`);
        return type === 'socks5' ? { ok: true, ip: `9.9.9.${host[0]}`, ms: 300 } : { ok: false, error: 'no' };
      },
      2,
    );
    expect(seen.sort()).toEqual(['http 1.1.1.1', 'socks5 1.1.1.1', 'socks5 2.2.2.2']);
    expect(checked).toHaveLength(2);
  });

  it('publishes working proxies with their exit country, fastest first', () => {
    const list = buildList([
      { type: 'socks5', host: '2.2.2.2', port: 1080, ip: '5.1.1.1', ms: 900 },
      { type: 'http', host: '1.1.1.1', port: 80, ip: '5.2.2.2', ms: 120 },
      { type: 'http', host: '3.3.3.3', port: 80, ip: '4.4.4.4', ms: 50 }, // country unknown
    ], ip => (ip.startsWith('5.') ? 'DE' : null), new Date('2026-10-29T09:20:00Z'));
    expect(list).toEqual({
      updatedAt: '2026-10-29T09:20:00.000Z',
      source: 'TheSpeedX/SOCKS-List',
      proxies: [
        { type: 'http', host: '1.1.1.1', port: 80, country: 'DE', ms: 120 },
        { type: 'socks5', host: '2.2.2.2', port: 1080, country: 'DE', ms: 900 },
      ],
    });
  });

  it('caps the list', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ type: 'http' as const, host: `1.1.1.${i}`, port: 80, ip: '5.0.0.1', ms: i }));
    expect(buildList(many, () => 'DE', new Date(), 3).proxies).toHaveLength(3);
  });
});

// ── checkProxy against fake proxies on localhost ──────────────────────────────

const servers: net.Server[] = [];
const listen = async (handler: (s: net.Socket) => void) => {
  const server = net.createServer(handler);
  servers.push(server);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return (server.address() as AddressInfo).port;
};
/** Answers like api.ipify.org, over plain HTTP. */
const echo = (socket: net.Socket) => socket.once('data', () => {
  socket.end('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"ip":"203.0.113.9"}');
});
const pipeTo = (client: net.Socket, port: number, onReady: () => void) => {
  const upstream = net.connect(port, '127.0.0.1', () => { onReady(); client.pipe(upstream).pipe(client); });
  upstream.on('error', () => client.destroy());
};

let target: Target;
let httpProxy: number;
let socksProxy: number;
let silent: number;
let dead: number;

beforeAll(async () => {
  const echoPort = await listen(echo);
  target = { host: '127.0.0.1', port: echoPort, path: '/?format=json', tls: false };
  httpProxy = await listen(client => client.once('data', head => {
    const m = /^CONNECT [^:]+:(\d+) /.exec(head.toString());
    if (!m) { client.destroy(); return; }
    pipeTo(client, Number(m[1]), () => client.write('HTTP/1.1 200 Connection Established\r\n\r\n'));
  }));
  socksProxy = await listen(client => client.once('data', hello => {
    if (hello[0] !== 5) { client.destroy(); return; }
    client.write(Buffer.from([5, 0]));
    client.once('data', req => {
      const len = req[4];
      const port = req.readUInt16BE(5 + len);
      pipeTo(client, port, () => client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0])));
    });
  }));
  silent = await listen(() => {}); // accepts, never answers
  dead = await listen(() => {});
  await new Promise<void>(r => servers.at(-1)!.close(() => r()));
});

afterAll(() => { for (const s of servers) s.close(); });

describe('checkProxy', () => {
  it('gets the exit IP through an HTTP proxy', async () => {
    const r = await checkProxy('http', '127.0.0.1', httpProxy, target, 2000);
    expect(r).toMatchObject({ ok: true, ip: '203.0.113.9' });
    expect(r.ok && r.ms).toBeGreaterThanOrEqual(0);
  });

  it('gets the exit IP through a SOCKS5 proxy', async () => {
    expect(await checkProxy('socks5', '127.0.0.1', socksProxy, target, 2000)).toMatchObject({ ok: true, ip: '203.0.113.9' });
  });

  it('fails when the proxy speaks the other protocol', async () => {
    expect((await checkProxy('http', '127.0.0.1', socksProxy, target, 2000)).ok).toBe(false);
    expect((await checkProxy('socks5', '127.0.0.1', httpProxy, target, 2000)).ok).toBe(false);
  });

  it('fails on a closed port and on a proxy that never answers', async () => {
    expect((await checkProxy('http', '127.0.0.1', dead, target, 2000)).ok).toBe(false);
    expect(await checkProxy('http', '127.0.0.1', silent, target, 200)).toEqual({ ok: false, error: 'timeout' });
  });
});
