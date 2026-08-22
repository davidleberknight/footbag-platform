/**
 * Shared birth-date rules: the validator both collection surfaces use
 * (personal details and the wizard claim task's birth-date anchor), and the
 * two-class comparison that turns a member-versus-legacy date into evidence
 * metadata (identical / mismatch).
 */
import { describe, it, expect } from 'vitest';
import { validateBirthDate, compareBirthDates } from '../../src/lib/birthDate';
import { ValidationError } from '../../src/services/serviceErrors';

describe('validateBirthDate', () => {
  it('accepts a real calendar date and returns it unchanged', () => {
    expect(validateBirthDate('1985-07-10')).toBe('1985-07-10');
  });

  it('rejects a non-ISO format', () => {
    expect(() => validateBirthDate('07/10/1985')).toThrow(ValidationError);
    expect(() => validateBirthDate('1985-7-10')).toThrow(ValidationError);
  });

  it('rejects an impossible day-of-month that JS Date would roll forward', () => {
    expect(() => validateBirthDate('1985-02-30')).toThrow(ValidationError);
  });

  it('rejects dates in 1900 and earlier', () => {
    expect(() => validateBirthDate('1899-12-31')).toThrow(ValidationError);
  });

  it('rejects a future date', () => {
    const next = new Date();
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    expect(() => validateBirthDate(next.toISOString().slice(0, 10))).toThrow(ValidationError);
  });
});

describe('compareBirthDates', () => {
  it('identical dates', () => {
    expect(compareBirthDates('1985-07-10', '1985-07-10')).toBe('identical');
  });

  // Anything that is not identical fails to corroborate, and the outcome of
  // failing to corroborate is the same however near the two dates are. A date
  // that does not match never blocks a claim, weakens one, or raises work, so a
  // graded middle class would have no consumer and no meaning.
  it('a day/month transposition is a mismatch, not a tolerated typo', () => {
    expect(compareBirthDates('1985-03-07', '1985-07-03')).toBe('mismatch');
  });

  it('a single component off by one is a mismatch (year, month, day)', () => {
    expect(compareBirthDates('1985-07-10', '1986-07-10')).toBe('mismatch');
    expect(compareBirthDates('1985-07-10', '1985-08-10')).toBe('mismatch');
    expect(compareBirthDates('1985-07-10', '1985-07-09')).toBe('mismatch');
  });

  it('two components off by one is a mismatch', () => {
    expect(compareBirthDates('1985-07-10', '1986-08-10')).toBe('mismatch');
  });

  it('one component off by more than one is a mismatch', () => {
    expect(compareBirthDates('1985-07-10', '1985-07-20')).toBe('mismatch');
    expect(compareBirthDates('1985-07-10', '1990-07-10')).toBe('mismatch');
  });

  it('entirely different dates are a mismatch', () => {
    expect(compareBirthDates('1985-07-10', '1962-01-28')).toBe('mismatch');
  });

  it('a malformed date on either side is a mismatch, never identical', () => {
    expect(compareBirthDates('not-a-date', '1985-07-10')).toBe('mismatch');
    expect(compareBirthDates('1985-07-10', '')).toBe('mismatch');
  });
});
