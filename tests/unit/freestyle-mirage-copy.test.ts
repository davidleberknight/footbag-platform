/**
 * Mirage is one of several simple foundational dexterities (around-the-world is
 * another), so authored public teaching copy must not describe it as uniquely
 * "the simplest complete dexterity" or as "the first dexterity a player learns".
 * The approved language is "one of the simplest complete dexterity movements"
 * and "usually one of the first dexterities a player learns". This scans the
 * authored surfaces that carry the Mirage introduction; it does not touch legacy
 * source quotations under freestyle/inputs, and it does not police the unrelated
 * "the first dexterity" sense that means the first of two circles in a compound.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES = [
  'src/views/freestyle/start.hbs',
  'src/content/freestyleGlossaryFamilyCards.ts',
];

describe('Mirage teaching copy does not overclaim its position', () => {
  for (const rel of SOURCES) {
    const text = readFileSync(join(process.cwd(), rel), 'utf8');

    it(`${rel} does not call Mirage uniquely the simplest complete dexterity`, () => {
      // The exclusive "the simplest ...", but not the approved "one of the simplest ...".
      expect(text).not.toMatch(/(?<!one of )the simplest complete dexterity/i);
    });

    it(`${rel} does not call Mirage the first dexterity a player learns`, () => {
      expect(text).not.toMatch(/(?<!one of )the first dexterit(y|ies) a player learns/i);
    });
  }

  it('the glossary family card uses the approved non-exclusive phrasing', () => {
    const text = readFileSync(
      join(process.cwd(), 'src/content/freestyleGlossaryFamilyCards.ts'),
      'utf8',
    );
    expect(text).toContain('one of the simplest complete dexterity movements');
    expect(text).toContain('one of the first dexterities a player learns');
  });
});
