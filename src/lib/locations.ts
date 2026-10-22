import type { GeoSettings } from '../types';

export interface Location {
  key: string;
  name: string;
  country: string;
  flag: string;
  timezone: string;
  locale: string;
  lat: number;
  lon: number;
  countryCode: string;
}

export const LOCATIONS: Location[] = [
  { key: 'auckland',      name: 'Auckland',       country: 'New Zealand',   flag: '🇳🇿', timezone: 'Pacific/Auckland',                locale: 'en-NZ', lat: -36.85, lon:  174.76, countryCode: 'NZ' },
  { key: 'sydney',        name: 'Sydney',          country: 'Australia',     flag: '🇦🇺', timezone: 'Australia/Sydney',                locale: 'en-AU', lat: -33.87, lon:  151.21, countryCode: 'AU' },
  { key: 'tokyo',         name: 'Tokyo',           country: 'Japan',         flag: '🇯🇵', timezone: 'Asia/Tokyo',                     locale: 'ja-JP', lat:  35.69, lon:  139.69, countryCode: 'JP' },
  { key: 'seoul',         name: 'Seoul',           country: 'South Korea',   flag: '🇰🇷', timezone: 'Asia/Seoul',                     locale: 'ko-KR', lat:  37.57, lon:  126.98, countryCode: 'KR' },
  { key: 'singapore',     name: 'Singapore',       country: 'Singapore',     flag: '🇸🇬', timezone: 'Asia/Singapore',                 locale: 'en-SG', lat:   1.35, lon:  103.82, countryCode: 'SG' },
  { key: 'beijing',       name: 'Beijing',         country: 'China',         flag: '🇨🇳', timezone: 'Asia/Shanghai',                  locale: 'zh-CN', lat:  39.90, lon:  116.41, countryCode: 'CN' },
  { key: 'shanghai',      name: 'Shanghai',        country: 'China',         flag: '🇨🇳', timezone: 'Asia/Shanghai',                  locale: 'zh-CN', lat:  31.23, lon:  121.47, countryCode: 'CN' },
  { key: 'hongKong',      name: 'Hong Kong',       country: 'China',         flag: '🇭🇰', timezone: 'Asia/Hong_Kong',                 locale: 'zh-HK', lat:  22.32, lon:  114.17, countryCode: 'HK' },
  { key: 'delhi',         name: 'Delhi',           country: 'India',         flag: '🇮🇳', timezone: 'Asia/Kolkata',                   locale: 'hi-IN', lat:  28.61, lon:   77.10, countryCode: 'IN' },
  { key: 'mumbai',        name: 'Mumbai',          country: 'India',         flag: '🇮🇳', timezone: 'Asia/Kolkata',                   locale: 'en-IN', lat:  19.08, lon:   72.88, countryCode: 'IN' },
  { key: 'dubai',         name: 'Dubai',           country: 'UAE',           flag: '🇦🇪', timezone: 'Asia/Dubai',                     locale: 'ar-AE', lat:  25.20, lon:   55.27, countryCode: 'AE' },
  { key: 'tehran',        name: 'Tehran',          country: 'Iran',          flag: '🇮🇷', timezone: 'Asia/Tehran',                    locale: 'fa-IR', lat:  35.69, lon:   51.39, countryCode: 'IR' },
  { key: 'saintPetersburg', name: 'Saint Petersburg', country: 'Russia',    flag: '🇷🇺', timezone: 'Europe/Moscow',                  locale: 'ru-RU', lat:  59.93, lon:   30.32, countryCode: 'RU' },
  { key: 'moscow',        name: 'Moscow',          country: 'Russia',        flag: '🇷🇺', timezone: 'Europe/Moscow',                  locale: 'ru-RU', lat:  55.76, lon:   37.62, countryCode: 'RU' },
  { key: 'istanbul',      name: 'Istanbul',        country: 'Turkey',        flag: '🇹🇷', timezone: 'Europe/Istanbul',                locale: 'tr-TR', lat:  41.01, lon:   28.98, countryCode: 'TR' },
  { key: 'kyiv',          name: 'Kyiv',            country: 'Ukraine',       flag: '🇺🇦', timezone: 'Europe/Kyiv',                    locale: 'uk-UA', lat:  50.45, lon:   30.52, countryCode: 'UA' },
  { key: 'warsaw',        name: 'Warsaw',          country: 'Poland',        flag: '🇵🇱', timezone: 'Europe/Warsaw',                  locale: 'pl-PL', lat:  52.23, lon:   21.01, countryCode: 'PL' },
  { key: 'berlin',        name: 'Berlin',          country: 'Germany',       flag: '🇩🇪', timezone: 'Europe/Berlin',                  locale: 'de-DE', lat:  52.52, lon:   13.40, countryCode: 'DE' },
  { key: 'paris',         name: 'Paris',           country: 'France',        flag: '🇫🇷', timezone: 'Europe/Paris',                   locale: 'fr-FR', lat:  48.86, lon:    2.35, countryCode: 'FR' },
  { key: 'london',        name: 'London',          country: 'UK',            flag: '🇬🇧', timezone: 'Europe/London',                  locale: 'en-GB', lat:  51.51, lon:   -0.13, countryCode: 'GB' },
  { key: 'amsterdam',     name: 'Amsterdam',       country: 'Netherlands',   flag: '🇳🇱', timezone: 'Europe/Amsterdam',               locale: 'nl-NL', lat:  52.37, lon:    4.90, countryCode: 'NL' },
  { key: 'madrid',        name: 'Madrid',          country: 'Spain',         flag: '🇪🇸', timezone: 'Europe/Madrid',                  locale: 'es-ES', lat:  40.42, lon:   -3.70, countryCode: 'ES' },
  { key: 'rome',          name: 'Rome',            country: 'Italy',         flag: '🇮🇹', timezone: 'Europe/Rome',                    locale: 'it-IT', lat:  41.90, lon:   12.50, countryCode: 'IT' },
  { key: 'cairo',         name: 'Cairo',           country: 'Egypt',         flag: '🇪🇬', timezone: 'Africa/Cairo',                   locale: 'ar-EG', lat:  30.04, lon:   31.24, countryCode: 'EG' },
  { key: 'lagos',         name: 'Lagos',           country: 'Nigeria',       flag: '🇳🇬', timezone: 'Africa/Lagos',                   locale: 'en-NG', lat:   6.52, lon:    3.38, countryCode: 'NG' },
  { key: 'nairobi',       name: 'Nairobi',         country: 'Kenya',         flag: '🇰🇪', timezone: 'Africa/Nairobi',                 locale: 'en-KE', lat:  -1.29, lon:   36.82, countryCode: 'KE' },
  { key: 'newYork',       name: 'New York',        country: 'USA',           flag: '🇺🇸', timezone: 'America/New_York',               locale: 'en-US', lat:  40.71, lon:  -74.00, countryCode: 'US' },
  { key: 'losAngeles',    name: 'Los Angeles',     country: 'USA',           flag: '🇺🇸', timezone: 'America/Los_Angeles',            locale: 'en-US', lat:  34.05, lon: -118.24, countryCode: 'US' },
  { key: 'chicago',       name: 'Chicago',         country: 'USA',           flag: '🇺🇸', timezone: 'America/Chicago',                locale: 'en-US', lat:  41.88, lon:  -87.63, countryCode: 'US' },
  { key: 'toronto',       name: 'Toronto',         country: 'Canada',        flag: '🇨🇦', timezone: 'America/Toronto',                locale: 'en-CA', lat:  43.65, lon:  -79.38, countryCode: 'CA' },
  { key: 'saoPaulo',      name: 'São Paulo',       country: 'Brazil',        flag: '🇧🇷', timezone: 'America/Sao_Paulo',              locale: 'pt-BR', lat: -23.55, lon:  -46.63, countryCode: 'BR' },
  { key: 'mexicoCity',    name: 'Mexico City',     country: 'Mexico',        flag: '🇲🇽', timezone: 'America/Mexico_City',            locale: 'es-MX', lat:  19.43, lon:  -99.13, countryCode: 'MX' },
  { key: 'bogota',        name: 'Bogotá',          country: 'Colombia',      flag: '🇨🇴', timezone: 'America/Bogota',                 locale: 'es-CO', lat:   4.71, lon:  -74.07, countryCode: 'CO' },
  { key: 'buenosAires',   name: 'Buenos Aires',    country: 'Argentina',     flag: '🇦🇷', timezone: 'America/Argentina/Buenos_Aires', locale: 'es-AR', lat: -34.61, lon:  -58.38, countryCode: 'AR' },
];

export const DEFAULT_LOCATION_KEYS = ['buenosAires', 'saintPetersburg'];

export function findLocationByKey(key: string): Location | undefined {
  return LOCATIONS.find(l => l.key === key);
}

/** Country of the current location, whether it's a preset city or came from an IP lookup. */
export function countryOfGeo(geo: GeoSettings): string | undefined {
  if (geo.countryCode) return geo.countryCode.toUpperCase();
  return geo.locationKey ? findLocationByKey(geo.locationKey)?.countryCode : undefined;
}
