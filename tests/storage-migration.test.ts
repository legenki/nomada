import { describe, it, expect } from 'vitest';
import { migrateData } from '../src/lib/storage-migration';

const profile = (id: string) => ({
  id, name: id, description: '', color: '#ff0000', createdAt: '', updatedAt: '', tags: [],
  config: {
    type: 'http' as const, host: '1.2.3.4', port: 8080, pacUrl: '', bypassList: [],
    auth: { username: '', password: '' },
    routingRules: { enabled: false, mode: 'whitelist' as const, domains: [] },
  },
});

const place = { ip: '1.1.1.1', city: 'X', country: 'Y', countryCode: 'YY', lat: 0, lon: 0, timezone: 'UTC', locale: 'en-YY', checkedAt: 0 };

describe('migrateData', () => {
  it('starts a fresh install OFF with nothing selected', () => {
    const result = migrateData(null);
    expect(result.version).toBe(3);
    expect(result.enabled).toBe(false);
    expect(result.profiles).toEqual([]);
    expect(result.activeProfileId).toBeUndefined();
  });

  it('keeps an enabled install with a valid selection ON', () => {
    const result = migrateData({ version: 3, profiles: [profile('p1')], activeProfileId: 'p1' });
    expect(result.enabled).toBe(true);
    expect(result.activeProfileId).toBe('p1');
  });

  it('cannot be ON without a proxy (the old geo-only mode is gone)', () => {
    const result = migrateData({ version: 3, enabled: true, profiles: [], geo: { enabled: true, locale: 'ja-JP' } });
    expect(result.enabled).toBe(false);
  });

  it('drops a stale selection', () => {
    const result = migrateData({ version: 3, enabled: true, profiles: [], activeProfileId: 'ghost' });
    expect(result.activeProfileId).toBeUndefined();
    expect(result.enabled).toBe(false);
  });

  it('restores the profile older builds parked in lastProfileId while OFF', () => {
    const result = migrateData({ version: 3, enabled: false, profiles: [profile('p1')], lastProfileId: 'p1' });
    expect(result.activeProfileId).toBe('p1');
    expect(result.enabled).toBe(false);
  });

  it('removes fields of the retired city picker and sync suggestions', () => {
    const result = migrateData({
      version: 3, mode: 'profile', geo: { enabled: true }, syncEnabled: true, syncDismissed: ['JP'], lastProfileId: 'x',
    }) as unknown as Record<string, unknown>;
    for (const key of ['mode', 'geo', 'syncEnabled', 'syncDismissed', 'lastProfileId']) expect(key in result).toBe(false);
  });

  it('forgets a proxy location that belongs to another profile', () => {
    const result = migrateData({
      version: 3, profiles: [profile('p1')], activeProfileId: 'p1', proxyPlace: { ...place, profileId: 'p2' },
    });
    expect(result.proxyPlace).toBeUndefined();
  });

  it('keeps the proxy location of the selected profile', () => {
    const result = migrateData({
      version: 3, profiles: [profile('p1')], activeProfileId: 'p1', proxyPlace: { ...place, profileId: 'p1' },
    });
    expect(result.proxyPlace?.ip).toBe('1.1.1.1');
  });
});
