/**
 * Unit tests for shared Handlebars helpers extracted from src/app.ts.
 * Pure functions; no DB, no HTTP.
 */
import { describe, it, expect } from 'vitest';
import { formatDate } from '../../src/lib/handlebarsHelpers';

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

  it('handles single-digit numeric month and day correctly', () => {
    expect(formatDate('2024-01-05')).toBe('5 January 2024');
  });

  it('handles December (boundary month=12)', () => {
    expect(formatDate('2024-12-31')).toBe('31 December 2024');
  });
});
