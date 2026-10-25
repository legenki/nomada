import { describe, it, expect } from 'vitest';
import { spoofConfigOf, isFresh } from '../src/background/state-helpers';
import type { Place, ProxyPlace, WooPortalData } from '../src/types';

const place: ProxyPlace = {
  ip: '185.218.0.68',
  city: 'Saint Petersburg',
  country: 'Russia',
  countryCode: 'RU',
  lat: 59.93,
  lon: 30.32,
  timezone: 'Europe/Moscow',
  locale: 'ru-RU',
  checkedAt: Date.now(),
  profileId: 'p1',
};

const baseData: WooPortalData = {
  version: 3,
  enabled: true,
  profiles: [
    {
      id: 'p1',
      name: 'Proxy 1',
      description: '',
      color: '#0969da',
      config: { type: 'http', host: '185.218.0.68', port: 3128, pacUrl: '', bypassList: [], auth: { username: '', password: '' }, routingRules: { enabled: false, mode: 'whitelist', domains: [] } },
      createdAt: '',
      updatedAt: '',
      tags: [],
    },
    {
      id: 'p2',
      name: 'Proxy 2',
      description: '',
      color: '#cf222e',
      config: { type: 'http', host: '185.218.0.69', port: 3128, pacUrl: '', bypassList: [], auth: { username: '', password: '' }, routingRules: { enabled: false, mode: 'whitelist', domains: [] } },
      createdAt: '',
      updatedAt: '',
      tags: [],
    },
  ],
  activeProfileId: 'p1',
  proxyPlace: place,
  settings: { notifyChange: true, notifyError: true },
};

describe('spoofConfigOf', () => {
  it('returns null when enabled is false', () => {
    expect(spoofConfigOf({ ...baseData, enabled: false })).toBeNull();
  });

  it('returns spoof config for active matching profile', () => {
    const cfg = spoofConfigOf(baseData);
    expect(cfg).toEqual({
      timezone: 'Europe/Moscow',
      locale: 'ru-RU',
      languages: ['ru-RU', 'ru'],
      lat: 59.93,
      lon: 30.32,
    });
  });

  it('retains prior spoof config during profile transition so tabs do not leak real identity', () => {
    // When switching activeProfileId to 'p2' before p2 lookup completes,
    // proxyPlace still has profileId: 'p1'. It must not drop to null!
    const transitioning: WooPortalData = {
      ...baseData,
      activeProfileId: 'p2',
    };
    const cfg = spoofConfigOf(transitioning);
    expect(cfg).not.toBeNull();
    expect(cfg?.timezone).toBe('Europe/Moscow');
  });
});

describe('isFresh', () => {
  it('identifies places checked within 10 minutes as fresh', () => {
    const recent: Place = { ...place, checkedAt: Date.now() - 5 * 60 * 1000 };
    expect(isFresh(recent)).toBe(true);
  });

  it('identifies places older than 10 minutes as stale', () => {
    const old: Place = { ...place, checkedAt: Date.now() - 11 * 60 * 1000 };
    expect(isFresh(old)).toBe(false);
  });

  it('returns false for undefined place', () => {
    expect(isFresh(undefined)).toBe(false);
  });
});
