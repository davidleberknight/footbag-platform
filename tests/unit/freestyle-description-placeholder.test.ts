/**
 * The description-suppression policy: a trick description that is a structural
 * placeholder (a formula-embedded backfill or a thin auto-generated
 * restatement) must be flagged so no public surface renders it as prose. This
 * pins each placeholder shape and, critically, that ordinary instructional
 * prose is never flagged.
 */
import { describe, it, expect } from 'vitest';

import { isDescriptionStructuralPlaceholder } from '../../src/content/freestyleSemanticOverrides';

describe('isDescriptionStructuralPlaceholder — JOB notation', () => {
  it('flags a description carrying a JOB-notation chain', () => {
    expect(isDescriptionStructuralPlaceholder(
      'Atomic modifier on barrage base. 4 ADD = atomic(+1) + barrage(3); JOB TOE > OP OUT [DEX] > OP TOE [DEL].',
    )).toBe(true);
  });
});

describe('isDescriptionStructuralPlaceholder — bracket notation', () => {
  it('flags a description carrying a bracket token even without a JOB prefix', () => {
    expect(isDescriptionStructuralPlaceholder('Sets into the wing arc [BOD] before the recovery.')).toBe(true);
    expect(isDescriptionStructuralPlaceholder('A cross-body finish marked [XBD] on the last dex.')).toBe(true);
  });
});

describe('isDescriptionStructuralPlaceholder — ADD arithmetic', () => {
  it('flags the "N ADD = ..." decomposition shorthand', () => {
    expect(isDescriptionStructuralPlaceholder('Atomic on blender. 5 ADD = atomic(1) + blender(4).')).toBe(true);
  });

  it('flags the parenthesized "(name(+1) + ... = N)" shorthand', () => {
    expect(isDescriptionStructuralPlaceholder('Atomic Drifter (atomic(+1) + drifter(3) = 4).')).toBe(true);
  });

  it('flags a bare signed modifier-bonus token', () => {
    expect(isDescriptionStructuralPlaceholder('The atomic set adds a dexterity (+1) before the base.')).toBe(true);
  });
});

describe('isDescriptionStructuralPlaceholder — thin auto-generated restatements', () => {
  it('flags "X-modified Y." and the generic "Popular/Common freestyle trick."', () => {
    expect(isDescriptionStructuralPlaceholder('Atomic-modified barrage.')).toBe(true);
    expect(isDescriptionStructuralPlaceholder('Popular freestyle trick.')).toBe(true);
    expect(isDescriptionStructuralPlaceholder('Common freestyle trick')).toBe(true);
  });
});

describe('isDescriptionStructuralPlaceholder — ordinary instructional prose', () => {
  it('does not flag neutral prose that names no arithmetic or notation', () => {
    expect(isDescriptionStructuralPlaceholder(
      'The leg circles the bag the opposite way around a delayed bag before the catch.',
    )).toBe(false);
    expect(isDescriptionStructuralPlaceholder(
      'A set primitive, the opposite-direction counterpart of pixie, adding energy during the set.',
    )).toBe(false);
  });

  it('does not flag a community-named compound whose ADD equation is kept out of the prose', () => {
    // A community-name description carries its decomposition qualitatively in
    // prose ("a pixie set into Mirage"); with no "ADD =" or "(+1)" tail it must
    // render rather than be suppressed with the arithmetic.
    expect(isDescriptionStructuralPlaceholder(
      'Smear, the community name for Pixie Mirage, a pixie set into Mirage.',
    )).toBe(false);
    expect(isDescriptionStructuralPlaceholder(
      'Dark Avenue, the community name for Fairy Diving Butterfly, a fairy set followed by a dive into Butterfly.',
    )).toBe(false);
  });

  it('does not flag prose that mentions ADD as a word rather than the "ADD =" token', () => {
    expect(isDescriptionStructuralPlaceholder('Each dexterity you add raises the difficulty of the run.')).toBe(false);
  });

  it('treats null, empty, and whitespace as not-a-placeholder', () => {
    expect(isDescriptionStructuralPlaceholder(null)).toBe(false);
    expect(isDescriptionStructuralPlaceholder('')).toBe(false);
    expect(isDescriptionStructuralPlaceholder('   ')).toBe(false);
  });
});
