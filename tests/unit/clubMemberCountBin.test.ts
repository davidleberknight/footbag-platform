/**
 * Unit tests for the /clubs world-map choropleth bin function.
 *
 * Bin boundaries (1-2 / 3-9 / 10-29 / 30-99 / 100-299 / 300+) were
 * chosen against the 2026-05-18 per-country distribution of
 * legacy_person_club_affiliations: USA=1153 sits alone in bin 6;
 * Canada (258) plus the 100-200 cohort populate bin 5; bin 4
 * captures the middle of the long tail; bins 1-3 split the small-
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

  it('returns 1 at the bottom of the trace bin', () => {
    expect(memberCountBin(1)).toBe(1);
  });

  it('returns 1 at the top of the trace bin (1-2)', () => {
    expect(memberCountBin(2)).toBe(1);
  });

  it('returns 2 at the bottom of the small bin', () => {
    expect(memberCountBin(3)).toBe(2);
  });

  it('returns 2 at the top of the small bin (3-9)', () => {
    expect(memberCountBin(9)).toBe(2);
  });

  it('returns 3 at the bottom of the medium-small bin', () => {
    expect(memberCountBin(10)).toBe(3);
  });

  it('returns 3 at the top of the medium-small bin (10-29)', () => {
    expect(memberCountBin(29)).toBe(3);
  });

  it('returns 4 at the bottom of the medium bin', () => {
    expect(memberCountBin(30)).toBe(4);
  });

  it('returns 4 at the top of the medium bin (30-99)', () => {
    expect(memberCountBin(99)).toBe(4);
  });

  it('returns 5 at the bottom of the large bin', () => {
    expect(memberCountBin(100)).toBe(5);
  });

  it('returns 5 at the top of the large bin (100-299)', () => {
    expect(memberCountBin(299)).toBe(5);
  });

  it('returns 6 at the bottom of the outlier bin', () => {
    expect(memberCountBin(300)).toBe(6);
  });

  it('returns 6 for the current production outlier (USA ~1153)', () => {
    expect(memberCountBin(1153)).toBe(6);
  });
});
