/**
 * Cross-surface consistency for variant clusters. The trick page, the core-atom
 * notation spec, the operator reference, the family teaching text, and the
 * modifier seed notes must not disagree about the same move. These guard
 * the rulings that osis is genuinely either-side, that around-the-world is the
 * inward circle and orbit its reverse, that furious and barraging are distinct,
 * that atomic and illusioning are distinct, and that miraging is not a set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { committedNotation } from '../fixtures/committedNotation';
import { STAGED_FAMILIES } from '../../freestyle/inputs/curator_content/freestyleFamilies';
import { STAGED_REFERENCE_ENTRIES as OPERATOR_REFERENCE_ENTRIES } from '../fixtures/stagedOperatorReference';
import { COMPOUND_SEMANTIC_DESCRIPTIONS } from '../../freestyle/inputs/curator_content/freestyleSemanticOverridesData';
import { MODIFIER_BEGINNER_NOTES } from '../../freestyle/inputs/curator_content/freestyleStructuralFactNotes';

describe('osis renders one either-side catch model', () => {
  it('the core-atom spec catches on an either-side SAME/OP clipper', () => {
    expect(committedNotation('osis')).toContain('SAME/OP CLIP');
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
});

describe('whirl, swirl and drifter family cards use entry-generic wording', () => {
  const teachingText = (slug: string) => JSON.stringify(STAGED_FAMILIES.find(f => f.slug === slug)).toLowerCase();
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
