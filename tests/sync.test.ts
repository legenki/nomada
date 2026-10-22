import { describe, it, expect } from 'vitest';
import { shouldSuggest, parseSyncSuggestion } from '../src/background/sync';

describe('shouldSuggest', () => {
  it('suggests when the proxy country differs from the current location', () => {
    expect(shouldSuggest('RU', 'US', ['JP'])).toBe(true);
  });

  it('does not suggest when the countries already match', () => {
    expect(shouldSuggest('ru', 'RU', [])).toBe(false);
  });

  it('does not suggest a country the user dismissed', () => {
    expect(shouldSuggest('JP', 'US', ['JP'])).toBe(false);
  });

  it('does not suggest when no location is set', () => {
    expect(shouldSuggest('RU', undefined, [])).toBe(false);
  });

  it('does not suggest a country without a preset city', () => {
    expect(shouldSuggest('ZZ', 'US', [])).toBe(false);
  });
});

describe('parseSyncSuggestion', () => {
  it('returns null for unknown country code', () => {
    expect(parseSyncSuggestion('ZZ')).toBeNull();
  });

  it('returns SyncSuggestion for known country code', () => {
    const result = parseSyncSuggestion('JP');
    expect(result).not.toBeNull();
    expect(result?.locationKey).toBe('tokyo');
    expect(result?.countryCode).toBe('JP');
    expect(result?.timezone).toContain('Tokyo');
  });
});
