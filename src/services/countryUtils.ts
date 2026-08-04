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

/**
 * The country names offered in a picker, alphabetical. Aliases that map to a
 * code already covered by another name ('USA' beside 'United States') are left
 * out, so each country appears once.
 */
export function countryNames(): string[] {
  const seenCodes = new Set<string>();
  const names: string[] = [];
  for (const name of Object.keys(COUNTRY_CODES).sort((a, b) => a.localeCompare(b))) {
    const code = COUNTRY_CODES[name];
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    names.push(name);
  }
  return names;
}

/**
 * The states or provinces a country's addresses are written with, as
 * code-and-label pairs, or an empty list for a country that does not use them.
 * Only the two the platform requires a region for are listed; everywhere else
 * the region stays a free-text field.
 */
const SUBDIVISIONS: Record<string, ReadonlyArray<{ code: string; label: string }>> = {
  US: [
    { code: 'AL', label: 'Alabama' },        { code: 'AK', label: 'Alaska' },
    { code: 'AZ', label: 'Arizona' },        { code: 'AR', label: 'Arkansas' },
    { code: 'CA', label: 'California' },     { code: 'CO', label: 'Colorado' },
    { code: 'CT', label: 'Connecticut' },    { code: 'DE', label: 'Delaware' },
    { code: 'DC', label: 'District of Columbia' },
    { code: 'FL', label: 'Florida' },        { code: 'GA', label: 'Georgia' },
    { code: 'HI', label: 'Hawaii' },         { code: 'ID', label: 'Idaho' },
    { code: 'IL', label: 'Illinois' },       { code: 'IN', label: 'Indiana' },
    { code: 'IA', label: 'Iowa' },           { code: 'KS', label: 'Kansas' },
    { code: 'KY', label: 'Kentucky' },       { code: 'LA', label: 'Louisiana' },
    { code: 'ME', label: 'Maine' },          { code: 'MD', label: 'Maryland' },
    { code: 'MA', label: 'Massachusetts' },  { code: 'MI', label: 'Michigan' },
    { code: 'MN', label: 'Minnesota' },      { code: 'MS', label: 'Mississippi' },
    { code: 'MO', label: 'Missouri' },       { code: 'MT', label: 'Montana' },
    { code: 'NE', label: 'Nebraska' },       { code: 'NV', label: 'Nevada' },
    { code: 'NH', label: 'New Hampshire' },  { code: 'NJ', label: 'New Jersey' },
    { code: 'NM', label: 'New Mexico' },     { code: 'NY', label: 'New York' },
    { code: 'NC', label: 'North Carolina' }, { code: 'ND', label: 'North Dakota' },
    { code: 'OH', label: 'Ohio' },           { code: 'OK', label: 'Oklahoma' },
    { code: 'OR', label: 'Oregon' },         { code: 'PA', label: 'Pennsylvania' },
    { code: 'RI', label: 'Rhode Island' },   { code: 'SC', label: 'South Carolina' },
    { code: 'SD', label: 'South Dakota' },   { code: 'TN', label: 'Tennessee' },
    { code: 'TX', label: 'Texas' },          { code: 'UT', label: 'Utah' },
    { code: 'VT', label: 'Vermont' },        { code: 'VA', label: 'Virginia' },
    { code: 'WA', label: 'Washington' },     { code: 'WV', label: 'West Virginia' },
    { code: 'WI', label: 'Wisconsin' },      { code: 'WY', label: 'Wyoming' },
  ],
  CA: [
    { code: 'AB', label: 'Alberta' },        { code: 'BC', label: 'British Columbia' },
    { code: 'MB', label: 'Manitoba' },       { code: 'NB', label: 'New Brunswick' },
    { code: 'NL', label: 'Newfoundland and Labrador' },
    { code: 'NS', label: 'Nova Scotia' },    { code: 'NT', label: 'Northwest Territories' },
    { code: 'NU', label: 'Nunavut' },        { code: 'ON', label: 'Ontario' },
    { code: 'PE', label: 'Prince Edward Island' },
    { code: 'QC', label: 'Quebec' },         { code: 'SK', label: 'Saskatchewan' },
    { code: 'YT', label: 'Yukon' },
  ],
};

export function subdivisionsForCountry(country: string): ReadonlyArray<{ code: string; label: string }> {
  return SUBDIVISIONS[countryCode(country).toUpperCase()] ?? [];
}
