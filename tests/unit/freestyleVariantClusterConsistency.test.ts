/**
 * Cross-surface consistency for variant clusters. The trick page, the family
 * card, the core-atom notation spec, the operator reference, the teaching prose,
 * and the modifier seed notes must not disagree about the same move. These guard
 * the rulings that osis is genuinely either-side, that around-the-world is the
 * inward circle and orbit its reverse, that furious and barraging are distinct,
 * that atomic and illusioning are distinct, and that miraging is not a set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { CORE_TRICK_SPEC } from '../../src/content/freestyleLandingContent';
import { ROOT_TERMINAL_FAMILIES, BRANCH_FAMILIES } from '../../src/content/freestyleGlossaryFamilyCards';
import { OPERATOR_REFERENCE_ENTRIES } from '../../src/content/freestyleOperatorReference';
import { COMPOUND_SEMANTIC_DESCRIPTIONS } from '../../src/content/freestyleSemanticOverrides';
import { MODIFIER_BEGINNER_NOTES } from '../../src/content/freestyleStructuralFactNotes';
import { GLOSSARY_CORE_CONCEPTS } from '../../src/content/freestyleGlossaryCoreConcepts';
import { TRICK_INTUITION_ENTRIES } from '../../src/content/freestyleTrickIntuition';
import { TRICK_MECHANICAL_DELTA_ENTRIES } from '../../src/content/freestyleTrickMechanicalDelta';

const cardBySlug = new Map(
  [...ROOT_TERMINAL_FAMILIES, ...BRANCH_FAMILIES].map(c => [c.slug, c]),
);

describe('core atom family card matches its core atom notation spec', () => {
  it('every core atom that also has a family card shows the identical formula on both', () => {
    const checked: string[] = [];
    for (const spec of CORE_TRICK_SPEC) {
      const card = cardBySlug.get(spec.slug);
      if (!card) continue;
      checked.push(spec.slug);
      expect(card.canonicalFormula, `${spec.slug}: family card formula must equal the core-atom spec`)
        .toBe(spec.operationalNotation);
    }
    // The parity check must actually exercise the reconciled atoms, not silently
    // skip them all.
    expect(checked).toEqual(expect.arrayContaining(['whirl', 'swirl', 'osis', 'butterfly']));
  });
});

describe('osis renders one either-side catch model everywhere', () => {
  it('the core-atom spec catches on an either-side SAME/OP clipper', () => {
    const osis = CORE_TRICK_SPEC.find(s => s.slug === 'osis');
    expect(osis?.operationalNotation).toContain('SAME/OP CLIP');
  });
  it('the osis family card shows the same either-side catch', () => {
    expect(cardBySlug.get('osis')?.canonicalFormula).toContain('SAME/OP CLIP');
  });
});

describe('miraging is not classified as a set', () => {
  it('the operator reference entry for miraging is not tagged set', () => {
    const miraging = OPERATOR_REFERENCE_ENTRIES.find(e => e.slug === 'miraging');
    expect(miraging).toBeDefined();
    expect(miraging!.category).not.toBe('set');
  });
});

describe('furious is not presented as the same thing as barraging', () => {
  it('the furious About text does not call it the barraging pattern', () => {
    const about = COMPOUND_SEMANTIC_DESCRIPTIONS.get('furious') ?? '';
    expect(about.toLowerCase()).not.toContain('barraging pattern');
  });
  it('the furious modifier note does not call it the barraging pattern', () => {
    const note = MODIFIER_BEGINNER_NOTES.get('furious') ?? '';
    expect(note.toLowerCase()).not.toContain('barraging pattern');
  });
  it('no glossary core concept calls barrage and furious the same structure named twice', () => {
    const joined = GLOSSARY_CORE_CONCEPTS.map(c => c.relates).join(' ').toLowerCase();
    expect(joined).not.toContain('named twice');
    expect(joined).not.toContain('same two-dex structure');
  });
  it('no mechanical-delta prose calls furious the barraging pattern', () => {
    const joined = TRICK_MECHANICAL_DELTA_ENTRIES.map(e => e.prose).join(' ').toLowerCase();
    expect(joined).not.toContain('barraging pattern');
  });
});

describe('around-the-world is inward-only and orbit is its reverse', () => {
  const intuition = (slug: string) =>
    (TRICK_INTUITION_ENTRIES.find(e => e.slug === slug)?.prose ?? '').toLowerCase();
  it('the around-the-world prose does not claim both directions are around the world', () => {
    expect(intuition('around_the_world')).not.toContain('both directions');
  });
  it('the orbit prose does not claim orbit and around-the-world are the same movement', () => {
    const orbit = intuition('orbit');
    expect(orbit).not.toContain('same movement');
    expect(orbit).not.toContain('describe the same');
  });
});

describe('whirl, swirl and drifter family cards use entry-generic wording', () => {
  const teachingText = (slug: string) => JSON.stringify(cardBySlug.get(slug)!.teaching).toLowerCase();
  it('the whirl card does not lock the base to clipper-to-clipper', () => {
    expect(teachingText('whirl')).not.toContain('clipper-to-clipper');
  });
  it('the swirl card does not lock the base to clipper-to-clipper', () => {
    expect(teachingText('swirl')).not.toContain('clipper-to-clipper');
  });
  it('the drifter card does not lock whirl to clipper-to-clipper', () => {
    expect(teachingText('drifter')).not.toContain('clipper-to-clipper');
  });
});

describe('the modifier seed notes keep atomic and furious distinct from their neighbours', () => {
  const seed = readFileSync(
    new URL('../../freestyle/inputs/base_dictionary/trick_modifiers.csv', import.meta.url),
    'utf8',
  );
  it('the atomic note does not say illusioning is a presentation of atomic', () => {
    const row = seed.split('\n').find(l => l.startsWith('atomic,')) ?? '';
    expect(row.toLowerCase()).not.toContain('presentation of this operator');
  });
  it('the furious note does not say furious is the same operator as barraging', () => {
    const row = seed.split('\n').find(l => l.startsWith('furious,')) ?? '';
    expect(row.toLowerCase()).not.toContain('same operator as barraging');
  });
});

describe('the around-the-world description seed is inward-only', () => {
  const seed = readFileSync(
    new URL('../../freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv', import.meta.url),
    'utf8',
  );
  it('the around-the-world description correction does not claim both directions', () => {
    const rows = seed.split('\n').filter(l => l.startsWith('around-the-world,description,'));
    expect(rows.join(' ').toLowerCase()).not.toContain('both directions');
  });
});
