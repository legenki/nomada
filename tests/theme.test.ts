import { describe, it, expect, vi, afterEach } from 'vitest';
import { THEME_KEY, chosenTheme, themeFor } from '../src/lib/theme';

afterEach(() => { vi.unstubAllGlobals(); });

const storage = (items: Record<string, string>) => ({ getItem: (k: string) => items[k] ?? null });

describe('themeFor', () => {
  it('follows the system until a theme is picked', () => {
    expect(themeFor(null, true)).toBe('dark');
    expect(themeFor(null, false)).toBe('light');
  });

  it('keeps the pick whatever the system does', () => {
    expect(themeFor('light', true)).toBe('light');
    expect(themeFor('dark', false)).toBe('dark');
  });
});

describe('chosenTheme', () => {
  it('reads the pick from localStorage', () => {
    vi.stubGlobal('localStorage', storage({ [THEME_KEY]: 'dark' }));
    expect(chosenTheme()).toBe('dark');
  });

  it('ignores anything else and copes without storage', () => {
    vi.stubGlobal('localStorage', storage({ [THEME_KEY]: 'sepia' }));
    expect(chosenTheme()).toBeNull();
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(chosenTheme()).toBeNull();
  });
});
