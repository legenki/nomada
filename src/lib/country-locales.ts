// Maps ISO 3166-1 alpha-2 country code → location key in LOCATIONS
// Used to suggest a preset city for the country of the detected proxy IP
export const COUNTRY_TO_LOCATION: Record<string, string> = {
  AU: 'sydney',      NZ: 'auckland',    JP: 'tokyo',       KR: 'seoul',
  SG: 'singapore',   CN: 'beijing',     HK: 'hongKong',    IN: 'delhi',
  AE: 'dubai',       IR: 'tehran',      RU: 'saintPetersburg', TR: 'istanbul',
  UA: 'kyiv',        PL: 'warsaw',      DE: 'berlin',      FR: 'paris',
  GB: 'london',      NL: 'amsterdam',   ES: 'madrid',      IT: 'rome',
  EG: 'cairo',       NG: 'lagos',       KE: 'nairobi',     US: 'newYork',
  CA: 'toronto',     BR: 'saoPaulo',    MX: 'mexicoCity',  CO: 'bogota',
  AR: 'buenosAires',
};

// Maps ISO country code → BCP-47 locale for the "Use my IP location" feature,
// where the IP may resolve to a country without a preset city.
const COUNTRY_TO_LOCALE: Record<string, string> = {
  AU: 'en-AU', NZ: 'en-NZ', JP: 'ja-JP', KR: 'ko-KR', SG: 'en-SG', CN: 'zh-CN',
  HK: 'zh-HK', IN: 'en-IN', AE: 'ar-AE', IR: 'fa-IR', RU: 'ru-RU', TR: 'tr-TR',
  UA: 'uk-UA', PL: 'pl-PL', DE: 'de-DE', FR: 'fr-FR', GB: 'en-GB', NL: 'nl-NL',
  ES: 'es-ES', IT: 'it-IT', EG: 'ar-EG', NG: 'en-NG', KE: 'en-KE', US: 'en-US',
  CA: 'en-CA', BR: 'pt-BR', MX: 'es-MX', CO: 'es-CO', AR: 'es-AR', CH: 'de-CH',
  AT: 'de-AT', BE: 'nl-BE', SE: 'sv-SE', NO: 'nb-NO', DK: 'da-DK', FI: 'fi-FI',
  PT: 'pt-PT', GR: 'el-GR', CZ: 'cs-CZ', RO: 'ro-RO', HU: 'hu-HU', IE: 'en-IE',
  IL: 'he-IL', SA: 'ar-SA', TH: 'th-TH', VN: 'vi-VN', ID: 'id-ID', MY: 'ms-MY',
  PH: 'en-PH', ZA: 'en-ZA', CL: 'es-CL', PE: 'es-PE',
};

/**
 * Locale for a country. Unmapped countries keep the user's own language but
 * take the country as region (e.g. "en-KZ"), so the region never contradicts
 * the IP — falling back to a fixed "en-US" would claim the wrong country.
 */
export function localeForCountry(countryCode: string, baseLanguage = 'en'): string {
  const cc = countryCode.toUpperCase();
  if (COUNTRY_TO_LOCALE[cc]) return COUNTRY_TO_LOCALE[cc];
  if (!/^[A-Z]{2}$/.test(cc)) return 'en-US';
  const lang = /^[a-z]{2,3}$/i.test(baseLanguage) ? baseLanguage.toLowerCase() : 'en';
  return `${lang}-${cc}`;
}

/** "es-AR" → "es-AR,es;q=0.9" — what a browser natively set to that locale sends. */
export function acceptLanguageFor(locale: string): string {
  const lang = locale.split('-')[0];
  return lang && lang !== locale ? `${locale},${lang};q=0.9` : locale;
}
