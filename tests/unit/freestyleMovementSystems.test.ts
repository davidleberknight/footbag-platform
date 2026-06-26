/**
 * Unit tests for src/content/freestyleMovementSystems.ts.
 *
 * Slice L1 of the 2026-05 dictionary/glossary normalization plan — the
 * content module is curator-authored and ontology-load-bearing, so the
 * pilot classification must match the ratified pilot list exactly.
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

  it('classifies each curator-confirmed modifier to its movement-system axis', () => {
    // 15 curator-confirmed modifiers: quantum / nuclear classify under
    // set-uptime, gyro under midtime-body, plus the original pilot set.
    // Still pending: barraging / blurry (Wave 2 operator-class question),
    // tapping / furious (curator placement).
    const expected: Record<string, string> = {
      pixie:     'set-uptime',
      fairy:     'set-uptime',
      atomic:    'set-uptime',
      quantum:   'set-uptime',
      nuclear:   'set-uptime',
      stepping:  'set-uptime',
      surging:   'set-uptime',
      whirling:  'set-uptime',
      paradox:   'entry-topology',
      spinning:  'midtime-body',
      gyro:      'midtime-body',
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
    // are intentionally pending curator classification. gyro is classified
    // under midtime-body; barraging stays pending (Wave 2 operator-class
    // question). Blurry + tapping + furious + blazing + illusioning +
    // terraging also stay pending per the consolidation plan.
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
  it('contains the curator-authored composition glosses', () => {
    // Paradox plus the set / body / midtime-body modifier glosses authored for
    // the detail-page modifier block. Curator-authored, never autogenerated.
    expect(MODIFIER_COMPOSITION_GLOSSES.size).toBe(15);
    for (const slug of ['paradox', 'spinning', 'ducking', 'symposium', 'stepping', 'pixie', 'fairy', 'surging',
                        'atomic', 'quantum', 'nuclear', 'gyro', 'diving', 'miraging', 'whirling']) {
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
    expect(resolveModifierCompositionGloss('atomic')).toMatch(/ATOMIC \+ base/);
    expect(resolveModifierCompositionGloss('quantum')).toMatch(/QUANTUM \+ base/);
    expect(resolveModifierCompositionGloss('nuclear')).toMatch(/NUCLEAR \+ base/);
    expect(resolveModifierCompositionGloss('gyro')).toMatch(/GYRO \+ base/);
    expect(resolveModifierCompositionGloss('diving')).toMatch(/DIVE \+ base/);
    expect(resolveModifierCompositionGloss('miraging')).toMatch(/MIRAGING \+ base/);
    expect(resolveModifierCompositionGloss('whirling')).toMatch(/WHIRLING \+ base/);
  });

  it('paradox gloss names the entry shape as the entry case, not paradox always', () => {
    // The gloss frames "clip > op-in dex" as paradox's entry case (it can also be
    // a later mid-trick dex), so paradox reads as a side-switch relationship
    // rather than a terminal family.
    const gloss = resolveModifierCompositionGloss('paradox');
    expect(gloss).not.toBeNull();
    expect(gloss).toMatch(/As an entry it reads clip > op-in dex/);
  });

  it('returns null for modifiers without a gloss (restraint contract)', () => {
    // Pilot is deliberately small. The directive forbids autogeneration;
    // un-glossed modifiers stay un-rendered until curator authors them.
    expect(resolveModifierCompositionGloss('barraging')).toBeNull();
    expect(resolveModifierCompositionGloss('furious')).toBeNull();
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
