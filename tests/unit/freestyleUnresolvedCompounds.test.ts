/**
 * Unit tests for src/content/freestyleUnresolvedCompounds.ts (Slice M).
 *
 * Allow-list is curator-authored; the test pins the pilot membership
 * exactly so an inadvertent edit fails loudly.
 */
import { describe, it, expect } from 'vitest';
import {
  UNRESOLVED_COMPOUNDS,
  isUnresolvedCompound,
} from '../../src/content/freestyleUnresolvedCompounds';

describe('freestyleUnresolvedCompounds', () => {
  it('declares the curator-authored pilot set verbatim', () => {
    const expected = new Set([
      'rev-up',
      'reaper',
      'surreal',
      'montage',
      'fury',
      'surgery',
    ]);
    expect(UNRESOLVED_COMPOUNDS).toEqual(expected);
  });

  it('isUnresolvedCompound returns true for each pilot member', () => {
    for (const slug of UNRESOLVED_COMPOUNDS) {
      expect(isUnresolvedCompound(slug), `${slug} should be flagged`).toBe(true);
    }
  });

  it('isUnresolvedCompound returns false for non-members', () => {
    expect(isUnresolvedCompound('whirl')).toBe(false);
    expect(isUnresolvedCompound('paradox-whirl')).toBe(false);
    expect(isUnresolvedCompound('drifter')).toBe(false);
    expect(isUnresolvedCompound('torque')).toBe(false);
    expect(isUnresolvedCompound('butterfly')).toBe(false);
    expect(isUnresolvedCompound('tomahawk')).toBe(false);
    expect(isUnresolvedCompound('witchdoctor')).toBe(false);
    expect(isUnresolvedCompound('nonexistent')).toBe(false);
    expect(isUnresolvedCompound('')).toBe(false);
  });

  it('pilot size is exactly 6 (restraint contract)', () => {
    // Pilot is small by design. A growing list signals unbounded doctrine
    // accumulation and should prompt curator review before the count increases.
    expect(UNRESOLVED_COMPOUNDS.size).toBe(6);
  });
});
