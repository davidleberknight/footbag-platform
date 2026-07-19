/**
 * Unit tests for src/content/freestyleFamilyOverrides.ts.
 *
 * Covers the one-way-redirect and dual-membership governance content.
 * These maps are curator-authoritative
 * — every entry has consequences across the Family-View browse surface,
 * so the shape is asserted explicitly.
 */
import { describe, it, expect } from 'vitest';
import {
  FAMILY_OVERRIDES,
  resolveFamilyOverride,
  FAMILY_DUAL_MEMBERSHIPS,
  resolveFamilyDualMemberships,
  FAMILY_DISPLAY_NAMES,
  resolveFamilyDisplayName,
} from '../../src/content/freestyleFamilyOverrides';

describe('FAMILY_OVERRIDES (one-way redirects)', () => {
  it('promotes whirl-family rows to rev-whirl-family', () => {
    expect(resolveFamilyOverride('rev_whirl')).toBe('rev_whirl');
    expect(resolveFamilyOverride('hatchet')).toBe('rev_whirl');
    expect(resolveFamilyOverride('mullet')).toBe('rev_whirl');
  });

  it('redirects high-plains-drifter to drifter-family', () => {
    expect(resolveFamilyOverride('high_plains_drifter')).toBe('drifter');
  });

  it('promotes the nearest-anchor branch families (torque / flurry / flail / butterfly-swirl / drifter)', () => {
    // The anchor of a derived branch family carried its root label and so
    // browsed under the root; the override makes the branch the owning family.
    expect(resolveFamilyOverride('torque')).toBe('torque');
    expect(resolveFamilyOverride('flurry')).toBe('flurry');
    expect(resolveFamilyOverride('flail')).toBe('flail');
    expect(resolveFamilyOverride('butterfly_swirl')).toBe('butterfly_swirl');
    expect(resolveFamilyOverride('drifter')).toBe('drifter');
    // toe-flurry is a flurry-family member that carried the legover root.
    expect(resolveFamilyOverride('toe_flurry')).toBe('flurry');
    // drifter members that carried the retired clipper-stall root.
    expect(resolveFamilyOverride('fume')).toBe('drifter');
    expect(resolveFamilyOverride('stepping_ducking_drifter')).toBe('drifter');
  });

  it('returns null for slugs that have no override', () => {
    expect(resolveFamilyOverride('whirl')).toBeNull();
    expect(resolveFamilyOverride('mirage')).toBeNull();
    expect(resolveFamilyOverride('osis')).toBeNull();
    expect(resolveFamilyOverride('nonexistent')).toBeNull();
  });

  it('the override map size matches the curator-authored entry count', () => {
    // Rev-Whirl sibling promotion (3) + high-plains-drifter (1) + rev-up
    // self-bucket (1) + nearest-anchor reassignments: torque (13), blender (8),
    // double-leg-over (7), eggbeater (14), flurry (2), flail (1),
    // butterfly-swirl (1), drifter anchor + members (9).
    expect(FAMILY_OVERRIDES.size).toBe(60);
  });
});

describe('FAMILY_DUAL_MEMBERSHIPS (additive memberships)', () => {
  it('branch-family anchors gain membership in their own branch family', () => {
    expect(resolveFamilyDualMemberships('torque')).toEqual(['torque']);
    expect(resolveFamilyDualMemberships('blender')).toEqual(['blender']);
    expect(resolveFamilyDualMemberships('drifter')).toEqual(['drifter']);
  });

  it('returns an empty array for rows without a dual-membership entry', () => {
    expect(resolveFamilyDualMemberships('whirl')).toEqual([]);
    expect(resolveFamilyDualMemberships('rev_whirl')).toEqual([]);
    expect(resolveFamilyDualMemberships('osis')).toEqual([]);
    expect(resolveFamilyDualMemberships('nonexistent')).toEqual([]);
  });

  it('dual-membership map size matches the curator-authored pilot (3 anchors)', () => {
    expect(FAMILY_DUAL_MEMBERSHIPS.size).toBe(3);
  });

  it('every dual-membership target is non-empty', () => {
    for (const [slug, extras] of FAMILY_DUAL_MEMBERSHIPS) {
      expect(extras.length, `${slug} should have at least one extra family`).toBeGreaterThan(0);
    }
  });
});

describe('FAMILY_DISPLAY_NAMES', () => {
  it('resolves rev-whirl to "Rev Whirl"', () => {
    expect(resolveFamilyDisplayName('rev_whirl')).toBe('Rev Whirl');
  });

  it('returns null for families that use default capitalization', () => {
    expect(resolveFamilyDisplayName('whirl')).toBeNull();
    expect(resolveFamilyDisplayName('torque')).toBeNull();
    expect(resolveFamilyDisplayName('drifter')).toBeNull();
    expect(resolveFamilyDisplayName('nonexistent')).toBeNull();
  });

  it('display-names map remains minimal (only hyphenated slugs need entries)', () => {
    expect(FAMILY_DISPLAY_NAMES.size).toBe(1);
  });
});

describe('cross-mechanism invariants', () => {
  it('keys shared by FAMILY_OVERRIDES and FAMILY_DUAL_MEMBERSHIPS agree on the branch family', () => {
    // Branch anchors (torque / blender / drifter) are re-bucketed one-way into
    // their own family (the override drives the detail-page family attribution)
    // and also carry an additive dual-membership into that same family. When a
    // slug is in both maps the two mechanisms must name the same branch.
    for (const slug of FAMILY_OVERRIDES.keys()) {
      const dual = FAMILY_DUAL_MEMBERSHIPS.get(slug);
      if (!dual) continue;
      expect(dual, `${slug} dual-membership should include its override family`)
        .toContain(FAMILY_OVERRIDES.get(slug));
    }
  });

});
