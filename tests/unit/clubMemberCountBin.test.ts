/**
 * Unit tests for the /clubs world-map choropleth tier function.
 *
 * Bin boundaries (1-2 / 3-9 / 10-29 / 30-99 / 100-299 / 300+) were
 * chosen against the 2026-05-18 per-country distribution of
 * legacy_person_club_affiliations: USA=1153 sits alone in tier 6;
 * Canada (258) plus the 100-200 cohort populate tier 5; tier 4
 * captures the middle of the long tail; tiers 1-3 split the small-
 * presence countries for visual gradient detail.
 *
 * If the distribution shifts substantially (e.g. when prod cuts in
 * with Phase-H-only clubs), revisit the boundaries — they aren't
 * intended to float automatically, they're an editorial bucketing.
 */
import { describe, it, expect } from 'vitest';
import { memberCountBin } from '../../src/services/clubService';

describe('memberCountBin', () => {
  it('returns 0 for zero affiliations', () => {
    expect(memberCountBin(0)).toBe(0);
  });

  it('returns 0 for negative input (defensive against bad data)', () => {
    expect(memberCountBin(-1)).toBe(0);
  });

  it('returns 1 at the bottom of the trace tier', () => {
    expect(memberCountBin(1)).toBe(1);
  });

  it('returns 1 at the top of the trace tier (1-2)', () => {
    expect(memberCountBin(2)).toBe(1);
  });

  it('returns 2 at the bottom of the small tier', () => {
    expect(memberCountBin(3)).toBe(2);
  });

  it('returns 2 at the top of the small tier (3-9)', () => {
    expect(memberCountBin(9)).toBe(2);
  });

  it('returns 3 at the bottom of the medium-small tier', () => {
    expect(memberCountBin(10)).toBe(3);
  });

  it('returns 3 at the top of the medium-small tier (10-29)', () => {
    expect(memberCountBin(29)).toBe(3);
  });

  it('returns 4 at the bottom of the medium tier', () => {
    expect(memberCountBin(30)).toBe(4);
  });

  it('returns 4 at the top of the medium tier (30-99)', () => {
    expect(memberCountBin(99)).toBe(4);
  });

  it('returns 5 at the bottom of the large tier', () => {
    expect(memberCountBin(100)).toBe(5);
  });

  it('returns 5 at the top of the large tier (100-299)', () => {
    expect(memberCountBin(299)).toBe(5);
  });

  it('returns 6 at the bottom of the outlier tier', () => {
    expect(memberCountBin(300)).toBe(6);
  });

  it('returns 6 for the current production outlier (USA ~1153)', () => {
    expect(memberCountBin(1153)).toBe(6);
  });
});
