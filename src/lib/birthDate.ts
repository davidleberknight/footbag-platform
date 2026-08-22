import { ValidationError } from '../services/serviceErrors';

/**
 * Shared birth-date rules for every surface that accepts or compares a member's
 * date of birth.
 *
 * Three surfaces collect it: the onboarding personal-details task, the claim
 * task's last attempt at the match, and profile edit. A fourth reads a
 * correction back from a member answering an administrator's question. One
 * validator keeps every one of them byte-identical in what it accepts and
 * rejects, which matters because the date is the anchor the matcher runs on and
 * a value one surface would refuse must not be storable through another.
 */

/**
 * Validate a submitted birth date and return the normalized ISO value.
 *
 * Accepts only a real calendar date in YYYY-MM-DD form, after 1900 and not
 * in the future. Throws ValidationError with a member-readable message.
 */
export function validateBirthDate(rawDob: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) {
    throw new ValidationError('Date of birth must be in YYYY-MM-DD format.');
  }
  const parsed = new Date(rawDob + 'T00:00:00Z');
  if (isNaN(parsed.getTime())) {
    throw new ValidationError('Date of birth is not a valid date.');
  }
  // JS Date silently rolls an impossible day-of-month forward (Feb 30 -> Mar 1)
  // rather than returning NaN, so re-serialize the parsed UTC date and reject
  // when it does not round-trip to the submitted string.
  if (parsed.toISOString().slice(0, 10) !== rawDob) {
    throw new ValidationError('Date of birth is not a valid calendar date.');
  }
  if (parsed.getFullYear() < 1900) {
    throw new ValidationError('Date of birth must be after 1900.');
  }
  if (parsed > new Date()) {
    throw new ValidationError('Date of birth cannot be in the future.');
  }
  return rawDob;
}

/**
 * A birth date as the member enters it: three separate parts rather than one
 * string. Day and year are typed; month is chosen from a named list, so its
 * value is the month number as a string.
 *
 * Three labelled parts is what every design system that has tested date-of-birth
 * entry settled on, because a birth date is a date the member already knows
 * rather than one they pick off a calendar, and a calendar opens decades away
 * from it. Separate labelled parts also carry the same meaning to a member who
 * writes dates day-first and one who writes them month-first, which a single
 * run of digits does not.
 */
export interface BirthDateParts { day: string; month: string; year: string }

export const BIRTH_MONTH_NAMES: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Split a stored ISO date into its parts for redisplay. Empty parts for none. */
export function splitBirthDateParts(iso: string | null | undefined): BirthDateParts {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { day: '', month: '', year: '' };
  const [year, month, day] = iso.split('-');
  // Strip the storage padding: the member typed "3", and showing them "03"
  // back implies a format the form does not actually require.
  return { day: String(Number(day)), month: String(Number(month)), year };
}

/**
 * Assemble the three entered parts into the stored ISO value.
 *
 * Names the part at fault rather than calling the whole date invalid, so a
 * member who mistyped one box is told which one. A day is accepted with or
 * without a leading zero, because requiring one is a rule the member cannot
 * see. Calendar and range checks are left to `validateBirthDate`, so the two
 * entry surfaces and the stored value cannot drift apart.
 */
export function assembleBirthDate(parts: BirthDateParts): string {
  const day = parts.day.trim();
  const month = parts.month.trim();
  const year = parts.year.trim();

  if (!day && !month && !year) {
    throw new ValidationError('Enter your date of birth.');
  }
  if (!day)   throw new ValidationError('Date of birth must include a day.');
  if (!month) throw new ValidationError('Date of birth must include a month.');
  if (!year)  throw new ValidationError('Date of birth must include a year.');

  if (!/^\d{1,2}$/.test(day) || Number(day) < 1 || Number(day) > 31) {
    throw new ValidationError('Day of birth must be a number between 1 and 31.');
  }
  if (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12) {
    throw new ValidationError('Choose a month of birth from the list.');
  }
  if (!/^\d{4}$/.test(year)) {
    throw new ValidationError('Year of birth must be four digits, for example 1980.');
  }

  const iso = `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  return validateBirthDate(iso);
}

/**
 * Outcome classes for comparing a member-entered birth date against the date a
 * legacy record carries.
 *
 * The date is corroborating evidence and nothing else. An identical pair
 * strengthens a match; anything else simply fails to corroborate it. There is
 * no third class between the two, because nothing downstream could act on one:
 * a date that does not match never blocks a claim, never weakens it, and never
 * raises work for an administrator, so grading how far apart two dates are
 * would decide nothing. Every claim records the outcome in its audit metadata
 * either way, which is where a disputed link is reconstructed from.
 *
 * This is the result of comparing two dates that both exist. What a claim
 * records is wider, because often one of them does not: see
 * `RecordedBirthDateComparison` below.
 */
export type BirthDateComparison = 'identical' | 'mismatch';

export function compareBirthDates(a: string, b: string): BirthDateComparison {
  return a === b ? 'identical' : 'mismatch';
}

/**
 * What a claim's audit row actually records, which is wider than the comparison
 * above: two dates can only be compared when both exist, and on the archive's
 * side one often does not.
 *
 * The absent classes are not a middle grade between identical and mismatch.
 * They say the comparison could not be made, which is a different fact and the
 * one an administrator needs when they are weighing how much a record's silence
 * is worth. Roughly a third of legacy accounts carry no date at all, and an
 * archived record reaches one only through a linked legacy account, so
 * `no_legacy_account` is the commonest of them rather than an edge case.
 *
 * Nothing here penalises a member. An absent date corroborates nothing and
 * costs nothing.
 */
export type RecordedBirthDateComparison =
  | BirthDateComparison
  /** The legacy account exists and carries no date. */
  | 'legacy_dob_absent'
  /** The member's own date is missing, which the claim prerequisite prevents. */
  | 'member_dob_absent'
  /** Neither side carries one. */
  | 'both_dob_absent'
  /** The archived record has no linked legacy account, so no date exists to read. */
  | 'no_legacy_account';
