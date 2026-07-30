/**
 * Unit tests for shared Handlebars helpers extracted from src/app.ts.
 * Pure functions; no DB, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import { formatDate, formatDateRange } from '../../src/lib/handlebarsHelpers';

describe('formatDate', () => {
  it('renders full ISO date as "<day> <Month> <year>"', () => {
    expect(formatDate('2024-09-15')).toBe('15 September 2024');
  });

  it('renders year+month input as "<Month> <year>"', () => {
    expect(formatDate('2024-09')).toBe('September 2024');
  });

  it('renders year-only input as the bare year', () => {
    expect(formatDate('2024')).toBe('2024');
  });

  it('falls back to year when month sentinel is "00" (legacy "month unknown" rows)', () => {
    // Regression: previously rendered `15 undefined 2024` because parseInt('00') = 0
    // and months[-1] = undefined slipped past the truthy-string guard.
    expect(formatDate('2024-00-15')).toBe('2024');
  });

  it('falls back to year when month is "00" and day is also missing', () => {
    expect(formatDate('2024-00')).toBe('2024');
  });

  it('falls back to year when month is out of range (>12)', () => {
    expect(formatDate('2024-13-01')).toBe('2024');
  });

  it('falls back to year when month is non-numeric', () => {
    expect(formatDate('2024-XX-15')).toBe('2024');
  });

  it('renders month+year only when day is non-numeric', () => {
    expect(formatDate('2024-09-XX')).toBe('September 2024');
  });

  it('falls back to month+year when day sentinel is "00" (legacy "day unknown" rows)', () => {
    // parseInt('00') is 0, which is not NaN, so an isNaN-only guard
    // rendered this as "0 June 1998".
    expect(formatDate('1998-06-00')).toBe('June 1998');
  });

  it('falls back to month+year when day is out of range (>31)', () => {
    expect(formatDate('2024-09-32')).toBe('September 2024');
  });

  it('handles single-digit numeric month and day correctly', () => {
    expect(formatDate('2024-01-05')).toBe('5 January 2024');
  });

  it('handles December (boundary month=12)', () => {
    expect(formatDate('2024-12-31')).toBe('31 December 2024');
  });
});

describe('formatDateRange', () => {
  it('formats a single ISO date exactly like formatDate', () => {
    expect(formatDateRange('2024-09-15')).toBe('15 September 2024');
    expect(formatDateRange('2024-09')).toBe('September 2024');
    expect(formatDateRange('2024')).toBe('2024');
  });

  it('collapses a same-month range to shared month and year', () => {
    // The confirmed defect value: rendered raw as "1998-03-21/1998-03-22".
    expect(formatDateRange('1998-03-21/1998-03-22')).toBe('21–22 March 1998');
  });

  it('collapses a same-year cross-month range to a shared year', () => {
    expect(formatDateRange('1998-03-21/1998-04-05')).toBe('21 March – 5 April 1998');
  });

  it('shows both full dates for a cross-year range', () => {
    expect(formatDateRange('1998-12-31/1999-01-02')).toBe('31 December 1998 – 2 January 1999');
  });

  it('renders a same-day range as a single date', () => {
    expect(formatDateRange('2001-07-04/2001-07-04')).toBe('4 July 2001');
  });

  it('renders a legacy day-first slash date in the same style as an ISO date', () => {
    // A day above twelve can only be a day, which is what proves the stored
    // format puts the day first.
    expect(formatDateRange('14/6/1997')).toBe('14 June 1997');
    expect(formatDateRange('18/4/1998')).toBe('18 April 1998');
    expect(formatDateRange('28/7/1987')).toBe('28 July 1987');
  });

  it('reads an all-small legacy slash date day-first too, so the table has one convention', () => {
    // Both numbers could be either part; the format is settled for the whole
    // set by the values that can only be read one way.
    expect(formatDateRange('3/4/1993')).toBe('3 April 1993');
    expect(formatDateRange('10/3/1995')).toBe('10 March 1995');
  });

  it('passes through a slash value whose day or month cannot exist', () => {
    // Dropping the impossible part would present a guess as a date.
    expect(formatDateRange('18/13/1998')).toBe('18/13/1998');
    expect(formatDateRange('32/1/1998')).toBe('32/1/1998');
    expect(formatDateRange('0/4/1998')).toBe('0/4/1998');
  });

  it('leaves a two-digit-year slash date alone, since its century is unknowable', () => {
    expect(formatDateRange('14/6/97')).toBe('14/6/97');
  });

  it('leaves any other unrecognized value unchanged', () => {
    expect(formatDateRange('March 1998')).toBe('March 1998');
    expect(formatDateRange('')).toBe('');
  });
});
