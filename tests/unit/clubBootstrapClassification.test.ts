/**
 * Unit tests for classifyBootstrapLeader.
 *
 * Coverage:
 *   - All 32 input combinations of the 5 structural signals are classified
 *     deterministically into strong / weak / none.
 *   - Strong gates each fire exactly when their conjunction holds.
 *   - Single-signal inputs always classify weak, regardless of which signal.
 *   - Zero structural signals classify none.
 *   - Context modifiers never change the classification.
 *   - Strong gate precedence: when multiple strong gates would match, the
 *     declared first-match order (listed_contact_and_affiliation, then
 *     hosting_and_roster, then listed_contact_and_hosting) is preserved.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyBootstrapLeader,
  type StructuralSignals,
  type ContextModifiers,
} from '../../src/services/clubBootstrapClassificationService';

const STRUCTURAL_KEYS = [
  'listed_contact',
  'affiliation',
  'hosting',
  'roster',
  'mirror_text',
] as const;

function structuralFromBits(bits: number): StructuralSignals {
  return {
    listed_contact: (bits & 0b00001) !== 0,
    affiliation:    (bits & 0b00010) !== 0,
    hosting:        (bits & 0b00100) !== 0,
    roster:         (bits & 0b01000) !== 0,
    mirror_text:    (bits & 0b10000) !== 0,
  };
}

function isStrong(s: StructuralSignals): boolean {
  return (s.listed_contact && s.affiliation)
      || (s.hosting && s.roster)
      || (s.listed_contact && s.hosting);
}

function anyStructural(s: StructuralSignals): boolean {
  return s.listed_contact || s.affiliation || s.hosting || s.roster || s.mirror_text;
}

describe('classifyBootstrapLeader', () => {
  it('classifies all 32 structural-signal combinations deterministically', () => {
    for (let bits = 0; bits < 32; bits += 1) {
      const s = structuralFromBits(bits);
      const result = classifyBootstrapLeader(s);
      if (isStrong(s)) {
        expect(result.classification).toBe('strong');
        expect(result.matchedGate).not.toBeNull();
      } else if (anyStructural(s)) {
        expect(result.classification).toBe('weak');
        expect(result.matchedGate).toBe('single_structural');
      } else {
        expect(result.classification).toBe('none');
        expect(result.matchedGate).toBeNull();
      }
      expect(result.structural).toEqual(s);
    }
  });

  it('classifies zero signals as none with null gate', () => {
    const result = classifyBootstrapLeader(structuralFromBits(0));
    expect(result.classification).toBe('none');
    expect(result.matchedGate).toBeNull();
  });

  for (const key of STRUCTURAL_KEYS) {
    it(`classifies single-signal "${key}" as weak`, () => {
      const s: StructuralSignals = {
        listed_contact: false,
        affiliation:    false,
        hosting:        false,
        roster:         false,
        mirror_text:    false,
      };
      s[key] = true;
      const result = classifyBootstrapLeader(s);
      expect(result.classification).toBe('weak');
      expect(result.matchedGate).toBe('single_structural');
    });
  }

  it('matches listed_contact_and_affiliation gate first', () => {
    const result = classifyBootstrapLeader({
      listed_contact: true,
      affiliation:    true,
      hosting:        false,
      roster:         false,
      mirror_text:    false,
    });
    expect(result.classification).toBe('strong');
    expect(result.matchedGate).toBe('listed_contact_and_affiliation');
  });

  it('matches hosting_and_roster gate', () => {
    const result = classifyBootstrapLeader({
      listed_contact: false,
      affiliation:    false,
      hosting:        true,
      roster:         true,
      mirror_text:    false,
    });
    expect(result.classification).toBe('strong');
    expect(result.matchedGate).toBe('hosting_and_roster');
  });

  it('matches listed_contact_and_hosting gate when other strong gates would not fire', () => {
    const result = classifyBootstrapLeader({
      listed_contact: true,
      affiliation:    false,
      hosting:        true,
      roster:         false,
      mirror_text:    false,
    });
    expect(result.classification).toBe('strong');
    expect(result.matchedGate).toBe('listed_contact_and_hosting');
  });

  it('strong-gate precedence: listed_contact+affiliation wins over hosting+roster when both hold', () => {
    const result = classifyBootstrapLeader({
      listed_contact: true,
      affiliation:    true,
      hosting:        true,
      roster:         true,
      mirror_text:    false,
    });
    expect(result.classification).toBe('strong');
    expect(result.matchedGate).toBe('listed_contact_and_affiliation');
  });

  it('classifies mirror_text alone as weak (no structural pair)', () => {
    const result = classifyBootstrapLeader({
      listed_contact: false,
      affiliation:    false,
      hosting:        false,
      roster:         false,
      mirror_text:    true,
    });
    expect(result.classification).toBe('weak');
    expect(result.matchedGate).toBe('single_structural');
  });

  it('context modifiers never change classification', () => {
    const structural: StructuralSignals = {
      listed_contact: false,
      affiliation:    false,
      hosting:        false,
      roster:         false,
      mirror_text:    false,
    };
    const noneResult = classifyBootstrapLeader(structural);
    expect(noneResult.classification).toBe('none');

    // Toggling every combination of the 3 modifiers must yield the same
    // structural classification.
    for (let m = 0; m < 8; m += 1) {
      const modifiers: ContextModifiers = {
        tier_signal:          (m & 0b001) !== 0,
        recent_activity:      (m & 0b010) !== 0,
        geographic_alignment: (m & 0b100) !== 0,
      };
      const r = classifyBootstrapLeader(structural, modifiers);
      expect(r.classification).toBe('none');
      expect(r.modifiers).toEqual(modifiers);
    }

    // Same test for a strong-classified structural set.
    const strong: StructuralSignals = {
      listed_contact: true,
      affiliation:    true,
      hosting:        false,
      roster:         false,
      mirror_text:    false,
    };
    for (let m = 0; m < 8; m += 1) {
      const modifiers: ContextModifiers = {
        tier_signal:          (m & 0b001) !== 0,
        recent_activity:      (m & 0b010) !== 0,
        geographic_alignment: (m & 0b100) !== 0,
      };
      const r = classifyBootstrapLeader(strong, modifiers);
      expect(r.classification).toBe('strong');
    }
  });

  it('returns the structural signals unchanged in the result', () => {
    const s: StructuralSignals = {
      listed_contact: true,
      affiliation:    false,
      hosting:        false,
      roster:         false,
      mirror_text:    true,
    };
    const result = classifyBootstrapLeader(s);
    expect(result.structural).toEqual(s);
  });
});
