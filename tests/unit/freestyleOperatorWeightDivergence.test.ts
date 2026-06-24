/**
 * Unit tests for the operator-weight divergence policy in
 * freestyleTrickDoctrine.ts.
 *
 * Long-term contract:
 *   - furious and railing are registered as cohort-level source-divergence
 *     policies, each anchored at structural weight 2.
 *   - The policy publishes at the platform structural value; the higher
 *     FootbagMoves figure is a recorded single-source divergence.
 *   - The cohort is documentation-only: cohort member slugs must NOT appear
 *     in the per-slug DOCTRINE_DIVERGENCE_REGISTRY, so they render no
 *     per-trick scoring note (the divergence lives in each row provenance,
 *     matching the single-trick Big Apple Sauce / redwetter treatment).
 */
import { describe, it, expect } from 'vitest';

import {
  OPERATOR_WEIGHT_DIVERGENCE_POLICY,
  getOperatorWeightDivergence,
  hasPublicScoringNote,
} from '../../src/content/freestyleTrickDoctrine';

describe('operator-weight divergence policy — furious / railing', () => {
  it('registers furious anchored at structural weight 2', () => {
    const p = getOperatorWeightDivergence('furious');
    expect(p).not.toBeNull();
    expect(p?.structuralWeight).toBe(2);
    expect(p?.sourceSystem).toBe('FootbagMoves');
    expect(p?.status).toBe('published');
    expect(p?.affectedSlugs).toEqual(['clown_face', 'genesis', 'rage', 'nebula']);
  });

  it('registers railing anchored at structural weight 2 (rooted + sailing)', () => {
    const p = getOperatorWeightDivergence('railing');
    expect(p).not.toBeNull();
    expect(p?.structuralWeight).toBe(2);
    expect(p?.affectedSlugs).toEqual(['dorshanatrix', 'flying_fish', 'rail_warrior']);
  });

  it('records the source over-count as a 1-to-2 ADD range for both cohorts', () => {
    expect(getOperatorWeightDivergence('furious')?.sourceOverCountRange).toEqual([1, 2]);
    expect(getOperatorWeightDivergence('railing')?.sourceOverCountRange).toEqual([1, 2]);
  });

  it('returns null for an operator with no registered divergence policy', () => {
    expect(getOperatorWeightDivergence('paradox')).toBeNull();
    expect(getOperatorWeightDivergence('spinning')).toBeNull();
  });

  it('keeps cohort members out of the per-slug registry (no per-trick scoring note)', () => {
    const cohort = [
      ...(getOperatorWeightDivergence('furious')?.affectedSlugs ?? []),
      ...(getOperatorWeightDivergence('railing')?.affectedSlugs ?? []),
    ];
    expect(cohort).toHaveLength(7);
    for (const slug of cohort) {
      expect(hasPublicScoringNote(slug)).toBe(false);
    }
  });

  it('exposes exactly the two ratified operator policies', () => {
    expect([...OPERATOR_WEIGHT_DIVERGENCE_POLICY.keys()].sort()).toEqual(['furious', 'railing']);
  });
});
