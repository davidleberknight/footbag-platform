/**
 * Family display tiers are curated doctrine, not a numeric threshold. These
 * tests pin the explicit first-class roster and prove a family's tier is fixed
 * by that roster, never by its live membership count. Foundational terminal
 * surfaces stay outside the ordinary family tiers.
 */
import { describe, it, expect } from 'vitest';

import {
  familyTier,
  isOfficialFamilyParent,
  FIRST_CLASS_FAMILIES,
  FOUNDATIONAL_TERMINAL_SURFACES,
} from '../../src/content/freestyleFamilyTiers';
import { PUBLIC_DISPLAY_FAMILIES } from '../../src/content/freestylePublicFamilies';

const EXPECTED_FIRST_CLASS = [
  'osis', 'whirl', 'legover', 'mirage', 'butterfly', 'down', 'illusion',
  'swirl', 'pickup', 'blender', 'torque', 'double_leg_over', 'drifter',
  'barfly', 'eggbeater', 'double_over_down', 'inside_stall',
];

describe('curated first-class family roster', () => {
  it('is exactly the 17 ratified families and nothing else', () => {
    expect([...FIRST_CLASS_FAMILIES].sort()).toEqual([...EXPECTED_FIRST_CLASS].sort());
    expect(FIRST_CLASS_FAMILIES.size).toBe(17);
  });

  it('marks each first-class family as a Family Parent', () => {
    for (const slug of EXPECTED_FIRST_CLASS) {
      expect(familyTier(slug)).toBe('family-parent');
      expect(isOfficialFamilyParent(slug)).toBe(true);
    }
  });

  it('keeps rev_whirl, eclipse, flail, butterfly_swirl, and paradon as minor lineages', () => {
    for (const slug of ['rev_whirl', 'eclipse', 'flail', 'butterfly_swirl', 'paradon']) {
      expect(familyTier(slug)).toBe('minor-lineage');
      expect(isOfficialFamilyParent(slug)).toBe(false);
    }
  });
});

describe('eligibility is curated, not a count threshold', () => {
  it('a minor lineage whose live membership exceeds the former threshold of 10 is not promoted', () => {
    // rev_whirl, eclipse, and flail all carry more than ten live members, which
    // under the old count > 10 rule would have promoted them. They stay minor:
    // only the curated set promotes a family.
    for (const slug of ['rev_whirl', 'eclipse', 'flail']) {
      expect(familyTier(slug)).toBe('minor-lineage');
    }
  });

  it('familyTier is a pure function of the slug and carries no count parameter', () => {
    expect(familyTier.length).toBe(1);
  });
});

describe('the first-class roster and the browse roster cannot drift', () => {
  // FIRST_CLASS_FAMILIES is the single authority for standalone-page eligibility.
  // PUBLIC_DISPLAY_FAMILIES is the full browse roster (roots + branches, first-
  // class and minor) and the source of family labels. A family page is reachable
  // only when it is both first-class and present in the browse roster, so every
  // first-class family must have a browse-roster entry or its page silently 404s.
  it('every first-class family has an entry in PUBLIC_DISPLAY_FAMILIES', () => {
    const browse = new Set(PUBLIC_DISPLAY_FAMILIES.map(f => f.slug));
    for (const slug of FIRST_CLASS_FAMILIES) {
      expect(browse.has(slug)).toBe(true);
    }
  });
});

describe('foundational terminal surfaces stay outside ordinary family eligibility', () => {
  it('classifies toe_stall / clipper_stall as foundational and never as a family parent', () => {
    for (const surface of FOUNDATIONAL_TERMINAL_SURFACES) {
      expect(familyTier(surface)).toBe('foundational-terminal-surface');
      expect(isOfficialFamilyParent(surface)).toBe(false);
      expect(FIRST_CLASS_FAMILIES.has(surface)).toBe(false);
    }
  });
});
