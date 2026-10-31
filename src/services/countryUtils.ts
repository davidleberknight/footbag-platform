/**
 * Country-name canonicalization helpers shared across services and templates.
 *
 * The single source of truth for what names a country on this platform. Every
 * country is keyed by its ISO 3166-1 alpha-2 code and carries one canonical
 * name, the name the picker offers and the only spelling a write path stores,
 * so members, clubs and events all name one place the same way. The flag emoji
 * is derived from the code, so a country never lacks one.
 *
 * Alongside the canonical names sits a list of aliases: other spellings people
 * write for the same country (an abbreviation, a constituent nation, the name in
 * its own language). `canonicalCountryName` folds any alias, any alpha-2 code,
 * or the canonical name itself to that one name.
 */

const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  AD: 'Andorra',
  AE: 'United Arab Emirates',
  AF: 'Afghanistan',
  AG: 'Antigua and Barbuda',
  AI: 'Anguilla',
  AL: 'Albania',
  AM: 'Armenia',
  AO: 'Angola',
  AQ: 'Antarctica',
  AR: 'Argentina',
  AS: 'American Samoa',
  AT: 'Austria',
  AU: 'Australia',
  AW: 'Aruba',
  AX: 'Åland Islands',
  AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina',
  BB: 'Barbados',
  BD: 'Bangladesh',
  BE: 'Belgium',
  BF: 'Burkina Faso',
  BG: 'Bulgaria',
  BH: 'Bahrain',
  BI: 'Burundi',
  BJ: 'Benin',
  BL: 'Saint Barthélemy',
  BM: 'Bermuda',
  BN: 'Brunei',
  BO: 'Bolivia',
  BQ: 'Caribbean Netherlands',
  BR: 'Brazil',
  BS: 'Bahamas',
  BT: 'Bhutan',
  BV: 'Bouvet Island',
  BW: 'Botswana',
  BY: 'Belarus',
  BZ: 'Belize',
  CA: 'Canada',
  CC: 'Cocos (Keeling) Islands',
  CD: 'Democratic Republic of the Congo',
  CF: 'Central African Republic',
  CG: 'Republic of the Congo',
  CH: 'Switzerland',
  CI: "Côte d'Ivoire",
  CK: 'Cook Islands',
  CL: 'Chile',
  CM: 'Cameroon',
  CN: 'China',
  CO: 'Colombia',
  CR: 'Costa Rica',
  CU: 'Cuba',
  CV: 'Cape Verde',
  CW: 'Curaçao',
  CX: 'Christmas Island',
  CY: 'Cyprus',
  CZ: 'Czech Republic',
  DE: 'Germany',
  DJ: 'Djibouti',
  DK: 'Denmark',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  DZ: 'Algeria',
  EC: 'Ecuador',
  EE: 'Estonia',
  EG: 'Egypt',
  EH: 'Western Sahara',
  ER: 'Eritrea',
  ES: 'Spain',
  ET: 'Ethiopia',
  FI: 'Finland',
  FJ: 'Fiji',
  FK: 'Falkland Islands',
  FM: 'Micronesia',
  FO: 'Faroe Islands',
  FR: 'France',
  GA: 'Gabon',
  GB: 'United Kingdom',
  GD: 'Grenada',
  GE: 'Georgia',
  GF: 'French Guiana',
  GG: 'Guernsey',
  GH: 'Ghana',
  GI: 'Gibraltar',
  GL: 'Greenland',
  GM: 'Gambia',
  GN: 'Guinea',
  GP: 'Guadeloupe',
  GQ: 'Equatorial Guinea',
  GR: 'Greece',
  GS: 'South Georgia and the South Sandwich Islands',
  GT: 'Guatemala',
  GU: 'Guam',
  GW: 'Guinea-Bissau',
  GY: 'Guyana',
  HK: 'Hong Kong',
  HM: 'Heard Island and McDonald Islands',
  HN: 'Honduras',
  HR: 'Croatia',
  HT: 'Haiti',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IM: 'Isle of Man',
  IN: 'India',
  IO: 'British Indian Ocean Territory',
  IQ: 'Iraq',
  IR: 'Iran',
  IS: 'Iceland',
  IT: 'Italy',
  JE: 'Jersey',
  JM: 'Jamaica',
  JO: 'Jordan',
  JP: 'Japan',
  KE: 'Kenya',
  KG: 'Kyrgyzstan',
  KH: 'Cambodia',
  KI: 'Kiribati',
  KM: 'Comoros',
  KN: 'Saint Kitts and Nevis',
  KP: 'North Korea',
  KR: 'South Korea',
  KW: 'Kuwait',
  KY: 'Cayman Islands',
  KZ: 'Kazakhstan',
  LA: 'Laos',
  LB: 'Lebanon',
  LC: 'Saint Lucia',
  LI: 'Liechtenstein',
  LK: 'Sri Lanka',
  LR: 'Liberia',
  LS: 'Lesotho',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  LY: 'Libya',
  MA: 'Morocco',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MF: 'Saint Martin',
  MG: 'Madagascar',
  MH: 'Marshall Islands',
  MK: 'North Macedonia',
  ML: 'Mali',
  MM: 'Myanmar',
  MN: 'Mongolia',
  MO: 'Macao',
  MP: 'Northern Mariana Islands',
  MQ: 'Martinique',
  MR: 'Mauritania',
  MS: 'Montserrat',
  MT: 'Malta',
  MU: 'Mauritius',
  MV: 'Maldives',
  MW: 'Malawi',
  MX: 'Mexico',
  MY: 'Malaysia',
  MZ: 'Mozambique',
  NA: 'Namibia',
  NC: 'New Caledonia',
  NE: 'Niger',
  NF: 'Norfolk Island',
  NG: 'Nigeria',
  NI: 'Nicaragua',
  NL: 'Netherlands',
  NO: 'Norway',
  NP: 'Nepal',
  NR: 'Nauru',
  NU: 'Niue',
  NZ: 'New Zealand',
  OM: 'Oman',
  PA: 'Panama',
  PE: 'Peru',
  PF: 'French Polynesia',
  PG: 'Papua New Guinea',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PM: 'Saint Pierre and Miquelon',
  PN: 'Pitcairn Islands',
  PR: 'Puerto Rico',
  PS: 'Palestine',
  PT: 'Portugal',
  PW: 'Palau',
  PY: 'Paraguay',
  QA: 'Qatar',
  RE: 'Réunion',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SB: 'Solomon Islands',
  SC: 'Seychelles',
  SD: 'Sudan',
  SE: 'Sweden',
  SG: 'Singapore',
  SH: 'Saint Helena',
  SI: 'Slovenia',
  SJ: 'Svalbard and Jan Mayen',
  SK: 'Slovakia',
  SL: 'Sierra Leone',
  SM: 'San Marino',
  SN: 'Senegal',
  SO: 'Somalia',
  SR: 'Suriname',
  SS: 'South Sudan',
  ST: 'São Tomé and Príncipe',
  SV: 'El Salvador',
  SX: 'Sint Maarten',
  SY: 'Syria',
  SZ: 'Eswatini',
  TC: 'Turks and Caicos Islands',
  TD: 'Chad',
  TF: 'French Southern Territories',
  TG: 'Togo',
  TH: 'Thailand',
  TJ: 'Tajikistan',
  TK: 'Tokelau',
  TL: 'Timor-Leste',
  TM: 'Turkmenistan',
  TN: 'Tunisia',
  TO: 'Tonga',
  TR: 'Turkey',
  TT: 'Trinidad and Tobago',
  TV: 'Tuvalu',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  UA: 'Ukraine',
  UG: 'Uganda',
  UM: 'United States Minor Outlying Islands',
  US: 'United States',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VA: 'Vatican City',
  VC: 'Saint Vincent and the Grenadines',
  VE: 'Venezuela',
  VG: 'British Virgin Islands',
  VI: 'United States Virgin Islands',
  VN: 'Vietnam',
  VU: 'Vanuatu',
  WF: 'Wallis and Futuna',
  WS: 'Samoa',
  YE: 'Yemen',
  YT: 'Mayotte',
  ZA: 'South Africa',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
};

// Other names people write for a country, each folded to that country's code.
// Case, full stops and accents are ignored when matching, so each alias is
// listed once in its plain form.
const COUNTRY_CODE_BY_ALIAS: Record<string, string> = {
  'USA': 'US',
  'United States of America': 'US',
  'United States America': 'US',
  'America': 'US',
  'US Virgin Islands': 'VI',
  'UK': 'GB',
  'Great Britain': 'GB',
  'Britain': 'GB',
  'The United Kingdom': 'GB',
  'England': 'GB',
  'Scotland': 'GB',
  'Wales': 'GB',
  'Northern Ireland': 'GB',
  'The Netherlands': 'NL',
  'Holland': 'NL',
  'Nederland': 'NL',
  'Deutschland': 'DE',
  'Polska': 'PL',
  'Brasil': 'BR',
  'Espana': 'ES',
  'Espanya': 'ES',
  'Schweiz': 'CH',
  'Suisse': 'CH',
  'Osterreich': 'AT',
  'Czechia': 'CZ',
  'Czech': 'CZ',
  'The Czech Republic': 'CZ',
  'Ceska Republika': 'CZ',
  'Cesko': 'CZ',
  'Slovak Republic': 'SK',
  'Slovensko': 'SK',
  'Slovenija': 'SI',
  'Korea': 'KR',
  'Republic of Korea': 'KR',
  'Russian Federation': 'RU',
  'Turkiye': 'TR',
  'Norge': 'NO',
  'Sverige': 'SE',
  'Suomi': 'FI',
  'Danmark': 'DK',
  'Latvija': 'LV',
  'Lietuva': 'LT',
  'Eesti': 'EE',
  'Srbija': 'RS',
  'Magyarorszag': 'HU',
  'Belgie': 'BE',
  'Belgique': 'BE',
  'Republic of Ireland': 'IE',
  // Names in a country's own or second official language.
  'Aotearoa': 'NZ',
  'Aotearoa New Zealand': 'NZ',
  'Eire': 'IE',
  'Cymru': 'GB',
  'Svizzera': 'CH',
  'Belgien': 'BE',
  'Italia': 'IT',
  'Hrvatska': 'HR',
  'Hellas': 'GR',
  'Ellada': 'GR',
  'Nippon': 'JP',
  'Nihon': 'JP',
  'Rossiya': 'RU',
  'Ukraina': 'UA',
  'Bharat': 'IN',
  'Ivory Coast': 'CI',
  'Cabo Verde': 'CV',
  'Viet Nam': 'VN',
  "People's Republic of China": 'CN',
  'UAE': 'AE',
  'RSA': 'ZA',
  'Republic of South Africa': 'ZA',
  'DR Congo': 'CD',
  'Macedonia': 'MK',
  'Burma': 'MM',
  'Swaziland': 'SZ',
  'East Timor': 'TL',
  'Holy See': 'VA',
  'Republica Dominicana': 'DO',
  // Three-letter codes members commonly type for their own country.
  'AUS': 'AU',
  'AUT': 'AT',
  'BRA': 'BR',
  'CAN': 'CA',
  'CZE': 'CZ',
  'EST': 'EE',
  'GER': 'DE',
  'HUN': 'HU',
  'JPN': 'JP',
  'MEX': 'MX',
  'PAK': 'PK',
};

// The short token people type for a country, where it differs from the slug of
// its name: the country page address under /clubs and the country slot of a
// club hashtag both use it. A name carrying formal words ("Republic", "United",
// "and ...", "Saint") is known by its short form, so "#club_usa_portland" beats
// "#club_united_states_portland". The club data pipeline carries the same
// tokens, so a club it seeds and a club promoted here derive one hashtag.
const COUNTRY_TOKEN_BY_CODE: Record<string, string> = {
  US: 'usa',
  GB: 'uk',
  CZ: 'czech',
  AE: 'uae',
  BA: 'bosnia',
  CI: 'ivory_coast',
  CD: 'dr_congo',
  CG: 'congo',
  TT: 'trinidad',
  AG: 'antigua',
  ST: 'sao_tome',
  KN: 'st_kitts',
  VC: 'st_vincent',
  LC: 'st_lucia',
  BL: 'st_barts',
  SH: 'st_helena',
  MF: 'st_martin',
  PM: 'st_pierre',
  TC: 'turks_and_caicos',
  VG: 'bvi',
  VI: 'usvi',
  UM: 'us_outlying_islands',
  VA: 'vatican',
  SJ: 'svalbard',
  WF: 'wallis',
  HM: 'heard_island',
  GS: 'south_georgia',
  IO: 'chagos',
  TF: 'french_southern',
  CC: 'cocos_islands',
};

function slugifyCountryText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * The short token for a country, however it is spelled: the address of its
 * clubs page and the country slot of a club hashtag. A spelling that names no
 * country is slugified as written.
 */
export function countrySlug(country: string): string {
  const code = codeFor(country);
  if (!code) return slugifyCountryText(country);
  return COUNTRY_TOKEN_BY_CODE[code] ?? slugifyCountryText(COUNTRY_NAME_BY_CODE[code]);
}

/** Fold a spelling for matching: case, surrounding space, full stops and accents are ignored. */
function foldCountrySpelling(country: string): string {
  return country
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\./g, '');
}

let CODE_BY_SPELLING: Map<string, string> | null = null;

function codeBySpelling(): Map<string, string> {
  if (CODE_BY_SPELLING) return CODE_BY_SPELLING;
  const index = new Map<string, string>();
  for (const [code, name] of Object.entries(COUNTRY_NAME_BY_CODE)) {
    index.set(foldCountrySpelling(code), code);
    index.set(foldCountrySpelling(name), code);
  }
  for (const [alias, code] of Object.entries(COUNTRY_CODE_BY_ALIAS)) {
    index.set(foldCountrySpelling(alias), code);
  }
  CODE_BY_SPELLING = index;
  return index;
}

function codeFor(country: string): string | null {
  return codeBySpelling().get(foldCountrySpelling(country)) ?? null;
}

/** Flag emoji for the given country, however it is spelled. Empty string if it names no country. */
export function countryFlag(country: string): string {
  const code = codeFor(country);
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

/** ISO 3166-1 alpha-2 code for the given country, however it is spelled. Falls back to the input if it names no country. */
export function countryCode(country: string): string {
  return codeFor(country) ?? country;
}

/** The country names offered in a picker, alphabetical, one per country. */
export function countryNames(): string[] {
  return Object.values(COUNTRY_NAME_BY_CODE).sort((a, b) => a.localeCompare(b));
}

/**
 * The picker's name for a country however it was spelled, or null when the
 * spelling names no country.
 *
 * A country reaches a write path from the picker, from a legacy import, or
 * from a request built by hand, and those spell the same place differently
 * ('United States', 'USA', 'us', 'U.S.'). Every alias and every alpha-2 code
 * therefore resolves to the single canonical name, so one place cannot be
 * stored under several spellings.
 */
export function canonicalCountryName(country: string): string | null {
  const code = codeFor(country);
  return code ? COUNTRY_NAME_BY_CODE[code] : null;
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

// Australia's states and territories, offered to members as an optional pick
// because nearly every Australian on the old site gave one, and spelled it a
// dozen ways ("Vic", "VIC", "Victoria"). It is kept out of the list above, which
// also decides where a club must name a state and where a member's region is
// required; neither applies to Australia.
const OPTIONAL_MEMBER_REGIONS: Record<string, ReadonlyArray<{ code: string; label: string }>> = {
  AU: [
    { code: 'ACT', label: 'Australian Capital Territory' },
    { code: 'NSW', label: 'New South Wales' },  { code: 'NT', label: 'Northern Territory' },
    { code: 'QLD', label: 'Queensland' },       { code: 'SA', label: 'South Australia' },
    { code: 'TAS', label: 'Tasmania' },         { code: 'VIC', label: 'Victoria' },
    { code: 'WA', label: 'Western Australia' },
  ],
};

/**
 * The list a member picks their state, province or territory from, or an
 * empty list for a country where the member forms ask for no region.
 */
export function memberRegionListForCountry(country: string): ReadonlyArray<{ code: string; label: string }> {
  const code = countryCode(country).toUpperCase();
  return SUBDIVISIONS[code] ?? OPTIONAL_MEMBER_REGIONS[code] ?? [];
}

/** Every country whose members pick a region from a list, by ISO code. */
export function memberRegionListCountryCodes(): string[] {
  return [...Object.keys(SUBDIVISIONS), ...Object.keys(OPTIONAL_MEMBER_REGIONS)];
}
