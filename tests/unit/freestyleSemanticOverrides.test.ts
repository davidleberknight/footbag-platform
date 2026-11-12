/**
 * Unit tests for the curator description overrides on trick-detail "About",
 * and the Illusioning set's pointer to the Atomic operator.
 */
import { describe, it, expect } from 'vitest';
import { COMPOUND_SEMANTIC_DESCRIPTIONS } from '../../freestyle/inputs/curator_content/freestyleSemanticOverridesData';
import { findCanonicalSetBySlug, resolveCanonicalSetAlias } from '../../src/content/freestyleCanonicalSets';

const getCompoundSemanticDescription = (slug: string): string | null =>
  COMPOUND_SEMANTIC_DESCRIPTIONS.get(slug) ?? null;

describe('dex-kick description overrides', () => {
  it('Around the World Kick does not claim to be the only 1-ADD dex trick', () => {
    const d = getCompoundSemanticDescription('around_the_world_kick') ?? '';
    expect(d).not.toMatch(/only documented/i);
    expect(d).toMatch(/dex-kick/);
    expect(d).toMatch(/no longer the only one/i);
  });

  it('Illusioning Kick reads as the kick form of the illusion-direction dexterity, rarely practiced', () => {
    const d = getCompoundSemanticDescription('illusioning_kick') ?? '';
    expect(d).toMatch(/illusion-direction dexterity/);
    expect(d).toMatch(/direction-reversed sibling of Miraging Kick/);
    expect(d).toMatch(/rarely encountered/i);
  });

  it('Pixie Kick states the footwork difference notation cannot express', () => {
    const d = getCompoundSemanticDescription('pixie_kick') ?? '';
    expect(d).toMatch(/shares its notation with Around the World Kick/);
    expect(d).toMatch(/opposite foot/);
  });
});

describe('Atomic and Illusioning are distinct (no merge)', () => {
  it('illusioning is not a canonical-set entry', () => {
    expect(findCanonicalSetBySlug('illusioning')).toBeNull();
  });

  it('the atomic entry does not link to miraging', () => {
    const atomic = findCanonicalSetBySlug('atomic');
    expect(atomic).not.toBeNull();
    const relatedSlugs = (atomic!.relatedSystems ?? []).map(s => s.slug);
    expect(relatedSlugs).not.toContain('miraging');
  });

  it('the illusioning slug does not fold to atomic', () => {
    expect(resolveCanonicalSetAlias('illusioning')).toBeNull();
  });
});
