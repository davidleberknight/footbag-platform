/**
 * A birth date is entered as three separate parts and stored as one ISO string.
 * These tests pin the contract between the two: what the parts must contain,
 * which part a rejection names, and that a stored value comes back out in the
 * same form the member typed it.
 */
import { describe, it, expect } from 'vitest';
import {
  assembleBirthDate,
  splitBirthDateParts,
  BIRTH_MONTH_NAMES,
} from '../../src/lib/birthDate';
import { ValidationError } from '../../src/services/serviceErrors';

describe('splitBirthDateParts', () => {
  it('splits a stored date into day, month and year', () => {
    expect(splitBirthDateParts('1980-03-31')).toEqual({ day: '31', month: '3', year: '1980' });
  });

  it('strips the storage padding so the member sees what they typed', () => {
    expect(splitBirthDateParts('1980-03-05')).toEqual({ day: '5', month: '3', year: '1980' });
  });

  it('returns empty parts when nothing is stored', () => {
    expect(splitBirthDateParts(null)).toEqual({ day: '', month: '', year: '' });
    expect(splitBirthDateParts('')).toEqual({ day: '', month: '', year: '' });
    expect(splitBirthDateParts(undefined)).toEqual({ day: '', month: '', year: '' });
  });

  it('returns empty parts rather than fragments for a value that is not a stored date', () => {
    expect(splitBirthDateParts('31/03/1980')).toEqual({ day: '', month: '', year: '' });
  });

  it('round-trips a stored date back to the same stored date', () => {
    const parts = splitBirthDateParts('1974-12-09');
    expect(assembleBirthDate(parts)).toBe('1974-12-09');
  });
});

describe('assembleBirthDate', () => {
  it('assembles the three parts into the stored form', () => {
    expect(assembleBirthDate({ day: '31', month: '3', year: '1980' })).toBe('1980-03-31');
  });

  it('accepts a day typed without a leading zero, and one with', () => {
    expect(assembleBirthDate({ day: '5', month: '3', year: '1980' })).toBe('1980-03-05');
    expect(assembleBirthDate({ day: '05', month: '03', year: '1980' })).toBe('1980-03-05');
  });

  it('ignores surrounding whitespace', () => {
    expect(assembleBirthDate({ day: ' 5 ', month: ' 3 ', year: ' 1980 ' })).toBe('1980-03-05');
  });

  it('asks for the whole date when every part is empty', () => {
    expect(() => assembleBirthDate({ day: '', month: '', year: '' }))
      .toThrow(/Enter your date of birth/);
  });

  it('names the missing part rather than calling the date invalid', () => {
    expect(() => assembleBirthDate({ day: '', month: '3', year: '1980' })).toThrow(/include a day/);
    expect(() => assembleBirthDate({ day: '5', month: '', year: '1980' })).toThrow(/include a month/);
    expect(() => assembleBirthDate({ day: '5', month: '3', year: '' })).toThrow(/include a year/);
  });

  it('names the part at fault when a part is out of range', () => {
    expect(() => assembleBirthDate({ day: '32', month: '3', year: '1980' })).toThrow(/Day of birth/);
    expect(() => assembleBirthDate({ day: '0', month: '3', year: '1980' })).toThrow(/Day of birth/);
    expect(() => assembleBirthDate({ day: '5', month: '13', year: '1980' })).toThrow(/month of birth/);
    expect(() => assembleBirthDate({ day: '5', month: '0', year: '1980' })).toThrow(/month of birth/);
  });

  it('requires a four-digit year, so a two-digit one cannot mean two centuries', () => {
    expect(() => assembleBirthDate({ day: '5', month: '3', year: '80' })).toThrow(/four digits/);
    expect(() => assembleBirthDate({ day: '5', month: '3', year: '19800' })).toThrow(/four digits/);
  });

  it('rejects a part that is not digits at all', () => {
    expect(() => assembleBirthDate({ day: 'ते', month: '3', year: '1980' })).toThrow(/Day of birth/);
    expect(() => assembleBirthDate({ day: '5', month: 'March', year: '1980' })).toThrow(/month of birth/);
    expect(() => assembleBirthDate({ day: '5', month: '3', year: '19x0' })).toThrow(/four digits/);
    expect(() => assembleBirthDate({ day: '-5', month: '3', year: '1980' })).toThrow(/Day of birth/);
  });

  it('rejects a day that does not exist in that month', () => {
    expect(() => assembleBirthDate({ day: '30', month: '2', year: '2023' }))
      .toThrow(/not a valid calendar date/);
    expect(() => assembleBirthDate({ day: '31', month: '4', year: '1980' }))
      .toThrow(/not a valid calendar date/);
  });

  it('accepts a leap day in a leap year and rejects it otherwise', () => {
    expect(assembleBirthDate({ day: '29', month: '2', year: '2020' })).toBe('2020-02-29');
    expect(() => assembleBirthDate({ day: '29', month: '2', year: '2021' }))
      .toThrow(/not a valid calendar date/);
  });

  it('carries through the stored range rules', () => {
    expect(() => assembleBirthDate({ day: '1', month: '1', year: '1899' })).toThrow(/after 1900/);
    expect(() => assembleBirthDate({ day: '1', month: '1', year: '2999' })).toThrow(/in the future/);
  });

  it('throws the error class the form surfaces to the member', () => {
    expect(() => assembleBirthDate({ day: '', month: '', year: '' })).toThrow(ValidationError);
    expect(() => assembleBirthDate({ day: '99', month: '1', year: '1980' })).toThrow(ValidationError);
  });
});

describe('BIRTH_MONTH_NAMES', () => {
  it('lists the twelve months in calendar order', () => {
    expect(BIRTH_MONTH_NAMES).toHaveLength(12);
    expect(BIRTH_MONTH_NAMES[0]).toBe('January');
    expect(BIRTH_MONTH_NAMES[11]).toBe('December');
  });

  it('has a name for every month the assembler accepts', () => {
    BIRTH_MONTH_NAMES.forEach((_label, i) => {
      expect(assembleBirthDate({ day: '1', month: String(i + 1), year: '1980' }))
        .toBe(`1980-${String(i + 1).padStart(2, '0')}-01`);
    });
  });
});
