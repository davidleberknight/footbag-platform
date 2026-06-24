/**
 * Unit tests for the curator description overrides on trick-detail "About",
 * and the Illusioning set's pointer to the Atomic operator.
 */
import { describe, it, expect } from 'vitest';
import { getCompoundSemanticDescription } from '../../src/content/freestyleSemanticOverrides';
import { findCanonicalSetBySlug } from '../../src/content/freestyleCanonicalSets';

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

describe('Illusioning set points to Atomic as the underlying operator', () => {
  it('illusioning relatedSystems includes both atomic and miraging', () => {
    const set = findCanonicalSetBySlug('illusioning');
    expect(set).not.toBeNull();
    const slugs = (set!.relatedSystems ?? []).map(s => s.slug);
    expect(slugs).toContain('atomic');
    expect(slugs).toContain('miraging');
  });
});
