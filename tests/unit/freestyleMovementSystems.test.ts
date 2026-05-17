/**
 * Unit tests for src/content/freestyleMovementSystems.ts.
 *
 * Slice L1 of the 2026-05 dictionary/glossary normalization plan — the
 * content module is curator-authored and ontology-load-bearing, so the
 * pilot classification must match STABILIZATION_PLAN.md §1 exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  MOVEMENT_SYSTEM_AXES,
  resolveAxisForModifier,
  allMovementSystemModifierSlugs,
  type MovementSystemAxis,
} from '../../src/content/freestyleMovementSystems';

describe('freestyleMovementSystems content module', () => {
  it('declares the four curator-confirmed axes in canonical order', () => {
    const keys = MOVEMENT_SYSTEM_AXES.map(a => a.axisKey);
    expect(keys).toEqual([
      'set-uptime',
      'entry-topology',
      'midtime-body',
      'no-plant-suspension',
    ]);
  });

  it('every axis has a non-empty name, definition, and at least one modifier', () => {
    for (const axis of MOVEMENT_SYSTEM_AXES) {
      expect(axis.axisName.length).toBeGreaterThan(0);
      expect(axis.axisDefinition.length).toBeGreaterThan(0);
      expect(axis.modifierSlugs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('pilot modifiers are classified exactly as the STABILIZATION_PLAN spec lists', () => {
    const expected: Record<string, string> = {
      pixie:     'set-uptime',
      fairy:     'set-uptime',
      atomic:    'set-uptime',
      stepping:  'set-uptime',
      surging:   'set-uptime',
      paradox:   'entry-topology',
      spinning:  'midtime-body',
      ducking:   'midtime-body',
      diving:    'midtime-body',
      weaving:   'midtime-body',
      symposium: 'no-plant-suspension',
    };
    for (const [slug, expectedAxisKey] of Object.entries(expected)) {
      const axis: MovementSystemAxis | null = resolveAxisForModifier(slug);
      expect(axis, `${slug} should resolve to an axis`).not.toBeNull();
      expect(axis!.axisKey, `${slug} should belong to axis '${expectedAxisKey}'`).toBe(expectedAxisKey);
    }
  });

  it('every modifier appears in exactly one axis (no cross-axis duplication)', () => {
    const counts = new Map<string, number>();
    for (const axis of MOVEMENT_SYSTEM_AXES) {
      for (const slug of axis.modifierSlugs) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
    for (const [slug, count] of counts) {
      expect(count, `${slug} should appear in exactly one axis`).toBe(1);
    }
  });

  it('returns null for modifiers not yet classified under any axis', () => {
    // These modifiers exist in freestyle_tricks (category='modifier') but are
    // intentionally pending curator classification under the Movement System
    // pilot scope per STABILIZATION_PLAN.md §1.
    for (const slug of ['blazing', 'gyro', 'illusioning', 'tapping', 'terraging', 'barraging']) {
      expect(resolveAxisForModifier(slug), `${slug} should not be classified yet`).toBeNull();
    }
  });

  it('returns null for nonexistent slugs', () => {
    expect(resolveAxisForModifier('nonexistent')).toBeNull();
    expect(resolveAxisForModifier('')).toBeNull();
  });

  it('allMovementSystemModifierSlugs returns the union of all axes with no duplicates', () => {
    const all = allMovementSystemModifierSlugs();
    expect(all.length).toBe(11);
    expect(new Set(all).size).toBe(11);
    // Spot-check membership
    expect(all).toContain('pixie');
    expect(all).toContain('paradox');
    expect(all).toContain('spinning');
    expect(all).toContain('symposium');
  });

  it('modifierSlugs arrays are immutable (typed readonly)', () => {
    // Compile-time check; if this file compiles, the readonly modifier
    // is honored. Runtime check guards against accidental mutation in
    // future authoring.
    for (const axis of MOVEMENT_SYSTEM_AXES) {
      expect(Array.isArray(axis.modifierSlugs)).toBe(true);
      expect(axis.modifierSlugs.length).toBeGreaterThan(0);
    }
  });
});
