/**
 * Unit tests for the core-atom registry and isCoreAtom() helper.
 *
 * Contract under test (post-Wave-7 editorial pass, 2026-05-23):
 *
 *   - CORE_ATOM_SLUGS is the canonical 12-atom slug set, derived from
 *     CORE_ATOM_EDUCATIONAL and used at the service layer to suppress
 *     compound-shaped trick-detail partials (addAnalysis,
 *     equivalenceTopology) on atom pages.
 *
 *   - isCoreAtom(slug) returns true for each of the 12 atoms and
 *     false for any non-atom slug.
 *
 * Atoms are the floor of decomposition; the suppression rule prevents
 * placeholder content or false structural claims on atom pages.
 */
import { describe, it, expect } from 'vitest';

import {
  CORE_ATOM_EDUCATIONAL,
  CORE_ATOM_SLUGS,
  isCoreAtom,
} from '../../src/content/freestyleCoreAtomEducational';

describe('CORE_ATOM_SLUGS — canonical 12-atom set', () => {
  it('contains exactly 12 atoms', () => {
    expect(CORE_ATOM_SLUGS.size).toBe(12);
  });

  it('matches the slug list of CORE_ATOM_EDUCATIONAL exactly', () => {
    const educationalSlugs = new Set(CORE_ATOM_EDUCATIONAL.map(c => c.slug));
    expect(educationalSlugs.size).toBe(CORE_ATOM_SLUGS.size);
    for (const slug of educationalSlugs) {
      expect(CORE_ATOM_SLUGS.has(slug), `${slug} expected in CORE_ATOM_SLUGS`).toBe(true);
    }
  });

  it('contains each of the 12 curator-locked atoms', () => {
    // Per project_freestyle_core_atoms memory + freestyleCoreAtomEducational
    // (2026-05-22 curator lock): the 12-atom registry.
    const expected = [
      'toe-stall', 'clipper-stall', 'around-the-world', 'orbit',
      'legover', 'mirage', 'pickup', 'illusion',
      'butterfly', 'osis', 'whirl', 'swirl',
    ];
    for (const slug of expected) {
      expect(CORE_ATOM_SLUGS.has(slug), `${slug} expected in CORE_ATOM_SLUGS`).toBe(true);
    }
  });
});

describe('isCoreAtom() — predicate for service-layer suppression', () => {
  it('returns true for each of the 12 atoms', () => {
    for (const atom of CORE_ATOM_EDUCATIONAL) {
      expect(isCoreAtom(atom.slug), `${atom.slug} should be a core atom`).toBe(true);
    }
  });

  it('returns false for compound tricks (non-atom slugs)', () => {
    // Sample of well-known compounds; the predicate must not over-match.
    const compounds = [
      'paradox-mirage', 'paradox-whirl', 'blur', 'blurry-whirl',
      'mobius', 'flurry', 'witchdoctor', 'baroque',
      'atomsmasher', 'eggbeater', 'rev-whirl',
    ];
    for (const slug of compounds) {
      expect(isCoreAtom(slug), `${slug} should NOT be a core atom`).toBe(false);
    }
  });

  it('returns false for empty / nonexistent slugs (defensive)', () => {
    expect(isCoreAtom('')).toBe(false);
    expect(isCoreAtom('nonexistent-slug')).toBe(false);
    expect(isCoreAtom('WHIRL')).toBe(false); // case-sensitive
  });
});
