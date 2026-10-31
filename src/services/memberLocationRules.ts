/**
 * The rules a member's location and first-competition year must satisfy, and
 * the single home for them.
 *
 * These columns feed the Official IFPA Roster, where one place recorded
 * as CA, California and Calif. cannot be reconciled afterwards. That is why the
 * region for a country with an official state or province set must be the
 * two-letter code, and why the country must be the one name the picker offers:
 * a strict region rule beside a lax country rule protects nothing, because one
 * country spelled US, USA and United States splits a roster just as badly.
 *
 * Four paths write these columns and they must agree, which is why the rules
 * live here rather than in any one of them:
 *
 *   - the onboarding wizard's personal-details step,
 *   - the profile edit form,
 *   - the legacy-account claim merge,
 *   - the historical-person claim merge.
 *
 * The first two carry the member's own answer and REFUSE anything invalid, so
 * the member fixes it while they are looking at the form. The last two copy
 * values out of an imported record the member did not write, and must never
 * refuse: see `normalizeImportedLocation`.
 *
 * The city casing rule, `capitalizeLowercaseCity`, also governs a club's city,
 * so every path that writes a city anywhere applies the same one.
 *
 * Two deliberate asymmetries a reader will otherwise try to "fix":
 *
 *   - Only a CHANGED country is held to the canonical rule. A migrated profile
 *     carries whatever the import wrote, and the picker re-offers a stored
 *     value it does not list, so holding an untouched value to the rule would
 *     trap the member on a form they cannot submit over a field they never
 *     chose.
 *   - Every path folds a full state or province name to its two-letter code.
 *     The member's own forms offer only a list, so a name there comes from a
 *     request built by hand or an older page; it costs nothing to accept, and
 *     a member never has to know the code. What differs is a value that names
 *     no state or province: the member's own forms refuse it, while the import
 *     paths drop it.
 *
 * The member's own forms ask for a region only where it is picked from a list:
 * required in the USA and Canada, optional in Australia, and not asked at all
 * anywhere else, since nothing reads it beyond showing it. A region already on
 * file that the form does not ask about is kept, not erased.
 */
import { ValidationError } from './serviceErrors';
import {
  canonicalCountryName,
  countryCode,
  memberRegionListCountryCodes,
  memberRegionListForCountry,
  subdivisionsForCountry,
} from './countryUtils';

export const MAX_LOCATION_FIELD = 64;
export const FIRST_COMPETITION_YEAR_MIN = 1972;

export const REGION_REQUIRED_MESSAGE = 'Region or state is required for the USA and Canada.';
export const REGION_CODE_MESSAGE =
  'Region must be a state or province name, such as Oregon or Ontario.';
export const COUNTRY_CHOICE_MESSAGE =
  'Country must be one of the countries offered in the list, such as United States or Canada.';

function trimmed(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

// A city typed with no capital letter at all ("tauranga") is someone who never
// pressed shift, so each word is capitalized. A city carrying any capital is
// kept exactly as typed, because only its writer knows whether "McAllen",
// "La Jolla" or "NYC" is right, and re-casing it would damage a correct name.
// This never refuses: casing is not a reason to send anyone back to a form.
export function capitalizeLowercaseCity(city: string): string {
  if (city !== city.toLowerCase() || city === city.toUpperCase()) return city;
  return city.replace(
    /(^|[\s-])(\p{Ll})/gu,
    (_match, separator: string, letter: string) => separator + letter.toUpperCase(),
  );
}

// In the USA and Canada a location without its state or province is ambiguous
// (a bare "Portland" or "London" names more than one place), so the region is
// required there and optional everywhere else. The country field may hold free
// text from an import, so it is folded to its ISO code through the shared country
// map, which carries every spelling the platform accepts for a country.
const REGION_REQUIRED_COUNTRY_CODES = new Set(['US', 'CA']);

export function regionRequiredForCountry(country: string): boolean {
  return REGION_REQUIRED_COUNTRY_CODES.has(countryCode(trimmed(country)).toUpperCase());
}

// The official code for a region given as either its code or its full name, in
// any case, or null when it names none of the country's states or provinces.
export function subdivisionCodeFor(country: string, region: string): string | null {
  const wanted = region.trim().toLowerCase();
  return subdivisionsForCountry(country).find(
    (s) => s.code.toLowerCase() === wanted || s.label.toLowerCase() === wanted,
  )?.code ?? null;
}

export const REGION_COUNTRY_MISMATCH_MESSAGE =
  'The state or province you picked is not in the country you chose.';

export interface RegionPickerEntry {
  value: string;   // the country's ISO code and the region's, as 'US-OR'
  label: string;   // the name the member reads and clicks, as 'Oregon'
  countryCode: string;
  code: string;
}

// Every state, province and territory a member can pick, from every country
// whose members pick one, as one alphabetical list of names. The form cannot
// know the country before it is submitted and must work without a script, so
// the whole list is on the page and a script narrows it to the chosen country.
// Each value carries its country because two countries can share a code: 'WA'
// is both Washington and Western Australia.
export function regionPickerEntries(): RegionPickerEntry[] {
  return memberRegionListCountryCodes()
    .flatMap((cc) => memberRegionListForCountry(cc).map((s) => ({
      value: `${cc}-${s.code}`, label: s.label, countryCode: cc, code: s.code,
    })))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function sameCountry(a: string, b: string): boolean {
  return countryCode(a.trim()).toUpperCase() === countryCode(b.trim()).toUpperCase();
}

/**
 * The region to store from a member's form, which offers a region only as a
 * pick from a list, and only for the countries that have one.
 *
 * In the USA and Canada the pick is the answer, and a blank one is left for
 * the required-region check to refuse. In Australia the pick is optional. Every
 * other country is asked for no region at all, so whatever the form carried is
 * ignored.
 *
 * Where the form leaves the region unanswered and it is not required, a region
 * already on file is kept while the country stays the same, because the forms
 * never ask for it: a migrated "Canterbury" or "Vic" is not the member's to
 * lose by saving their profile. A changed country drops it, since it names a
 * place in the old one.
 *
 * A pick from another country's list is refused rather than guessed at,
 * because either half could be the mistake. A value with no country prefix
 * (a request built by hand, or an older page) is matched by code or name
 * within the chosen country's list.
 */
export function resolveSubmittedRegion(input: {
  country: string;
  picked: string;
  storedRegion: string | null;
  storedCountry: string | null;
}): string | null {
  const list = memberRegionListForCountry(input.country);
  const pick = input.picked.trim();
  const kept = input.storedCountry !== null && sameCountry(input.storedCountry, input.country)
    ? input.storedRegion
    : null;
  if (list.length === 0) return kept;
  if (!pick) return regionRequiredForCountry(input.country) ? null : kept;

  const prefixed = /^([A-Za-z]{2})-(.+)$/.exec(pick);
  if (prefixed) {
    if (!sameCountry(prefixed[1], input.country)) {
      throw new ValidationError(REGION_COUNTRY_MISMATCH_MESSAGE);
    }
    const wanted = prefixed[2].toUpperCase();
    const match = list.find((s) => s.code === wanted);
    if (!match) throw new ValidationError(REGION_CODE_MESSAGE);
    return match.code;
  }
  const wanted = pick.toLowerCase();
  const match = list.find((s) => s.code.toLowerCase() === wanted || s.label.toLowerCase() === wanted);
  if (!match) throw new ValidationError(REGION_CODE_MESSAGE);
  return match.code;
}

// Where a country writes its addresses with an official state or province set,
// that set is the whole vocabulary and the server decides membership in it.
// The form renders a picker, but a picker is not the only way a value reaches
// this method. A country with no official set keeps a free-text region.
export function canonicalRegionOrThrow(country: string, region: string | null): string | null {
  if (!region) return region;
  if (subdivisionsForCountry(country).length === 0) return region;
  const code = subdivisionCodeFor(country, region);
  if (!code) throw new ValidationError(REGION_CODE_MESSAGE);
  return code;
}

export function canonicalCountryOrThrow(country: string, storedCountry: string | null): string {
  if (storedCountry !== null && country === storedCountry) return country;
  const canonical = canonicalCountryName(country);
  if (!canonical) throw new ValidationError(COUNTRY_CHOICE_MESSAGE);
  return canonical;
}

// A year the member cannot have competed in is a typo, and a typo is not an
// answer. Both member-facing paths refuse it rather than storing null, which
// would erase a good stored year while reporting the save as successful.
export function parseFirstCompetitionYearOrThrow(rawYear: string): number | null {
  if (rawYear === '') return null;
  const parsed = parseInt(rawYear, 10);
  const thisYear = new Date().getFullYear();
  if (
    !Number.isFinite(parsed) ||
    String(parsed) !== rawYear ||
    parsed < FIRST_COMPETITION_YEAR_MIN ||
    parsed > thisYear
  ) {
    throw new ValidationError(
      `Year must be a whole number between ${FIRST_COMPETITION_YEAR_MIN} and ${thisYear}.`,
    );
  }
  return parsed;
}

export interface ValidatedMemberLocation {
  city: string;
  region: string | null;
  country: string;
  firstCompetitionYear: number | null;
}

/**
 * The shape both member-facing write paths store. A rule enforced on only one
 * of them is not a rule: whatever the wizard refuses, a member could otherwise
 * store by editing their profile afterwards, and the roster shows
 * whatever lands.
 *
 * Gender is deliberately NOT here. The wizard is the primary collection point
 * and records a blank answer as 'undisclosed'; the edit form always re-offers
 * the control, so a blank there means "unchanged" and must leave the stored
 * value alone. Each path keeps its own handling of that.
 *
 * Whether city and country are present is likewise left to the callers, which
 * word it differently: the wizard asks for one field at a time, while the edit
 * form can report both missing at once.
 *
 * Order matters. The form's pick is resolved to the region to store first
 * (see `resolveSubmittedRegion`), then the region-required check runs on the
 * country as submitted, so a
 * member who omitted a required region is told that rather than being sent down
 * an argument about spelling. The country folds next, because the state and
 * province list is looked up by country: without the fold, a country spelled
 * 'U.S.' matches no list and its region silently escapes the two-letter-code
 * rule.
 */
export function validateMemberLocationAndYear(input: {
  city: string;
  region: string | null;
  country: string;
  storedRegion: string | null;
  storedCountry: string | null;
  rawYear: string;
}): ValidatedMemberLocation {
  const submittedRegion = resolveSubmittedRegion({
    country: input.country,
    picked: input.region ?? '',
    storedRegion: input.storedRegion,
    storedCountry: input.storedCountry,
  });
  if (!submittedRegion && regionRequiredForCountry(input.country)) {
    throw new ValidationError(REGION_REQUIRED_MESSAGE);
  }
  const country = canonicalCountryOrThrow(input.country, input.storedCountry);
  const region = canonicalRegionOrThrow(country, submittedRegion);

  if (input.city.length > MAX_LOCATION_FIELD) {
    throw new ValidationError(`City must be ${MAX_LOCATION_FIELD} characters or fewer.`);
  }
  if (region && region.length > MAX_LOCATION_FIELD) {
    throw new ValidationError(`Region must be ${MAX_LOCATION_FIELD} characters or fewer.`);
  }
  if (country.length > MAX_LOCATION_FIELD) {
    throw new ValidationError(`Country must be ${MAX_LOCATION_FIELD} characters or fewer.`);
  }

  return {
    city: capitalizeLowercaseCity(input.city),
    region,
    country,
    firstCompetitionYear: parseFirstCompetitionYearOrThrow(input.rawYear),
  };
}

export interface ImportedLocation {
  city: string | null;
  region: string | null;
  country: string | null;
}

/**
 * The same rules, applied to values copied from an imported record, refusing
 * nothing.
 *
 * A claim merge runs inside the transaction that also records the claim, grants
 * the tier and writes the audit row. Throwing here would lose all of that over
 * a typo in twenty-year-old data, locking a member out of their own history;
 * design intent is explicit that a legacy-side mistake must never block a
 * claim. So a value that will not normalise is dropped rather than stored
 * dirty, and the member supplies it on the personal-details step, which asks
 * for it anyway.
 *
 * Dropping is safe for the merge's fill-if-empty contract: an absent value
 * leaves the column exactly as it was.
 */
export function normalizeImportedLocation(input: ImportedLocation): ImportedLocation {
  const country = input.country ? canonicalCountryName(input.country) : null;
  const city = input.city && input.city.length <= MAX_LOCATION_FIELD
    ? capitalizeLowercaseCity(input.city)
    : null;

  let region: string | null = null;
  if (input.region) {
    if (country && subdivisionsForCountry(country).length > 0) {
      // Anything that is neither a code nor a full name is the free text the
      // export cannot reconcile.
      region = subdivisionCodeFor(country, input.region);
    } else if (input.region.length <= MAX_LOCATION_FIELD) {
      region = input.region;
    }
  }

  return { city, region, country };
}
