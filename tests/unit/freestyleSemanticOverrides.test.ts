/**
 * Unit tests for the curator description overrides on trick-detail "About",
 * and the Illusioning set's pointer to the Atomic operator.
 */
import { describe, it, expect } from 'vitest';
import { getCompoundSemanticDescription } from '../../src/content/freestyleSemanticOverrides';
import { findCanonicalSetBySlug, resolveCanonicalSetAlias } from '../../src/content/freestyleCanonicalSets';

describe('dex-kick description overrides', () => {
  it('Around the World Kick no longer claims to be the only 1-ADD dex trick', () => {
    const d = getCompoundSemanticDescription('around_the_world_kick') ?? '';
    expect(d).not.toMatch(/only documented/i);
    expect(d).toMatch(/dex-kick/);
    expect(d).toMatch(/no longer the only one/i);
  });

  it('Atomic Kick reads as the kick form of the Illusion dexterity, rarely practiced', () => {
    const d = getCompoundSemanticDescription('atomic_kick') ?? '';
    expect(d).toMatch(/same dexterity pattern as Illusion/);
    expect(d).toMatch(/rarely encountered/i);
  });

  it('Pixie Kick states the footwork difference notation cannot express', () => {
    const d = getCompoundSemanticDescription('pixie_kick') ?? '';
    expect(d).toMatch(/shares its notation with Around the World Kick/);
    expect(d).toMatch(/opposite foot/);
  });

  it('DSO note frames the DATW relationship without an opposite-foot claim', () => {
    const d = getCompoundSemanticDescription('double_switch_over') ?? '';
    expect(d).toMatch(/different movement patterns/);
    expect(d).not.toMatch(/opposite foot/i);
  });
});

describe('Illusioning folds into the Atomic set (one set, two names)', () => {
  it('illusioning is no longer a separate canonical-set entry', () => {
    expect(findCanonicalSetBySlug('illusioning')).toBeNull();
  });

  it('the surviving atomic entry carries Illusioning as an equivalent name and links to miraging', () => {
    const atomic = findCanonicalSetBySlug('atomic');
    expect(atomic).not.toBeNull();
    const equivNames = (atomic!.equivalentNames ?? []).map(e => e.name);
    expect(equivNames).toContain('Illusioning');
    const relatedSlugs = (atomic!.relatedSystems ?? []).map(s => s.slug);
    expect(relatedSlugs).toContain('miraging');
  });

  it('the retired illusioning slug resolves to atomic', () => {
    expect(resolveCanonicalSetAlias('illusioning')).toBe('atomic');
  });
});
