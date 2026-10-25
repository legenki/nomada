import { describe, it, expect } from 'vitest';
import { withLocale, normalizeYear, install, CONFIG_EVENT } from '../src/content/spoof-main';
import type { SpoofConfig } from '../src/types';

const config: SpoofConfig = {
  timezone: 'America/Argentina/Buenos_Aires',
  locale: 'es-AR',
  languages: ['es-AR', 'es'],
  lat: -34.61,
  lon: -58.38,
};

describe('withLocale', () => {
  it('returns untouched locales when config is null', () => {
    expect(withLocale(undefined, null)).toBeUndefined();
    expect(withLocale([], null)).toEqual([]);
  });

  it('replaces undefined with config.locale', () => {
    expect(withLocale(undefined, config)).toBe('es-AR');
  });

  it('replaces empty array with [config.locale] so Intl does not leak system locale', () => {
    expect(withLocale([], config)).toEqual(['es-AR']);
  });

  it('preserves explicitly specified non-empty locales', () => {
    expect(withLocale('fr-FR', config)).toBe('fr-FR');
    expect(withLocale(['de-DE'], config)).toEqual(['de-DE']);
  });
});

describe('normalizeYear', () => {
  it('truncates floats and maps 0-99 to 1900-1999 according to ECMA-262', () => {
    expect(normalizeYear(99)).toBe(1999);
    expect(normalizeYear(99.9)).toBe(1999);
    expect(normalizeYear(0)).toBe(1900);
    expect(normalizeYear(0.5)).toBe(1900);
    expect(normalizeYear(2026)).toBe(2026);
    expect(normalizeYear(-10)).toBe(-10);
  });
});

describe('install and dispatchEvent isolation', () => {
  it('blocks page-originated nomada:config dispatch and protects against double installation', () => {
    let nativeDispatched = false;
    class FakeEventTarget {
      dispatchEvent(_event: { type: string }) {
        nativeDispatched = true;
        return true;
      }
    }
    function FakeDate() {}
    FakeDate.prototype = {};
    function FakeDTF() {}
    FakeDTF.prototype = {};

    const fakeWin = {
      Date: FakeDate,
      Intl: { DateTimeFormat: FakeDTF },
      Function: { prototype: {} },
      EventTarget: FakeEventTarget,
      Navigator: { prototype: {} },
    } as unknown as Window & typeof globalThis;

    install(fakeWin);
    const winObj = fakeWin as unknown as Record<string, unknown>;
    expect(winObj.__nomada_installed__).toBe(true);

    const target = new FakeEventTarget();
    const blocked = target.dispatchEvent({ type: CONFIG_EVENT });
    expect(blocked).toBe(false);
    expect(nativeDispatched).toBe(false);

    const otherAllowed = target.dispatchEvent({ type: 'click' });
    expect(otherAllowed).toBe(true);
    expect(nativeDispatched).toBe(true);

    // Second call on already installed window is a no-op
    install(fakeWin);
  });
});
