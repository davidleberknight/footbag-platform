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

describe('Atomic and Illusioning are distinct (no merge)', () => {
  it('illusioning is not a canonical-set entry', () => {
    expect(findCanonicalSetBySlug('illusioning')).toBeNull();
  });

  it('the atomic entry does not carry Illusioning as an equivalent name and does not link to miraging', () => {
    const atomic = findCanonicalSetBySlug('atomic');
    expect(atomic).not.toBeNull();
    const equivNames = (atomic!.equivalentNames ?? []).map(e => e.name);
    expect(equivNames).not.toContain('Illusioning');
    const relatedSlugs = (atomic!.relatedSystems ?? []).map(s => s.slug);
    expect(relatedSlugs).not.toContain('miraging');
  });

  it('the illusioning slug no longer folds to atomic', () => {
    expect(resolveCanonicalSetAlias('illusioning')).toBeNull();
  });
});
