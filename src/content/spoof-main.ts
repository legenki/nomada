// Runs in the page's own JS world at document_start (registered only while
// Nomada is ON). Makes the page see the proxy's timezone, locale and location.
// The config arrives from spoof-bridge.ts (isolated world) through a DOM event;
// until it does — and whenever it's cleared — every hook passes through.
import type { SpoofConfig } from '../types';
import { createTz } from './tz';

export const CONFIG_EVENT = 'nomada:config';
const INSTALLED_KEY = '__nomada_installed__';

let cfg: SpoofConfig | null = null;
let frozenLanguages: readonly string[] | null = null;

// Sources shown by Function.prototype.toString for our replacements.
const disguised = new WeakMap<object, string>();
const installed = new WeakSet<object>();

type AnyFn = (...args: never[]) => unknown;

/** A non-constructible, prototype-less function with a native-looking name — like real built-ins. */
function nativeLike<F extends AnyFn>(name: string, length: number, impl: F): F {
  const fn = { [name](this: unknown, ...args: unknown[]) { return (impl as AnyFn).apply(this, args as never[]); } }[name];
  Object.defineProperty(fn, 'length', { value: length, configurable: true });
  disguised.set(fn, `function ${name}() { [native code] }`);
  return fn as unknown as F;
}

function replaceMethod<T extends object>(obj: T, key: string, make: (orig: AnyFn) => AnyFn): void {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d || typeof d.value !== 'function') return;
  const orig = d.value as AnyFn;
  Object.defineProperty(obj, key, { ...d, value: nativeLike(key, orig.length, make(orig)) });
}

function replaceGetter<T extends object>(obj: T, key: string, make: (orig: () => unknown) => () => unknown): void {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  if (!d?.get) return;
  const getter = nativeLike(`get ${key}`, 0, make(d.get));
  disguised.set(getter, `function get ${key}() { [native code] }`);
  Object.defineProperty(obj, key, { ...d, get: getter });
}

/** Replace a global constructor with a Proxy that rewrites its arguments. */
function proxyConstructor<C extends AnyFn & { prototype: object }>(
  holder: object, key: string, rewrite: (args: unknown[]) => unknown[],
  onApply?: (target: C, args: unknown[]) => unknown,
): C | undefined {
  const target = (holder as Record<string, unknown>)[key] as C | undefined;
  if (typeof target !== 'function') return undefined;
  const proxy: C = new Proxy(target, {
    construct: (t, args, newTarget): object =>
      Reflect.construct(t, cfg ? rewrite(args) : args, newTarget === proxy ? t : newTarget),
    apply: (t, thisArg, args) =>
      cfg && onApply ? onApply(t, args) : Reflect.apply(t, thisArg, cfg ? rewrite(args) : args),
  });
  disguised.set(proxy, `function ${key}() { [native code] }`);
  Object.defineProperty(target.prototype, 'constructor', {
    value: proxy, writable: true, configurable: true, enumerable: false,
  });
  Object.defineProperty(holder, key, { value: proxy, writable: true, configurable: true, enumerable: false });
  return target;
}

export const withTimeZone = (options: unknown, c: SpoofConfig | null = cfg): unknown => {
  if (!c) return options;
  if (options === undefined) return { timeZone: c.timezone };
  if (options === null || typeof options !== 'object') return options; // let the engine throw as usual
  const o = options as Record<string, unknown>;
  return o.timeZone === undefined ? { ...o, timeZone: c.timezone } : options;
};

export const withLocale = (locales: unknown, c: SpoofConfig | null = cfg): unknown => {
  if (!c) return locales;
  if (locales === undefined) return c.locale;
  // If an empty array is passed, V8 falls back to system locale; wrap with spoofed locale.
  if (Array.isArray(locales) && locales.length === 0) return [c.locale];
  return locales;
};

/** ECMAScript ToIntegerOrInfinity mapping for 2-digit years. */
export function normalizeYear(val: number): number {
  const y = Math.trunc(val);
  return y >= 0 && y <= 99 ? y + 1900 : y;
}
export function applyConfig(newCfg: SpoofConfig | null): void {
  cfg = newCfg;
  frozenLanguages = null;
}

export function install(win: Window & typeof globalThis): void {
  const winObj = win as unknown as Record<string, unknown>;
  if (winObj[INSTALLED_KEY] || installed.has(win)) return;
  try {
    Object.defineProperty(win, INSTALLED_KEY, { value: true, configurable: false, enumerable: false, writable: false });
  } catch {
    // Sealed window
  }
  installed.add(win);

  // Capture originals before anything in this window is patched.
  const RealDate = win.Date;
  const RealDTF = win.Intl.DateTimeFormat;
  const tz = createTz(RealDate, RealDTF);
  const DP = RealDate.prototype;
  const getTime = DP.getTime;
  const setTime = DP.setTime;
  const realTzOffset = DP.getTimezoneOffset;
  const realParse = RealDate.parse;

  // ── Protect internal event from page-script forgery ───────────────────
  if (win.EventTarget?.prototype) {
    replaceMethod(win.EventTarget.prototype, 'dispatchEvent', orig => function (this: EventTarget, event: Event) {
      if (event?.type === CONFIG_EVENT) {
        return false;
      }
      return orig.call(this as never, event as never);
    });
  }

  // ── Function.prototype.toString: keep replacements looking native ──────
  replaceMethod(win.Function.prototype, 'toString', orig => function (this: unknown) {
    return typeof this === 'function' || (typeof this === 'object' && this !== null)
      ? disguised.get(this as object) ?? orig.call(this as never)
      : orig.call(this as never);
  });

  // ── Date: local-time getters ───────────────────────────────────────────
  const FIELD = { getFullYear: 0, getMonth: 1, getDate: 2, getHours: 3, getMinutes: 4, getSeconds: 5, getDay: 7 } as const;
  for (const [name, idx] of Object.entries(FIELD)) {
    replaceMethod(DP, name, orig => function (this: Date) {
      const t = getTime.call(this); // throws on non-dates, like the original
      if (!cfg) return orig.call(this as never);
      return Number.isNaN(t) ? NaN : tz.fields(t, cfg.timezone)[idx];
    });
  }
  replaceMethod(DP, 'getYear', orig => function (this: Date) {
    const t = getTime.call(this);
    if (!cfg) return orig.call(this as never);
    return Number.isNaN(t) ? NaN : tz.fields(t, cfg.timezone)[0] - 1900;
  });
  replaceMethod(DP, 'getTimezoneOffset', orig => function (this: Date) {
    const t = getTime.call(this);
    if (!cfg) return orig.call(this as never);
    return Number.isNaN(t) ? NaN : -tz.offsetMinutes(t, cfg.timezone);
  });

  // ── Date: local-time setters ───────────────────────────────────────────
  const SETTERS = { setFullYear: [0, 3], setMonth: [1, 2], setDate: [2, 1], setHours: [3, 4], setMinutes: [4, 3], setSeconds: [5, 2] } as const;
  for (const [name, [start, max]] of Object.entries(SETTERS)) {
    replaceMethod(DP, name, orig => function (this: Date, ...args: unknown[]) {
      let t = getTime.call(this);
      if (!cfg) return orig.apply(this as never, args as never[]);
      if (Number.isNaN(t)) {
        if (name !== 'setFullYear') return NaN;
        t = tz.wallToUtc(0, cfg.timezone); // spec: an invalid date's year is set from local +0
      }
      const f = tz.fields(t, cfg.timezone);
      const n = Math.max(1, Math.min(args.length, max));
      for (let i = 0; i < n; i++) f[start + i] = Number(args[i]);
      if (f.slice(0, 7).some(v => !Number.isFinite(v))) return setTime.call(this, NaN);
      const wall = tz.utcFromFields(f[0], f[1], f[2], f[3], f[4], f[5], f[6]);
      return setTime.call(this, tz.wallToUtc(wall, cfg.timezone));
    });
  }

  // ── Date: string forms ─────────────────────────────────────────────────
  replaceMethod(DP, 'toString', orig => function (this: Date) {
    const t = getTime.call(this);
    if (!cfg) return orig.call(this as never);
    if (Number.isNaN(t)) return 'Invalid Date';
    return `${tz.dateString(t, cfg.timezone)} ${tz.timeString(t, cfg.timezone, cfg.locale)}`;
  });
  replaceMethod(DP, 'toDateString', orig => function (this: Date) {
    const t = getTime.call(this);
    if (!cfg) return orig.call(this as never);
    return Number.isNaN(t) ? 'Invalid Date' : tz.dateString(t, cfg.timezone);
  });
  replaceMethod(DP, 'toTimeString', orig => function (this: Date) {
    const t = getTime.call(this);
    if (!cfg) return orig.call(this as never);
    return Number.isNaN(t) ? 'Invalid Date' : tz.timeString(t, cfg.timezone, cfg.locale);
  });
  for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    replaceMethod(DP, name, orig => function (this: Date, locales?: unknown, options?: unknown) {
      return orig.call(this as never, withLocale(locales) as never, withTimeZone(options) as never);
    });
  }

  // ── Date: constructor and parse (local-time inputs) ────────────────────
  const hasExplicitZone = (s: string) =>
    /(?:Z|[+-]\d{2}:?\d{2}|\b(?:GMT|UTC|UT|[ECMP][SD]T)\b[+-]?\d{0,4})\s*(?:\([^)]*\))?\s*$/i.test(s.trim())
    || /^\d{4}(?:-\d{2}){0,2}$/.test(s.trim()); // ISO date-only strings are UTC by spec

  function parseLocal(str: string): number {
    const t = realParse(str);
    if (Number.isNaN(t) || !cfg || hasExplicitZone(str)) return t;
    // The engine read it as wall time in the *real* zone; reinterpret in the spoofed one.
    const wall = t - realTzOffset.call(new RealDate(t)) * 60000;
    return tz.wallToUtc(wall, cfg.timezone);
  }

  Object.defineProperty(RealDate, 'parse', {
    value: nativeLike('parse', 1, (s: unknown) => parseLocal(String(s))),
    writable: true, configurable: true, enumerable: false,
  });

  proxyConstructor<DateConstructor & AnyFn>(win, 'Date', args => {
    if (args.length === 1 && typeof args[0] === 'string') return [parseLocal(args[0])];
    if (args.length < 2) return args;
    const n = args.slice(0, 7).map(Number);
    const year = normalizeYear(n[0]);
    const f = [year, n[1], n[2] ?? 1, n[3] ?? 0, n[4] ?? 0, n[5] ?? 0, n[6] ?? 0];
    if (f.some(v => !Number.isFinite(v))) return [NaN];
    return [tz.wallToUtc(tz.utcFromFields(f[0], f[1], f[2], f[3], f[4], f[5], f[6]), cfg!.timezone)];
  }, () => {
    // Date() called as a function returns the current time as a string.
    const t = getTime.call(new RealDate());
    return `${tz.dateString(t, cfg!.timezone)} ${tz.timeString(t, cfg!.timezone, cfg!.locale)}`;
  });

  // ── Intl: default locale and timezone ──────────────────────────────────
  proxyConstructor<typeof Intl.DateTimeFormat & AnyFn>(win.Intl, 'DateTimeFormat',
    ([locales, options, ...rest]) => [withLocale(locales), withTimeZone(options), ...rest]);
  for (const name of ['NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat', 'DisplayNames', 'Segmenter']) {
    proxyConstructor(win.Intl, name, ([locales, ...rest]) => [withLocale(locales), ...rest]);
  }
  for (const [proto, name, localeArg] of [
    [win.Number?.prototype, 'toLocaleString', 0],
    [win.BigInt?.prototype, 'toLocaleString', 0],
    [win.String?.prototype, 'localeCompare', 1],
    [win.String?.prototype, 'toLocaleUpperCase', 0],
    [win.String?.prototype, 'toLocaleLowerCase', 0],
  ] as const) {
    if (!proto) continue;
    replaceMethod(proto, name, orig => function (this: unknown, ...args: unknown[]) {
      if (cfg && args[localeArg] === undefined) {
        args = [...args];
        args[localeArg] = cfg.locale;
      }
      return orig.apply(this as never, args as never[]);
    });
  }

  // ── navigator.language(s) ──────────────────────────────────────────────
  const NP = win.Navigator.prototype;
  replaceGetter(NP, 'language', orig => function (this: Navigator) {
    return cfg ? cfg.languages[0] : orig.call(this);
  });
  replaceGetter(NP, 'languages', orig => function (this: Navigator) {
    if (!cfg) return orig.call(this);
    frozenLanguages ??= Object.freeze([...cfg.languages]);
    return frozenLanguages;
  });

  // ── Geolocation: same permission flow, the proxy's coordinates ─────────
  const GeoPosition = (win as unknown as Record<string, { prototype: object } | undefined>).GeolocationPosition;
  const GeoCoords = (win as unknown as Record<string, { prototype: object } | undefined>).GeolocationCoordinates;
  function fakePosition(c: SpoofConfig): GeolocationPosition {
    const coordsData = {
      latitude: c.lat, longitude: c.lon, accuracy: 20,
      altitude: null, altitudeAccuracy: null, heading: null, speed: null,
    };
    const timestamp = Date.now();
    const coords = Object.create(GeoCoords?.prototype ?? Object.prototype);
    for (const [k, v] of Object.entries(coordsData)) Object.defineProperty(coords, k, { value: v, enumerable: true });
    Object.defineProperty(coords, 'toJSON', { value: () => ({ ...coordsData }) });
    const pos = Object.create(GeoPosition?.prototype ?? Object.prototype);
    Object.defineProperty(pos, 'coords', { value: coords, enumerable: true });
    Object.defineProperty(pos, 'timestamp', { value: timestamp, enumerable: true });
    Object.defineProperty(pos, 'toJSON', { value: () => ({ coords: { ...coordsData }, timestamp }) });
    return pos;
  }
  const GP = win.Geolocation?.prototype;
  if (GP) {
    for (const name of ['getCurrentPosition', 'watchPosition']) {
      replaceMethod(GP, name, orig => function (this: Geolocation, success?: unknown, error?: unknown, options?: unknown) {
        if (!cfg || typeof success !== 'function') return orig.call(this, success as never, error as never, options as never);
        const c = cfg;
        const ok = () => (success as PositionCallback)(fakePosition(c));
        // Keep the real permission prompt; only a denial is passed through as-is.
        return orig.call(this, ok as never, ((err: GeolocationPositionError) => {
          if (err.code === 1) (error as PositionErrorCallback | undefined)?.(err);
          else ok();
        }) as never, options as never);
      });
    }
  }

  // ── Same-origin iframes: patch them as soon as the page touches them ───
  for (const Frame of [win.HTMLIFrameElement, win.HTMLFrameElement]) {
    if (!Frame) continue;
    replaceGetter(Frame.prototype, 'contentWindow', orig => function (this: HTMLIFrameElement) {
      const w = orig.call(this) as (Window & typeof globalThis) | null;
      try { if (w) install(w); } catch { /* cross-origin */ }
      return w;
    });
    replaceGetter(Frame.prototype, 'contentDocument', orig => function (this: HTMLIFrameElement) {
      const d = orig.call(this) as Document | null;
      try { if (d?.defaultView) install(d.defaultView as Window & typeof globalThis); } catch { /* cross-origin */ }
      return d;
    });
  }
}

if (typeof window !== 'undefined') {
  try {
    install(window);
  } catch {
    // Never break the page.
  }

  // Listen on window (highest in capture hierarchy). Runs before any page listeners.
  window.addEventListener(CONFIG_EVENT, e => {
    e.stopImmediatePropagation();
    const detail = (e as CustomEvent<unknown>).detail;
    try {
      applyConfig(typeof detail === 'string' && detail ? JSON.parse(detail) as SpoofConfig : null);
    } catch {
      applyConfig(null);
    }
  }, true);
}
