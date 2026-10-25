import { describe, it, expect } from 'vitest';
import { toPlace } from '../src/background/places';

describe('toPlace', () => {
  const raw = {
    success: true, ip: '185.218.0.68', country: 'Russia', country_code: 'ru', city: 'Saint Petersburg',
    latitude: 59.93, longitude: 30.32, timezone: { id: 'Europe/Moscow' },
  };

  it('normalizes an ipwho.is answer', () => {
    expect(toPlace(raw)).toMatchObject({
      ip: '185.218.0.68', city: 'Saint Petersburg', country: 'Russia', countryCode: 'RU',
      lat: 59.93, lon: 30.32, timezone: 'Europe/Moscow', locale: 'ru-RU',
    });
  });

  it('builds a locale from the user language for unmapped countries', () => {
    expect(toPlace({ ...raw, country_code: 'KZ' }, 'de')?.locale).toBe('de-KZ');
  });

  it('rejects failed or incomplete answers', () => {
    expect(toPlace({ success: false })).toBeNull();
    expect(toPlace({ ...raw, latitude: undefined })).toBeNull();
    expect(toPlace(null)).toBeNull();
  });
});
