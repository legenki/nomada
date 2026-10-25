import { describe, it, expect } from 'vitest';
import { createTz } from '../src/content/tz';

const tz = createTz(Date, Intl.DateTimeFormat);
const at = (iso: string) => Date.parse(iso);

describe('offsetMinutes', () => {
  it('handles fixed and DST zones', () => {
    expect(tz.offsetMinutes(at('2026-01-15T12:00:00Z'), 'America/Argentina/Buenos_Aires')).toBe(-180);
    expect(tz.offsetMinutes(at('2026-01-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(tz.offsetMinutes(at('2026-01-15T12:00:00Z'), 'Europe/Berlin')).toBe(60);
    expect(tz.offsetMinutes(at('2026-07-15T12:00:00Z'), 'Europe/Berlin')).toBe(120);
  });

  it('is NaN for invalid times', () => {
    expect(tz.offsetMinutes(NaN, 'UTC')).toBeNaN();
  });
});

describe('fields', () => {
  it('reads wall-clock time in the zone', () => {
    const [y, mo, d, h, mi, s, , wd] = tz.fields(at('2026-10-22T23:30:15Z'), 'Asia/Tokyo');
    expect([y, mo, d, h, mi, s, wd]).toEqual([2026, 9, 23, 8, 30, 15, 5]); // Fri Oct 23, 08:30:15
  });
});

describe('wallToUtc', () => {
  it('round-trips wall time to the right instant', () => {
    const wall = Date.UTC(2026, 9, 22, 14, 0, 0);
    expect(new Date(tz.wallToUtc(wall, 'America/Argentina/Buenos_Aires')).toISOString()).toBe('2026-10-22T17:00:00.000Z');
  });

  it('is correct on both sides of a DST change', () => {
    // Berlin switches to summer time on 2026-03-29 at 02:00 local.
    expect(new Date(tz.wallToUtc(Date.UTC(2026, 2, 29, 1, 0), 'Europe/Berlin')).toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(new Date(tz.wallToUtc(Date.UTC(2026, 2, 29, 4, 0), 'Europe/Berlin')).toISOString()).toBe('2026-03-29T02:00:00.000Z');
  });
});

describe('string forms', () => {
  const t = at('2026-10-22T17:32:10Z');

  it('matches the Date.prototype.toDateString shape', () => {
    expect(tz.dateString(t, 'America/Argentina/Buenos_Aires')).toBe('Thu Oct 22 2026');
  });

  it('matches the Date.prototype.toTimeString shape', () => {
    expect(tz.timeString(t, 'America/Argentina/Buenos_Aires', 'en-US'))
      .toBe('14:32:10 GMT-0300 (Argentina Standard Time)');
    expect(tz.timeString(t, 'Asia/Kolkata', 'en-US')).toMatch(/^23:02:10 GMT\+0530 \(/);
  });
});
