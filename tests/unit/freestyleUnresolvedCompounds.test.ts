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
    // 2026-05-16 Pre-Red completion sweep removed 'tomahawk' from the
    // allow-list after Slice P confirmed strong external consensus
    // (FM + PB both decompose to ducking paradox whirl).
    const expected = new Set([
      'rev-up',
      'reaper',
      'surreal',
      'montage',
      'witchdoctor',
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
    // 2026-05-16 Pre-Red sweep: tomahawk removed from pilot list after
    // external (FM + PB) consensus on ducking paradox whirl reading.
    expect(isUnresolvedCompound('tomahawk')).toBe(false);
    expect(isUnresolvedCompound('nonexistent')).toBe(false);
    expect(isUnresolvedCompound('')).toBe(false);
  });

  it('pilot size is exactly 7 (restraint contract)', () => {
    // Per the slice directive: "DO NOT harden unresolved doctrine".
    // The pilot is small by design. A growing list should prompt a
    // curator review, not silently scale. 2026-05-16 Pre-Red sweep
    // dropped pilot from 8 → 7 by removing tomahawk.
    expect(UNRESOLVED_COMPOUNDS.size).toBe(7);
  });
});
