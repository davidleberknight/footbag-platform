/**
 * Display-tier classifier for the public family roster. The threshold is the
 * single editorial knob; surfaces are excluded regardless of count. These tests
 * pin the boundary so a threshold change is a deliberate, visible edit.
 */
import { describe, it, expect } from 'vitest';

import {
  classifyFamilyTier,
  FAMILY_PARENT_MIN_DESCENDANTS,
  FOUNDATIONAL_TERMINAL_SURFACES,
} from '../../src/content/freestyleFamilyTiers';

describe('classifyFamilyTier', () => {
  it('classifies more-than-threshold descendants as a Family Parent', () => {
    expect(classifyFamilyTier('whirl', FAMILY_PARENT_MIN_DESCENDANTS + 1)).toBe('family-parent');
    expect(classifyFamilyTier('osis', 84)).toBe('family-parent');
    expect(classifyFamilyTier('inside-stall', 11)).toBe('family-parent');
  });

  it('classifies threshold-or-fewer descendants as a Minor Lineage', () => {
    expect(classifyFamilyTier('flail', FAMILY_PARENT_MIN_DESCENDANTS)).toBe('minor-lineage');
    expect(classifyFamilyTier('eclipse', 9)).toBe('minor-lineage');
    expect(classifyFamilyTier('flurry', 3)).toBe('minor-lineage');
  });

  it('classifies the universal catch surfaces as Foundational Terminal Surfaces regardless of count', () => {
    for (const surface of FOUNDATIONAL_TERMINAL_SURFACES) {
      expect(classifyFamilyTier(surface, 328)).toBe('foundational-terminal-surface');
      expect(classifyFamilyTier(surface, 1)).toBe('foundational-terminal-surface');
    }
  });

  it('keeps the boundary at the configured threshold (11 in, 10/9 out)', () => {
    // Guards the documented gap: families sit at 11+ (parent) or 9- (minor),
    // with the threshold at 10. If the constant moves, this test moves with it.
    expect(classifyFamilyTier('x', FAMILY_PARENT_MIN_DESCENDANTS + 1)).toBe('family-parent');
    expect(classifyFamilyTier('x', FAMILY_PARENT_MIN_DESCENDANTS)).toBe('minor-lineage');
    expect(classifyFamilyTier('x', FAMILY_PARENT_MIN_DESCENDANTS - 1)).toBe('minor-lineage');
  });
});
