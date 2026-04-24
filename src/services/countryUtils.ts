/**
 * Country-name canonicalization helpers shared across services and templates.
 *
 * Consolidates the flag-emoji lookup (consumed by the `countryFlag` Handlebars
 * helper) and the ISO 3166-1 alpha-2 code lookup (used for club-page SEO
 * titles) into a single source of truth so new countries are added in one
 * place. Both lookups key on the full country name as stored in the DB.
 *
 * Keep both maps in sync when adding a new country. `FLAG` entries not
 * present in `CODE` (or vice versa) fall back to the documented default on
 * lookup: empty string for flag, the input name for code.
 */

const COUNTRY_FLAGS: Record<string, string> = {
  'Argentina':        '🇦🇷',
  'Australia':        '🇦🇺',
  'Austria':          '🇦🇹',
  'Belgium':          '🇧🇪',
  'Brazil':           '🇧🇷',
  'Bulgaria':         '🇧🇬',
  'Canada':           '🇨🇦',
  'Chile':            '🇨🇱',
  'China':            '🇨🇳',
  'Colombia':         '🇨🇴',
  'Czech Republic':   '🇨🇿',
  'Denmark':          '🇩🇰',
  'Estonia':          '🇪🇪',
  'Finland':          '🇫🇮',
  'France':           '🇫🇷',
  'Germany':          '🇩🇪',
  'Hungary':          '🇭🇺',
  'India':            '🇮🇳',
  'Ireland':          '🇮🇪',
  'Japan':            '🇯🇵',
  'Mexico':           '🇲🇽',
  'New Zealand':      '🇳🇿',
  'Nigeria':          '🇳🇬',
  'Pakistan':         '🇵🇰',
  'Poland':           '🇵🇱',
  'Puerto Rico':      '🇵🇷',
  'Russia':           '🇷🇺',
  'Slovakia':         '🇸🇰',
  'Slovenia':         '🇸🇮',
  'South Africa':     '🇿🇦',
  'South Korea':      '🇰🇷',
  'Spain':            '🇪🇸',
  'Sweden':           '🇸🇪',
  'Switzerland':      '🇨🇭',
  'The Netherlands':  '🇳🇱',
  'Turkey':           '🇹🇷',
  'Ukraine':          '🇺🇦',
  'United Kingdom':   '🇬🇧',
  'USA':              '🇺🇸',
  'United States':    '🇺🇸',
  'Venezuela':        '🇻🇪',
};

const COUNTRY_CODES: Record<string, string> = {
  Argentina: 'AR',
  Australia: 'AU',
  Austria: 'AT',
  Belgium: 'BE',
  Brazil: 'BR',
  Bulgaria: 'BG',
  Canada: 'CA',
  Chile: 'CL',
  China: 'CN',
  Colombia: 'CO',
  Croatia: 'HR',
  'Czech Republic': 'CZ',
  Denmark: 'DK',
  Estonia: 'EE',
  Finland: 'FI',
  France: 'FR',
  Germany: 'DE',
  Greece: 'GR',
  Hungary: 'HU',
  India: 'IN',
  Ireland: 'IE',
  Israel: 'IL',
  Italy: 'IT',
  Japan: 'JP',
  Mexico: 'MX',
  Netherlands: 'NL',
  'The Netherlands': 'NL',
  'New Zealand': 'NZ',
  Nigeria: 'NG',
  Norway: 'NO',
  Pakistan: 'PK',
  Peru: 'PE',
  Poland: 'PL',
  Portugal: 'PT',
  'Puerto Rico': 'PR',
  Romania: 'RO',
  Russia: 'RU',
  Slovakia: 'SK',
  Slovenia: 'SI',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  Spain: 'ES',
  Sweden: 'SE',
  Switzerland: 'CH',
  Turkey: 'TR',
  Ukraine: 'UA',
  'United Kingdom': 'GB',
  'United States': 'US',
  Uruguay: 'UY',
  USA: 'US',
  Venezuela: 'VE',
};

/** Flag emoji for the given country name. Empty string if unmapped. */
export function countryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? '';
}

/** ISO 3166-1 alpha-2 code for the given country name. Falls back to the input name if unmapped. */
export function countryCode(country: string): string {
  return COUNTRY_CODES[country] ?? country;
}
