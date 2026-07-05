import { ValidationError } from '../services/serviceErrors';

/**
 * Shared birth-date rules for every surface that accepts or compares a
 * member's date of birth (the onboarding personal-details task and the
 * wizard claim task's birth-date anchor). One validator keeps the two
 * entry points byte-identical in what they accept and reject.
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
 * Outcome classes for comparing a member-entered birth date against the
 * date a legacy record carries. `near_miss` absorbs the common entry
 * errors (a day/month transposition, or exactly one component off by one)
 * so a typo neither blocks a match nor raises a false alarm; anything
 * further apart is a `mismatch`. The comparison is evidence metadata only:
 * it never gates a claim.
 */
export type BirthDateComparison = 'identical' | 'near_miss' | 'mismatch';

export function compareBirthDates(a: string, b: string): BirthDateComparison {
  if (a === b) return 'identical';
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  if (pa.length !== 3 || pb.length !== 3 || pa.some(isNaN) || pb.some(isNaN)) {
    return 'mismatch';
  }
  const [ya, ma, da] = pa;
  const [yb, mb, db] = pb;
  // Day/month transposition (a US/EU date-format flip): both parts must be
  // plausible months for the swap to be an honest reading of the same date.
  if (ya === yb && ma === db && da === mb && ma <= 12 && da <= 12) {
    return 'near_miss';
  }
  // Exactly one component off by one, the other two identical.
  const diffs =
    (ya === yb ? 0 : Math.abs(ya - yb) === 1 ? 1 : 99) +
    (ma === mb ? 0 : Math.abs(ma - mb) === 1 ? 1 : 99) +
    (da === db ? 0 : Math.abs(da - db) === 1 ? 1 : 99);
  if (diffs === 1) return 'near_miss';
  return 'mismatch';
}
