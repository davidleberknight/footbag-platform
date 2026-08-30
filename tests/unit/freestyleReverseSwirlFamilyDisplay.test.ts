/**
 * Reverse Swirl on the public family surfaces.
 *
 * The swirl and reverse-swirl movements are distinct terminal identities, ruled
 * so and corrected in the data. Six active tricks carry the reverse-swirl family
 * and none of them is in the swirl family any more, but the browse showed the
 * group nowhere and a reader following a family chip landed on a page headed
 * "Rev swirl", which is how the row is keyed rather than how the family is named.
 *
 * This is display policy only. The registry reshapes the public menu and writes
 * nothing: no trick changes family, difficulty, notation or aliases because of
 * anything asserted here.
 *
 * Reverse Swirl is a Minor Lineage, exactly as Reverse Whirl is. It is
 * deliberately not first-class, so it does not become searchable as a family, does
 * not head a detail-page section as "Family", and gets no family detail page. Those
 * three follow from the first-class roster, and this change leaves that roster
 * alone.
 */
import { describe, it, expect } from 'vitest';
import {
  PUBLIC_DISPLAY_FAMILIES,
  PUBLIC_FAMILY_ORDER,
  PUBLIC_FAMILY_LABEL,
  SUBLABEL_FAMILY_OF,
} from '../../src/content/freestylePublicFamilies';
import {
  FIRST_CLASS_FAMILIES,
  familyTier,
  isOfficialFamilyParent,
} from '../../src/content/freestyleFamilyTiers';
import {
  FAMILY_OVERRIDES,
  resolveFamilyDisplayName,
} from '../../src/content/freestyleFamilyOverrides';

const REV_SWIRL = 'rev_swirl';

describe('Reverse Swirl is on the browse registry', () => {
  it('is present, labelled as a name rather than the slug', () => {
    const entry = PUBLIC_DISPLAY_FAMILIES.find(f => f.slug === REV_SWIRL);
    expect(entry).toBeDefined();
    expect(entry!.label).toBe('Reverse Swirl');
  });

  it('is a root, not a branch of anything', () => {
    // A parent would put it under another family's heading, which is the grouping
    // the ruling rejected.
    expect(PUBLIC_DISPLAY_FAMILIES.find(f => f.slug === REV_SWIRL)!.parent).toBeUndefined();
  });

  it('sits immediately after Swirl, as Reverse Whirl sits after Whirl', () => {
    const at = (slug: string) => PUBLIC_FAMILY_ORDER.indexOf(slug);
    expect(at(REV_SWIRL)).toBe(at('swirl') + 1);
    expect(at('rev_whirl')).toBe(at('whirl') + 1);
  });

  it('is not folded into another family as a sub-label', () => {
    expect(SUBLABEL_FAMILY_OF.has(REV_SWIRL)).toBe(false);
    expect(SUBLABEL_FAMILY_OF.get('rev_swirl')).toBeUndefined();
  });
});

describe('Reverse Swirl is a Minor Lineage and nothing more', () => {
  it('is not on the first-class roster', () => {
    expect(FIRST_CLASS_FAMILIES.has(REV_SWIRL)).toBe(false);
  });

  it('reports the Minor Lineage tier, the same as Reverse Whirl', () => {
    expect(familyTier(REV_SWIRL)).toBe('minor-lineage');
    expect(familyTier('rev_whirl')).toBe('minor-lineage');
  });

  it('is not an official family parent, so it stays out of family search', () => {
    // Family search and the family detail surface are both gated on this, so the
    // registry entry gives it a browse chip and nothing else.
    expect(isOfficialFamilyParent(REV_SWIRL)).toBe(false);
    expect(isOfficialFamilyParent('rev_whirl')).toBe(false);
  });

  it('leaves Swirl first-class and unaffected', () => {
    expect(FIRST_CLASS_FAMILIES.has('swirl')).toBe(true);
    expect(familyTier('swirl')).toBe('family-parent');
  });
});

describe('the family reads as a name wherever it is shown', () => {
  it('resolves to Reverse Swirl rather than the capitalised slug', () => {
    expect(resolveFamilyDisplayName(REV_SWIRL)).toBe('Reverse Swirl');
  });

  it('carries the same label on the registry and in the display-name map', () => {
    // The chip and the raw filter read the display-name map; the browse reads the
    // registry. A reader should not see two names for one family.
    expect(PUBLIC_FAMILY_LABEL.get(REV_SWIRL)).toBe(resolveFamilyDisplayName(REV_SWIRL));
  });

  it('never renders as the abbreviation', () => {
    const fallback = REV_SWIRL.charAt(0).toUpperCase()
      + REV_SWIRL.slice(1).replace(/[-_]/g, ' ');
    expect(fallback).toBe('Rev swirl');
    expect(resolveFamilyDisplayName(REV_SWIRL)).not.toBe(fallback);
  });
});

describe('no compatibility layer is involved', () => {
  it('needs no re-bucketing override, because the data is already right', () => {
    // That map exists for rows whose stored family differs from the public
    // bucket. The six reverse-swirl tricks carry the correct family already.
    expect(FAMILY_OVERRIDES.has(REV_SWIRL)).toBe(false);
    expect([...FAMILY_OVERRIDES.values()]).not.toContain(REV_SWIRL);
  });
});
