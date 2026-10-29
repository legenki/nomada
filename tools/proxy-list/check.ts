import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import type { ProxyType } from './lists.ts';

/** Where to ask "what's my IP?" through the proxy. */
export interface Target {
  host: string;
  port: number;
  path: string;
  tls: boolean;
}

export const IPIFY: Target = { host: 'api.ipify.org', port: 443, path: '/?format=json', tls: true };

export type CheckResult = { ok: true; ip: string; ms: number } | { ok: false; error: string };

/** Buffered reads from a stream that arrives in arbitrary chunks. */
function reader(stream: net.Socket) {
  let buf = Buffer.alloc(0);
  let ended = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  const onData = (chunk: Buffer) => { buf = Buffer.concat([buf, chunk]); wake?.(); };
  stream.on('data', onData);
  stream.on('end', () => { ended = true; wake?.(); });
  stream.on('error', e => { failure = e; wake?.(); });

  /** Wait until `take` says how many buffered bytes to return. */
  async function until(take: (b: Buffer) => number): Promise<Buffer> {
    for (;;) {
      const n = take(buf);
      if (n >= 0) {
        const out = buf.subarray(0, n);
        buf = buf.subarray(n);
        return out;
      }
      if (failure) throw failure;
      if (ended) throw new Error('closed');
      await new Promise<void>(resolve => { wake = resolve; });
      wake = null;
    }
  }

  return {
    bytes: (n: number) => until(b => (b.length >= n ? n : -1)),
    through: (delimiter: string) => until(b => { const i = b.indexOf(delimiter); return i < 0 ? -1 : i + delimiter.length; }),
    all: () => until(b => (ended ? b.length : -1)),
    /** Stop reading the raw stream (before TLS takes it over). */
    release: () => { stream.off('data', onData); },
  };
}

/** Open a tunnel to `target` through an HTTP proxy (CONNECT). */
async function connectHttp(socket: net.Socket, read: ReturnType<typeof reader>, target: Target): Promise<void> {
  socket.write(`CONNECT ${target.host}:${target.port} HTTP/1.1\r\nHost: ${target.host}:${target.port}\r\n\r\n`);
  const head = (await read.through('\r\n\r\n')).toString('latin1');
  if (!/^HTTP\/1\.[01] 200/.test(head)) throw new Error(`proxy answered ${head.split('\r\n')[0]}`);
}

/** Open a tunnel to `target` through a SOCKS5 proxy (no login; the proxy resolves the name). */
async function connectSocks5(socket: net.Socket, read: ReturnType<typeof reader>, target: Target): Promise<void> {
  socket.write(Buffer.from([5, 1, 0]));
  const hello = await read.bytes(2);
  if (hello[0] !== 5 || hello[1] !== 0) throw new Error('not a SOCKS5 proxy without login');
  const name = Buffer.from(target.host);
  socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([target.port >> 8, target.port & 255])]));
  const reply = await read.bytes(4);
  if (reply[0] !== 5 || reply[1] !== 0) throw new Error(`SOCKS5 connect failed (${reply[1]})`);
  const addressLength = reply[3] === 1 ? 4 : reply[3] === 4 ? 16 : (await read.bytes(1))[0];
  await read.bytes(addressLength + 2);
}

/**
 * Ask `target` for our IP through the proxy. Works only if the proxy really
 * speaks `type` and lets traffic out; `ms` is the whole round trip.
 */
export async function checkProxy(type: ProxyType, host: string, port: number, target = IPIFY, timeoutMs = 5000): Promise<CheckResult> {
  const started = performance.now();
  const socket = net.connect({ host, port });
  const timer = setTimeout(() => socket.destroy(new Error('timeout')), timeoutMs);
  try {
    await once(socket, 'connect');
    const raw = reader(socket);
    await (type === 'http' ? connectHttp : connectSocks5)(socket, raw, target);
    raw.release();

    let stream: net.Socket = socket;
    if (target.tls) {
      stream = tls.connect({ socket, servername: target.host });
      stream.on('error', () => {}); // a failed handshake rejects below; later errors don't matter
      await once(stream, 'secureConnect');
    }
    const response = reader(stream);
    stream.write(`GET ${target.path} HTTP/1.1\r\nHost: ${target.host}\r\nUser-Agent: nomada-proxy-check\r\nConnection: close\r\n\r\n`);
    const body = (await response.all()).toString('utf8');
    const ip = /"ip"\s*:\s*"([^"]+)"/.exec(body)?.[1];
    if (!ip) throw new Error('no IP in the answer');
    return { ok: true, ip, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}
