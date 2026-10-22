import { describe, it, expect } from 'vitest';
import { escHtml, safeColor } from '../src/lib/html';
import { isGeoActive, hasGeoTarget } from '../src/lib/state';
import { resolveIconPaths } from '../src/lib/icon-paths';

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

describe('isGeoActive', () => {
  const geo = { enabled: true, timezone: 'Europe/Moscow' };

  it('needs the master switch, the geo flag and a place', () => {
    expect(isGeoActive({ enabled: true, geo })).toBe(true);
    expect(isGeoActive({ enabled: false, geo })).toBe(false);
    expect(isGeoActive({ enabled: true, geo: { ...geo, enabled: false } })).toBe(false);
    expect(isGeoActive({ enabled: true, geo: { enabled: true } })).toBe(false);
  });

  it('requires both coordinates to count as a place', () => {
    expect(hasGeoTarget({ enabled: true, lat: 1 })).toBe(false);
    expect(hasGeoTarget({ enabled: true, lat: 1, lon: 2 })).toBe(true);
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
