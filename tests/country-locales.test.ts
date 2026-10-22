import { describe, it, expect } from 'vitest';
import { localeForCountry, acceptLanguageFor } from '../src/lib/country-locales';

describe('localeForCountry', () => {
  it('uses the mapped locale for known countries', () => {
    expect(localeForCountry('ar')).toBe('es-AR');
  });

  it('keeps the user language with the country as region for unmapped countries', () => {
    expect(localeForCountry('KZ', 'ru')).toBe('ru-KZ');
    expect(localeForCountry('KZ')).toBe('en-KZ');
  });

  it('falls back to en-US for a missing or malformed country', () => {
    expect(localeForCountry('')).toBe('en-US');
    expect(localeForCountry('XYZ', 'de')).toBe('en-US');
  });
});

describe('acceptLanguageFor', () => {
  it('adds the bare language as a lower-priority fallback', () => {
    expect(acceptLanguageFor('es-AR')).toBe('es-AR,es;q=0.9');
  });

  it('leaves a bare language alone', () => {
    expect(acceptLanguageFor('en')).toBe('en');
  });
});
