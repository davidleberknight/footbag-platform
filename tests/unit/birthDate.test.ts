/**
 * Shared birth-date rules: the validator both collection surfaces use
 * (personal details and the wizard claim task's birth-date anchor), and the
 * three-class comparison that turns a member-versus-legacy date difference
 * into evidence metadata (identical / near_miss / mismatch).
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

  it('day/month transposition is a near-miss when both parts read as months', () => {
    expect(compareBirthDates('1985-03-07', '1985-07-03')).toBe('near_miss');
  });

  it('a swap involving a day above 12 is not a transposition', () => {
    expect(compareBirthDates('1985-03-17', '1985-17-03')).toBe('mismatch');
  });

  it('single component off by one is a near-miss (year, month, day)', () => {
    expect(compareBirthDates('1985-07-10', '1986-07-10')).toBe('near_miss');
    expect(compareBirthDates('1985-07-10', '1985-08-10')).toBe('near_miss');
    expect(compareBirthDates('1985-07-10', '1985-07-09')).toBe('near_miss');
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
});
