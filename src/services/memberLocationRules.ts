/**
 * The rules a member's location and first-competition year must satisfy, and
 * the single home for them.
 *
 * These columns feed the Official IFPA Roster export, where one place recorded
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
 * Two deliberate asymmetries a reader will otherwise try to "fix":
 *
 *   - Only a CHANGED country is held to the canonical rule. A migrated profile
 *     carries whatever the import wrote, and the picker re-offers a stored
 *     value it does not list, so holding an untouched value to the rule would
 *     trap the member on a form they cannot submit over a field they never
 *     chose.
 *   - On the member's own forms a full state name is refused rather than folded
 *     to its code, because the member is answering a picker and a name means
 *     the submission did not come from it. On the import paths a name IS folded,
 *     because there was no picker and the imported record is free text.
 */
import { ValidationError } from './serviceErrors';
import { canonicalCountryName, countryCode, subdivisionsForCountry } from './countryUtils';

export const MAX_LOCATION_FIELD = 64;
export const FIRST_COMPETITION_YEAR_MIN = 1972;

export const REGION_REQUIRED_MESSAGE = 'Region or state is required for the USA and Canada.';
export const REGION_CODE_MESSAGE =
  'Region must be the official two-letter state or province code, such as CO, CA, or NY.';
export const COUNTRY_CHOICE_MESSAGE =
  'Country must be one of the countries offered in the list, such as United States or Canada.';

function trimmed(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

// In the USA and Canada a location without its state or province is ambiguous
// (a bare "Portland" or "London" names more than one place), so the region is
// required there and optional everywhere else. The country field may hold free
// text from an import, so the common spellings are folded to an ISO code before
// comparing; the shared country map already carries the full names and the USA
// alias, and the short forms a member is likely to type are handled here.
const REGION_REQUIRED_COUNTRY_CODES = new Set(['US', 'CA']);
const REGION_REQUIRED_SPELLINGS = new Set([
  'US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA', 'AMERICA',
  'CA', 'CAN', 'CANADA',
]);

export function regionRequiredForCountry(country: string): boolean {
  const raw = trimmed(country).toUpperCase().replace(/\./g, '');
  if (REGION_REQUIRED_SPELLINGS.has(raw)) return true;
  return REGION_REQUIRED_COUNTRY_CODES.has(countryCode(trimmed(country)).toUpperCase());
}

// Where a country writes its addresses with an official state or province set,
// that set is the whole vocabulary and the server decides membership in it.
// The form renders a picker, but a picker is not the only way a value reaches
// this method. A country with no official set keeps a free-text region.
export function canonicalRegionOrThrow(country: string, region: string | null): string | null {
  if (!region) return region;
  const subdivisions = subdivisionsForCountry(country);
  if (subdivisions.length === 0) return region;
  const match = subdivisions.find((s) => s.code.toLowerCase() === region.trim().toLowerCase());
  if (!match) throw new ValidationError(REGION_CODE_MESSAGE);
  return match.code;
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
 * store by editing their profile afterwards, and the roster export carries
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
 * Order matters. The region-required check runs first, on the country as
 * submitted, so a member who omitted a required region is told that rather than
 * being sent down an argument about spelling. The country folds next, because
 * the state and province list is looked up by country: without the fold, a
 * country spelled 'U.S.' matches no list and its region silently escapes the
 * two-letter-code rule.
 */
export function validateMemberLocationAndYear(input: {
  city: string;
  region: string | null;
  country: string;
  storedCountry: string | null;
  rawYear: string;
}): ValidatedMemberLocation {
  if (!input.region && regionRequiredForCountry(input.country)) {
    throw new ValidationError(REGION_REQUIRED_MESSAGE);
  }
  const country = canonicalCountryOrThrow(input.country, input.storedCountry);
  const region = canonicalRegionOrThrow(country, input.region);

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
    city: input.city,
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
  const city = input.city && input.city.length <= MAX_LOCATION_FIELD ? input.city : null;

  let region: string | null = null;
  if (input.region) {
    const wanted = input.region.trim().toLowerCase();
    const subdivisions = country ? subdivisionsForCountry(country) : [];
    if (subdivisions.length > 0) {
      // An imported record answered no picker, so it may carry either the code
      // or the full name; both are recognizable, and anything else is the free
      // text the export cannot reconcile.
      region =
        subdivisions.find(
          (s) => s.code.toLowerCase() === wanted || s.label.toLowerCase() === wanted,
        )?.code ?? null;
    } else if (input.region.length <= MAX_LOCATION_FIELD) {
      region = input.region;
    }
  }

  return { city, region, country };
}
