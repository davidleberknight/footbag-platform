/**
 * Unit tests for src/content/freestyleFamilyOverrides.ts.
 *
 * Covers Slice J (one-way redirect) and Slice M (dual-membership +
 * retirement) governance content. These maps are curator-authoritative
 * — every entry has consequences across the Family-View browse surface,
 * so the shape is asserted explicitly.
 */
import { describe, it, expect } from 'vitest';
import {
  FAMILY_OVERRIDES,
  resolveFamilyOverride,
  FAMILY_DUAL_MEMBERSHIPS,
  resolveFamilyDualMemberships,
  isRetiredFamily,
  FAMILY_DISPLAY_NAMES,
  resolveFamilyDisplayName,
} from '../../src/content/freestyleFamilyOverrides';

describe('FAMILY_OVERRIDES (Slice J + Slice M one-way redirects)', () => {
  it('Slice J entries promote whirl-family rows to rev-whirl-family', () => {
    expect(resolveFamilyOverride('rev-whirl')).toBe('rev-whirl');
    expect(resolveFamilyOverride('hatchet')).toBe('rev-whirl');
    expect(resolveFamilyOverride('mullet')).toBe('rev-whirl');
  });

  it('Slice M entry redirects high-plains-drifter to drifter-family', () => {
    expect(resolveFamilyOverride('high-plains-drifter')).toBe('drifter');
  });

  it('returns null for slugs that have no override', () => {
    expect(resolveFamilyOverride('whirl')).toBeNull();
    expect(resolveFamilyOverride('torque')).toBeNull();
    expect(resolveFamilyOverride('drifter')).toBeNull();
    expect(resolveFamilyOverride('nonexistent')).toBeNull();
  });

  it('the override map size matches the curator-authored entry count', () => {
    // 4 Slice J/M entries + 1 emergency 2026-05-19 entry (rev-up self-bucket).
    expect(FAMILY_OVERRIDES.size).toBe(5);
  });
});

describe('FAMILY_DUAL_MEMBERSHIPS (Slice M additive memberships)', () => {
  it('branch-family anchors gain membership in their own branch family', () => {
    expect(resolveFamilyDualMemberships('torque')).toEqual(['torque']);
    expect(resolveFamilyDualMemberships('blender')).toEqual(['blender']);
    expect(resolveFamilyDualMemberships('drifter')).toEqual(['drifter']);
  });

  it('returns an empty array for rows without a dual-membership entry', () => {
    expect(resolveFamilyDualMemberships('whirl')).toEqual([]);
    expect(resolveFamilyDualMemberships('rev-whirl')).toEqual([]);
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

describe('RETIRED_FAMILIES (Family-view route-outs)', () => {
  it('retires the foundational surfaces (clipper-stall, clipper, toe-stall)', () => {
    expect(isRetiredFamily('clipper-stall')).toBe(true);
    expect(isRetiredFamily('clipper')).toBe(true);
    expect(isRetiredFamily('toe-stall')).toBe(true);
  });

  it('retires representative modifier-ecosystem + alternative-surface route-outs', () => {
    // Membership of the full route-out set is exhaustively asserted in
    // freestyleParentFamilies.test.ts; here we spot-check the kinds.
    expect(isRetiredFamily('pixie')).toBe(true);                  // modifier ecosystem
    expect(isRetiredFamily('cross-body-sole-stall')).toBe(true);  // alternative surface
    expect(isRetiredFamily('2-bag-juggling')).toBe(true);         // multi-bag primitive
  });

  it('does NOT retire parent families or labels that fold/defer into the view', () => {
    // Parents render top-level; children fold into a live parent; deferred
    // labels keep their own section. None are route-outs.
    expect(isRetiredFamily('whirl')).toBe(false);      // parent
    expect(isRetiredFamily('osis')).toBe(false);       // parent
    expect(isRetiredFamily('butterfly')).toBe(false);  // parent
    expect(isRetiredFamily('torque')).toBe(false);     // folds into osis
    expect(isRetiredFamily('blender')).toBe(false);    // folds into osis
    expect(isRetiredFamily('drifter')).toBe(false);    // deferred, own section
  });
});

describe('FAMILY_DISPLAY_NAMES', () => {
  it('resolves rev-whirl to "Rev Whirl"', () => {
    expect(resolveFamilyDisplayName('rev-whirl')).toBe('Rev Whirl');
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
  it('FAMILY_OVERRIDES and FAMILY_DUAL_MEMBERSHIPS share no keys', () => {
    // A row is either re-bucketed (one-way) or dual-membership — never both.
    for (const slug of FAMILY_OVERRIDES.keys()) {
      expect(FAMILY_DUAL_MEMBERSHIPS.has(slug),
        `${slug} should not appear in both maps`).toBe(false);
    }
  });

  it('no dual-membership target is a retired family', () => {
    for (const [slug, extras] of FAMILY_DUAL_MEMBERSHIPS) {
      for (const extra of extras) {
        expect(isRetiredFamily(extra),
          `${slug} should not be promoted into a retired family (${extra})`).toBe(false);
      }
    }
  });
});
