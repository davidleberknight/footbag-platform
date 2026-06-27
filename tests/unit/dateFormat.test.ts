/**
 * Unit tests for the shared formatDateDisplay helper. Pinning here so the two
 * callers (memberService tier-status block, activePlayerExpiryService
 * reminder email body) stay aligned and the contract is editable in one place.
 */
import { describe, it, expect } from 'vitest';
import { formatDateDisplay } from '../../src/services/dateFormat';

describe('formatDateDisplay', () => {
  it('default short style is day-first with a spelled month, not American month-first', () => {
    const out = formatDateDisplay('2099-09-15T12:00:00.000Z');
    expect(out).toMatch(/Sep/);   // month always renders as a name, never a bare number
    expect(out).toContain('2099');
    // International order: the day precedes the month.
    expect(out.indexOf('15')).toBeLessThan(out.search(/Sep/));
  });

  it('long style emits the full month name, day-first', () => {
    const out = formatDateDisplay('2099-09-15T12:00:00.000Z', { style: 'long' });
    expect(out).toContain('September');
    expect(out).toContain('2099');
    expect(out.indexOf('15')).toBeLessThan(out.indexOf('September'));
  });

  it('respects an explicit locale override', () => {
    const out = formatDateDisplay('2099-09-15T12:00:00.000Z', { locale: 'en-US' });
    // Passing en-US restores the American month-first order, proving the
    // caller can override the international default.
    expect(out).toContain('Sep');
    expect(out).toContain('2099');
    expect(out.search(/Sep/)).toBeLessThan(out.indexOf('15'));
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
