import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProxyProfile, WooPortalData } from '../src/types';

let stored: WooPortalData;
vi.mock('../src/lib/storage', () => ({ readData: async () => stored }));

const setIcon = vi.fn(async (_: { path: Record<string, string> }) => {});
const setBadgeText = vi.fn(async (_: { text: string }) => {});
vi.stubGlobal('chrome', {
  action: { setIcon, setBadgeText, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
});

const { refreshIcon } = await import('../src/background/icon');

const profile = (color: string): ProxyProfile => ({
  id: 'p1', name: 'Berlin', description: '', color, createdAt: '', updatedAt: '', tags: [],
  config: {
    type: 'http', host: '1.2.3.4', port: 8080, pacUrl: '', bypassList: [],
    auth: { username: '', password: '' }, routingRules: { enabled: false, mode: 'whitelist', domains: [] },
  },
});
const data = (enabled: boolean, color: string): WooPortalData => ({
  version: 3, enabled, profiles: [profile(color)], activeProfileId: 'p1',
  proxyPlace: {
    ip: '9.9.9.9', city: 'Berlin', country: 'Germany', countryCode: 'DE', lat: 52.5, lon: 13.4,
    timezone: 'Europe/Berlin', locale: 'de-DE', checkedAt: 0, profileId: 'p1',
  },
  settings: { notifyChange: true, notifyError: true },
});
const iconPath = () => setIcon.mock.calls.at(-1)![0].path['16'];

beforeEach(() => { setIcon.mockClear(); setBadgeText.mockClear(); });

describe('refreshIcon', () => {
  it('is green while protected, whatever colour the profile has stored', async () => {
    for (const color of ['#808080', '#cf222e', '']) {
      stored = data(true, color);
      await refreshIcon();
      expect(iconPath(), color).toBe('icons/icon-active-green-16.png');
    }
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: 'DE' });
  });

  it('warns when every failover proxy is silent', async () => {
    stored = { ...data(true, '#808080'), failover: { enabled: true, order: [], down: ['p1'], exhausted: true } };
    await refreshIcon();
    expect(iconPath()).toBe('icons/icon-inactive-16.png');
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '!' });
  });

  it('is grey with no badge while off', async () => {
    stored = data(false, '#cf222e');
    await refreshIcon();
    expect(iconPath()).toBe('icons/icon-inactive-16.png');
    expect(setBadgeText).toHaveBeenLastCalledWith({ text: '' });
  });
});
