/**
 * Ripped Warrior and Stepping Ducking Butterfly Same Side are a far and
 * same-side pair, not one trick.
 *
 * FootbagMoves gives Ripped Warrior the technical name Stepping Ducking Far
 * Butterfly with an opposite-side butterfly dexterity, PassBack records it as
 * the opposite-side form, and FootbagMoves lists the same-side form separately.
 * A plain butterfly name means the far form (the butterfly-implies-far ruling),
 * so the plain name Stepping Ducking Butterfly belongs to Ripped Warrior as a
 * shown structural name, and the same-side form is the separately named row.
 *
 * These read the committed curator inputs, so a regression fails without a
 * built database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const TRICKS = join(REPO_ROOT, 'freestyle', 'inputs', 'curated', 'tricks');
const additions = readFileSync(join(TRICKS, 'red_additions_2026_04_20.csv'), 'utf8').split('\n');
const corrections = readFileSync(join(TRICKS, 'red_corrections_2026_04_20.csv'), 'utf8').split('\n');
const overrides = readFileSync(
  join(REPO_ROOT, 'freestyle', 'inputs', 'base_dictionary', 'alias_overrides.csv'), 'utf8').split('\n');

/** The new_value of a slug's field correction, for values that carry no comma. */
function correctionValue(slug: string, field: string): string | undefined {
  const row = corrections.find(l => new RegExp(`^${slug},${field},`).test(l));
  return row?.split(',')[3];
}

describe('Ripped Warrior is the far form', () => {
  // Defect caught: Ripped Warrior's butterfly dexterity written on the near side,
  // collapsing it into its same-side partner.
  it('ends with the opposite-side butterfly dexterity', () => {
    expect(correctionValue('ripped-warrior', 'operational_notation'))
      .toBe('CLIP > OP IN [DEX] >> DUCK [BOD] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]');
  });

  // Defect caught: the plain name left on the same-side row, so a reader
  // searching Stepping Ducking Butterfly lands on the wrong side.
  it('carries the plain name and shows it as a structural name', () => {
    const row = additions.find(l => l.startsWith('ripped warrior,'));
    expect(row?.split(',')[4]).toBe('stepping ducking butterfly');
    const ov = overrides.find(l => l.startsWith('stepping_ducking_butterfly,'));
    expect(ov?.split(',').slice(1, 4)).toEqual(['retype', 'structural', '1']);
  });
});

describe('the same-side form is its own row', () => {
  // Defect caught: the same-side trick keeping the plain name the far form owns.
  it('is named Stepping Ducking Butterfly Same Side, with no row under the plain name', () => {
    expect(additions.some(l => l.startsWith('stepping ducking butterfly same side,'))).toBe(true);
    expect(additions.some(l => l.startsWith('stepping ducking butterfly,'))).toBe(false);
    expect(corrections.filter(l => /^stepping[-_]ducking[-_]butterfly,/.test(l))).toEqual([]);
  });

  // Defect caught: the rename carrying the far notation onto the same-side row.
  it('keeps its same-side butterfly dexterity', () => {
    expect(correctionValue('stepping-ducking-butterfly-same-side', 'operational_notation'))
      .toBe('CLIP > OP IN [DEX] > DUCK [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]');
  });

  // Defect caught: either trick still flagged as an open identity question.
  it('leaves neither trick with an identity notice', () => {
    for (const slug of ['ripped_warrior', 'stepping_ducking_butterfly', 'stepping_ducking_butterfly_same_side']) {
      expect(correctionValue(slug, 'review_aspect'), slug).toBeUndefined();
    }
  });
});
