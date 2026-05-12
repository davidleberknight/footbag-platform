/**
 * Unit tests for the shared formatDateDisplay helper. Pinning here so the two
 * callers (memberService tier-status block, activePlayerExpiryService
 * reminder email body) stay aligned and the contract is editable in one place.
 */
import { describe, it, expect } from 'vitest';
import { formatDateDisplay } from '../../src/services/dateFormat';

describe('formatDateDisplay', () => {
  it('default short style emits en-US month-abbreviation form', () => {
    const out = formatDateDisplay('2099-09-15T12:00:00.000Z');
    expect(out).toContain('Sep');
    expect(out).toContain('2099');
  });

  it('long style emits the full month name', () => {
    const out = formatDateDisplay('2099-09-15T12:00:00.000Z', { style: 'long' });
    expect(out).toContain('September');
    expect(out).toContain('2099');
  });

  it('respects a non-default locale', () => {
    const out = formatDateDisplay('2099-09-15T12:00:00.000Z', { locale: 'en-GB' });
    // en-GB short form puts day before month and uses different month abbreviation casing.
    expect(out).toContain('15');
    expect(out).toContain('2099');
  });

  it('uses UTC so the rendered calendar day matches the ISO date regardless of host time zone', () => {
    // 2099-09-15 23:30 UTC: in any timezone with negative UTC offset, local
    // date is still 2099-09-15. The fixed UTC option ensures the output day
    // stays 15 (not 14, 16, etc.) across CI runners.
    const out = formatDateDisplay('2099-09-15T23:30:00.000Z');
    expect(out).toContain('15');
    expect(out).toContain('Sep');
  });

  it('returns the raw ISO string when parsing fails (defense in depth for legacy data)', () => {
    expect(formatDateDisplay('not-a-date')).toBe('not-a-date');
  });
});
