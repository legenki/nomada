import { describe, it, expect } from 'vitest';
import { escHtml, safeColor } from '../src/lib/html';
import { activeProfileOf, isProtected, proxyPlaceOf } from '../src/lib/state';
import { resolveIconPaths } from '../src/lib/icon-paths';
import { nearestIconColor } from '../src/lib/icon-color';
import { fade, mixColor, mixTint, moodOf, parseColor } from '../src/popup/globe';
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

describe('globe colours', () => {
  it('reads hex and rgb(a) colours', () => {
    expect(parseColor('#16a34a')).toEqual([22, 163, 74, 1]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('rgba(220, 38, 38, 0.24)')).toEqual([220, 38, 38, 0.24]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('red')).toBeNull();
  });

  it('mixes from one colour to the other', () => {
    expect(mixColor('#000000', '#ffffff', 0)).toBe('rgba(0,0,0,1)');
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgba(128,128,128,1)');
    expect(mixColor('rgba(0,0,0,0.2)', 'rgba(200,100,0,0.4)', 1)).toBe('rgba(200,100,0,0.4)');
    expect(mixColor('red', '#16a34a', 0.5)).toBe('#16a34a');
  });

  it('mixes every part of a tint', () => {
    const a = { dot: '#000', sphere: '#000', sphereEdge: '#000', glow: 'rgba(0,0,0,0)' };
    const b = { dot: '#fff', sphere: '#fff', sphereEdge: '#fff', glow: 'rgba(255,255,255,1)' };
    expect(mixTint(a, b, 1)).toEqual({
      dot: 'rgba(255,255,255,1)', sphere: 'rgba(255,255,255,1)', sphereEdge: 'rgba(255,255,255,1)', glow: 'rgba(255,255,255,1)',
    });
  });

  it('is red when something is wrong, green while protected, neutral otherwise', () => {
    const scene = { real: null, proxy: null, active: false, connecting: false };
    expect(moodOf(scene)).toBe('off');
    expect(moodOf({ ...scene, connecting: true })).toBe('off');
    expect(moodOf({ ...scene, active: true })).toBe('on');
    expect(moodOf({ ...scene, alert: true })).toBe('alert');
  });
});
