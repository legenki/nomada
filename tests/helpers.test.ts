import { describe, it, expect } from 'vitest';
import { escHtml, safeColor } from '../src/lib/html';
import { activeProfileOf, isProtected, proxyPlaceOf } from '../src/lib/state';
import { resolveIconPaths } from '../src/lib/icon-paths';
import { nearestIconColor } from '../src/lib/icon-color';
import { fade } from '../src/popup/globe';
import { languagesFor } from '../src/lib/country-locales';
import type { WooPortalData } from '../src/types';

describe('escHtml', () => {
  it('escapes quotes so values are safe inside attributes', () => {
    expect(escHtml(`a"b'<c>&`)).toBe('a&quot;b&#39;&lt;c&gt;&amp;');
  });
});

describe('safeColor', () => {
  it('accepts hex colours and replaces anything else', () => {
    expect(safeColor('#0969da')).toBe('#0969da');
    expect(safeColor('red;background:url(x)')).toBe('#808080');
  });
});

describe('nearestIconColor', () => {
  it('matches 6-digit hex colours to nearest palette variant', () => {
    expect(nearestIconColor('#cf222e')).toBe('red');
    expect(nearestIconColor('#0969da')).toBe('blue');
  });

  it('matches 3-digit hex colours as well', () => {
    expect(nearestIconColor('#f00')).toBe('red');
    expect(nearestIconColor('#00f')).toBe('blue');
  });

  it('returns null for empty or invalid hex values', () => {
    expect(nearestIconColor(null)).toBeNull();
    expect(nearestIconColor('invalid')).toBeNull();
  });
});

describe('fade', () => {
  it('preserves rgb components for rgba colors and zeroes alpha', () => {
    expect(fade('rgba(22, 163, 74, 0.3)')).toBe('rgba(22,163,74,0)');
  });

  it('parses 6-digit and 3-digit hex colors into zero-alpha rgba', () => {
    expect(fade('#16a34a')).toBe('rgba(22,163,74,0)');
    expect(fade('#fff')).toBe('rgba(255,255,255,0)');
  });

  it('falls back to rgba(0,0,0,0) on invalid input', () => {
    expect(fade('invalid')).toBe('rgba(0,0,0,0)');
  });
});

describe('state', () => {
  const place = { ip: '1.1.1.1', city: 'X', country: 'Y', countryCode: 'YY', lat: 0, lon: 0, timezone: 'UTC', locale: 'en', checkedAt: 0 };
  const base = {
    version: 3, enabled: true, activeProfileId: 'p1',
    profiles: [{ id: 'p1' }], proxyPlace: { ...place, profileId: 'p1' }, settings: {},
  } as unknown as WooPortalData;

  it('is protected only when ON, with a selected proxy and its location known', () => {
    expect(isProtected(base)).toBe(true);
    expect(isProtected({ ...base, enabled: false })).toBe(false);
    expect(isProtected({ ...base, proxyPlace: undefined })).toBe(false);
  });

  it('ignores a proxy location from another profile', () => {
    expect(proxyPlaceOf({ ...base, proxyPlace: { ...place, profileId: 'p2' } })).toBeUndefined();
  });

  it('has no active profile while OFF', () => {
    expect(activeProfileOf({ ...base, enabled: false })).toBeUndefined();
    expect(activeProfileOf(base)?.id).toBe('p1');
  });
});

describe('languagesFor', () => {
  it('lists the locale then its bare language', () => {
    expect(languagesFor('es-AR')).toEqual(['es-AR', 'es']);
    expect(languagesFor('en')).toEqual(['en']);
  });
});

describe('resolveIconPaths', () => {
  it('is grey when off, green when on, tinted with a known proxy colour', () => {
    expect(resolveIconPaths(false, 'red')['16']).toBe('icons/icon-inactive-16.png');
    expect(resolveIconPaths(true, null)['16']).toBe('icons/icon-active-green-16.png');
    expect(resolveIconPaths(true, 'red')['16']).toBe('icons/icon-active-red-16.png');
    expect(resolveIconPaths(true, 'magenta')['16']).toBe('icons/icon-active-green-16.png');
  });
});
