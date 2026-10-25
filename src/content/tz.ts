// Time-zone arithmetic for the page-level spoofing script. Built only on the
// *original* Date and Intl.DateTimeFormat, captured before anything is patched,
// so it never calls back into its own overrides.

/** Local wall-clock fields: [year, month0, day, hours, minutes, seconds, ms, weekday]. */
export type Fields = [number, number, number, number, number, number, number, number];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

export function createTz(RealDate: DateConstructor, RealDTF: typeof Intl.DateTimeFormat) {
  const P = RealDate.prototype;
  const { getUTCFullYear, getUTCMonth, getUTCDate, getUTCHours, getUTCMinutes, getUTCSeconds,
    getUTCMilliseconds, getUTCDay, setUTCFullYear, setUTCHours } = P;
  const scratch = new RealDate(0);

  const partsCache = new Map<string, Intl.DateTimeFormat>();
  const nameCache = new Map<string, Intl.DateTimeFormat>();

  function partsFormatter(tz: string): Intl.DateTimeFormat {
    let f = partsCache.get(tz);
    if (!f) {
      f = new RealDTF('en-US', {
        timeZone: tz, hourCycle: 'h23', era: 'short',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
      partsCache.set(tz, f);
    }
    return f;
  }

  /** UTC ms for the given fields read as UTC (full years, no 0–99 → 19xx quirk). */
  function utcFromFields(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): number {
    setUTCFullYear.call(scratch, y, mo, d);
    setUTCHours.call(scratch, h, mi, s, ms);
    return scratch.getTime();
  }

  /** Minutes to add to UTC to get local time in `tz` at instant `t`. */
  function offsetMinutes(t: number, tz: string): number {
    if (!Number.isFinite(t)) return NaN;
    const parts = partsFormatter(tz).formatToParts(t);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    const era = parts.find(p => p.type === 'era')?.value;
    let year = get('year');
    if (era === 'BC' || era === 'B') year = 1 - year;
    const local = utcFromFields(year, get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'), 0);
    const utcSecond = t - (((t % 1000) + 1000) % 1000);
    return Math.round((local - utcSecond) / 60000);
  }

  /** Wall-clock time in `tz` (expressed as if it were UTC ms) → real UTC ms. */
  function wallToUtc(wall: number, tz: string): number {
    if (!Number.isFinite(wall)) return NaN;
    const first = wall - offsetMinutes(wall, tz) * 60000;
    return wall - offsetMinutes(first, tz) * 60000;
  }

  function fields(t: number, tz: string): Fields {
    scratch.setTime(t + offsetMinutes(t, tz) * 60000);
    return [
      getUTCFullYear.call(scratch), getUTCMonth.call(scratch), getUTCDate.call(scratch),
      getUTCHours.call(scratch), getUTCMinutes.call(scratch), getUTCSeconds.call(scratch),
      getUTCMilliseconds.call(scratch), getUTCDay.call(scratch),
    ];
  }

  function zoneName(t: number, tz: string, locale: string): string {
    const key = `${tz}|${locale}`;
    let f = nameCache.get(key);
    if (!f) {
      try {
        f = new RealDTF(locale, { timeZone: tz, timeZoneName: 'long' });
      } catch {
        f = new RealDTF('en-US', { timeZone: tz, timeZoneName: 'long' });
      }
      nameCache.set(key, f);
    }
    return f.formatToParts(t).find(p => p.type === 'timeZoneName')?.value ?? tz;
  }

  function yearString(y: number): string {
    return y < 0 ? `-${pad(y, 6)}` : pad(y, 4);
  }

  /** Same shape as Date.prototype.toDateString: "Tue Oct 22 2026". */
  function dateString(t: number, tz: string): string {
    const [y, mo, d, , , , , wd] = fields(t, tz);
    return `${WEEKDAYS[wd]} ${MONTHS[mo]} ${pad(d)} ${yearString(y)}`;
  }

  /** Same shape as Date.prototype.toTimeString: "14:32:10 GMT-0300 (Argentina Standard Time)". */
  function timeString(t: number, tz: string, locale: string): string {
    const [, , , h, mi, s] = fields(t, tz);
    const off = offsetMinutes(t, tz);
    const sign = off < 0 ? '-' : '+';
    const gmt = `GMT${sign}${pad(Math.trunc(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`;
    return `${pad(h)}:${pad(mi)}:${pad(s)} ${gmt} (${zoneName(t, tz, locale)})`;
  }

  return { offsetMinutes, wallToUtc, fields, utcFromFields, dateString, timeString };
}

export type Tz = ReturnType<typeof createTz>;
