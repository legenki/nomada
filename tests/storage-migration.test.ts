import { describe, it, expect } from 'vitest';
import { migrateData, MAX_SYNC_DISMISSED } from '../src/lib/storage-migration';

const profile = (id: string) => ({
  id, name: id, description: '', color: '#ff0000', createdAt: '', updatedAt: '', tags: [],
  config: {
    type: 'http' as const, host: '1.2.3.4', port: 8080, pacUrl: '', bypassList: [],
    auth: { username: '', password: '' },
    routingRules: { enabled: false, mode: 'whitelist' as const, domains: [] },
  },
});

describe('migrateData', () => {
  it('starts a fresh install OFF with nothing selected', () => {
    const result = migrateData(null);
    expect(result.version).toBe(3);
    expect(result.enabled).toBe(false);
    expect(result.mode).toBe('system');
    expect(result.profiles).toEqual([]);
    expect(result.geo.enabled).toBe(false);
    expect(result.syncEnabled).toBe(true);
    expect(result.syncDismissed).toEqual([]);
  });

  it('treats installs from before the master switch as ON', () => {
    const result = migrateData({ version: 3, mode: 'system', profiles: [], geo: { enabled: true, locale: 'ja-JP' } });
    expect(result.enabled).toBe(true);
    expect(result.geo).toEqual({ enabled: true, locale: 'ja-JP' });
  });

  it('maps the removed "direct" mode to system', () => {
    expect(migrateData({ version: 3, mode: 'direct', profiles: [] }).mode).toBe('system');
  });

  it('resets mode to system when activeProfileId is stale', () => {
    const result = migrateData({ version: 3, mode: 'profile', profiles: [], activeProfileId: 'ghost' });
    expect(result.mode).toBe('system');
    expect(result.activeProfileId).toBeUndefined();
  });

  it('keeps a valid active profile', () => {
    const result = migrateData({ version: 3, enabled: true, mode: 'profile', profiles: [profile('p1')], activeProfileId: 'p1' });
    expect(result.mode).toBe('profile');
    expect(result.activeProfileId).toBe('p1');
  });

  it('restores the profile older builds parked in lastProfileId while OFF', () => {
    const result = migrateData({
      version: 3, enabled: false, mode: 'system', profiles: [profile('p1')], lastProfileId: 'p1',
    });
    expect(result.mode).toBe('profile');
    expect(result.activeProfileId).toBe('p1');
    expect('lastProfileId' in result).toBe(false);
  });

  it('normalizes dismissed "profileId:CC" pairs to unique country codes', () => {
    const result = migrateData({ version: 3, syncDismissed: ['p1:jp', 'p2:JP', 'RU', 42] });
    expect(result.syncDismissed).toEqual(['JP', 'RU']);
  });

  it('caps the dismissed list', () => {
    const many = Array.from({ length: MAX_SYNC_DISMISSED + 10 }, (_, i) => `C${i}`);
    expect(migrateData({ version: 3, syncDismissed: many }).syncDismissed).toHaveLength(MAX_SYNC_DISMISSED);
  });
});
