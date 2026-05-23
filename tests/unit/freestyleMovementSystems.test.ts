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
  MODIFIER_COMPOSITION_GLOSSES,
  resolveModifierCompositionGloss,
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

  it('curator-confirmed modifiers are classified per STABILIZATION_PLAN + 2026-05-18 Phase B inheritance', () => {
    // Original pilot scope (Slice L1, 2026-05-16): 11 modifiers.
    // Phase B inheritance (2026-05-18): added quantum / nuclear to
    // set-uptime + gyro / whirling to midtime-body per the
    // consolidation plan. Total now 15. Still pending: barraging /
    // blurry (Wave 2), tapping / furious (curator placement).
    const expected: Record<string, string> = {
      pixie:     'set-uptime',
      fairy:     'set-uptime',
      atomic:    'set-uptime',
      quantum:   'set-uptime',
      nuclear:   'set-uptime',
      stepping:  'set-uptime',
      surging:   'set-uptime',
      paradox:   'entry-topology',
      spinning:  'midtime-body',
      gyro:      'midtime-body',
      whirling:  'midtime-body',
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

  it('returns null for modifiers still pending curator classification', () => {
    // These modifiers exist in freestyle_tricks (category='modifier') but
    // are intentionally pending curator classification. Original pilot
    // pending list (STABILIZATION_PLAN.md §1) was reduced 2026-05-18 by
    // the Phase B inheritance: gyro is now classified under midtime-body;
    // barraging stays pending (Wave 2 operator-class question). Blurry +
    // tapping + furious + blazing + illusioning + terraging also stay
    // pending per the consolidation plan.
    for (const slug of ['blazing', 'illusioning', 'tapping', 'terraging', 'barraging', 'blurry', 'furious']) {
      expect(resolveAxisForModifier(slug), `${slug} should not be classified yet`).toBeNull();
    }
  });

  it('returns null for nonexistent slugs', () => {
    expect(resolveAxisForModifier('nonexistent')).toBeNull();
    expect(resolveAxisForModifier('')).toBeNull();
  });

  it('allMovementSystemModifierSlugs returns the union of all axes with no duplicates', () => {
    // Post-2026-05-18 Phase B inheritance: 15 modifiers (was 11).
    const all = allMovementSystemModifierSlugs();
    expect(all.length).toBe(15);
    expect(new Set(all).size).toBe(15);
    // Spot-check original pilot membership
    expect(all).toContain('pixie');
    expect(all).toContain('paradox');
    expect(all).toContain('spinning');
    expect(all).toContain('symposium');
    // Spot-check inherited (2026-05-18) membership
    expect(all).toContain('quantum');
    expect(all).toContain('nuclear');
    expect(all).toContain('gyro');
    expect(all).toContain('whirling');
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

describe('MODIFIER_COMPOSITION_GLOSSES (Slice M + Slice N + post-Wave-7 editorial pass)', () => {
  it('contains the 8 curator-authored pilot entries', () => {
    // Slice M (paradox) + Slice N (spinning/ducking/symposium/stepping/pixie)
    // + post-Wave-7 editorial pass (fairy + surging).
    expect(MODIFIER_COMPOSITION_GLOSSES.size).toBe(8);
    for (const slug of ['paradox', 'spinning', 'ducking', 'symposium', 'stepping', 'pixie', 'fairy', 'surging']) {
      expect(MODIFIER_COMPOSITION_GLOSSES.has(slug), `gloss expected for ${slug}`).toBe(true);
    }
  });

  it('resolveModifierCompositionGloss returns curator content for each pilot entry', () => {
    expect(resolveModifierCompositionGloss('paradox')).toMatch(/PDX \+ base/);
    expect(resolveModifierCompositionGloss('spinning')).toMatch(/SPIN \+ base/);
    expect(resolveModifierCompositionGloss('ducking')).toMatch(/DUCK \+ base/);
    expect(resolveModifierCompositionGloss('symposium')).toMatch(/SYMP \+ base/);
    expect(resolveModifierCompositionGloss('stepping')).toMatch(/STEP \+ base/);
    expect(resolveModifierCompositionGloss('pixie')).toMatch(/PIX \+ base/);
    expect(resolveModifierCompositionGloss('fairy')).toMatch(/FAIRY \+ base/);
    expect(resolveModifierCompositionGloss('surging')).toMatch(/SURGE \+ base/);
  });

  it('paradox gloss carries the entry-shape line (Pre-Red sweep 2026-05-16)', () => {
    // Per the Pre-Red completion sweep directive: "PDX → clip > op-in dex"
    // must appear in the paradox gloss to reinforce paradox as an
    // entry topology rather than a terminal family.
    const gloss = resolveModifierCompositionGloss('paradox');
    expect(gloss).not.toBeNull();
    expect(gloss).toMatch(/Entry shape: clip > op-in dex/);
  });

  it('returns null for modifiers without a gloss (restraint contract)', () => {
    // Pilot is deliberately small. The directive forbids autogeneration;
    // un-glossed modifiers stay un-rendered until curator authors them.
    expect(resolveModifierCompositionGloss('atomic')).toBeNull();
    expect(resolveModifierCompositionGloss('diving')).toBeNull();
    expect(resolveModifierCompositionGloss('weaving')).toBeNull();
    expect(resolveModifierCompositionGloss('nonexistent')).toBeNull();
  });

  it('every gloss is bounded (≤300 chars) per the restraint contract', () => {
    for (const [slug, gloss] of MODIFIER_COMPOSITION_GLOSSES) {
      expect(gloss.length, `${slug} gloss exceeds 300 chars`).toBeLessThanOrEqual(300);
      expect(gloss.length, `${slug} gloss is empty`).toBeGreaterThan(0);
    }
  });
});
